/**
 * Minimal types for `@semantic-release/commit-analyzer`, which ships none and
 * has no `@types` package.
 *
 * Declares only what `release-config.spec.mts` calls. The point of that spec is
 * to run the real analyzer against the real config rather than re-implement its
 * rules, so the alternative — asserting the shape of `releaseRules` — would
 * pass against a config whose rules do not do what they appear to.
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
