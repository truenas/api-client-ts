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
import { httpScheme, type ApplianceProtocol } from '@/types/transport.type';
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

/**
 * The probe's own budget, matching discovery's. A host that accepts the socket
 * and then says nothing would otherwise hold the probe for as long as the
 * runtime's own network timeout — minutes, in a browser — while the caller
 * waits on a question that was meant to be quick.
 */
const probeTimeoutMs = 5000;

/**
 * What a reachability probe found. Three states rather than two: "we asked and
 * got silence" and "there was no way to ask" refuse the CORS fallback for
 * different reasons, and collapsing them into one `false` is the conflation
 * this whole change exists to undo.
 */
export type Reachability = 'reachable' | 'silent' | 'cannot-ask';

/**
 * Whether this runtime enforces CORS on `fetch`, and therefore whether a
 * discovery failure could be a refusal rather than an absence.
 *
 * A document is the obvious case but not the only one: a worker has no `window`
 * and enforces CORS in full, so asking only about `window` would report
 * "cannot ask" somewhere the question is exactly the one worth asking.
 */
function corsIsEnforced(): boolean {
  const hasDocument =
    typeof window !== 'undefined' && typeof window.document !== 'undefined';
  const inWorker =
    typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope !==
    'undefined';
  return hasDocument || inWorker;
}

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
 * {@link VersionDiscoveryNetworkError} (replacing the old
 * `HttpErrorResponse.status === 0` check). That error names a symptom with
 * several causes, so it opens the client factory's disambiguation rather than
 * deciding it — see {@link VersionDiscovery.probeReachable}.
 */
export class VersionDiscovery {
  private versionCache = new Map<string, Observable<ApiVersion>>();

  constructor(
    private readonly logger: Logger = noopLogger,
    private readonly protocol: ApplianceProtocol = 'https:',
  ) {}

  private versionsUrl(hostname: string): string {
    return `${httpScheme(this.protocol)}//${hostname}/api/versions`;
  }

  /**
   * Whether the appliance answers at all, asked in a way CORS cannot block.
   *
   * A `no-cors` request yields a response the page may not read, but its
   * *arrival* is the whole answer here: something served it. That separates the
   * two failures `fetch` reports identically — a box that refused to share its
   * versions with this origin, and a box that is not there.
   *
   * `cannot-ask` where CORS is not enforced: nothing is blocking anything, so a
   * failed fetch already means unreachable and a probe would only repeat what
   * discovery just found. It is not a quieter way of saying "no".
   */
  async probeReachable(hostname: string): Promise<Reachability> {
    if (!corsIsEnforced()) return 'cannot-ask';

    const url = this.versionsUrl(hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), probeTimeoutMs);

    try {
      // `no-store`, because a `no-cors` GET is cacheable and a fresh
      // `VersionDiscovery` is built per call: a cached answer would report a box
      // that has since gone as reachable, and re-arm the fallback on it.
      await fetch(url, {
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      this.logger.info('Reachability probe answered', { hostname, url });
      return 'reachable';
    } catch (error: unknown) {
      this.logger.warn('Reachability probe got no answer', {
        hostname,
        url,
        error,
      });
      return 'silent';
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Discovers the API version for a given hostname.
   *
   * Makes a GET request to `{protocol}//{hostname}/api/versions` and returns the latest
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

    this.logger.info('Starting version discovery', {
      hostname,
      url: this.versionsUrl(hostname),
    });

    const discovery$ = defer(() => from(this.fetchVersions(hostname))).pipe(
      map(versionStrings => this.selectVersion(hostname, versionStrings)),
      catchError((error: unknown) => {
        // Remove from cache on error to allow retry on next call.
        this.versionCache.delete(hostname);
        // since we're trying multiple hostnames, we expect a hostname
        // to fail every once in a while. so, we `warn` here instead of `error`.
        this.logger.warn('Version discovery failed', { hostname, error });
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
   * other non-2xx or a body that is not an array of strings; lets `TypeError`
   * (network) and `AbortError` (timeout) bubble to `classify`.
   *
   * The element-type check matters: a reachable server returning an array of
   * non-strings (e.g. `[1, 2, 3]`) would otherwise reach `parseApiVersion`, whose
   * `.match()` throws a `TypeError` on a non-string — which `classify` would then
   * misfile as a network error. Validating here keeps it an `InvalidVersionResponseError`.
   */
  private async fetchVersions(hostname: string): Promise<ApiVersionResponse> {
    const url = this.versionsUrl(hostname);
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
      if (!Array.isArray(body) || !body.every(v => typeof v === 'string')) {
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
      this.logger.warn('No valid versions in response', {
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
