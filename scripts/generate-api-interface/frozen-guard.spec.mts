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
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const FROZEN_HEADER = `/**
 * FROZEN — generated once, then hand-maintained. Do not regenerate.
 */
export {};
`;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

let out: string | undefined;

afterEach(() => {
  if (out) rmSync(out, { recursive: true, force: true });
  out = undefined;
});

/** Run the generator over the mini fixture, writing into a throwaway directory. */
function generate(target: string, handRemoved?: string) {
  return spawnSync(
    'node',
    [
      path.join(REPO, 'node_modules/tsx/dist/cli.mjs'),
      path.join(HERE, 'generate.mts'),
      '--schema', path.join(HERE, 'fixtures/mini-dump.json'),
      '--api-version', 'all',
      '--out', target,
      ...(handRemoved ? ['--hand-removed', handRemoved] : []),
    ],
    { cwd: REPO, encoding: 'utf8' }
  );
}

describe('the frozen-directory guard', () => {
  it('leaves a frozen file untouched while generating the rest', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-frozen-'));
    mkdirSync(path.join(out, 'v1_0_0'), { recursive: true });
    writeFileSync(path.join(out, 'v1_0_0/api-types.ts'), FROZEN_HEADER);

    const result = generate(out);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Left 1 frozen file(s) untouched');
    expect(result.stderr).toContain('v1_0_0/api-types.ts');

    // Byte-identical: the point is that the marker survives, not merely that a
    // file with that name still exists.
    expect(readFileSync(path.join(out, 'v1_0_0/api-types.ts'), 'utf8')).toBe(FROZEN_HEADER);

    // The rest of the chain still has to be emitted — later versions are deltas
    // against the frozen one and the root index enumerates every version, so
    // aborting would leave no way to pick up a new release.
    expect(readdirSync(out)).toContain('v2_0_0');
    expect(readdirSync(out)).toContain('index.ts');
    expect(readdirSync(path.join(out, 'v1_0_0'))).toContain('api-call-directory.ts');
  });

  it('writes normally when nothing is marked', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-unfrozen-'));

    const result = generate(out);

    expect(result.status).toBe(0);
    expect(readdirSync(out)).toContain('v1_0_0');
    expect(readdirSync(out)).toContain('shared');
  });
});

/**
 * The freeze protects v25.10, but what keeps `virt.*` out of v26 lives in a
 * directory that is still a regeneration target. Deriving it from a dump is
 * impossible — the entries a diff would have to notice were deleted from every
 * version directory upstream — so it comes from `hand-removed.json`, and the
 * thing worth testing is that regenerating reproduces it rather than dropping it.
 */
describe('hand-declared removals', () => {
  it('are emitted into the inheriting version, so regeneration is idempotent', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-handremoved-'));

    const manifest = path.join(out, 'hand-removed.json');
    writeFileSync(manifest, JSON.stringify({ 'v2.0.0': ['test.'] }));

    const result = generate(out, manifest);

    expect(result.status).toBe(0);
    // The fixture's v2.0.0 inherits from v1.0.0; the manifest drops `test.` there.
    const v2 = readFileSync(path.join(out, 'v2_0_0/api-call-directory.ts'), 'utf8');
    expect(v2).toContain('`test.${string}`');
  });

  it('rejects a prefix that would break the emitted type', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-badprefix-'));
    const manifest = path.join(out, 'hand-removed.json');
    writeFileSync(manifest, JSON.stringify({ 'v2.0.0': ['`${evil}'] }));

    const result = generate(out, manifest);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not a bare namespace prefix');
  });
});
