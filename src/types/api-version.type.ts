/**
 * Response from the /api/versions endpoint
 * Returns an array of version strings directly
 * Example: ["v25.10.0", "v25.10.1", "v26.0.0"]
 */
export type ApiVersionResponse = string[];

/**
 * Parsed API version information
 *
 * Version format:
 * - Legacy (v25.x): vYY.MM.PATCH (e.g., v25.10.0 = October 2025, patch 0)
 * - New (v26+): vYY.MINOR.PATCH (e.g., v26.0.0 = 2026, minor 0, patch 0)
 *
 * Note: The second segment has different semantics based on the year:
 * - Year 25: month (1-12)
 * - Year 26+: minor version (0-99)
 */
export interface ApiVersion {
  /** Full version string (e.g., "v26.0.0") */
  version: string;
  /** Two-digit year (e.g., 26 = 2026) */
  year: number;
  /**
   * Second version segment (semantics depend on year):
   * - For v25.x: month (1-12, e.g., 10 = October)
   * - For v26+: minor version (0-99)
   */
  minor: number;
  /** Patch version number (e.g., 0, 1, 2) */
  patch: number;
  /** WebSocket path for this version (e.g., "/api/v26.0.0") */
  websocketPath: string;
}

/**
 * Version compatibility status
 *
 * `Unsupported` is the gap `TooOld`/`TooNew` cannot express: a version inside
 * the supported span that this package still ships no types for. Middleware
 * renumbered 26.0.0 to 27.0.0 before releasing it, so v26.0.0 sits between two
 * shipped versions and a range check calls it compatible — which is how an
 * appliance claiming it reached a code path documented as unreachable.
 */
export enum VersionCompatibility {
  Compatible = 'compatible',
  TooOld = 'too-old',
  TooNew = 'too-new',
  Unsupported = 'unsupported',
  Invalid = 'invalid',
}
