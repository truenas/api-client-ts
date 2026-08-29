import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InvalidVersionResponseError,
  NoCompatibleVersionsError,
  VersionDiscoveryNetworkError,
  VersionDiscoveryTimeoutError,
  VersionEndpointNotFoundError,
  VersionTooNewError,
  VersionTooOldError,
} from '@/errors/version-discovery.errors';
import { VersionDiscovery } from './version-discovery';

/** Build a minimal fake `Response` for the fetch mock. */
function fakeResponse(opts: {
  status?: number;
  json?: () => Promise<unknown>;
  body?: unknown;
}): Response {
  const status = opts.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: opts.json ?? (() => Promise.resolve(opts.body ?? [])),
  } as unknown as Response;
}

/** Subscribe and resolve with either the emitted value or the thrown error. */
function settle<T>(obs: { subscribe: unknown }): Promise<T | unknown> {
  return firstValueFrom(obs as never).catch((e: unknown) => e);
}

describe('VersionDiscovery', () => {

  describe('probeReachable', () => {
    /** A browser, as far as the CORS check is concerned. */
    function inBrowser(): void {
      vi.stubGlobal('window', { document: {} });
    }

    it('asks the discovery endpoint, on the discovery scheme', async () => {
      inBrowser();
      fetchMock.mockResolvedValue({ type: 'opaque' });

      await new VersionDiscovery(undefined, 'http:').probeReachable('box');

      // The same URL discovery uses. A probe on a different scheme would answer
      // a different question from the one that just failed, and `protocol` is
      // caller-supplied precisely because it can be either.
      expect(fetchMock).toHaveBeenCalledWith(
        'http://box/api/versions',
        // `no-store` too: a cached opaque answer would report a box that has
        // since gone as reachable, which is the wrong-year fallback all over.
        expect.objectContaining({ mode: 'no-cors', cache: 'no-store' })
      );
    });

    it('defaults to https, as discovery does', async () => {
      inBrowser();
      fetchMock.mockResolvedValue({ type: 'opaque' });

      await new VersionDiscovery().probeReachable('box');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://box/api/versions',
        expect.objectContaining({ mode: 'no-cors' })
      );
    });

    it('reports reachable when something answers', async () => {
      inBrowser();
      fetchMock.mockResolvedValue({ type: 'opaque' });

      expect(await new VersionDiscovery().probeReachable('box')).toBe(
        'reachable'
      );
    });

    it('reports silence when nothing answers', async () => {
      inBrowser();
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      expect(await new VersionDiscovery().probeReachable('box')).toBe('silent');
    });

    it('gives up rather than waiting on a host that never replies', async () => {
      vi.useFakeTimers();
      inBrowser();
      // Accepts the request and says nothing, unless aborted.
      fetchMock.mockImplementation(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      );

      const pending = new VersionDiscovery().probeReachable('box');
      await vi.advanceTimersByTimeAsync(6000);
      vi.useRealTimers();

      expect(await pending).toBe('silent');
    });

    it('says it cannot ask where CORS is not enforced', async () => {
      // No `window`, no worker scope: nothing is blocking anything here, so a
      // failed fetch already meant unreachable and the probe adds nothing.
      expect(await new VersionDiscovery().probeReachable('box')).toBe(
        'cannot-ask'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still asks inside a worker, which enforces CORS without a window', async () => {
      vi.stubGlobal('WorkerGlobalScope', class {});
      fetchMock.mockResolvedValue({ type: 'opaque' });

      expect(await new VersionDiscovery().probeReachable('box')).toBe(
        'reachable'
      );
    });
  });

  let fetchMock: ReturnType<typeof vi.fn>;
  let discovery: VersionDiscovery;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    discovery = new VersionDiscovery();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fetches /api/versions and selects the latest compatible version', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ body: ['v25.10.0', 'v25.10.1', 'v26.0.0'] })
    );

    const version = await firstValueFrom(discovery.discoverVersion('box'));

    expect(version.version).toBe('v26.0.0');
    expect(version.websocketPath).toBe('/api/v26.0.0');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://box/api/versions',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('maps a resolved 404 Response to VersionEndpointNotFoundError', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: 404 }));

    const error = await settle(discovery.discoverVersion('box'));

    expect(error).toBeInstanceOf(VersionEndpointNotFoundError);
  });

  it('maps a non-404 non-2xx Response to InvalidVersionResponseError', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ status: 500 }));

    const error = await settle(discovery.discoverVersion('box'));

    expect(error).toBeInstanceOf(InvalidVersionResponseError);
  });

  it('maps a fetch TypeError (network/CORS/unreachable) to VersionDiscoveryNetworkError', async () => {
    const cause = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(cause);

    const error = await settle(discovery.discoverVersion('box'));

    expect(error).toBeInstanceOf(VersionDiscoveryNetworkError);
    expect((error as VersionDiscoveryNetworkError).originalError).toBe(cause);
  });

  it('aborts after 5s and maps to VersionDiscoveryTimeoutError', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, opts: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted', 'AbortError'))
          );
        })
    );

    const settled = settle(discovery.discoverVersion('box'));
    await vi.advanceTimersByTimeAsync(5000);
    const error = await settled;

    expect(error).toBeInstanceOf(VersionDiscoveryTimeoutError);
  });

  it('throws VersionTooOldError when all versions are below the supported range', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ body: ['v24.10.0', 'v25.9.0'] }));

    const error = await settle(discovery.discoverVersion('box'));

    expect(error).toBeInstanceOf(VersionTooOldError);
  });

  it('fetches over http when the appliance is reached over http', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ body: ['v26.0.0'] }));
    const httpDiscovery = new VersionDiscovery(undefined, 'http:');

    await firstValueFrom(httpDiscovery.discoverVersion('box'));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://box/api/versions',
      expect.anything()
    );
  });

  it('throws VersionTooNewError when all versions are above the supported range', async () => {
    // Both above the ceiling. This used to read `['v26.0.1', 'v28.0.0']`, which
    // passed only because the ceiling was v26.0.0 — so v26.0.1 counted as "above
    // the supported range" and the fixture quietly documented that a v26 patch
    // release is rejected. Raising MAX to v27.0.0 makes v26.0.1 compatible and
    // the name true again.
    fetchMock.mockResolvedValue(fakeResponse({ body: ['v28.0.0', 'v29.0.0'] }));

    const error = await settle(discovery.discoverVersion('box'));

    expect(error).toBeInstanceOf(VersionTooNewError);
  });

  it('throws NoCompatibleVersionsError when versions straddle the range but none fit', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ body: ['v24.10.0', 'v28.0.0'] }));

    const error = await settle(discovery.discoverVersion('box'));

    expect(error).toBeInstanceOf(NoCompatibleVersionsError);
  });

  it('throws InvalidVersionResponseError when no version string parses', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ body: ['garbage', 'nope'] }));

    const error = await settle(discovery.discoverVersion('box'));

    expect(error).toBeInstanceOf(InvalidVersionResponseError);
  });

  it('throws InvalidVersionResponseError when the body is not an array', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ body: { versions: [] } }));

    const error = await settle(discovery.discoverVersion('box'));

    expect(error).toBeInstanceOf(InvalidVersionResponseError);
  });

  it('throws InvalidVersionResponseError (not a network error) for an array of non-strings', async () => {
    // A reachable-but-malformed response must not be misfiled as a network/CORS
    // failure (which would wrongly trigger the factory's fallback path).
    fetchMock.mockResolvedValue(fakeResponse({ body: [1, 2, 3] }));

    const error = await settle(discovery.discoverVersion('box'));

    expect(error).toBeInstanceOf(InvalidVersionResponseError);
    expect(error).not.toBeInstanceOf(VersionDiscoveryNetworkError);
  });

  it('throws InvalidVersionResponseError when the body is not valid JSON', async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ json: () => Promise.reject(new SyntaxError('Unexpected token')) })
    );

    const error = await settle(discovery.discoverVersion('box'));

    expect(error).toBeInstanceOf(InvalidVersionResponseError);
  });

  it('caches the result per hostname (a second call does not re-fetch)', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ body: ['v26.0.0'] }));

    await firstValueFrom(discovery.discoverVersion('box'));
    await firstValueFrom(discovery.discoverVersion('box'));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('clears the cache on failure so the next call retries', async () => {
    fetchMock.mockResolvedValueOnce(fakeResponse({ status: 404 }));
    fetchMock.mockResolvedValueOnce(fakeResponse({ body: ['v26.0.0'] }));

    const firstError = await settle(discovery.discoverVersion('box'));
    expect(firstError).toBeInstanceOf(VersionEndpointNotFoundError);

    const version = await firstValueFrom(discovery.discoverVersion('box'));
    expect(version.version).toBe('v26.0.0');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clearCache(hostname) forces a re-fetch for that hostname', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ body: ['v26.0.0'] }));

    await firstValueFrom(discovery.discoverVersion('box'));
    discovery.clearCache('box');
    await firstValueFrom(discovery.discoverVersion('box'));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
