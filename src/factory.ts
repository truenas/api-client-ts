import { firstValueFrom } from 'rxjs';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import { TrueNasApiClientV2510 } from '@/client/truenas-api-client-v25-10';
import { TrueNasApiClientV26 } from '@/client/truenas-api-client-v26';
import { apiVersionConfig } from '@/config/api-version.config';
import { VersionDiscoveryNetworkError } from '@/errors/version-discovery.errors';
import { Logger, noopLogger } from '@/logger';
import { ApiVersion } from '@/types/api-version.type';
import { legacyCutoffYear, parseApiVersion } from '@/utils/api-version.utils';
import { VersionDiscovery } from '@/version-discovery';

/** Options for {@link createTrueNasClient}. */
export interface CreateClientOptions {
  /** System UUID. */
  uuid: string;
  /** Hostnames to connect to — primary first, then fallbacks. */
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
 * 1. Discovers the API version from the primary hostname (`GET /api/versions`).
 * 2. Selects the matching client implementation (`v25.10.x` -> `TrueNasApiClientV2510`,
 *    `v26.x.y` -> `TrueNasApiClientV26`).
 * 3. Instantiates and returns it.
 *
 * Resolves exactly once with a single client instance — dispose of it with
 * `client.close()` when done.
 *
 * @returns a Promise that resolves with the created client, or rejects with a
 *   {@link VersionDiscoveryError} subclass (or a client-selection error).
 *   Rejects if `hostnames` is empty.
 */
export async function createTrueNasClient(
  opts: CreateClientOptions
): Promise<TrueNasApiClient> {
  const { uuid, hostnames, systemName } = opts;
  const logger = opts.logger ?? noopLogger;

  if (!hostnames || hostnames.length === 0) {
    throw new Error(
      `Cannot create client for system ${uuid}: hostnames array is empty`
    );
  }

  const primaryHostname = hostnames[0];
  const versionDiscovery = new VersionDiscovery(logger);

  logger.info('Creating versioned API client', {
    uuid: uuid.slice(0, 8),
    hostname: primaryHostname,
    systemName,
  });

  let version: ApiVersion;
  try {
    version = await firstValueFrom(
      versionDiscovery.discoverVersion(primaryHostname)
    );
    logger.info('API version discovered, instantiating client', {
      uuid: uuid.slice(0, 8),
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
    if (!(error instanceof VersionDiscoveryNetworkError)) {
      // For other errors (version too old/too new, invalid response, etc.), re-throw.
      logger.error('Version discovery failed', {
        uuid: uuid.slice(0, 8),
        hostname: primaryHostname,
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
        hostname: primaryHostname,
        fallbackVersion: fallbackVersionString,
      });
      throw error;
    }

    logger.warn(
      'Version discovery failed with a network error (possible CORS or ' +
        'network issue), falling back to assumed version',
      {
        uuid: uuid.slice(0, 8),
        hostname: primaryHostname,
        fallbackVersion: fallbackVersionString,
        originalError: errorMessage,
        warning:
          'A network error has multiple causes (CORS, network down, DNS ' +
          'failure). The connection may still fail during the WebSocket handshake.',
      }
    );

    version = fallbackVersion;
  }

  return instantiateClientForVersion(version, opts, logger);
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

/** Maps a discovered version to its client implementation. */
function instantiateClientForVersion(
  version: ApiVersion,
  opts: CreateClientOptions,
  logger: Logger
): TrueNasApiClient {
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
  return new Client(uuid, hostnames, version, enabled, systemName, logger);
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
