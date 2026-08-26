import { firstValueFrom } from 'rxjs';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import { TrueNasApiClientV2510 } from '@/client/truenas-api-client-v25-10';
import { TrueNasApiClientV26 } from '@/client/truenas-api-client-v26';
import { TrueNasApiClientV27 } from '@/client/truenas-api-client-v27';
import { apiVersionConfig } from '@/config/api-version.config';
import { SUPPORTED_API_VERSIONS } from '@/generated';
import type { ApiDirectoryByVersion, ApiDirectoryV25_10_0, SupportedApiVersion } from '@/generated';
import { NoCompatibleVersionsError, VersionDiscoveryNetworkError, VersionEndpointNotFoundError, VersionTooNewError, VersionTooOldError } from '@/errors/version-discovery.errors';
import { Logger, noopLogger } from '@/logger';
import type { ApiDirectoryShape } from '@/types/api-directory.type';
import { ApiVersion, VersionCompatibility } from '@/types/api-version.type';
import { checkVersionCompatibility, legacyCutoffYear, parseApiVersion } from '@/utils/api-version.utils';
import { VersionDiscovery } from '@/version-discovery';

/**
 * The API surface {@link createTrueNasClient} assumes when the caller does not
 * say otherwise: the oldest supported version.
 *
 * Conservative in the direction that matters — against a newer server the types
 * understate what is available, rather than promising methods that are not
 * there. Move it in step with `--min-version` in the `generate:api` script.
 *
 * Named rather than written inline because a type parameter's default cannot be
 * observed through `ReturnType`, which erases it to `unknown`. Tests assert
 * against this alias; without it they pass whatever the default is, which is
 * how the missing 22 methods went unnoticed in the first place.
 */
export type DefaultApiDirectory = ApiDirectoryV25_10_0;

/**
 * The surface a named version derives, falling back when nothing was narrowed.
 *
 * `V` only pins a directory when inference narrowed it. A wrapper typed
 * `(version: SupportedApiVersion)` widens it back to the whole union, and
 * indexing by a union yields a union of directories whose usable methods are
 * their *intersection* — narrower than the default surface, so naming the
 * version would buy fewer methods than naming nothing. That case falls back to
 * {@link DefaultApiDirectory} instead, matching every other shape that loses
 * the literal. A partial union still derives: methods common to the versions
 * named is the right answer for "one of these".
 */
type DerivedDirectory<V extends SupportedApiVersion> =
  SupportedApiVersion extends V ? DefaultApiDirectory : ApiDirectoryByVersion[V];

/** Options for {@link createTrueNasClient}. */
export interface CreateClientOptions {
  /** System UUID. */
  uuid: string;
  /**
   * Hostnames to connect to. Order carries no precedence for version discovery
   * (every hostname is asked at once); it only breaks ties when deciding which
   * failure to report if none of them answer.
   */
  hostnames: string[];
  /**
   * Initial connection gate. The client only opens a socket while this is `true`;
   * flip it later via `client.connection.setEnabled()`. (The app maps its
   * `SystemState.Active -> true`.)
   */
  enabled: boolean;
  /** Optional system name (used only for log context). */
  systemName?: string;
  /**
   * Optional logger; defaults to a no-op. Forwarded to version discovery and,
   * through the client, to the connection.
   */
  logger?: Logger;
  /**
   * The appliance's API version, when the caller already knows it.
   *
   * Supplying it skips version discovery entirely — no `GET /api/versions`, no
   * CORS fallback — and *derives* the client's typed surface from the string,
   * so `version: 'v27.0.0'` yields `TrueNasApiClient<ApiDirectoryV27_0_0>`
   * without the caller asserting it through a type parameter.
   */
  version?: SupportedApiVersion;
}

