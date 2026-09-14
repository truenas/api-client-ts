/**
 * Minimal types for `@semantic-release/commit-analyzer` (ships none, no `@types`),
 * covering only what `release-config.spec.mts` calls.
 *
 * Delete once the package ships types: an ambient `declare module` shadows
 * `node_modules`, so a changed signature would keep compiling against 13.x.
 * The return omits `pre*` types; no rule of ours or the preset's names one.
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
