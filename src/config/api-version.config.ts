/**
 * API Version Configuration
 * Defines the supported range of TrueNAS API versions.
 *
 * Version format:
 * - Legacy (v25.x): vYY.MM.PATCH where MM is month (01-12)
 *   - Example: v25.10.0 = October 2025, patch 0
 * - New (v26+): vYY.MINOR.PATCH where MINOR is minor version (0-99)
 *   - Example: v26.0.0 = 2026, minor 0, patch 0
 *   - Breaking changes only in yearly releases (v26.0.0, v27.0.0, etc.)
 */
import { SUPPORTED_API_VERSIONS, type SupportedApiVersion } from '@/generated';

export const apiVersionConfig = {
  /**
   * Minimum supported API version. Systems below it are rejected.
   *
   * DERIVED, not declared. The client supports exactly the versions it ships
   * types for, so the oldest generated version *is* the minimum — there is no
   * second decision to make, and therefore nothing to keep in sync. Lowering
   * or raising it means changing the generator's `--api-version` list in
   * package.json and regenerating; this follows automatically.
   *
   * Written as a literal it would be a duplicate of that list with nothing
   * enforcing agreement, so bumping one and forgetting the other would
   * silently reintroduce types for versions the client rejects.
   */
  MIN_SUPPORTED_VERSION: SUPPORTED_API_VERSIONS[0],

  /**
   * Maximum supported API version. Systems above it are rejected.
   *
   * NOT derived, deliberately. This should be the newest generated version by
   * the same argument as MIN, but `instantiateClientForVersion` only maps
   * `25.10` and `26` — a v27 system would pass the range check and then throw
   * on client selection. It moves to the newest generated version once a v27
   * client exists. Until then it lags on purpose, and the `satisfies` clause
   * below still pins it to a version that was actually generated.
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
} as const satisfies Record<
  'MIN_SUPPORTED_VERSION' | 'MAX_SUPPORTED_VERSION' | 'FALLBACK_VERSION',
  SupportedApiVersion
>;
