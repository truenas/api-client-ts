/**
 * Guards what v25.10 holds by hand: `virt.*` and
 * `pool.dataset.encryption_algorithm_choices`, which no current dump describes
 * (removed in middleware b9c330ee94 / 22ce5eac51), plus an event payload the
 * dump gets wrong. The patch directories' re-export blocks can vanish on
 * regeneration with `tsc` still green, so they are read as text: every name
 * is checked, and text catches a re-export shadowing a local declaration,
 * which `toEqualTypeOf` cannot.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { v25_10_0, v25_10_5 } from '@/generated';

const generatedDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'generated'
);

// Derived, not listed: the day a v25.10.6 lands, a hardcoded list checks every
// directory except the new one — the same silence, one directory over. The
// sibling guard derives its list for exactly this reason.
const patchVersions = readdirSync(generatedDir)
  .filter((d) => /^v25_10_\d+$/.test(d) && d !== 'v25_10_0')
  .sort();

/** Identifiers a version re-exports from another version's `api-types`. */
function inheritedNames(version: string): Set<string> {
  const text = readFileSync(path.join(generatedDir, version, 'index.ts'), 'utf8');
  const names = new Set<string>();
  // Both halves: the generator emits an `export {` block for an ancestor
  // group's enums and an `export type {` block for its types. Matching only the
  // second leaves every enum re-export invisible, which is the same shadowing
  // this guard exists to catch.
  //
  // `[^}]` rather than `[\s\S]`, so a match cannot run past its own block
  // terminator and swallow the next one — which silently dropped later groups
  // and pulled literal `export {` text into the result.
  for (const block of text.matchAll(
    /export (?:type )?\{\n([^}]*?)\n\} from '\.\.\/(v25_10_\d+)\/api-types';/g
  )) {
    for (const line of block[1].split('\n')) {
      const name = line.trim().replace(/,$/, '');
      if (name) names.add(name);
    }
  }
  return names;
}

/** Identifiers a version declares in its own `api-types`. */
function ownNames(version: string): Set<string> {
  const text = readFileSync(path.join(generatedDir, version, 'api-types.ts'), 'utf8');
  return new Set(
    [...text.matchAll(/^export (?:interface|type|const) ([A-Za-z0-9_]+)/gm)].map(
      (m) => m[1]
    )
  );
}

/** The keys a version's directory file declares, in source order. */
function directoryKeys(version: string, file: string): string[] {
  const text = readFileSync(path.join(generatedDir, version, file), 'utf8');
  return [...text.matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1]);
}

/** The hand-maintained names, taken from the root rather than listed here. */
const handMaintained = [...ownNames('v25_10_0')]
  .filter((n) => n.startsWith('Virt') || n === 'PoolDatasetEncryptionAlgorithmChoicesResult')
  .sort();

describe('hand-maintained v25.10 surface', () => {
  /**
   * `it.each([])` registers no tests and reports success, so an empty list would
   * retire every check below without a word — and the list is derived now, so it
   * can empty on a rename or a change to the version-directory scheme. The
   * sibling guard pins its own derived list for the same reason.
   */
  it('finds the patch directories to check', () => {
    expect(patchVersions).toContain('v25_10_1');
    expect(patchVersions.length).toBeGreaterThan(0);
  });

  it('declares them at the chain root', () => {
    // 39 virt models plus the pool result type. A floor rather than an equality:
    // what this needs to catch is the set shrinking, which would make the two
    // checks below trivially satisfiable. Adding a 40th virt model to the root
    // and to the re-export blocks is a correct change and should not fail here.
    expect(handMaintained.length).toBeGreaterThanOrEqual(40);
  });

  it.each(patchVersions)('re-exports every one of them from %s', (version) => {
    const inherited = inheritedNames(version);
    const missing = handMaintained.filter((n) => !inherited.has(n));
    expect(missing).toEqual([]);
  });

  /**
   * The other half of the failure. An explicit named re-export beats the
   * `export *` beside it, so re-exporting an ancestor's copy of a name the
   * version redeclares makes the ancestor's shape win — silently, and not as a
   * duplicate-identifier error.
   */
  it.each(patchVersions)('does not re-export anything %s redeclares', (version) => {
    const own = ownNames(version);
    const shadowed = [...inheritedNames(version)].filter((n) => own.has(n));
    expect(shadowed.sort()).toEqual([]);
  });

  /**
   * The models are covered above. The directory entries that reference them are
   * covered thinly and unevenly: five are held by the compiler rather than by
   * any test, because `truenas-api-client-v25-10.ts` calls
   * `virt.instance.query`, `start`, `stop`, `restart` and `delete` through the
   * typed directory, and ten of the thirty-five distinct keys are named in some
   * other spec. `virt.global.update` was in neither set — dropping it, entry
   * and import together, left every gate green.
   *
   * Floors rather than equalities, for the reason the model count gives: adding
   * an entry is a correct change and losing one is not.
   */
  it.each([
    ['api-call-directory.ts', 22],
    ['api-job-directory.ts', 11],
    ['api-event-directory.ts', 2],
  ] as const)('keeps every virt.* entry in v25_10_0/%s', (file, count) => {
    const virt = directoryKeys('v25_10_0', file).filter((k) => k.startsWith('virt.'));
    expect(virt.length).toBeGreaterThanOrEqual(count);
  });

  /**
   * The one hand-restored entry that is not in the `virt.` namespace, so the
   * derived check above cannot see it. `generated-hand-removed.spec.ts` asserts
   * v26 omits it; nothing else asserted v25.10 still has it.
   */
  it('keeps pool.dataset.encryption_algorithm_choices at the root', () => {
    expect(directoryKeys('v25_10_0', 'api-call-directory.ts')).toContain(
      'pool.dataset.encryption_algorithm_choices'
    );
  });
});

describe('the pool.dataset event payload', () => {
  /**
   * The dump gives every version's events master's models, so v25.10's
   * `pool.dataset.query` event wrongly nests `comments` and friends under
   * `user_properties`. The call side is correct; this fails if a regeneration
   * reintroduces the event side's shape. (Unlike `generated-known-gaps.spec.ts`,
   * this pins a disagreement we decline to ship.)
   */
  it('describes the same object as the call side', () => {
    expectTypeOf<
      v25_10_0.ApiEventDirectory['pool.dataset.query']['added']['fields']
    >().toEqualTypeOf<v25_10_0.PoolDatasetEntry>();
    expectTypeOf<
      v25_10_0.ApiEventDirectory['pool.dataset.query']['changed']['fields']
    >().toEqualTypeOf<v25_10_0.PoolDatasetEntry>();
  });

  /**
   * The equality above would still hold if `PoolDatasetEntry` itself acquired
   * the nested shape, since both sides would move together. This names the
   * property whose access broke.
   */
  it('keeps the dataset properties at the top level', () => {
    expectTypeOf<v25_10_0.PoolDatasetEntry['comments']>().toEqualTypeOf<
      v25_10_0.PoolDatasetEntryProperty | undefined
    >();
  });

  /**
   * The patch directories inherit the root's event directory rather than
   * redeclaring it, so this is the assertion that notices the day one of them
   * starts redeclaring it.
   */
  it('holds at the end of the 25.10 chain too', () => {
    expectTypeOf<
      v25_10_5.ApiEventDirectory['pool.dataset.query']['added']['fields']
    >().toEqualTypeOf<v25_10_5.PoolDatasetEntry>();
  });
});
