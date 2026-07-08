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
import { ApiVersion } from '@/types/api-version.type';
import { OperationMappings } from '@/types/operation-mappings.interface';
import { getWebSocketPath } from '@/utils/api-version.utils';

export abstract class TrueNasApiClient {
  /** API version information for this client */
  readonly version: ApiVersion;

  /** WebSocket connection manager */
  readonly connection: TrueNasConnection;

  /** Authentication manager */
  readonly authenticator: TrueNasAuthenticator;

  /** API call handler */
  readonly api: TrueNasApi;

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
   * Factory method to create the API handler.
   * Override in subclasses to provide version-specific API implementations.
   */
  protected createApi(): TrueNasApi {
    return new TrueNasApi(this.authenticator.authenticated$, this.connection);
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
