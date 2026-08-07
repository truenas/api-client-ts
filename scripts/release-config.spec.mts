import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { analyzeCommits } from '@semantic-release/commit-analyzer';
import { describe, expect, it } from 'vitest';

const resolver = createRequire(import.meta.url);

/** Where `import '@semantic-release/commit-analyzer'` lands from this file. */
const analyzerPath = (): string =>
  resolver.resolve('@semantic-release/commit-analyzer');

/**
 * A squash merge turns the PR title into the commit subject, so two separate
 * regexes see it: the gate in .github/workflows/pr-title.yml decides whether the
 * PR may merge, and parserOpts.headerPattern in .releaserc.json decides what
 * gets released. When they disagree the failure is silent — the PR merges and
 * semantic-release publishes nothing — so this asserts they stay in lockstep.
 */

const repoFile = async (path: string): Promise<string> =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/**
 * The gate pattern, read from the workflow so the test can't drift from it.
 *
 * The gate itself runs under bash's POSIX ERE; this exercises it with JS
 * `RegExp`. The two engines agree on whether a pattern of this shape matches
 * (no backreferences, no lazy quantifiers), which is all that is asserted here
 * — but they can differ on capture positions, so extract from the parser
 * patterns rather than this one.
 */
const gatePattern = async (): Promise<string> => {
  const yaml = await repoFile('.github/workflows/pr-title.yml');
  const match = /^\s*pattern='(.+)'$/m.exec(yaml);
  if (!match) throw new Error('could not find the pattern= line in pr-title.yml');
  return match[1];
};

/** The commit-analyzer's own options block, whatever it contains. */
const analyzerOpts = async (): Promise<Record<string, unknown>> => {
  const config = JSON.parse(await repoFile('.releaserc.json')) as {
    plugins: (string | [string, Record<string, unknown>])[];
  };
  const plugin = config.plugins.find(
    (p): p is [string, Record<string, unknown>] =>
      Array.isArray(p) && p[0] === '@semantic-release/commit-analyzer',
  );
  if (!plugin) throw new Error('no commit-analyzer plugin in .releaserc.json');
  return plugin[1];
};

/**
 * What semantic-release would actually release for a commit with this subject.
 *
 * No return annotation and no cast: the declaration file already types this as
 * `'major' | 'minor' | 'patch' | null`, and widening it to `string` would let
 * `toBe('mayor')` typecheck.
 *
 * `body` is joined into `message` because the analyzer parses `message`, not
 * `subject` — a `BREAKING CHANGE:` footer is invisible otherwise.
 */
const releaseFor = async (subject: string, body = '') =>
  analyzeCommits(await analyzerOpts(), {
    commits: [
      {
        hash: 'deadbee',
        subject,
        message: body ? `${subject}\n\n${body}` : subject,
        body,
      },
    ],
    logger: { log: () => undefined },
    cwd: process.cwd(),
    env: process.env,
  });

interface ParserOpts {
  headerPattern: string;
  headerCorrespondence: string[];
  breakingHeaderPattern: string;
}

/** Every parserOpts block in .releaserc.json — commit-analyzer and release-notes-generator. */
const parserOpts = async (): Promise<[string, ParserOpts][]> => {
  const config = JSON.parse(await repoFile('.releaserc.json')) as {
    plugins: (string | [string, { parserOpts?: ParserOpts }])[];
  };
  return config.plugins.flatMap((plugin) =>
    Array.isArray(plugin) && plugin[1].parserOpts
      ? [[plugin[0], plugin[1].parserOpts] as [string, ParserOpts]]
      : [],
  );
};

/**
 * Titles the gate accepts, paired with the type semantic-release must extract.
 * The `/`-in-subject cases are the regression: with a `.+` prefix the pattern
 * swallowed the real type and left a word from the subject in its place.
 */
