/**
 * Which dump versions to generate.
 *
 * The policy is a floor, not a set: the client supports every version from a
 * minimum upward, and no plan exists to generate arbitrary subsets. Spelling
 * the versions out instead would mean a new middleware release is silently NOT
 * generated until someone remembers to edit the list — the failure is invisible,
 * because the output stays valid and simply lacks the new version.
 *
 * Explicit selection is kept for ad-hoc use (previewing one version, narrowing
 * a repro) but is not how the committed tree is produced.
 */

/**
 * Ascending order for TrueNAS version strings.
 *
 * Numeric collation, so `v25.04.0 < v25.10.0` compares 4 against 10 rather
 * than '0' against '1', and the two-component `v24.10` in the dump sorts
 * before `v24.10.x` would. The dump itself is NOT ordered — it currently
 * starts at v27.0.0 — so nothing may assume its sequence.
 */
export const compareVersionStrings = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true });

export interface SelectVersionsOptions {
  /** Version strings present in the dump, in dump order. */
  available: string[];
  /** Generate this version and every newer one. */
  minVersion?: string;
  /** Explicit selection, or `['all']`. Mutually exclusive with `minVersion`. */
  apiVersions?: string[];
}

/**
 * @returns the versions to generate, ascending; `undefined` to leave the
 *   choice to the pipeline (single-version dumps)
 * @throws Error if both selectors are given, or if the floor is not a version
 *   the dump actually contains
 */
export function selectVersions({
  available,
  minVersion,
  apiVersions,
}: SelectVersionsOptions): string[] | undefined {
  if (minVersion && apiVersions?.length) {
    throw new Error('Pass --min-version or --api-version, not both.');
  }
  if (!minVersion) return apiVersions;

  const sorted = [...available].sort(compareVersionStrings);
  const at = sorted.indexOf(minVersion);
  if (at === -1) {
    // Not silently treated as a bare floor: a typo and a version middleware
    // has since dropped look identical here, and both warrant a decision.
    throw new Error(
      `--min-version ${minVersion} is not a version in the dump. `
        + `Available: ${sorted.join(', ')}`,
    );
  }
  return sorted.slice(at);
}
