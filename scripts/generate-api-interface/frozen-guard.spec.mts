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

import { dumpDigest } from './lib/dump-digest.mts';
import type { ApiDumpFile } from './lib/types.mts';

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
/** Seed a baseline the way the CLI tells you to: run once, paste what it prints. */
function seedBaseline(target: string): string {
  const file = mkdtempSync(path.join(tmpdir(), 'gen-hashes-')) + '/frozen-hashes.json';
  writeFileSync(file, '{}');
  const first = generate(target, undefined, file);
  expect(first.status).toBe(1);
  expect(first.stderr).toContain('No baseline recorded');
  const json = first.stderr.slice(first.stderr.indexOf('{'), first.stderr.lastIndexOf('}') + 1);
  writeFileSync(file, json);
  return file;
}

/** Like `generate`, but narrowed to one version — the preview path. */
function generateNarrowed(target: string, handRemoved: string, version: string) {
  return spawnSync(
    'node',
    [
      path.join(REPO, 'node_modules/tsx/dist/cli.mjs'),
      path.join(HERE, 'generate.mts'),
      '--schema', path.join(HERE, 'fixtures/mini-dump.json'),
      '--api-version', version,
      '--out', target,
      '--manifest-appendix', path.join(HERE, 'fixtures/empty-appendix.md'),
      '--hand-removed', handRemoved,
    ],
    { cwd: REPO, encoding: 'utf8' }
  );
}

function generate(target: string, handRemoved?: string, frozenHashes?: string) {
  return spawnSync(
    'node',
    [
      path.join(REPO, 'node_modules/tsx/dist/cli.mjs'),
      path.join(HERE, 'generate.mts'),
      '--schema', path.join(HERE, 'fixtures/mini-dump.json'),
      '--api-version', 'all',
      '--out', target,
      // Keep the real virt appendix out of fixture output.
      '--manifest-appendix', path.join(HERE, 'fixtures/empty-appendix.md'),
      // Always explicit: the production manifest names real versions the mini
      // fixture does not have, and these tests should not depend on it.
      '--hand-removed', handRemoved ?? path.join(HERE, 'fixtures/empty-hand-removed.json'),
      ...(frozenHashes ? ['--frozen-hashes', frozenHashes] : []),
    ],
    { cwd: REPO, encoding: 'utf8' }
  );
}

