import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrueNasApiClientV2510 } from '@/client/truenas-api-client-v25-10';
import { TrueNasApiClientV26 } from '@/client/truenas-api-client-v26';
import {
  VersionTooNewError,
  VersionTooOldError,
} from '@/errors/version-discovery.errors';
import { ClientSupportedVersion } from '@/types/api-surface.type';
import { AnyTrueNasApiClient, createTrueNasClient } from './factory';

function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('createTrueNasClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  // Typed by what cleanup actually needs: version-pinned clients are
  // deliberately not assignable to the range-typed AnyTrueNasApiClient, so a
  // heterogeneous list of them has no common client type.
  const created: { close: () => void }[] = [];

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    // Close created clients so their connection ping/subscription timers stop.
    created.forEach(c => c.close());
    created.length = 0;
    vi.unstubAllGlobals();
  });

  // `enabled: false` keeps the connection gate shut, so no real socket is opened.
  async function create(hostnames = ['box']): Promise<AnyTrueNasApiClient> {
    const client = await createTrueNasClient({
      uuid: 'uuid-1234',
      hostnames,
      enabled: false,
    });
    created.push(client);
    return client;
  }

  it('selects the v25.10 client for a v25.10.x server', async () => {
    fetchMock.mockResolvedValue(fakeResponse(['v25.10.0', 'v25.10.1']));

    const client = await create();

    expect(client).toBeInstanceOf(TrueNasApiClientV2510);
    expect(client.version.version).toBe('v25.10.1');
  });

  it('selects the v26 client for a v26.x server', async () => {
    fetchMock.mockResolvedValue(fakeResponse(['v26.0.0']));

    const client = await create();

    expect(client).toBeInstanceOf(TrueNasApiClientV26);
    expect(client.version.version).toBe('v26.0.0');
  });

  it('falls back to the assumed version on a network/CORS error', async () => {
    // A fetch TypeError -> VersionDiscoveryNetworkError -> factory CORS fallback.
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const client = await create();

    // FALLBACK_VERSION is v25.10.0 -> the v25.10 client.
    expect(client).toBeInstanceOf(TrueNasApiClientV2510);
    expect(client.version.version).toBe('v25.10.0');
  });

  it('propagates non-network discovery errors (e.g. version too old)', async () => {
    fetchMock.mockResolvedValue(fakeResponse(['v24.10.0']));

    await expect(
      createTrueNasClient({ uuid: 'u', hostnames: ['box'], enabled: false })
    ).rejects.toBeInstanceOf(VersionTooOldError);
  });

  it('rejects when hostnames is empty', async () => {
    await expect(
      createTrueNasClient({ uuid: 'u', hostnames: [], enabled: false })
    ).rejects.toThrow(/hostnames array is empty/);
  });

  describe('pinned version', () => {
    it('skips discovery and selects the client for the pinned version', async () => {
      const client = await createTrueNasClient({
        uuid: 'uuid-1234',
        hostnames: ['box'],
        enabled: false,
        version: 'v26.0.0',
      });
      created.push(client);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(client).toBeInstanceOf(TrueNasApiClientV26);
      expect(client.version.version).toBe('v26.0.0');
      // The socket path is pinned to the negotiated version, which is what
      // makes supports() answer about the wire protocol rather than a guess.
      expect(client.version.websocketPath).toBe('/api/v26.0.0');
    });

    it('pins the exact patch, not just the family', async () => {
      const client = await createTrueNasClient({
        uuid: 'uuid-1234',
        hostnames: ['box'],
        enabled: false,
        version: 'v25.10.2',
      });
      created.push(client);

      expect(client).toBeInstanceOf(TrueNasApiClientV2510);
      expect(client.version.version).toBe('v25.10.2');
      expect(client.supports('v25.10.2')).toBe(true);
      expect(client.supports('v25.10.5')).toBe(false);
    });

    // A pin bypasses `/api/versions`, but must not bypass the range check:
    // an out-of-range pin fails the same way a server reporting it would.
    it('rejects a pinned version below the supported range', async () => {
      await expect(
        createTrueNasClient({
          uuid: 'u',
          hostnames: ['box'],
          enabled: false,
          version: 'v25.04.0' as ClientSupportedVersion,
        })
      ).rejects.toBeInstanceOf(VersionTooOldError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a pinned version above the supported range', async () => {
      await expect(
        createTrueNasClient({
          uuid: 'u',
          hostnames: ['box'],
          enabled: false,
          version: 'v27.0.0' as ClientSupportedVersion,
        })
      ).rejects.toBeInstanceOf(VersionTooNewError);
    });

    it('rejects an unparseable pinned version', async () => {
      await expect(
        createTrueNasClient({
          uuid: 'u',
          hostnames: ['box'],
          enabled: false,
          version: 'not-a-version' as ClientSupportedVersion,
        })
      ).rejects.toThrow(/invalid version/);
    });
  });
});
