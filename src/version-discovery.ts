import { Observable, defer, from, throwError } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { apiVersionConfig } from '@/config/api-version.config';
import {
  InvalidVersionResponseError,
  NoCompatibleVersionsError,
  VersionDiscoveryError,
  VersionDiscoveryNetworkError,
  VersionDiscoveryTimeoutError,
  VersionEndpointNotFoundError,
  VersionTooNewError,
  VersionTooOldError,
} from '@/errors/version-discovery.errors';
import { Logger, noopLogger } from '@/logger';
import {
  ApiVersion,
  ApiVersionResponse,
  VersionCompatibility,
} from '@/types/api-version.type';
import {
  checkVersionCompatibility,
  compareVersions,
  filterCompatibleVersions,
  parseApiVersion,
} from '@/utils/api-version.utils';

const discoveryTimeoutMs = 5000;

/** True when `error` looks like `{ name }` equal to `expected` (robust to DOMException). */
function hasErrorName(error: unknown, expected: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === expected
  );
}

/**
 * Discovers available API versions from TrueNAS systems.
 *
 * Performs a `fetch` GET to the `/api/versions` endpoint and:
 * - Parses version strings
 * - Filters to compatible versions (within MIN/MAX range)
 * - Selects the latest compatible version
 * - Caches results per hostname
 * - Classifies failures into typed {@link VersionDiscoveryError} subclasses
 *
 * This is the framework-agnostic replacement for the app's Angular `HttpClient`
 * service. Because `fetch` resolves (rather than rejects) on non-2xx responses and
 * throws a `TypeError` on network/CORS/unreachable failures, the error contract
 * differs from the original: a network/CORS/unreachable failure surfaces as a
 * {@link VersionDiscoveryNetworkError} — the sentinel the client factory keys on for
 * its CORS fallback (replacing the old `HttpErrorResponse.status === 0` check).
 */
export class VersionDiscovery {
  private versionCache = new Map<string, Observable<ApiVersion>>();

  constructor(private readonly logger: Logger = noopLogger) {}

  /**
   * Discovers the API version for a given hostname.
   *
   * Makes a GET request to `https://{hostname}/api/versions` and returns the latest
   * compatible version. Results are cached per hostname; the cache entry is removed
   * on failure so the next call retries.
   *
   * @param hostname - The TrueNAS system hostname (e.g., "truenas.local")
   * @returns Observable that emits the selected ApiVersion
   * @throws VersionDiscoveryError subclasses for specific failure scenarios
   */
  discoverVersion(hostname: string): Observable<ApiVersion> {
    const cached = this.versionCache.get(hostname);
    if (cached) {
      this.logger.info('Version discovery cache hit', { hostname });
      return cached;
    }

    const url = `https://${hostname}/api/versions`;
    this.logger.info('Starting version discovery', { hostname, url });

    const discovery$ = defer(() => from(this.fetchVersions(hostname))).pipe(
      map(versionStrings => this.selectVersion(hostname, versionStrings)),
      catchError((error: unknown) => {
        // Remove from cache on error to allow retry on next call.
        this.versionCache.delete(hostname);
        this.logger.error('Version discovery failed', { hostname, error });
        return throwError(() => this.classify(error, hostname));
      }),
      shareReplay(1)
    );

    this.versionCache.set(hostname, discovery$);
    return discovery$;
  }

  /**
   * Clears the version cache for a specific hostname or all hostnames.
   *
   * @param hostname - Optional hostname to clear. If omitted, clears all cached versions.
   */
  clearCache(hostname?: string): void {
    if (hostname) {
      this.versionCache.delete(hostname);
    } else {
      this.versionCache.clear();
    }
  }

