import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import { TrueNasApiClientV2510 } from '@/client/truenas-api-client-v25-10';
import { TrueNasApiClientV26 } from '@/client/truenas-api-client-v26';
import { TrueNasApiClientV27 } from '@/client/truenas-api-client-v27';
import {
  VersionDiscoveryTimeoutError,
  VersionEndpointNotFoundError,
  VersionTooOldError,
} from '@/errors/version-discovery.errors';
import { apiVersionConfig } from '@/config/api-version.config';
import type { ApiDirectoryV27_0_0 } from '@/generated';
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
import type { CreateClientOptions, DefaultApiDirectory } from './factory';

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

  it('selects the v27 client for a v27.x server', async () => {
    fetchMock.mockResolvedValue(fakeResponse(['v27.0.0']));

    const client = await create();

    expect(client).toBeInstanceOf(TrueNasApiClientV27);
    // Not the v26 client: the two share their container operations today, so
    // instanceof is what separates them rather than behaviour.
    expect(client).not.toBeInstanceOf(TrueNasApiClientV26);
    expect(client.version.version).toBe('v27.0.0');
  });

  /**
   * The derivation is the entire point of `opts.version`, and it is invisible
   * to `vitest run` — the runtime tests below pass with both overloads deleted,
   * which I checked rather than assumed. These are what actually pin it, and
   * they run under `tsc -p tsconfig.spec.json`.
   */
  describe('the surface derived from a named version', () => {
    it('derives the directory from the version string, not from a default', async () => {
      const v27 = await createTrueNasClient({
        uuid: 'u', hostnames: ['box'], enabled: false, version: 'v27.0.0',
      });
      created.push(v27 as unknown as TrueNasApiClient);
      expectTypeOf(v27).toEqualTypeOf<TrueNasApiClient<ApiDirectoryV27_0_0>>();

      // A different version must derive a different surface, or the assertion
      // above would also hold for a hardcoded default.
      const v26 = await createTrueNasClient({
        uuid: 'u', hostnames: ['box'], enabled: false, version: 'v26.0.0',
      });
      created.push(v26 as unknown as TrueNasApiClient);
      expectTypeOf(v26).toEqualTypeOf<TrueNasApiClient<ApiDirectoryV26_0_0>>();
    });

    it('still accepts the exported options type as a value', async () => {
      // Regression guard. Narrowing overload 2 to `{ version?: undefined }`
      // made `CreateClientOptions` — an exported part of the contract —
      // un-passable, so every consumer naming the type broke while the suite
      // stayed green.
      const opts: CreateClientOptions = { uuid: 'u', hostnames: ['box'], enabled: false };
      fetchMock.mockResolvedValue(fakeResponse(['v26.0.0']));
      const client = await createTrueNasClient(opts);
      created.push(client as unknown as TrueNasApiClient);
      expectTypeOf(client).toEqualTypeOf<TrueNasApiClient<DefaultApiDirectory>>();
    });

    it('accepts the conditional-spread shape that `version?:` advertises', async () => {
      // "I might know the version" is the case the optional property exists for.
      const maybe = (v?: 'v27.0.0'): CreateClientOptions =>
        ({ uuid: 'u', hostnames: ['box'], enabled: false, ...(v ? { version: v } : {}) });
      fetchMock.mockResolvedValue(fakeResponse(['v26.0.0']));
      const client = await createTrueNasClient(maybe());
      created.push(client as unknown as TrueNasApiClient);
      expect(client).toBeInstanceOf(TrueNasApiClientV26);
    });

    /**
     * The derivation comes from inference on `{ version: V }`, so it needs the
     * literal at the call site. Indirection widens the property and resolution
     * falls to the discovery overload, which defaults to the oldest surface.
     *
     * Pinned rather than merely documented because it is silent: the call runs
     * against the version named, and only the *types* quietly revert. Both
     * shapes below are the natural way to write "I might know the version", so
     * anyone who tries one should find this test rather than a puzzle.
     */
    it('does NOT derive the surface when the version reaches it indirectly', async () => {
      const connect = (version?: 'v27.0.0') =>
        createTrueNasClient({ uuid: 'u', hostnames: ['box'], enabled: false, version });

      const client = await connect('v27.0.0');
      created.push(client as unknown as TrueNasApiClient);

      // Runtime honours the version...
      expect(client).toBeInstanceOf(TrueNasApiClientV27);
      expect(fetchMock).not.toHaveBeenCalled();
      // ...while the type falls back. Safe direction — a v27-only call is a
      // compile error rather than a runtime surprise — but not what was asked.
      expectTypeOf(client).toEqualTypeOf<TrueNasApiClient<DefaultApiDirectory>>();
    });

    it('rejects a version this package ships no types for', () => {
      // @ts-expect-error - not a member of SupportedApiVersion
      const bad: CreateClientOptions = { uuid: 'u', hostnames: ['box'], enabled: false, version: 'v99.0.0' };
      expect(bad).toBeTruthy();
    });
  });

  describe('a caller that names the version', () => {
    it('skips discovery entirely — no request is made', async () => {
      const client = await createTrueNasClient({
        uuid: 'uuid-1234',
        hostnames: ['box'],
        enabled: false,
        version: 'v27.0.0',
      });
      created.push(client as unknown as TrueNasApiClient);

      // The point of the option. If discovery ran, the stubbed `fetch` returns
      // `undefined`, `response.ok` throws a TypeError, and the factory's CORS
      // fallback quietly builds a v25.10.0 client — so the version assertion
      // below is what catches a regression, and this one names the cause.
      expect(fetchMock).not.toHaveBeenCalled();
      expect(client.version.version).toBe('v27.0.0');
    });

    it('builds the client for that version', async () => {
      const client = await createTrueNasClient({
        uuid: 'uuid-1234', hostnames: ['box'], enabled: false, version: 'v26.0.0',
      });
      created.push(client as unknown as TrueNasApiClient);

      expect(client).toBeInstanceOf(TrueNasApiClientV26);
      expect(client).not.toBeInstanceOf(TrueNasApiClientV27);
    });

    it('derives the websocket path from the version named', async () => {
      const client = await createTrueNasClient({
        uuid: 'uuid-1234', hostnames: ['box'], enabled: false, version: 'v27.0.0',
      });
      created.push(client as unknown as TrueNasApiClient);

      // Not just the types: naming the version also dials the number.
      expect(client.connection.websocketPath).toBe('/api/v27.0.0');
    });

    /**
     * Reachable only from JavaScript — `SupportedApiVersion` rejects it at
     * compile time — but this is a published entry point. Falling through to
     * discovery would be the wrong recovery: the caller explicitly declined it.
     */
    it('throws on a version it ships no types for, rather than discovering', async () => {
      const call = createTrueNasClient({
        uuid: 'uuid-1234',
        hostnames: ['box'],
        enabled: false,
        version: 'v99.0.0' as never,
      });

      await expect(call).rejects.toThrow(/not a version this package ships types for/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

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

      it('still falls back when an invalid-response error accompanies a network error', async () => {
        mockPerHostname({
          // A proxy/gateway answering non-404, non-2xx -> InvalidVersionResponseError,
          // which `selectRepresentativeFailure` deliberately leaves out of tier 1.
          'truenas1.local': () => Promise.resolve(fakeResponse(null, 502)),
          'truenas2.local': () => Promise.reject(new TypeError('Failed to fetch')),
        });

        expect(await outcomeOf(hostnames)).toBe(
          'fallback fired: TrueNasApiClientV2510 @ v25.10.0'
        );
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