/**
 * Creates a version-specific TrueNAS API client.
 *
 * 1. Discovers the API version (`GET /api/versions`), asking every hostname in
 *    parallel. The first usable answer wins — *unless* `opts.version` says
 *    which version this is, in which case discovery is skipped entirely.
 * 2. Selects the matching client implementation (`v25.10.x` -> `TrueNasApiClientV2510`,
 *    `v26.x.y` -> `TrueNasApiClientV26`, `v27.x.y` -> `TrueNasApiClientV27`).
 * 3. Instantiates and returns it.
 *
 * Resolves exactly once with a single client instance — dispose of it with
 * `client.close()` when done.
 *
 * ## Choosing `D`
 *
 * The version is discovered at *runtime*; the query verbs are typed at *compile
 * time*. Something has to bridge that, and `D` is where the caller says which
 * API surface they are writing against:
 *
 * ```typescript
 * const client = await createTrueNasClient(opts);
 * client.api.query('user.query');            // typed against v25.10
 *
 * const client = await createTrueNasClient<ApiDirectoryV26_0_0>(opts);
 * client.api.query('container.query');       // v26-only methods reachable
 * ```
 *
 * It defaults to the oldest supported version's directory, which is the
 * conservative direction: against a newer server the types understate what is
 * available rather than promising methods that are not there. Move it in step
 * with `--min-version` in the `generate:api` script.
 *
 * Note this is a *claim*, not a guarantee — the connected server may be any
 * supported version. Operations that must work across versions belong on
 * `client.ops`, which resolves them at runtime.
 *
 * ## Naming the version instead
 *
 * A caller that already knows its appliance — a UI served by the appliance
 * itself, a test harness against a pinned image — can say so and skip discovery
 * altogether:
 *
 * ```typescript
 * const client = await createTrueNasClient({
 *   uuid, hostnames, enabled: true, version: 'v27.0.0',
 * });
 * // client: TrueNasApiClient<ApiDirectoryV27_0_0>, derived from the string
 * ```
 *
 * The surface is *derived* rather than asserted: `ApiDirectoryByVersion` maps
 * the version string to its directory, so the caller writes no cast and names
 * no directory type. A version this package ships no types for does not
 * compile.
 *
 * **The derivation needs the version to be literal at the call site.** It comes
 * from inference on `{ version: V }`, so it holds for a string literal written
 * in the options object (or a `const`-typed one). It does not survive
 * indirection:
 *
 * - `createTrueNasClient<D>({ …, version: 'v27.0.0' })` — an explicit type
 *   argument makes the derived overload inapplicable, so `D` wins.
 * - `(v?: SupportedApiVersion) => createTrueNasClient({ …, version: v })` — the
 *   property is `SupportedApiVersion | undefined`, which no `V` satisfies.
 * - `(v: SupportedApiVersion) => …` — reaches this overload, but `V` is the
 *   whole union; see {@link DerivedDirectory}.
 * - `const opts: CreateClientOptions = { …, version: 'v27.0.0' }` — the
 *   annotation widens the property before the call sees it.
 *
 * All of them compile, run against the named version, and type as
 * {@link DefaultApiDirectory}. That fails in the safe direction — understated
 * types give a compile error at the method call rather than a runtime surprise —
 * but it is silent, so a wrapper that forwards a version gets none of the
 * surface it named. Keep the literal at the call site, and if you are adding
 * `version` to an existing `createTrueNasClient<ApiDirectoryV26_0_0>(opts)`
 * call, delete the type argument in the same edit.
 *
 * Two consequences worth knowing before reaching for it.
 *
 * It is a stronger claim than `D` alone, because it also picks the websocket
 * path. Naming `v27.0.0` at a v26 appliance connects on `/api/v27.0.0` with v27
 * types over a v26 server, and discovery cannot correct it — declining
 * discovery is the whole point. `D` on its own only mistyped the surface; this
 * mistypes the surface *and* dials the wrong number.
 *
 * Compatibility is still checked. Skipping discovery skips the network round
 * trip, not the range check, which is local and free. Two refusals reach a
 * caller, and they are not interchangeable:
 *
 * - a string that is not a `SupportedApiVersion` at all — only reachable from
 *   JavaScript — throws a plain `Error` naming the versions that are.
 * - a version this package ships types for but cannot build a client for
 *   throws {@link VersionTooNewError}, the same error discovery raises.
 *
 * The second is not hypothetical. `MAX_SUPPORTED_VERSION` is a hand-written
 * literal, and while it matches the newest generated version today, a
 * regeneration can add a year before anyone writes its client — at which point
 * that version is nameable, promised by the overload, and has nothing to build.
 * `VersionTooOldError` has no counterpart here: `MIN_SUPPORTED_VERSION` is
 * derived from the same list that constrains the type, so nothing nameable is
 * below it.
 *
 * @typeParam V - the version named in `opts.version`, when one is. The returned
 *   surface is `ApiDirectoryByVersion[V]`, so it is derived rather than chosen.
 * @typeParam D - the generated API surface the client is typed against, as a
 *   whole (`call`, `job`, `event`), for the discovery path where no version is
 *   named. Every verb resolves method names against it, so naming a method this
 *   surface does not have is a build error.
 * @returns a Promise that resolves with the created client, or rejects with a
 *   {@link VersionDiscoveryError} subclass (or a client-selection error).
 *   Rejects if version discovery on all hostnames *fails* and is not recoverable.
 *   Note that when the selected failure is a `VersionDiscoveryNetworkError`,
 *   this function attempts to use a fallback API version (see `FALLBACK_VERSION`)
 *   because network errors are actually expected on 25.10.0 systems due to a CORS
 *   bug. A network error alongside a version-compatibility error or a 404 does
 *   *not* reach the fallback — see `selectRepresentativeFailure`.
 */
