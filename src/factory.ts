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
import type { ApplianceProtocol, ReconnectOptions } from '@/types/transport.type';
import { ApiVersion, VersionCompatibility } from '@/types/api-version.type';
import { checkVersionCompatibility, legacyCutoffYear, parseApiVersion } from '@/utils/api-version.utils';
import { VersionDiscovery, type Reachability } from '@/version-discovery';

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
export type DerivedDirectory<V extends SupportedApiVersion> =
  SupportedApiVersion extends V ? DefaultApiDirectory : ApiDirectoryByVersion[V];

/**
 * Options for {@link createTrueNasClient}. `retryDelay` and `maxRetry` pace
 * reconnection, which never stops on its own; see {@link ReconnectOptions}.
 */
export interface CreateClientOptions extends ReconnectOptions {
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
  /**
   * The appliance's scheme, in `location.protocol` form: `https:` (default)
   * gives https discovery and a `wss` socket, `http:` gives http and `ws`.
   *
   * It describes the *appliance*, not the page, so `location.protocol` is only
   * right when the appliance serves the page. A mismatch fails the WebSocket
   * handshake without naming the scheme, or is reported as unreachable.
   */
  protocol?: ApplianceProtocol;
}

/**
 * Creates a version-specific TrueNAS API client; dispose of it with `client.close()`.
 *
 * Without `opts.version`, discovers the version from every hostname in parallel
 * and types the client as `D` — a claim, not a guarantee. A literal
 * `opts.version` skips discovery and derives the surface from the string, unless
 * a type argument overrides it. See the README's "Working across versions".
 *
 * @typeParam V - the version named in `opts.version`.
 * @typeParam D - the API surface to type against when no version is named.
 * @returns the client; rejects with a {@link VersionDiscoveryError} subclass,
 *   including {@link VersionTooNewError} for a named version with no client.
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

    // Skipping discovery skips the network, not the range check. Load-bearing:
    // `MAX_SUPPORTED_VERSION` can lag the newest generated version, so a
    // version may be nameable with no client to build. Reject it with
    // discovery's typed `VersionTooNewError`, not a bare `Error` later.
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

  const versionDiscovery = new VersionDiscovery(logger, opts.protocol);

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

    // CORS fallback, load-bearing until MIN_SUPPORTED_VERSION > v25.10.0:
    // v25.10.0 has no CORS on /api/versions, so browser discovery fails there
    // with a `VersionDiscoveryNetworkError`. Only reached when that was the
    // selected failure — see `selectRepresentativeFailure`.
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

    // A network failure is the one discovery error that does not say what went
    // wrong. `fetch` reports a CORS refusal, a dead box, a bad DNS name and the
    // wrong scheme as the same `TypeError`, and falling back on all of them
    // pinned healthy v26/v27 appliances to a v25.10 surface. So ask two further
    // questions before assuming CORS.
    const reachable = await probeAnyHostname(hostnames, versionDiscovery);

    // A box that answered nothing may be mid-reboot rather than absent, so give
    // it a moment before asking again. Only when the probe actually got silence:
    // where the probe does not apply there is no reason to think anything is
    // coming back, and a consumer with no browser should fail fast.
    if (reachable === 'silent') {
      await sleep(unreachableRetryDelayMs);
    }

    try {
      const retryWinner = await discoverVersionFromAnyHostname(
        hostnames,
        versionDiscovery,
      );
      logger.info('Version discovery succeeded on retry', {
        uuid: uuid.slice(0, 8),
        hostname: retryWinner.hostname,
        version: retryWinner.version.version,
        firstError: errorMessage,
      });
      // Assigned rather than returned from inside the `try`: building the client
      // can throw, and this `catch` is written to classify discovery failures.
      version = retryWinner.version;
    } catch (retryError) {
      if (!(retryError instanceof VersionDiscoveryNetworkError)) {
        // The retry got far enough to say something specific — too old, no such
        // endpoint. That answer is better than the one we came in with.
        throw retryError;
      }

      // Only a box that answered the probe and still refuses to share its
      // versions is the CORS case the fallback exists for. Anything else —
      // nothing there, or no way to ask — is reported rather than guessed at,
      // because guessing here is what produced a wrong-year client.
      if (reachable !== 'reachable') {
        logger.error(
          'Version discovery failed and the appliance did not answer a ' +
            'reachability probe; not assuming a version',
          {
            uuid: uuid.slice(0, 8),
            hostnames: hostnames.join(', '),
            probe: reachable === 'silent' ? 'no answer' : 'not applicable',
            error: errorMessageOrDefault(retryError, 'Unknown error'),
          }
        );
        throw retryError;
      }

      const fallbackVersionString = apiVersionConfig.FALLBACK_VERSION;
      const fallbackVersion = parseApiVersion(fallbackVersionString);

      if (!fallbackVersion) {
        logger.error('Invalid fallback version configuration', {
          uuid: uuid.slice(0, 8),
          hostnames: hostnames.join(', '),
          fallbackVersion: fallbackVersionString,
        });
        throw retryError;
      }

      logger.warn(
        'Appliance is reachable but version discovery is still blocked; ' +
          'falling back to assumed version',
        {
          uuid: uuid.slice(0, 8),
          hostnames: hostnames.join(', '),
          fallbackVersion: fallbackVersionString,
          originalError: errorMessage,
          warning:
            'The appliance answered a probe but not /api/versions, which is ' +
            'what v25.10.0 looks like from a browser. If it is newer than ' +
            'that, this client is now pinned to the wrong surface.',
        }
      );

      version = fallbackVersion;
    }
  }

  return instantiateClientForVersion<D>(version, opts, logger);
}

/**
 * How long to wait before re-running discovery against an appliance that did
 * not answer the reachability probe. 2500ms, per issue #46: long enough that a
 * box finishing a reboot gets a second chance, short enough that a genuinely
 * absent one is reported promptly.
 */
