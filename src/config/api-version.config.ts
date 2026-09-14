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
   * second decision to make, and therefore nothing to keep in sync.
   *
   * To move the floor, change `--min-version` in the `generate:api` script in
   * package.json and regenerate; this follows on its own. Written as a literal
   * it would duplicate that value with nothing enforcing agreement, so raising
   * one and forgetting the other would silently keep generating types for
   * versions the client rejects.
   */
  MIN_SUPPORTED_VERSION: SUPPORTED_API_VERSIONS[0],

  /**
   * Maximum supported API version. Systems above it are rejected.
   *
   * Deliberately NOT derived like MIN: generating types for a new year does
   * not write its client, so the ceiling is the newest version in
   * `CLIENT_BY_VERSION_KEY`. A factory test asserts the two agree.
   */
  MAX_SUPPORTED_VERSION: 'v27.0.0',

  /**
   * Version assumed when discovery is CORS-blocked, as v25.10.0's
   * `/api/versions` is. Used only for an appliance that answers a reachability
   * probe yet still refuses discovery; one that answers nothing is reported as
   * unreachable instead.
   */
  FALLBACK_VERSION: 'v25.10.0',
} as const satisfies Record<
  'MIN_SUPPORTED_VERSION' | 'MAX_SUPPORTED_VERSION' | 'FALLBACK_VERSION',
  SupportedApiVersion
>;
