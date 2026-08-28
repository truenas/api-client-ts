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
   * NOT derived, deliberately — and for a different reason than it used to
   * lag. It sat at v26.0.0 while types for v27 already shipped, because
   * `CLIENT_BY_VERSION_KEY` had no `27` and a v27 system would have passed the
   * range check only to throw on client selection. `TrueNasApiClientV27` now
   * exists, so this moves up with it.
   *
   * What it must not become is `SUPPORTED_API_VERSIONS[length - 1]`, the mirror
   * of how MIN is derived. MIN is safe to derive because the oldest generated
   * version always has a client — it is the floor the clients were built from.
   * The ceiling is not symmetric: generating types for v28 does not write a v28
   * client, so deriving this would re-create the exact gap described above on
   * the next regeneration, silently. The real invariant is "the newest version
   * a client can be built for", which lives in `CLIENT_BY_VERSION_KEY`; a
   * factory test asserts the two agree, which is the check that keeps this
   * literal honest without importing the factory here.
   */
  MAX_SUPPORTED_VERSION: 'v27.0.0',

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
   * Which is why it is no longer reached on all of them. A discovery failure is
   * now put to a reachability probe and a second attempt first, and only an
   * appliance that answers the probe and still will not serve `/api/versions`
   * is assumed to be this version. One that answers nothing is reported as
   * unreachable rather than pinned to a version nobody confirmed.
   */
  FALLBACK_VERSION: 'v25.10.0',
} as const satisfies Record<
  'MIN_SUPPORTED_VERSION' | 'MAX_SUPPORTED_VERSION' | 'FALLBACK_VERSION',
  SupportedApiVersion
>;