export async function createTrueNasClient<V extends SupportedApiVersion>(
  opts: CreateClientOptions & { version: V },
): Promise<TrueNasApiClient<DerivedDirectory<V>>>;
export async function createTrueNasClient<
  D extends ApiDirectoryShape = DefaultApiDirectory,
>(opts: CreateClientOptions): Promise<TrueNasApiClient<D>>;
export async function createTrueNasClient<
  D extends ApiDirectoryShape = DefaultApiDirectory,
>(opts: CreateClientOptions): Promise<TrueNasApiClient<D>> {
  const { uuid, hostnames, systemName } = opts;
  const logger = opts.logger ?? noopLogger;

  if (!hostnames || hostnames.length === 0) {
    throw new Error(
      `Cannot create client for system ${uuid}: hostnames array is empty`
    );
  }

  logger.info('Creating versioned API client', {
    uuid: uuid.slice(0, 8),
    hostnames: hostnames.join(', '),
    systemName,
  });

  // Caller knows the version: skip discovery outright. Nothing here can fail
  // over the network, so none of the fallback machinery below applies.
  if (opts.version !== undefined) {
    // Membership, not parseability. `parseApiVersion` validates *shape* — it
    // accepts 'v99.0.0' quite happily — while what this path needs is a version
    // the package actually ships a surface for, because that surface is what
    // the return type was derived from. Checking the runtime twin of
    // `SupportedApiVersion` is the same question the type asked.
    //
    // Unreachable from TypeScript, which rejects the string at compile time.
    // Reachable from JavaScript, and this is a published entry point. Throwing
    // names the real problem; falling through to discovery would be worse than
    // an error, because declining discovery is exactly what the caller asked
    // for and doing it anyway would connect somewhere they did not choose.
    if (!(SUPPORTED_API_VERSIONS as readonly string[]).includes(opts.version)) {
      throw new Error(
        `Cannot create client for system ${uuid}: '${opts.version}' is not a ` +
          `version this package ships types for. Supported: ` +
          `${SUPPORTED_API_VERSIONS.join(', ')}.`
      );
    }
    const known = parseApiVersion(opts.version);
    if (!known) {
      // Belt and braces: every member of the list above parses today, so this
      // is a contradiction rather than a user error. Loud beats silent.
      throw new Error(
        `Cannot create client for system ${uuid}: supported version ` +
          `'${opts.version}' failed to parse.`
      );
    }

    // Skipping discovery is about not making a network round trip, not about
    // waiving the compatibility check — that one is local and free, and
    // dropping it would leave this path answering a question discovery answers
    // properly.
    //
    // It is load-bearing rather than defensive. `MAX_SUPPORTED_VERSION` is a
    // hand-written literal that deliberately lags the newest generated version
    // (see api-version.config.ts: generating types for a year does not write a
    // client for it). So a regeneration can add 'v28.0.0' to
    // `SupportedApiVersion` — making it nameable here, and promised as
    // `ApiDirectoryV28_0_0` by the overload — while no v28 client exists. Left
    // unchecked that lands in `instantiateClientForVersion`'s defensive branch
    // and throws a bare `Error` naming internal version keys, where discovery
    // would have rejected the same appliance with a typed `VersionTooNewError`.
    // Same errors, either way in.
    //
    // The named version is the only one on offer, so it is what the error
    // reports as available — the same shape discovery would produce for an
    // appliance that offered exactly this one.
    const compatibility = checkVersionCompatibility(known);
    if (compatibility === VersionCompatibility.TooNew) {
      // `hostnames[0]` and the single-element list are the caller's claim, not
      // the appliance's answer — nothing has been contacted yet. The error's
      // shape matches discovery's so callers can catch one type either way;
      // its content necessarily reads differently.
      throw new VersionTooNewError(hostnames[0], [known.version]);
    }
    if (compatibility !== VersionCompatibility.Compatible) {
      // `TooOld` cannot occur: `MIN_SUPPORTED_VERSION` is derived from the same
      // list that constrains `SupportedApiVersion`, so the oldest nameable
      // version *is* the floor. That leaves `Invalid`, which means MIN or MAX
      // failed to parse — a defect in this package rather than in the call, and
      // not something to build a client through.
      throw new Error(
        `Cannot create client for system ${uuid}: the supported version range ` +
          `is not usable (${apiVersionConfig.MIN_SUPPORTED_VERSION}..` +
          `${apiVersionConfig.MAX_SUPPORTED_VERSION}).`
      );
    }
    logger.info('API version supplied by the caller, skipping discovery', {
      uuid: uuid.slice(0, 8),
      version: known.version,
      websocketPath: known.websocketPath,
    });
    return instantiateClientForVersion<D>(known, opts, logger);
  }

  const versionDiscovery = new VersionDiscovery(logger);

  let version: ApiVersion;
  try {
    const winner = await discoverVersionFromAnyHostname(
      hostnames,
      versionDiscovery,
    );
    version = winner.version;
    logger.info('API version discovered, instantiating client', {
      uuid: uuid.slice(0, 8),
      // Which hostname answered is log context only. The client is built with
      // the full hostname list regardless — the websocket connection races all
      // of them anyway.
      hostname: winner.hostname,
      version: version.version,
      websocketPath: version.websocketPath,
    });
  } catch (error) {
    const errorMessage = errorMessageOrDefault(error, 'Unknown error');

    // CORS / network fallback (load-bearing).
    //
    // `fetch` surfaces network/CORS/unreachable failures as a
    // `VersionDiscoveryNetworkError` (the replacement for the Angular
    // `HttpClient`'s `status === 0`). IMPORTANT: TrueNAS v25.10.0 does not
    // have CORS enabled for the /api/versions endpoint, so discovery is
    // blocked there. This fallback MUST remain until v25.10.0 is no longer in
    // the supported range (i.e. once MIN_SUPPORTED_VERSION > v25.10.0).
    //
    // NOTE: This is reached only when version discovery on all hostnames
    // failed to give us a usable API version. See `selectRepresentativeFailure`
    // for how errors are selected.
    // Basically: version compatibility and `VersionEndpointNotFoundError`
    // errors are prioritized over network errors.
    if (!(error instanceof VersionDiscoveryNetworkError)) {
      // For other errors (version too old/too new, invalid response, etc.), re-throw.
      logger.error('Version discovery failed on every hostname', {
        uuid: uuid.slice(0, 8),
        hostnames: hostnames.join(', '),
        error: errorMessage,
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
      });
      throw error;
    }

    const fallbackVersionString = apiVersionConfig.FALLBACK_VERSION;
    const fallbackVersion = parseApiVersion(fallbackVersionString);

    if (!fallbackVersion) {
      logger.error('Invalid fallback version configuration', {
        uuid: uuid.slice(0, 8),
        hostnames: hostnames.join(', '),
        fallbackVersion: fallbackVersionString,
      });
      throw error;
    }

    logger.warn(
      'Version discovery failed with a network error (possible CORS or ' +
        'network issue), falling back to assumed version',
      {
        uuid: uuid.slice(0, 8),
        hostnames: hostnames.join(', '),
        fallbackVersion: fallbackVersionString,
        originalError: errorMessage,
        warning:
          'A network error has multiple causes (CORS, network down, DNS ' +
          'failure). The connection may still fail during the WebSocket handshake.',
      }
    );

    version = fallbackVersion;
  }

  return instantiateClientForVersion<D>(version, opts, logger);
}