  /**
   * Performs the `fetch` with a 5-second `AbortController` timeout and inspects the
   * *resolved* Response (fetch does not reject on non-2xx). Throws
   * `VersionEndpointNotFoundError` on 404 and `InvalidVersionResponseError` on any
   * other non-2xx or a non-array body; lets `TypeError` (network) and `AbortError`
   * (timeout) bubble to `classify`.
   */
  private async fetchVersions(hostname: string): Promise<ApiVersionResponse> {
    const url = `https://${hostname}/api/versions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), discoveryTimeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (response.status === 404) {
        throw new VersionEndpointNotFoundError(hostname);
      }
      if (!response.ok) {
        throw new InvalidVersionResponseError(
          hostname,
          `HTTP ${String(response.status)}`
        );
      }

      const body: unknown = await response.json();
      if (!Array.isArray(body)) {
        throw new InvalidVersionResponseError(
          hostname,
          'Response was not an array of version strings'
        );
      }

      return body as ApiVersionResponse;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parses, filters, and selects the latest compatible version from the raw response
   * array. Throws the appropriate typed error when no valid/compatible version exists.
   */
  private selectVersion(
    hostname: string,
    versionStrings: ApiVersionResponse
  ): ApiVersion {
    this.logger.info('Version discovery response received', {
      hostname,
      versionCount: versionStrings.length,
      versions: versionStrings,
    });

    const parsedVersions = versionStrings
      .map(parseApiVersion)
      .filter((v): v is ApiVersion => v !== null);

    if (parsedVersions.length === 0) {
      this.logger.error('No valid versions in response', {
        hostname,
        versionStrings,
      });
      throw new InvalidVersionResponseError(
        hostname,
        'No valid API versions found in response'
      );
    }

    const compatibleVersions = filterCompatibleVersions(parsedVersions);

    this.logger.info('Version compatibility check', {
      hostname,
      total: parsedVersions.length,
      compatible: compatibleVersions.length,
      supportedRange: {
        min: apiVersionConfig.MIN_SUPPORTED_VERSION,
        max: apiVersionConfig.MAX_SUPPORTED_VERSION,
      },
    });

    if (compatibleVersions.length === 0) {
      const allTooOld = parsedVersions.every(
        v => checkVersionCompatibility(v) === VersionCompatibility.TooOld
      );
      const allTooNew = parsedVersions.every(
        v => checkVersionCompatibility(v) === VersionCompatibility.TooNew
      );

      const availableVersions = parsedVersions.map(v => v.version);

      if (allTooOld) {
        this.logger.warn('All available versions too old', {
          hostname,
          availableVersions,
        });
        throw new VersionTooOldError(hostname, availableVersions);
      } else if (allTooNew) {
        this.logger.warn('All available versions too new', {
          hostname,
          availableVersions,
        });
        throw new VersionTooNewError(hostname, availableVersions);
      } else {
        this.logger.warn('No compatible versions found', {
          hostname,
          availableVersions,
        });
        throw new NoCompatibleVersionsError(hostname, availableVersions);
      }
    }

    // Select latest compatible version (sort by highest first).
    const sortedVersions = compatibleVersions.sort((a, b) =>
      compareVersions(b, a)
    );
    const selectedVersion = sortedVersions[0];

    this.logger.info('Version selected', {
      hostname,
      selected: selectedVersion.version,
      websocketPath: selectedVersion.websocketPath,
    });

    return selectedVersion;
  }

  /**
   * Maps a raw failure to a typed {@link VersionDiscoveryError}. Errors thrown by
   * `fetchVersions`/`selectVersion` are already typed and pass through unchanged; a
   * `fetch` `TypeError` becomes {@link VersionDiscoveryNetworkError} (the CORS/network
   * sentinel), an `AbortError` becomes {@link VersionDiscoveryTimeoutError}, and any
   * other failure (e.g. an unparseable body's `SyntaxError`) becomes
   * {@link InvalidVersionResponseError}.
   */
  private classify(error: unknown, hostname: string): Error {
    // Already a typed version-discovery error (from fetchVersions or selectVersion).
    if (error instanceof VersionDiscoveryError) {
      return error;
    }

    // Abort → timeout.
    if (hasErrorName(error, 'AbortError')) {
      this.logger.warn('Version discovery timeout', { hostname });
      return new VersionDiscoveryTimeoutError(hostname);
    }

    // fetch network/CORS/unreachable failures reject with a TypeError. This is the
    // new "status 0" sentinel the client factory detects for its CORS fallback.
    if (error instanceof TypeError) {
      this.logger.warn('Version discovery network error', {
        hostname,
        message: error.message,
      });
      return new VersionDiscoveryNetworkError(hostname, error);
    }

    // Unparseable body (a `SyntaxError` from `response.json()`) or anything else.
    const reason = error instanceof Error ? error.message : 'Unknown error';
    this.logger.warn('Version discovery failed with unknown error', {
      hostname,
      reason,
    });
    return new InvalidVersionResponseError(
      hostname,
      `Versioned API not available. This system may be running an older TrueNAS version (requires v25.10.0+). ${reason}`
    );
  }
}