describe('the frozen-directory guard', () => {
  it('leaves a frozen file untouched while generating the rest', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-frozen-'));
    mkdirSync(path.join(out, 'v1_0_0'), { recursive: true });
    writeFileSync(path.join(out, 'v1_0_0/api-types.ts'), FROZEN_HEADER);

    const result = generate(out, undefined, seedBaseline(out));

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

    const manifest = mkdtempSync(path.join(tmpdir(), 'gen-manifest-')) + '/hand-removed.json';
    writeFileSync(manifest, JSON.stringify({ 'v2.0.0': ['test.'] }));

    const result = generate(out, manifest);

    expect(result.status).toBe(0);
    // The fixture's v2.0.0 inherits from v1.0.0; the manifest drops `test.` there.
    const v2 = readFileSync(path.join(out, 'v2_0_0/api-call-directory.ts'), 'utf8');
    expect(v2).toContain('`test.${string}`');
  });

  it('fails when the dump no longer matches a frozen version', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-drift-'));
    mkdirSync(path.join(out, 'v1_0_0'), { recursive: true });
    writeFileSync(path.join(out, 'v1_0_0/api-types.ts'), FROZEN_HEADER);
    const hashes = mkdtempSync(path.join(tmpdir(), 'gen-hashes-')) + '/frozen-hashes.json';
    // A baseline that cannot match: the dump has moved under the frozen file.
    writeFileSync(hashes, JSON.stringify({ 'v1.0.0': 'deadbeefdeadbeef' }));

    const result = generate(out, undefined, hashes);

    // Loud, because the alternative is a tree quietly generated against a model
    // its frozen files do not hold.
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('The dump no longer matches');
    expect(result.stderr).toContain('v1.0.0');
  });

  /**
   * The baseline is meant to isolate what the dump says, so that changing the
   * emitter does not read as "the dump changed". `generateFromDump` mutates the
   * dump in place — `hoistInlineEnums` accumulates hoisted enums into each
   * document's `$defs` — so a digest taken after generation is a hash of the
   * dump plus whatever the emitter did to it, and every emitter change would
   * fire the drift check on a dump nobody touched.
   *
   * Pinned against the fixture read fresh from disk: that is the value the
   * baseline claims to be, and it is not what generation leaves behind.
   */
  it('record what the dump says, not what generation did to it', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-digest-'));
    mkdirSync(path.join(out, 'v1_0_0'), { recursive: true });
    writeFileSync(path.join(out, 'v1_0_0/api-types.ts'), FROZEN_HEADER);
    const hashes = mkdtempSync(path.join(tmpdir(), 'gen-hashes-')) + '/frozen-hashes.json';
    writeFileSync(hashes, '{}');

    const result = generate(out, undefined, hashes);

    expect(result.status).toBe(1);
    const printed = JSON.parse(
      result.stderr.slice(result.stderr.indexOf('{'), result.stderr.lastIndexOf('}') + 1)
    ) as Record<string, string>;

    const dump = JSON.parse(
      readFileSync(path.join(HERE, 'fixtures/mini-dump.json'), 'utf8')
    ) as ApiDumpFile;
    const slice = dump.versions?.find((v) => v.version === 'v1.0.0');

    // Guard the lookup so the failure names its cause. `dumpDigest(undefined)`
    // throws a TypeError from `createHash().update()` rather than returning a
    // digest, so without this the test still fails if the fixture stops
    // carrying v1.0.0 — but as a stack trace inside the digest helper, which
    // reads as a bug in the thing under test.
    expect(slice).toBeDefined();
    expect(printed['v1.0.0']).toBe(dumpDigest(slice));
  });

  it('refuses to run when a frozen version has no baseline', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-nobaseline-'));
    mkdirSync(path.join(out, 'v1_0_0'), { recursive: true });
    writeFileSync(path.join(out, 'v1_0_0/api-types.ts'), FROZEN_HEADER);
    const hashes = mkdtempSync(path.join(tmpdir(), 'gen-hashes-')) + '/frozen-hashes.json';
    writeFileSync(hashes, '{}');

    const result = generate(out, undefined, hashes);

    // Fatal rather than a warning: a check that has never been seeded is a
    // check that has never run, and the warning would be read once and skipped.
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No baseline recorded');
    expect(result.stderr).toContain('v1.0.0');
  });

  it('rejects a prefix that would break the emitted type', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-badprefix-'));
    const manifest = mkdtempSync(path.join(tmpdir(), 'gen-manifest-')) + '/hand-removed.json';
    writeFileSync(manifest, JSON.stringify({ 'v2.0.0': ['`${evil}'] }));

    const result = generate(out, manifest);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is neither a namespace prefix');
  });

  /**
   * A removal is an `Omit` over what the previous version declared, so the root
   * of the chain has nothing to subtract from and the pipeline emits no link
   * for it. Keyed there, the entry used to be a silent no-op: nothing omitted,
   * nothing said, exit 0.
   *
   * Reachable without doing anything odd — any `--min-version` above the oldest
   * version promotes some version to the root, and `hand-removed.json` keys its
   * two live entries to `v26.0.0`, which `--min-version v26.0.0` would make the
   * root. Silent success is the one outcome a hand-declared removal must not
   * have, since nothing downstream can tell it apart from having worked.
   */
  it('rejects a removal keyed to the dump oldest version, which no run can apply', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-rootkey-'));
    const manifest = mkdtempSync(path.join(tmpdir(), 'gen-manifest-')) + '/hand-removed.json';
    // v1.0.0 is the fixture's oldest version, so it is the root of every
    // possible run — the entry is wrong however the generator is invoked.
    writeFileSync(manifest, JSON.stringify({ 'v1.0.0': ['call:test.get'] }));

    const result = generate(out, manifest);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is the oldest version in this dump');
  });

  /**
   * Root only because the run was narrowed is a different situation: the
   * manifest is right and a full run applies it. Making that fatal took away
   * `--api-version v26.0.0` for a manifest that is correct, leaving editing a
   * tracked file as the only way to preview one version.
   */
  it('skips, without failing, a removal that only this narrowed run cannot apply', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-narrowed-'));
    const manifest = mkdtempSync(path.join(tmpdir(), 'gen-manifest-')) + '/hand-removed.json';
    // Keyed to v2.0.0, which a full run applies — but this run starts there.
    writeFileSync(manifest, JSON.stringify({ 'v2.0.0': ['call:test.get'] }));

    const result = generateNarrowed(out, manifest, 'v2.0.0');

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('is the root of this narrowed run');
    // Said out loud rather than dropped: the whole point is that a no-op
    // removal is never silent.
    expect(result.stderr).toContain('::warning::');
  });

  /**
   * Shape is judged before applicability, so a narrowed run rejects exactly
   * what a full run rejects. Judged the other way round, the skip above
   * returned first and `--api-version v26.0.0` stayed green on a manifest that
   * `yarn generate:api` exits 1 on — a preview that disagrees with the real run
   * is worse than no preview.
   */
  it('rejects a malformed value even on the narrowed run that cannot apply it', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-narrowbad-'));
    const manifest = mkdtempSync(path.join(tmpdir(), 'gen-manifest-')) + '/hand-removed.json';
    // A bare string where an array belongs, keyed to this run's root.
    writeFileSync(manifest, JSON.stringify({ 'v2.0.0': 'test.' }));

    const result = generateNarrowed(out, manifest, 'v2.0.0');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must map to an array of strings');
    // Named by its own cause, not by the version check that runs after it.
    expect(result.stderr).not.toContain('is the root of this narrowed run');
  });

  it('still applies that same manifest on a full run', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-fullrun-'));
    const manifest = mkdtempSync(path.join(tmpdir(), 'gen-manifest-')) + '/hand-removed.json';
    writeFileSync(manifest, JSON.stringify({ 'v2.0.0': ['call:test.get'] }));

    const result = generate(out, manifest);

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('is the root of this narrowed run');
    expect(readFileSync(path.join(out, 'v2_0_0/api-call-directory.ts'), 'utf8'))
      .toContain("'test.get'");
  });

  /**
   * A single method deleted from every version directory upstream — the
   * `pool.dataset.encryption_algorithm_choices` case — cannot be stated as a
   * prefix, so the manifest also takes one exact entry with its kind.
   */
  it('omit one exact entry from the kind it names', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-exact-'));
    const manifest = mkdtempSync(path.join(tmpdir(), 'gen-manifest-')) + '/hand-removed.json';
    // `test.get` is carried by both fixture versions, so v2.0.0 inherits it —
    // which is the surface a hand-declared removal has to reach.
    writeFileSync(manifest, JSON.stringify({ 'v2.0.0': ['call:test.get'] }));

    const result = generate(out, manifest);

    expect(result.status).toBe(0);
    const calls = readFileSync(path.join(out, 'v2_0_0/api-call-directory.ts'), 'utf8');
    expect(calls).toMatch(/export type ApiCallDirectory = Omit<[^>]*'test\.get'/);
    // Named `call:`, so it must not be omitted from the other two directories,
    // where the literal would be a no-op Omit and a false claim in the comment.
    expect(readFileSync(path.join(out, 'v2_0_0/api-job-directory.ts'), 'utf8')).not.toContain("'test.get'");
    expect(readFileSync(path.join(out, 'v2_0_0/api-event-directory.ts'), 'utf8')).not.toContain("'test.get'");
  });

  it('rejects an exact entry whose kind is not a directory kind', () => {
    out = mkdtempSync(path.join(tmpdir(), 'gen-badkind-'));
    const manifest = mkdtempSync(path.join(tmpdir(), 'gen-manifest-')) + '/hand-removed.json';
    writeFileSync(manifest, JSON.stringify({ 'v2.0.0': ['method:test.alpha'] }));

    const result = generate(out, manifest);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is neither a namespace prefix');
  });
});