const ACCEPTED: [title: string, type: string][] = [
  ['feat: add reconnect backoff', 'feat'],
  ['fix(auth): handle expired token', 'fix'],
  ['feat!: drop v25.04 support', 'feat'],
  ['TNC-2127 / v2.1 / feat(generator): stop generating old types', 'feat'],
  ['TNC-2033 / v2.1 / feat: port version discovery with HttpClient -> fetch (Phase 6) (#8)', 'feat'],
  ['fix: handle x / y: z', 'fix'],
  ['docs: update readme / guide: examples', 'docs'],
  ['TNC-2033 / v2.1 / fix(auth): handle expired token / refresh: retry', 'fix'],
  ['chore(deps / tooling): bump eslint', 'chore'],
];

/** Titles the gate must reject, so semantic-release is never handed them. */
const REJECTED = [
  'Initial commit',
  'random title with no type',
  'notatype: something',
  'TNC-1 / v2 / notatype: something',
];

describe('PR title gate and semantic-release header pattern', () => {
  it('agree on which titles are valid', async () => {
    const gate = new RegExp(await gatePattern());
    for (const [title] of ACCEPTED) expect(gate.test(title), title).toBe(true);
    for (const title of REJECTED) expect(gate.test(title), title).toBe(false);
  });

  it('extract the same type from every title the gate accepts', async () => {
    for (const [plugin, opts] of await parserOpts()) {
      const header = new RegExp(opts.headerPattern);
      expect(opts.headerCorrespondence[0], plugin).toBe('type');

      for (const [title, expected] of ACCEPTED) {
        expect(header.exec(title)?.[1], `${plugin}: ${title}`).toBe(expected);
      }
      for (const title of REJECTED) {
        expect(header.test(title), `${plugin}: ${title}`).toBe(false);
      }
    }
  });

  it('flag a trailing "!" as breaking, and nothing else', async () => {
    for (const [plugin, opts] of await parserOpts()) {
      const breaking = new RegExp(opts.breakingHeaderPattern);
      expect(breaking.exec('feat!: drop v25.04 support')?.[1], plugin).toBe('feat');
      expect(breaking.exec('TNC-1 / v2.1 / feat(gen)!: drop it')?.[1], plugin).toBe('feat');
      expect(breaking.test('feat: not breaking'), plugin).toBe(false);
    }
  });

  /**
   * The parsing tests above prove a trailing `!` is *recognised* as breaking.
   * They say nothing about what that produces, and the two are independent:
   * `releaseRules` decides the release type, and a rule matching on `type`
   * alone will happily cap a breaking change at `patch`.
   *
   * That gap was not hypothetical. The config carried
   * `{ breaking: true, release: 'minor' }`, so a breaking change would have
   * shipped as a minor on a package already published at 1.x.
   *
   * Deleting the rule does not help either. `analyzeCommit` returns the highest
   * matching rule, not the first, and the preset's defaults are consulted only
   * when *no* custom rule matched at all — so `{ type: 'feat' }` matching is
   * itself what suppresses the fallback, leaving `feat!:` at `patch`. A
   * `chore!:`, matching no custom rule, still reaches the preset's
   * `{ breaking: true, release: 'major' }` and comes out right by accident.
   * The mapping has to be asserted for the types we override, not inferred
   * from the fact that the `!` parses.
   */
  it('release a breaking change as major, whatever its type', async () => {
    expect(await releaseFor('feat!: drop v25.04 support')).toBe('major');
    expect(await releaseFor('fix(auth)!: reject DENIED logins')).toBe('major');
    expect(
      await releaseFor('TNC-1 / v2.1 / feat(types)!: retype the client'),
    ).toBe('major');

    // A type with no custom rule: reaches the preset defaults instead, so it
    // is the case the deleted-rule regression does *not* reproduce.
    expect(await releaseFor('chore!: require node 22')).toBe('major');

    // The footer path, which does not touch `breakingHeaderPattern` at all.
    expect(
      await releaseFor('feat: add backoff', 'BREAKING CHANGE: call() drops its type param'),
    ).toBe('major');
  });

  it('release non-breaking changes below major', async () => {
    // Guards the other direction: a rule of `{ breaking: true, release: 'major' }`
    // that accidentally matched everything would pass the test above.
    //
    // `feat` → `patch` is deliberate, not an oversight left over from the bug
    // this file fixes. It means the 1.x line emits patches and majors and never
    // a minor, which is the intended shape: a new method is not a reason to move
    // the middle number, and anything that breaks a consumer moves the first.
    expect(await releaseFor('feat: add reconnect backoff')).toBe('patch');
    expect(await releaseFor('fix(auth): handle expired token')).toBe('patch');
    expect(await releaseFor('perf: fewer allocations')).toBe('patch');
    expect(await releaseFor('docs: update readme')).toBeNull();
    expect(await releaseFor('chore(deps): bump eslint')).toBeNull();
  });

  it('accept the same commit types on both sides', async () => {
    // The type alternation is the first parenthesised group that is a
    // `|`-separated list of lowercase words — matched by shape rather than by a
    // specific member, so reordering the types can't turn a consistent config
    // into a confusing "no type alternation" failure.
    const types = (pattern: string): string[] => {
      const alternation = /\(([a-z]+(?:\|[a-z]+)+)\)/.exec(pattern);
      if (!alternation) throw new Error(`no type alternation in: ${pattern}`);
      return alternation[1].split('|').sort();
    };

    const expected = types(await gatePattern());
    expect(expected.length).toBeGreaterThan(1);
    for (const [plugin, opts] of await parserOpts()) {
      expect(types(opts.headerPattern), plugin).toEqual(expected);
      expect(types(opts.breakingHeaderPattern), plugin).toEqual(expected);
    }
  });
});

