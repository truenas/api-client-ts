/**
 * API Version Configuration
 * Defines the supported range of TrueNAS API versions.
 *
 * Update these values as new API versions are released and old ones are deprecated.
 *
 * Version format:
 * - Legacy (v25.x): vYY.MM.PATCH where MM is month (01-12)
 *   - Example: v25.10.0 = October 2025, patch 0
 * - New (v26+): vYY.MINOR.PATCH where MINOR is minor version (0-99)
 *   - Example: v26.0.0 = 2026, minor 0, patch 0
 *   - Breaking changes only in yearly releases (v26.0.0, v27.0.0, etc.)
 */
export const apiVersionConfig = {
  /**
   * Minimum supported API version.
   * Systems with older API versions will be rejected.
   */
  MIN_SUPPORTED_VERSION: 'v25.10.0',

  /**
   * Maximum supported API version.
   * Systems with newer API versions will be rejected.
   */
  MAX_SUPPORTED_VERSION: 'v26.0.0',

  /**
   * Fallback version to use when version discovery fails due to CORS/network errors.
   * When /api/versions returns HTTP status 0 (CORS block, network down, etc.),
   * the system will attempt to connect using this version as a best-effort fallback.
   *
   * WARNING: Status 0 errors have multiple causes:
   * - CORS policy blocking the request
   * - Network disconnected
   * - DNS lookup failure
   * - Server unreachable
   *
   * Using this fallback means systems with genuine network issues will still
   * attempt connection (and fail during WebSocket handshake instead of immediately).
   */
  FALLBACK_VERSION: 'v25.10.0',
} as const;
