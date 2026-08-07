/**
 * Minimal types for `@semantic-release/commit-analyzer`, which ships none and
 * has no `@types` package.
 *
 * Declares only what `release-config.spec.mts` calls. The point of that spec is
 * to run the real analyzer against the real config rather than re-implement its
 * rules, so the alternative — asserting the shape of `releaseRules` — would
 * pass against a config whose rules do not do what they appear to.
 *
 * **Delete this file once the package ships its own types.** An ambient
 * `declare module` for a bare specifier is resolved before `node_modules` is
 * consulted, so it is a hard shadow rather than a fallback: if a later major
 * changes `analyzeCommits`' signature, this keeps compiling against the 13.x
 * shape and the real types are never seen. The spec would still fail at
 * runtime, so it is not silent — but it would fail for a reason that looks
 * nothing like "the declaration is stale".
 *
 * The return type omits `premajor`/`preminor`/`prepatch`/`prerelease`. Those
 * appear in this package's `RELEASE_TYPES`, but only as an ordering table for
 * comparing release types — `analyzeCommits` returns whatever `release` a
 * matching rule names, and neither our `releaseRules` nor the preset defaults
 * name anything but `major`, `minor` and `patch`. semantic-release derives
 * prerelease versions downstream in `get-next-version.js`, so adding a `next`
 * branch would not widen what this function can return. Adding a rule whose
 * `release` is a `pre*` value would.
 */
declare module '@semantic-release/commit-analyzer' {
  interface Commit {
    hash: string;
    subject: string;
    message: string;
    body: string;
  }

  interface AnalyzeContext {
    commits: Commit[];
    logger: { log: (...args: unknown[]) => void };
    cwd: string;
    env: NodeJS.ProcessEnv;
  }

  /** The release type for the given commits, or `null` if none warrants one. */
  export function analyzeCommits(
    pluginConfig: Record<string, unknown>,
    context: AnalyzeContext
  ): Promise<'major' | 'minor' | 'patch' | null>;
}