/**
 * The tests above are only worth anything if the analyzer they exercise is the
 * one that runs at release time. `@semantic-release/commit-analyzer` is a
 * direct devDependency so this file can import it, which means there are two
 * ranges that have to keep agreeing — ours and `semantic-release`'s own.
 *
 * A comment saying "bump these in lockstep" is not a guard, so these assert it.
 */
describe('the analyzer under test is the one that ships', () => {
  it('resolves to the same copy semantic-release resolves', () => {
    const viaSemanticRelease = createRequire(
      resolver.resolve('semantic-release'),
    ).resolve('@semantic-release/commit-analyzer');

    // Bump semantic-release to a major wanting `^14` while package.json still
    // says `^13` and the lock splits: 13.x stays hoisted for our direct
    // dependency, 14.x nests under semantic-release, and every test above
    // silently starts exercising the copy that does *not* release.
    expect(
      analyzerPath(),
      'commit-analyzer resolves to two different copies — bump the direct ' +
        'devDependency range in package.json to match semantic-release',
    ).toBe(viaSemanticRelease);
  });

  it('still ships no types, so the local declaration is still needed', async () => {
    const pkg = JSON.parse(
      await readFile(join(dirname(analyzerPath()), 'package.json'), 'utf8'),
    ) as { types?: string; typings?: string; exports?: unknown };

    // A `types` condition anywhere in `exports` counts. That is the shape
    // `moduleResolution: "Bundler"` actually resolves, and checking only the
    // top-level `types`/`typings` would stay green through the most likely way
    // this package starts shipping declarations.
    const typesCondition = (node: unknown): boolean =>
      typeof node === 'object' &&
      node !== null &&
      Object.entries(node).some(
        ([key, value]) => key === 'types' || typesCondition(value),
      );

    // scripts/semantic-release-commit-analyzer.d.ts is an ambient `declare
    // module`, which shadows anything the package ships rather than deferring
    // to it. This fails the day that shim becomes wrong instead of leaving it
    // to surface as a signature mismatch later.
    const message =
      'commit-analyzer now ships types — delete ' +
      'scripts/semantic-release-commit-analyzer.d.ts rather than reconciling it';

    expect(pkg.types ?? pkg.typings, message).toBeUndefined();
    expect(typesCondition(pkg.exports), message).toBe(false);
  });
});
