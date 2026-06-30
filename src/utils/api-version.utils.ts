import { apiVersionConfig } from '@/config/api-version.config';
import {
  ApiVersion,
  VersionCompatibility,
} from '@/types/api-version.type';

export const legacyCutoffYear = 25;

/**
 * Parses a version string into an ApiVersion object.
 *
 * Supports two versioning schemes:
 * - Legacy (v25.x): vYY.MM.PATCH where MM is month (1-12)
 * - New (v26+): vYY.MINOR.PATCH where MINOR is minor version (0-99)
 *
 * @param versionString - Version string (e.g., "v25.10.0" or "v26.0.0")
 * @returns Parsed ApiVersion object, or null if invalid format
 *
 * @example
 * parseApiVersion('v25.10.0')
 * // Returns: { version: 'v25.10.0', year: 25, minor: 10, patch: 0, websocketPath: '/api/v25.10.0' }
 *
 * parseApiVersion('v26.0.0')
 * // Returns: { version: 'v26.0.0', year: 26, minor: 0, patch: 0, websocketPath: '/api/v26.0.0' }
 */
export function parseApiVersion(versionString: string): ApiVersion | null {
  // Version format: vYY.MINOR.PATCH (where MINOR is 1-2 digits)
  const regex = /^v(\d{2})\.(\d+)\.(\d+)$/;
  const match = versionString.match(regex);

  if (!match) {
    return null;
  }

  const [, yearStr, minorStr, patchStr] = match;
  const year = parseInt(yearStr, 10);
  const minor = parseInt(minorStr, 10);
  const patch = parseInt(patchStr, 10);

  // For legacy v25.x and similar versions, validate month range (1-12)
  // For v26+ versions, minor can be 0-99
  if (year <= legacyCutoffYear) {
    if (minor < 1 || minor > 12) {
      return null;
    }
  } else if (year >= 26) {
    if (minor < 0 || minor > 99) {
      return null;
    }
  }

  return {
    version: versionString,
    year,
    minor,
    patch,
    websocketPath: `/api/${versionString}`,
  };
}

/**
 * Compares two API versions.
 *
 * @param a - First version
 * @param b - Second version
 * @returns Negative if a < b, zero if a === b, positive if a > b
 *
 * @example
 * compareVersions(v25_10_0, v26_0_0) // Returns negative (v25.10.0 < v26.0.0)
 * compareVersions(v26_1_0, v26_0_0) // Returns positive (v26.1.0 > v26.0.0)
 */
export function compareVersions(a: ApiVersion, b: ApiVersion): number {
  if (a.year !== b.year) {
    return a.year - b.year;
  }
  if (a.minor !== b.minor) {
    return a.minor - b.minor;
  }
  return a.patch - b.patch;
}

/**
 * Checks the compatibility status of a version against supported range.
 *
 * @param version - Version to check
 * @returns VersionCompatibility status
 *
 * @example
 * checkVersionCompatibility(v24_04_0) // Returns VersionCompatibility.TooOld
 * checkVersionCompatibility(v26_0_0) // Returns VersionCompatibility.Compatible
 * checkVersionCompatibility(v27_0_0) // Returns VersionCompatibility.TooNew
 */
export function checkVersionCompatibility(
  version: ApiVersion
): VersionCompatibility {
  const minVersion = parseApiVersion(apiVersionConfig.MIN_SUPPORTED_VERSION);
  const maxVersion = parseApiVersion(apiVersionConfig.MAX_SUPPORTED_VERSION);

  if (!minVersion || !maxVersion) {
    return VersionCompatibility.Invalid;
  }

  if (compareVersions(version, minVersion) < 0) {
    return VersionCompatibility.TooOld;
  }

  if (compareVersions(version, maxVersion) > 0) {
    return VersionCompatibility.TooNew;
  }

  return VersionCompatibility.Compatible;
}

/**
 * Checks if a version is within the supported range.
 *
 * @param version - Version to check
 * @returns True if version is supported (compatible)
 *
 * @example
 * isVersionSupported(v26_0_0) // Returns true
 * isVersionSupported(v24_04_0) // Returns false
 */
export function isVersionSupported(version: ApiVersion): boolean {
  return checkVersionCompatibility(version) === VersionCompatibility.Compatible;
}

/**
 * Filters an array of versions to only those within the supported range.
 *
 * @param versions - Array of versions to filter
 * @returns Array containing only compatible versions
 *
 * @example
 * filterCompatibleVersions([v24_04_0, v25_10_0, v27_04_0])
 * // Returns: [v25_10_0] (only compatible version)
 */
export function filterCompatibleVersions(versions: ApiVersion[]): ApiVersion[] {
  return versions.filter(isVersionSupported);
}

/**
 * Selects the latest compatible version from an array of version strings.
 *
 * @param versionStrings - Array of version strings
 * @returns Latest compatible version, or null if none found
 *
 * @example
 * selectLatestCompatibleVersion(['v25.10.0', 'v25.10.1', 'v26.0.0'])
 * // Returns: { version: 'v26.0.0', ... } (highest compatible version)
 */
export function selectLatestCompatibleVersion(
  versionStrings: string[]
): ApiVersion | null {
  // Parse all version strings
  const parsedVersions = versionStrings
    .map(parseApiVersion)
    .filter((v): v is ApiVersion => v !== null);

  if (parsedVersions.length === 0) {
    return null;
  }

  // Filter to only compatible versions
  const compatibleVersions = filterCompatibleVersions(parsedVersions);

  if (compatibleVersions.length === 0) {
    return null;
  }

  // Sort by version (highest first) and return the latest
  const sortedVersions = compatibleVersions.sort((a, b) =>
    compareVersions(b, a)
  );
  return sortedVersions[0];
}

/**
 * Gets the WebSocket path for a given API version.
 *
 * @param version - API version
 * @returns WebSocket path (e.g., "/api/v26.0.0")
 *
 * @example
 * getWebSocketPath(v26_0_0) // Returns "/api/v26.0.0"
 */
export function getWebSocketPath(version: ApiVersion): string {
  return version.websocketPath;
}
