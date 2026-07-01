import { apiVersionConfig } from '@/config/api-version.config';

/**
 * Base class for all version discovery errors
 */
export abstract class VersionDiscoveryError extends Error {
  constructor(
    message: string,
    readonly hostname: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when all available API versions are older than minimum supported version
 */
export class VersionTooOldError extends VersionDiscoveryError {
  constructor(
    hostname: string,
    readonly availableVersions: string[],
    readonly minRequired: string = apiVersionConfig.MIN_SUPPORTED_VERSION
  ) {
    super(
      `System API version is too old. Minimum supported: ${minRequired}. Available versions: ${availableVersions.join(
        ', '
      )}`,
      hostname
    );
  }
}

/**
 * Thrown when all available API versions are newer than maximum supported version
 */
export class VersionTooNewError extends VersionDiscoveryError {
  constructor(
    hostname: string,
    readonly availableVersions: string[],
    readonly maxSupported: string = apiVersionConfig.MAX_SUPPORTED_VERSION
  ) {
    super(
      `System API version is too new. Maximum supported: ${maxSupported}. Available versions: ${availableVersions.join(
        ', '
      )}`,
      hostname
    );
  }
}

/**
 * Thrown when the /api/versions endpoint returns 404
 */
export class VersionEndpointNotFoundError extends VersionDiscoveryError {
  constructor(
    hostname: string,
    readonly statusCode: number = 404
  ) {
    super(
      `Version discovery endpoint not found: ${hostname} (HTTP ${String(
        statusCode
      )})`,
      hostname
    );
  }
}

/**
 * Thrown when version discovery request times out
 */
export class VersionDiscoveryTimeoutError extends VersionDiscoveryError {
  constructor(
    hostname: string,
    readonly timeoutMs: number = 5000
  ) {
    super(
      `Cannot connect to system (timeout after ${String(
        timeoutMs
      )}ms): ${hostname}`,
      hostname
    );
  }
}

/**
 * Thrown when version discovery fails due to network error
 */
export class VersionDiscoveryNetworkError extends VersionDiscoveryError {
  constructor(
    hostname: string,
    readonly originalError: Error
  ) {
    super(
      `Network error connecting to ${hostname}: ${originalError.message}`,
      hostname
    );
  }
}

/**
 * Thrown when no compatible versions are found in the response
 */
export class NoCompatibleVersionsError extends VersionDiscoveryError {
  constructor(
    hostname: string,
    readonly availableVersions: string[],
    readonly supportedRange: { min: string; max: string } = {
      min: apiVersionConfig.MIN_SUPPORTED_VERSION,
      max: apiVersionConfig.MAX_SUPPORTED_VERSION,
    }
  ) {
    super(
      `No compatible API versions available. Supported: ${
        supportedRange.min
      } to ${supportedRange.max}. Available: ${availableVersions.join(', ')}`,
      hostname
    );
  }
}

/**
 * Thrown when the API response is malformed or invalid
 */
export class InvalidVersionResponseError extends VersionDiscoveryError {
  constructor(
    hostname: string,
    readonly reason: string
  ) {
    super(`Invalid API response format from ${hostname}: ${reason}`, hostname);
  }
}
