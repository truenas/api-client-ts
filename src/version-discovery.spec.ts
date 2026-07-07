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

  it('throws VersionTooNewError when all versions are above the supported range', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ body: ['v26.0.1', 'v27.0.0'] }));

    const error = await settle(discovery.discoverVersion('box'));

    expect(error).toBeInstanceOf(VersionTooNewError);
  });

  it('throws NoCompatibleVersionsError when versions straddle the range but none fit', async () => {
    fetchMock.mockResolvedValue(fakeResponse({ body: ['v24.10.0', 'v27.0.0'] }));

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
