/**
 * The v25.10 re-export blocks that no dump describes, checked in full.
 *
 * `virt.*` and `pool.dataset.encryption_algorithm_choices` exist only because
 * someone put them there by hand: middleware removed the `virt` models from
 * every version directory in b9c330ee94 and the pool method in 22ce5eac51, so
 * no dump taken since describes either. The API itself is unchanged — 25.10 is
 * released.
 *
 * The chain root declares them; the five patch directories re-export them. That
 * re-export block is what a regeneration deletes and a re-freeze then preserves
 * the absence of, and it went missing once already in this repo's history —
 * 40 names from each of five directories, while `tsc`, `eslint` and the whole
 * suite stayed green, because the directories still declared the *methods* and
 * imported their payload types straight from the root.
 *
 * Read as text rather than asserted as types, for two reasons this file learned
 * the hard way. A restore is done by hand and comes back *partial*, so naming
 * one representative per version passes while thirty-nine names are missing —
 * the sibling guard already says it: "Every key, not a chosen few." And a shape
 * assertion cannot express declaration *identity*: re-exporting an ancestor's
 * copy of a type the version redeclares shadows the local one silently, and
 * where the two shapes happen to agree, `toEqualTypeOf` holds either way.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const generatedDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'generated'
);

const patchVersions = ['v25_10_1', 'v25_10_2', 'v25_10_3', 'v25_10_4', 'v25_10_5'];

/** Identifiers a version re-exports from another version's `api-types`. */
function inheritedNames(version: string): Set<string> {
  const text = readFileSync(path.join(generatedDir, version, 'index.ts'), 'utf8');
  const names = new Set<string>();
  for (const block of text.matchAll(
    /export type \{\n([\s\S]*?)\n\} from '\.\.\/(v25_10_\d)\/api-types';/g
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

/** The hand-maintained names, taken from the root rather than listed here. */
const handMaintained = [...ownNames('v25_10_0')]
  .filter((n) => n.startsWith('Virt') || n === 'PoolDatasetEncryptionAlgorithmChoicesResult')
  .sort();

describe('hand-maintained v25.10 surface', () => {
  it('declares them at the chain root', () => {
    // 39 virt models plus the pool result type. Derived, so adding one to the
    // root does not quietly leave the patch versions behind.
    expect(handMaintained.length).toBe(40);
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
    const shadowed = [...inheritedNames(version)].filter((n) => ownNames(version).has(n));
    expect(shadowed.sort()).toEqual([]);
  });
});
