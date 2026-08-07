import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import { TrueNasApiClientV2510 } from '@/client/truenas-api-client-v25-10';
import { TrueNasApiClientV26 } from '@/client/truenas-api-client-v26';
import { VersionTooOldError } from '@/errors/version-discovery.errors';
import { apiVersionConfig } from '@/config/api-version.config';
import {
  SUPPORTED_API_VERSIONS,
  type ApiDirectoryV26_0_0,
} from '@/generated';
import { VersionCompatibility } from '@/types/api-version.type';
import {
  checkVersionCompatibility,
  parseApiVersion,
} from '@/utils/api-version.utils';
import { canBuildClientFor, createTrueNasClient } from './factory';

function fakeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('createTrueNasClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const created: TrueNasApiClient[] = [];

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
  async function create(hostnames = ['box']): Promise<TrueNasApiClient> {
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

  /**
   * `Dir` says which API surface the caller is *writing against*. It does not
   * ask for a version and cannot get one — it is erased before anything runs,
   * so discovery decides which client is built exactly as it did before.
   *
   * The consequence is worth pinning rather than leaving implied: a caller who
   * declares a surface the server does not have gets a client that type-checks
   * against v26 and is a v25.10 client. Calling a v26-only method on it fails
   * at runtime, not at compile time.
   */
  it('builds the discovered version, not the declared one', async () => {
    fetchMock.mockResolvedValue(fakeResponse(['v25.10.1']));

    const client = await createTrueNasClient<ApiDirectoryV26_0_0>({
      uuid: 'uuid-1234',
      hostnames: ['box'],
      enabled: false,
    });
    created.push(client as unknown as TrueNasApiClient);

    // Declaring the v26 surface changed the types and nothing else.
    expect(client).toBeInstanceOf(TrueNasApiClientV2510);
    expect(client).not.toBeInstanceOf(TrueNasApiClientV26);
    expect(client.version.version).toBe('v25.10.1');
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

  // The mirror image of the MIN derivation. MIN cannot drift because it is
  // derived; MAX can, because it deliberately lags the newest generated
  // version until a client exists for it. Both directions of that lag are
  // failure modes, so both are asserted.
  describe('supported range agrees with the available clients', () => {
    const supported = SUPPORTED_API_VERSIONS.map((v) => {
      const parsed = parseApiVersion(v);
      if (!parsed) throw new Error(`generated version ${v} does not parse`);
      return { version: v, parsed };
    });

    // MAX too HIGH: the range admits a version with no client, so discovery
    // clears the compatibility check and then throws on selection.
    it('every version within [MIN, MAX] can be built', () => {
      const inRange = supported.filter(
        ({ parsed }) =>
          checkVersionCompatibility(parsed) === VersionCompatibility.Compatible
      );
      expect(inRange.length).toBeGreaterThan(0);
      for (const { version, parsed } of inRange) {
        expect(canBuildClientFor(parsed), `${version} has no client`).toBe(true);
      }
    });

    // MAX too LOW: a client was added but MAX was not raised, so the version
    // stays rejected and nothing says so.
    it('MAX reaches the newest version a client can build', () => {
      const buildable = supported.filter(({ parsed }) => canBuildClientFor(parsed));
      expect(buildable.at(-1)?.version).toBe(
        apiVersionConfig.MAX_SUPPORTED_VERSION
      );
    });
  });
});
