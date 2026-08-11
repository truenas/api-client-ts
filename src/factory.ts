import { firstValueFrom } from 'rxjs';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import { TrueNasApiClientV2510 } from '@/client/truenas-api-client-v25-10';
import { TrueNasApiClientV26 } from '@/client/truenas-api-client-v26';
import { apiVersionConfig } from '@/config/api-version.config';
import type { ApiDirectoryV25_10_0 } from '@/generated';
import { NoCompatibleVersionsError, VersionDiscoveryNetworkError, VersionTooNewError, VersionTooOldError } from '@/errors/version-discovery.errors';
import { Logger, noopLogger } from '@/logger';
import type { ApiDirectoryShape } from '@/types/api-directory.type';
import { ApiVersion } from '@/types/api-version.type';
import { legacyCutoffYear, parseApiVersion } from '@/utils/api-version.utils';
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
}

/**
 * Creates a version-specific TrueNAS API client.
 *
 * 1. Discovers the API version (`GET /api/versions`), asking every hostname in
 *    parallel. The first usable answer wins.
 * 2. Selects the matching client implementation (`v25.10.x` -> `TrueNasApiClientV2510`,
 *    `v26.x.y` -> `TrueNasApiClientV26`).
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
 * @typeParam D - the generated API surface the client is typed against, as a
 *   whole (`call`, `job`, `event`). Every verb resolves method names against
 *   it, so naming a method this surface does not have is a build error.
 * @returns a Promise that resolves with the created client, or rejects with a
 *   {@link VersionDiscoveryError} subclass (or a client-selection error).
 *   Rejects only if discovery failed on *every* hostname, with the most
 *   informative of the per-hostname failures (see `selectRepresentativeFailure`).
 *   Rejects if `hostnames` is empty.
 */
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

  const versionDiscovery = new VersionDiscovery(logger);

  logger.info('Creating versioned API client', {
    uuid: uuid.slice(0, 8),
    hostnames: hostnames.join(', '),
    systemName,
  });

  let version: ApiVersion;
  try {
    const winner = await discoverVersionFromAnyHostname(
      uuid,
      hostnames,
      versionDiscovery,
      logger
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
    // NOTE: This fallback is reached if *all* version discovery attempts for each hostname
    // fail to give a proper list of versions they support. In that case, `error` will
    // be a `VersionDiscoveryNetworkError` or an explicitly unhandled error. In the unhandled case,
    // we run the statement immediately below. In the network error case, we commence the fallback.
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
 * @param uuid System UUID (for logging).
 * @param hostnames Non-empty array of hostnames to try.
 * @throws the representative failure if no hostname answered.
 */
async function discoverVersionFromAnyHostname(
  uuid: string,
  hostnames: string[],
  versionDiscovery: VersionDiscovery,
  logger: Logger
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

    logger.warn('Version discovery failed on all hostnames', {
      uuid: uuid.slice(0, 8),
      failedHostnames: hostnames.join(', '),
    });

    throw selectRepresentativeFailure(failures);
  }
}

/**
 * Pick which failure to surface when no hostname gave a usable version.
 *
 * If there are any version compatibility errors, we choose those, since
 * they give more information than a network error.
 */
function selectRepresentativeFailure(failures: unknown[]): unknown {
  const isVersionError = (error: unknown) =>
    error instanceof VersionTooOldError
    || error instanceof VersionTooNewError
    || error instanceof NoCompatibleVersionsError;

  const isNetworkError = (error: unknown) =>
    error instanceof VersionDiscoveryNetworkError;

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
