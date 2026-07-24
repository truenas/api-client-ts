/**
 * Abstract base class for TrueNAS API clients
 *
 * Provides common implementation for all API versions. Version-specific clients
 * extend this class and override factory methods to provide custom implementations
 * when needed.
 *
 * This class manages the lifecycle of all TrueNAS connection components:
 * - TrueNasConnection (WebSocket connection management)
 * - TrueNasApi (API call handling)
 * - TrueNasAuthenticator (authentication)
 */

import { TrueNasApi } from '@/api/truenas-api';
import { TrueNasAuthenticator } from '@/auth/truenas-authenticator';
import { TrueNasConnection } from '@/connection/truenas-connection';
import { Logger, noopLogger } from '@/logger';
import {
  ApiVersionsAtLeast,
  ApiVersionString,
  ClientSupportedVersion,
} from '@/types/api-surface.type';
import { ApiVersion } from '@/types/api-version.type';
import { OperationMappings } from '@/types/operation-mappings.interface';
import {
  compareVersions,
  getWebSocketPath,
  parseApiVersion,
} from '@/utils/api-version.utils';

/**
 * `V` is the set of API versions this client might be speaking; it types the
 * whole `api` surface (see `api-surface.type.ts`). Version-specific subclasses
 * pin it to their family, and callers who know their exact target can pin it
 * further (`new TrueNasApiClientV2510<'v25.10.5'>(…)`). The default — the
 * configured supported range — is the honest surface when the version is only
 * discovered at runtime.
 */
export abstract class TrueNasApiClient<
  V extends ApiVersionString = ClientSupportedVersion,
> {
  /** API version information for this client */
  readonly version: ApiVersion;

  /** WebSocket connection manager */
  readonly connection: TrueNasConnection;

  /** Authentication manager */
  readonly authenticator: TrueNasAuthenticator;

  /** API call handler, typed to this client's API version(s). */
  readonly api: TrueNasApi<V>;

  /**
   * Version-agnostic operation mappings
   *
   * Provides a unified interface for operations that differ between API versions.
   * Each version-specific client implements these operations using its own endpoints.
   *
   * Usage:
   * ```typescript
   * truenas.ops.containerQuery().subscribe(containers => ...);
   * truenas.ops.containerStart(id).subscribe(jobId => ...);
   * ```
   */
  readonly ops: OperationMappings;

  /** System UUID */
  protected readonly uuid: string;

  /** System hostnames (primary and fallback) */
  protected readonly hostnames: string[];

  /**
   * Initial connection gate, forwarded to the connection. The app flips it later
   * via `connection.setEnabled()` (mapping its `SystemState.Active -> true`).
   */
  protected readonly enabled: boolean;

  /** System name (optional) */
  protected readonly systemName: string | undefined;

  /** Logger forwarded to the connection (defaults to a no-op). */
  protected readonly logger: Logger;

  constructor(
    uuid: string,
    hostnames: string[],
    version: ApiVersion,
    enabled: boolean,
    systemName?: string,
    logger: Logger = noopLogger
  ) {
    this.uuid = uuid;
    this.hostnames = hostnames;
    this.version = version;
    this.enabled = enabled;
    this.systemName = systemName;
    this.logger = logger;

    // Initialize components using factory methods
    // Subclasses can override factory methods to provide version-specific implementations
    //
    // IMPORTANT: Initialization order matters! Do not reorder these lines.
    // Each component may depend on previous ones:
    // 1. connection (no dependencies)
    // 2. authenticator (depends on connection)
    // 3. api (depends on authenticator and connection)
    // 4. ops (depends on api)
    this.connection = this.createConnection();
    this.authenticator = this.createAuthenticator();
    this.api = this.createApi();
    this.ops = this.createOperations();
  }

  /**
   * Get current connection status.
   * @returns true if WebSocket is connected
   */
  get connected(): boolean {
    return this.connection.opened.getValue();
  }

  /**
   * Get current authentication status.
   * @returns true if authenticated with the system
   */
  get authenticated(): boolean {
    return this.authenticator.authenticated$.getValue();
  }

  /**
   * Close the WebSocket connection.
   * Connection will automatically retry if retry is enabled.
   */
  close(): void {
    this.connection.close();
  }

  /**
   * Factory method to create the WebSocket connection.
   * Override in subclasses to provide version-specific connection handling.
   */
  protected createConnection(): TrueNasConnection {
    const websocketPath = getWebSocketPath(this.version);
    return new TrueNasConnection(
      this.enabled,
      this.hostnames,
      this.uuid,
      websocketPath,
      this.systemName,
      undefined, // retryDelay (use default)
      undefined, // maxRetry (use default)
      this.logger
    );
  }

  /**
   * Narrows this client to API versions at or above `minimum`, unlocking the
   * methods those versions guarantee.
   *
   * This is the blessed way to reach version-specific API surface. Prefer it
   * over `instanceof`: client classes cover a whole family (one class for all
   * of v25.10.x), so `instanceof` cannot distinguish patch-level differences,
   * whereas the negotiated version this compares against is exact — it is the
   * version pinned in the WebSocket path.
   *
   * ```ts
   * if (client.supports('v26.0.0')) {
   *   client.api.call('api_key.convert_raw_key', [rawKey]);
   * }
   * ```
   *
   * Caveat: when version discovery falls back to an assumed version (see
   * `createTrueNasClient`), this reports on the assumption, not on what the
   * server actually speaks.
   */
  supports<T extends ApiVersionString>(
    minimum: T
  ): this is TrueNasApiClient<Extract<V, ApiVersionsAtLeast<T>>> {
    const min = parseApiVersion(minimum);
    return min !== null && compareVersions(this.version, min) >= 0;
  }

  /**
   * Factory method to create the API handler.
   * Override in subclasses to provide version-specific API implementations.
   */
  protected createApi(): TrueNasApi<V> {
    return new TrueNasApi<V>(
      this.authenticator.authenticated$,
      this.connection
    );
  }

  /**
   * Factory method to create the authenticator.
   * Override in subclasses to provide version-specific authentication.
   */
  protected createAuthenticator(): TrueNasAuthenticator {
    return new TrueNasAuthenticator(this.connection);
  }

  /**
   * Factory method to create version-specific operation mappings.
   * Must be implemented by subclasses to provide version-specific implementations.
   *
   * This is the primary extension point for handling API differences between versions.
   */
  protected abstract createOperations(): OperationMappings;
}
