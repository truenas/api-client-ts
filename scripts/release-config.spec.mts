import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

/**
 * A squash merge turns the PR title into the commit subject, so two separate
 * regexes see it: the gate in .github/workflows/pr-title.yml decides whether the
 * PR may merge, and parserOpts.headerPattern in .releaserc.json decides what
 * gets released. When they disagree the failure is silent — the PR merges and
 * semantic-release publishes nothing — so this asserts they stay in lockstep.
 */

const repoFile = async (path: string): Promise<string> =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/** The gate pattern, read from the workflow so the test can't drift from it. */
const gatePattern = async (): Promise<string> => {
  const yaml = await repoFile('.github/workflows/pr-title.yml');
  const match = /^\s*pattern='(.+)'$/m.exec(yaml);
  if (!match) throw new Error('could not find the pattern= line in pr-title.yml');
  return match[1];
};

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

  it('accept the same commit types on both sides', async () => {
    const types = (pattern: string): string[] => {
      const alternation = /\((feat\|[a-z|]+)\)/.exec(pattern);
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
