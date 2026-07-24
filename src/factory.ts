import { firstValueFrom } from 'rxjs';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import {
  TrueNasApiClientV2510,
  V2510ApiVersion,
} from '@/client/truenas-api-client-v25-10';
import {
  TrueNasApiClientV26,
  V26ApiVersion,
} from '@/client/truenas-api-client-v26';
import { apiVersionConfig } from '@/config/api-version.config';
import {
  VersionDiscoveryNetworkError,
  VersionTooNewError,
  VersionTooOldError,
} from '@/errors/version-discovery.errors';
import { Logger, noopLogger } from '@/logger';
import { ClientSupportedVersion } from '@/types/api-surface.type';
import { ApiVersion, VersionCompatibility } from '@/types/api-version.type';
import {
  checkVersionCompatibility,
  legacyCutoffYear,
  parseApiVersion,
} from '@/utils/api-version.utils';
import { VersionDiscovery } from '@/version-discovery';

/**
 * The client type produced when the API version is discovered at runtime.
 *
 * It is typed at the version-agnostic surface — everything the supported
 * range agrees on — because the concrete implementation is not known until
 * discovery completes. Version-specific surface is reached by narrowing with
 * `client.supports('vX.Y.Z')` (preferred) or `instanceof`.
 *
 * Deliberately NOT a union of the concrete client classes: a union of
 * classes has no single callable `call` signature, so even shared methods
 * would require narrowing first — which would break every version-agnostic
 * call site for no safety gain.
 */
export type AnyTrueNasApiClient = TrueNasApiClient<ClientSupportedVersion>;

/**
 * The client implementation that serves API version `V`.
 *
 * Deliberately NON-distributive (`[V] extends [X]`): a distributive form turns
 * a union `V` into a union of differently-pinned client classes, whose generic
 * `call`/`job`/`events` signatures cannot be resolved to one call signature —
 * so `client.api.call(…)` would fail with "no signatures compatible". A union
 * `V` (what a caller pinning from a config value produces, since the value's
 * declared type is the whole union rather than a literal) therefore falls
 * through to {@link AnyTrueNasApiClient}: the conservative surface, which is
 * usable. A literal `V` still selects the exact class.
 *
 * The fallback is also `AnyTrueNasApiClient` rather than `never` for a
 * version with no client implementation, because `never` is assignable to
 * everything and would silently poison call sites instead of failing. That
 * gap is caught at build time by the exhaustiveness assertion in
 * `api-surface.spec-d.ts`.
 */
export type ClientForVersion<V extends ClientSupportedVersion> = [V] extends [
  V2510ApiVersion,
]
  ? TrueNasApiClientV2510<V>
  : [V] extends [V26ApiVersion]
    ? TrueNasApiClientV26<V>
    : AnyTrueNasApiClient;

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
  /**
   * Skip version discovery and connect as this exact API version.
   *
   * For callers that already know what they are talking to — an on-appliance
   * UI shipped alongside its middleware, or a tool pinned to one system.
   * Passing a literal (`version: 'v26.0.0'`) types the returned client to
   * that version exactly, so its whole API surface is available with no
   * narrowing.
   *
   * Omit it for fleet/multi-system callers: discovery then negotiates per
   * system and the return type is {@link AnyTrueNasApiClient}.
   */
  version?: ClientSupportedVersion;
}

/**
 * Creates a client pinned to a known API version, skipping discovery.
 *
 * The literal `version` selects the client implementation *and* types its
 * whole API surface to that exact version — no narrowing needed.
 */
export async function createTrueNasClient<V extends ClientSupportedVersion>(
  opts: CreateClientOptions & { version: V }
): Promise<ClientForVersion<V>>;

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
): Promise<AnyTrueNasApiClient>;

export async function createTrueNasClient(
  opts: CreateClientOptions
): Promise<AnyTrueNasApiClient> {
  const { uuid, hostnames, systemName } = opts;
  const logger = opts.logger ?? noopLogger;

  if (!hostnames || hostnames.length === 0) {
    throw new Error(
      `Cannot create client for system ${uuid}: hostnames array is empty`
    );
  }

  // Explicit version: the caller already knows what it is talking to.
  //
  // This skips the `/api/versions` round trip by design, but NOT the range
  // check — a pin outside the supported range must fail the same way, and
  // with the same typed error, as a server that reported it. `version` is
  // typed to the supported range, so this catches JavaScript callers and
  // values that were cast or read from config.
  if (opts.version) {
    const pinned = parseApiVersion(opts.version);
    if (!pinned) {
      throw new Error(
        `Cannot create client for system ${uuid}: invalid version ${opts.version}`
      );
    }

    const compatibility = checkVersionCompatibility(pinned);
    if (compatibility !== VersionCompatibility.Compatible) {
      logger.error('Pinned API version is outside the supported range', {
        uuid: uuid.slice(0, 8),
        version: opts.version,
        compatibility,
      });
      throw compatibility === VersionCompatibility.TooOld
        ? new VersionTooOldError(hostnames[0], [opts.version])
        : new VersionTooNewError(hostnames[0], [opts.version]);
    }

    logger.info('Creating API client for explicitly pinned version', {
      uuid: uuid.slice(0, 8),
      version: opts.version,
      systemName,
    });
    return instantiateClientForVersion(pinned, opts, logger);
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

/**
 * Maps a discovered version to its client implementation by `year.month` (v25.x)
 * or `year` (v26+): `25.10` -> V2510, `26` -> V26.
 */
/**
 * Widening a version-pinned client to the version-agnostic type is sound: the
 * agnostic surface only admits what every supported version agrees on, so
 * every call it permits is one the pinned client accepts, and every response
 * the pinned client returns is covered by the agnostic union.
 */
function instantiateClientForVersion(
  version: ApiVersion,
  opts: CreateClientOptions,
  logger: Logger
): AnyTrueNasApiClient {
  const { uuid, hostnames, enabled, systemName } = opts;

  let versionKey: string;
  if (version.year <= legacyCutoffYear) {
    // Legacy scheme (vYY.MM): all patches of a month share one client.
    const monthPadded = version.minor.toString().padStart(2, '0');
    versionKey = `${version.year.toString()}.${monthPadded}`;
  } else {
    // Yearly scheme (v26+): the year selects the client.
    versionKey = version.year.toString();
  }

  switch (versionKey) {
    case '25.10':
      logger.info('Instantiating TrueNasApiClientV2510', {
        uuid: uuid.slice(0, 8),
        version: version.version,
        versionKey,
      });
      return new TrueNasApiClientV2510(
        uuid,
        hostnames,
        version,
        enabled,
        systemName,
        logger
      ) as unknown as AnyTrueNasApiClient;

    case '26':
      logger.info('Instantiating TrueNasApiClientV26', {
        uuid: uuid.slice(0, 8),
        version: version.version,
        versionKey,
      });
      return new TrueNasApiClientV26(
        uuid,
        hostnames,
        version,
        enabled,
        systemName,
        logger
      ) as unknown as AnyTrueNasApiClient;

    default:
      // Should not happen: discovery only yields compatible versions. Defensive.
      logger.error('No client implementation for version', {
        uuid: uuid.slice(0, 8),
        version: version.version,
        versionKey,
      });
      throw new Error(
        `No client implementation for API version ${version.version}. ` +
          `Supported versions: v25.10.x, v26.x.y. Version key: ${versionKey}`
      );
  }
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
