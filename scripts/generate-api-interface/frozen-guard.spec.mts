/**
 * The freeze has to hold against the generator itself, not just against the
 * `--min-version` in package.json.
 *
 * `src/generated/v25_10_0/` carries the `virt.*` namespace, which no dump can
 * reproduce — middleware deleted those models from every version directory, so
 * regenerating that directory deletes them here rather than restoring them.
 * `--min-version v26.0.0` is the polite default; anyone passing
 * `--api-version all` walks straight past it.
 *
 * So the guard is on what is already on disk, and this exercises the real CLI
 * rather than a lifted copy of the check.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const FROZEN_HEADER = `/**
 * FROZEN — generated once, then hand-maintained. Do not regenerate.
 */
export {};
`;

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '../..');

let out: string | undefined;

afterEach(() => {
  if (out) rmSync(out, { recursive: true, force: true });
  out = undefined;
});

/** Run the generator over the mini fixture, writing into a throwaway directory. */
function generate(target: string) {
  return spawnSync(
    'node',
    [
      path.join(REPO, 'node_modules/tsx/dist/cli.mjs'),
      path.join(HERE, 'generate.mts'),
      '--schema', path.join(HERE, 'fixtures/mini-dump.json'),
      '--api-version', 'all',
      '--out', target,
    ],
    { cwd: REPO, encoding: 'utf8' }
  );
}

describe('the frozen-directory guard', () => {
  it('refuses to overwrite a file marked frozen, and writes nothing', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-frozen-'));
    mkdirSync(path.join(out, 'v1_0_0'), { recursive: true });
    writeFileSync(path.join(out, 'v1_0_0/api-types.ts'), FROZEN_HEADER);

    const result = generate(out);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Refusing to regenerate');
    expect(result.stderr).toContain('v1_0_0/api-types.ts');

    // Aborts before writing anything — a half-applied generation is worse than
    // none, and would leave the frozen version's siblings inconsistent with it.
    expect(readdirSync(out)).toEqual(['v1_0_0']);
    expect(readdirSync(path.join(out, 'v1_0_0'))).toEqual(['api-types.ts']);
  });

  it('writes normally when nothing is marked', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-unfrozen-'));

    const result = generate(out);

    expect(result.status).toBe(0);
    expect(readdirSync(out)).toContain('v1_0_0');
    expect(readdirSync(out)).toContain('shared');
  });
});