/** A hostname that answered version discovery, and what it said. */
interface DiscoverySuccess {
  hostname: string;
  version: ApiVersion;
}

/**
 * Asks every hostname for the API version in parallel and takes the first
 * usable answer.
 *
 * Every hostname on a system points at the same box, so whichever one answers
 * first can be assumed to have given the same information as all the others.
 * The only reason the failures are kept at all is the all-failed case, where we
 * have to pick which error the caller sees and — crucially — whether the CORS
 * fallback in `createTrueNasClient` gets a chance to fire.
 *
 * `Promise.any` is what makes this a fix rather than a reshuffle: it settles on
 * the first *fulfilment*, so a hostname that fails fast (a refused connection
 * resolves far quicker than a healthy round trip) cannot beat a good hostname
 * to the answer, and a hostname that hangs until the 5s discovery timeout does
 * not hold up a good one. A `Promise.all`-style collect-everything would
 * reintroduce exactly the wait this removes.
 *
 * Losing attempts are not cancelled: `discoverVersion` is a `fetch` behind a
 * `defer`, so there is nothing to abort from here. They run out their own 5s
 * timeout unobserved, and their rejections are handled by `Promise.any`.
 *
 * @param hostnames Non-empty array of hostnames to try.
 * @throws the representative failure if no hostname answered.
 */
