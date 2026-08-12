import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import { TrueNasApiClientV2510 } from '@/client/truenas-api-client-v25-10';
import { TrueNasApiClientV26 } from '@/client/truenas-api-client-v26';
import {
  VersionDiscoveryTimeoutError,
  VersionEndpointNotFoundError,
  VersionTooOldError,
} from '@/errors/version-discovery.errors';
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

  /**
   * Routes `fetch` per hostname, so a test can describe a whole fleet at once.
   *
   * Note the plain `mockResolvedValue`/`mockRejectedValue` used elsewhere in
   * this file now means "every hostname behaves this way", which is still a
   * valid (and useful) scenario.
   */
  function mockPerHostname(routes: Record<string, () => Promise<Response>>) {
    fetchMock.mockImplementation((url: string) => {
      const { hostname } = new URL(url);
      const route = routes[hostname];
      return (
        route?.() ?? Promise.reject(new Error(`unexpected hostname ${hostname}`))
      );
    });
  }

  /** What an `AbortController` timeout looks like to `VersionDiscovery`. */
  const abortError = () =>
    Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
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

  describe('multi-hostname discovery', () => {
    const hostnames = ['truenas1.local', 'truenas2.local'];
    const answers = () => Promise.resolve(fakeResponse(['v26.0.0']));

    it('asks every hostname, not just the primary', async () => {
      // Both hostnames answer, so a "primary first, fall back on failure"
      // implementation would never reach truenas2 — which is the bug.
      mockPerHostname({
        'truenas1.local': answers,
        'truenas2.local': answers,
      });

      await create(hostnames);

      for (const hostname of hostnames) {
        expect(fetchMock).toHaveBeenCalledWith(
          `https://${hostname}/api/versions`,
          expect.anything()
        );
      }
    });

    it('succeeds when the primary hostname is faulty but another answers', async () => {
      mockPerHostname({
        'truenas1.local': () => Promise.reject(abortError()),
        'truenas2.local': answers,
      });

      const client = await create(hostnames);

      expect(client).toBeInstanceOf(TrueNasApiClientV26);
      expect(client.version.version).toBe('v26.0.0');
    });

    it('does not wait for a slow faulty hostname before using a good one', async () => {
      let failStraggler!: (reason: Error) => void;
      const straggler = new Promise<Response>((_, reject) => {
        failStraggler = reject;
      });

      mockPerHostname({
        'truenas1.local': () => straggler,
        'truenas2.local': answers,
      });

      // The assertion is that this resolves at all: truenas1 is still
      // outstanding, so an implementation collecting every answer before
      // choosing would hang here until the test timed out.
      const client = await create(hostnames);
      expect(client.version.version).toBe('v26.0.0');

      // Settle the straggler so its discovery timeout is cleared. Its rejection
      // is still handled — `Promise.any` keeps handlers on every attempt.
      failStraggler(new TypeError('Failed to fetch'));
    });

    it('falls back to v25.10.0 when a non-primary hostname hits a network error', async () => {
      // The core regression this fix must not break: the CORS fallback has to
      // fire no matter which hostname is the CORS-blocked v25.10.0 box.
      mockPerHostname({
        'truenas1.local': () => Promise.reject(abortError()),
        'truenas2.local': () => Promise.reject(new TypeError('Failed to fetch')),
      });

      const client = await create(hostnames);

      expect(client).toBeInstanceOf(TrueNasApiClientV2510);
      expect(client.version.version).toBe('v25.10.0');
    });

    it('prefers a versioning error over all other errors', async () => {
      mockPerHostname({
        'truenas1.local': () => Promise.resolve(fakeResponse(['v24.10.0'])),
        'truenas2.local': () => Promise.reject(new TypeError('Failed to fetch')),
      });

      await expect(create(hostnames)).rejects.toBeInstanceOf(
        VersionTooOldError
      );
    });

    it('reports the sole failure unchanged for a single hostname', async () => {
      mockPerHostname({
        'truenas1.local': () => Promise.resolve(fakeResponse(['v24.10.0'])),
      });

      const error: unknown = await create(['truenas1.local']).catch(
        (e: unknown) => e
      );

      expect(error).toBeInstanceOf(VersionTooOldError);
      expect((error as VersionTooOldError).hostname).toBe('truenas1.local');
    });

    it('surfaces the first failure when none is a network error', async () => {
      mockPerHostname({
        // case: both hostnames abort.
        // note that a `TypeError` ends up turning into a network error
        // via `classify`, so we can't use it for testing a no-network-errors case.
        'truenas1.local': () => Promise.reject(abortError()),
        'truenas2.local': () => Promise.reject(new Error('Unexpected error')),
      });

      await expect(create(hostnames)).rejects.toBeInstanceOf(
        VersionDiscoveryTimeoutError
      );
    });

    /**
     * These pin a coupling that is otherwise invisible from the call site.
     *
     * The CORS fallback in `createTrueNasClient` asks "is the *one selected*
     * failure a network error?", not "did *any* hostname report a network
     * error?". So membership of `selectRepresentativeFailure`'s top tier
     * doubles as the fallback's off switch: any failure list holding both a
     * tier-1 error and a `VersionDiscoveryNetworkError` skips the fallback and
     * rejects instead of connecting to the CORS-blocked v25.10.0 box.
     *
     * That is the intended trade-off — a version verdict or a 404 says more
     * than an unreachable host — but the fallback is load-bearing until
     * MIN_SUPPORTED_VERSION > v25.10.0, and nothing else here fails when the
     * tier moves. Adding an error type to `isVersionError` narrows the
     * fallback; these tests are what make that narrowing loud.
     */
    describe('tier-1 errors suppress the CORS fallback (deliberate)', () => {
      /**
       * The error, or a short description of the client if the fallback fired.
       *
       * Never the client itself: when one of these assertions fails, vitest
       * diffs the actual value, and a live `TrueNasApiClient` is cyclic enough
       * to take the whole worker out with it — an OOM crash instead of a
       * readable "expected X, got a v25.10 client".
       */
      async function outcomeOf(hosts: string[]): Promise<unknown> {
        return create(hosts).then(
          client =>
            `fallback fired: ${client.constructor.name} @ ${client.version.version}`,
          (error: unknown) => error
        );
      }

      it('rejects rather than falling back when a version error accompanies a network error', async () => {
        mockPerHostname({
          // A real v24.10 box; the CORS-blocked v25.10.0 box is unreachable.
          'truenas1.local': () => Promise.resolve(fakeResponse(['v24.10.0'])),
          'truenas2.local': () =>
            Promise.reject(new TypeError('Failed to fetch')),
        });

        expect(await outcomeOf(hostnames)).toBeInstanceOf(VersionTooOldError);
      });

      it('rejects rather than falling back when a 404 accompanies a network error', async () => {
        mockPerHostname({
          // A gateway/proxy or stale hostname that answers 404 on /api/versions.
          'truenas1.local': () => Promise.resolve(fakeResponse(null, 404)),
          'truenas2.local': () =>
            Promise.reject(new TypeError('Failed to fetch')),
        });

        expect(await outcomeOf(hostnames)).toBeInstanceOf(
          VersionEndpointNotFoundError
        );
      });

      it('still falls back when the only non-network failure is below tier 1', async () => {
        // The complement of the two above: a timeout is *not* tier 1, so the
        // network error is still what gets selected and the fallback fires.
        mockPerHostname({
          'truenas1.local': () => Promise.reject(abortError()),
          'truenas2.local': () =>
            Promise.reject(new TypeError('Failed to fetch')),
        });

        const client = await create(hostnames);

        expect(client).toBeInstanceOf(TrueNasApiClientV2510);
        expect(client.version.version).toBe('v25.10.0');
      });
    });
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