const unreachableRetryDelayMs = 2500;

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Whether any hostname answers, when that can be asked at all.
 *
 * Settles on the first `reachable` rather than collecting every probe: one live
 * appliance is all discovery needed, and waiting for the rest means a host that
 * accepts the socket and then says nothing holds the answer for its whole
 * timeout. `cannot-ask` is only the verdict when that was true everywhere —
 * it means the question does not apply here, not that the answer is no.
 */
async function probeAnyHostname(
  hostnames: string[],
  versionDiscovery: VersionDiscovery,
): Promise<Reachability> {
  const probes = hostnames.map(hostname =>
    versionDiscovery.probeReachable(hostname)
  );

  const remaining = new Set(probes);
  let sawSilence = false;

  while (remaining.size > 0) {
    const settled = await Promise.race(
      [...remaining].map(probe => probe.then(result => ({ probe, result })))
    );
    if (settled.result === 'reachable') return 'reachable';
    if (settled.result === 'silent') sawSilence = true;
    remaining.delete(settled.probe);
  }

  return sawSilence ? 'silent' : 'cannot-ask';
}

/** A hostname that answered version discovery, and what it said. */
interface DiscoverySuccess {
  hostname: string;
  version: ApiVersion;
}

/**
 * Asks every hostname for the API version in parallel and takes the first
 * usable answer; every hostname points at the same box.
 *
 * `Promise.any` settles on the first *fulfilment*, so a fast failure (a refused
 * connection) cannot beat a good answer and a hung hostname cannot delay one.
 * Losers are not cancelled; they run out their own timeout unobserved.
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
  logger?: Logger,
  protocol?: ApplianceProtocol,
  reconnect?: ReconnectOptions
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
  return clientClassFor(version) !== undefined;
}

/**
 * The client class this version resolves to, or `undefined` if none does.
 *
 * Exported for `src/testing`, which builds a fake on top of the same class the
 * real factory would have picked. A second copy of the map there would be a
 * second thing to update when a version lands, and its symptom would be a fake
 * silently one version behind the client it stands in for.
 */
export function clientClassFor(version: ApiVersion): ClientConstructor | undefined {
  return CLIENT_BY_VERSION_KEY[clientVersionKey(version)];
}

/**
 * Maps a discovered version to its client implementation.
 *
 * The final cast is deliberate: per-version directories are mutually
 * unassignable (`alert.list_categories` changed shape in v26), so the map is
 * typed against the shared base and the caller's `D` is reapplied here.
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
    logger,
    opts.protocol,
    { retryDelay: opts.retryDelay, maxRetry: opts.maxRetry }
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