async function discoverVersionFromAnyHostname(
  hostnames: string[],
  versionDiscovery: VersionDiscovery,
): Promise<DiscoverySuccess> {
  const attempts = hostnames.map(hostname =>
    firstValueFrom(versionDiscovery.discoverVersion(hostname)).then(
      (version): DiscoverySuccess => ({ hostname, version })
    )
  );

  try {
    return await Promise.any(attempts);
  } catch (error) {
    // `hostnames` is validated non-empty upstream, so this is always an
    // AggregateError holding one rejection per hostname, in hostname order.
    // The guard is for the impossible case rather than the expected one.
    const failures = error instanceof AggregateError ? error.errors : [error];
    throw selectRepresentativeFailure(failures);
  }
}

/**
 * Pick which failure to surface when no hostname gave a usable version.
 *
 * Three tiers, in order: an error that says something authoritative about the
 * system (`VersionTooOldError`, `VersionTooNewError`, `NoCompatibleVersionsError`,
 * `VersionEndpointNotFoundError`) - whichever of those comes first in hostname
 * order; then any `VersionDiscoveryNetworkError`; then the first failure as-is.
 * `InvalidVersionResponseError` gets no tier of its own - see the note below.
 */
function selectRepresentativeFailure(failures: unknown[]): unknown {
  const isVersionError = (error: unknown) =>
    // cases: valid response, but the given versions won't work for us
    error instanceof VersionTooOldError
    || error instanceof VersionTooNewError
    || error instanceof NoCompatibleVersionsError
    // case: `/api/versions` gave us a 404
    || error instanceof VersionEndpointNotFoundError

  const isNetworkError = (error: unknown) =>
    error instanceof VersionDiscoveryNetworkError;

  // NOTE: despite its name, an `InvalidVersionResponseError`
  // is thrown by `discoverVersion` as a sort of catch-all error.
  // so, we can't really rely on it meaning much - as a result, we explicitly
  // don't account for it here in this function.
  return (
    failures.find(isVersionError)
    ?? failures.find(isNetworkError)
    // this function is only ever called when there is definitely
    // at least one error, so accessing the 0th element is fine here.
    ?? failures[0]
  );
}

/** Constructor shape shared by every version-specific client. */
type ClientConstructor = new (
  uuid: string,
  hostnames: string[],
  version: ApiVersion,
  enabled: boolean,
  systemName?: string,
  logger?: Logger
) => TrueNasApiClient;

/**
 * Version key -> client implementation.
 *
 * The single source of truth for which versions can actually be built. Kept as
 * data rather than a `switch` so it can be asserted against
 * `MAX_SUPPORTED_VERSION`: adding a client here without raising MAX would leave
 * the new version rejected by the range check, which is the same silent
 * divergence that made MIN worth deriving.
 */
const CLIENT_BY_VERSION_KEY: Readonly<Record<string, ClientConstructor>> = {
  '25.10': TrueNasApiClientV2510,
  '26': TrueNasApiClientV26,
  '27': TrueNasApiClientV27,
};

/**
 * The key that selects a client: `year.month` for the legacy vYY.MM scheme
 * (all patches of a month share one client), `year` for v26+.
 */
export function clientVersionKey(version: ApiVersion): string {
  if (version.year <= legacyCutoffYear) {
    return `${version.year.toString()}.${version.minor.toString().padStart(2, '0')}`;
  }
  return version.year.toString();
}

/** Whether a client implementation exists for `version`. */
export function canBuildClientFor(version: ApiVersion): boolean {
  return clientVersionKey(version) in CLIENT_BY_VERSION_KEY;
}

/**
 * Maps a discovered version to its client implementation.
 *
 * The cast at the end is the one place where runtime and compile time disagree,
 * and it is deliberate. `CLIENT_BY_VERSION_KEY` holds constructors for every
 * supported version under a single type, which is only possible because the
 * directories they are parameterised by have no common supertype — the versions
 * are mutually unassignable (`alert.list_categories` takes no arguments in
 * v25.10 and an options object in v26). So the map is typed against the shared
 * base, and the caller's `D` is reapplied here.
 *
 * Widening it away would mean either giving every caller the base directory —
 * which cannot reach `user.query` or `pool.query`, 22 of the 66 query methods —
 * or pretending the constructors are interchangeable, which they are not.
 */
function instantiateClientForVersion<D extends ApiDirectoryShape>(
  version: ApiVersion,
  opts: CreateClientOptions,
  logger: Logger
): TrueNasApiClient<D> {
  const { uuid, hostnames, enabled, systemName } = opts;
  const versionKey = clientVersionKey(version);
  const Client = CLIENT_BY_VERSION_KEY[versionKey];

  if (!Client) {
    // Should not happen: discovery only yields compatible versions. Defensive.
    logger.error('No client implementation for version', {
      uuid: uuid.slice(0, 8),
      version: version.version,
      versionKey,
    });
    throw new Error(
      `No client implementation for API version ${version.version}. ` +
        `Version keys with a client: ${Object.keys(CLIENT_BY_VERSION_KEY).join(', ')}. ` +
        `Version key: ${versionKey}`
    );
  }

  logger.info(`Instantiating ${Client.name}`, {
    uuid: uuid.slice(0, 8),
    version: version.version,
    versionKey,
  });
  return new Client(
    uuid,
    hostnames,
    version,
    enabled,
    systemName,
    logger
  ) as unknown as TrueNasApiClient<D>;
}

/**
 * Extracts a user-facing message from an unknown error, falling back to `fallback`.
 * (Inlined pure subset of the app's `errorMessageOrDefault`.)
 */
function errorMessageOrDefault(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}
