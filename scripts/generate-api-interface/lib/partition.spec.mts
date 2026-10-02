import { describe, expect, it } from 'vitest';
import { chainAssign } from './partition.mts';
import type { DefSchema, VersionModel } from './types.mts';

const model = (version: string, definitions: Record<string, DefSchema>): VersionModel => ({
  version,
  definitions,
  methods: [],
  events: [],
});

const str = (extra: Partial<DefSchema> = {}): DefSchema => ({
  type: 'object', properties: { a: { type: 'string' } }, ...extra,
});

describe('chainAssign', () => {
  it('inherits unchanged shapes and declares them once at the root', () => {
    const { declared, homes } = chainAssign([
      model('v1', { A: str() }),
      model('v2', { A: str() }),
    ]);
    expect(homes[0].get('A')).toBe(0);
    expect(homes[1].get('A')).toBe(0);
    expect(Object.keys(declared[0])).toEqual(['A']);
    expect(Object.keys(declared[1])).toEqual([]);
  });

  it('re-declares a shape at the version where it changes', () => {
    const { declared, homes } = chainAssign([
      model('v1', { A: str() }),
      model('v2', { A: str({ required: ['a'] }) }),
    ]);
    expect(homes[1].get('A')).toBe(1);
    expect(Object.keys(declared[1])).toEqual(['A']);
  });

  it('re-declares a byte-identical shape whose referenced type changed (transitive)', () => {
    const b = (): DefSchema => ({ type: 'object', properties: { child: { $ref: '#/definitions/A' } } });
    const { homes } = chainAssign([
      model('v1', { A: str(), B: b() }),
      model('v2', { A: str({ required: ['a'] }), B: b() }),
    ]);
    expect(homes[1].get('A')).toBe(1);
    expect(homes[1].get('B')).toBe(1); // own body identical, split forced by A
  });

  it('re-declares on docs-only changes — docs are part of each version\'s shipped surface', () => {
    const { declared, homes } = chainAssign([
      model('v1', { A: str({ description: 'old words' }) }),
      model('v2', { A: str({ description: 'new words' }) }),
    ]);
    expect(homes[1].get('A')).toBe(1);
    expect(declared[0]['A'].description).toBe('old words'); // v1's file keeps v1's docs
    expect(declared[1]['A'].description).toBe('new words');
  });

  it('does not re-declare on title-only changes (titles are not emitted)', () => {
    const { homes } = chainAssign([
      model('v1', { A: { type: 'object', properties: { a: { type: 'string', title: 'Old' } } } }),
      model('v2', { A: { type: 'object', properties: { a: { type: 'string', title: 'New' } } } }),
    ]);
    expect(homes[1].get('A')).toBe(0);
  });

  /**
   * `_usedBy` is generator-internal and never emitted, so a change to it is not
   * a change to the shape.
   */
  it('ignores _usedBy, which is generator-internal', () => {
    const { homes } = chainAssign([
      model('v1', { A: str({ _usedBy: ['x'] }) }),
      model('v2', { A: str({ _usedBy: ['x', 'y'] }) }),
    ]);
    expect(homes[1].get('A')).toBe(0);
  });

  /**
   * The other `title`, and the reason a non-emitted keyword can only be ignored
   * at a keyword position. A model may have a *field* called `title`, and 328
   * models in the 2026-10-01 dump do. Ignoring the key wherever it appears would
   * compare two different shapes equal: the later version would inherit the
   * earlier declaration and emit the wrong type for a property the emitter
   * ships, with every gate green.
   */
  it('re-declares when a property named title changes', () => {
    const withTitle = (type: string): DefSchema => ({
      type: 'object', properties: { title: { type, title: 'Title' } },
    });
    const { homes } = chainAssign([
      model('v1', { A: withTitle('string') }),
      model('v2', { A: withTitle('integer') }),
    ]);
    expect(homes[1].get('A')).toBe(1);
  });

  /**
   * The case that sent `config.save` out of `ApiJobDirectoryBase` on the
   * 2026-10-01 dump: middleware flipped `ConfigSave.secretseed`'s default from
   * false to true, and nothing in the emitted output can express a default, so
   * the two versions' `ConfigSave` rendered byte-identically while the shape
   * comparison called them different. Re-homing the type cost the *method* its
   * place in the base directory, because an entry hoists there only when every
   * type it references is chain-stable.
   */
  it('does not re-declare on default-only changes (defaults are not emitted)', () => {
    const { homes } = chainAssign([
      model('v1', { A: str({ properties: { a: { type: 'boolean', default: false } } }) }),
      model('v2', { A: str({ properties: { a: { type: 'boolean', default: true } } }) }),
    ]);
    expect(homes[1].get('A')).toBe(0);
  });

  /**
   * And its trap, which is worse than `title`'s: 216 models in that same dump
   * have a field called `default`, and unlike a title it cannot be told apart
   * from the keyword by value — a keyword `default` is an object as often as a
   * field's schema is.
   */
  it('re-declares when a property named default changes', () => {
    const withDefault = (type: string): DefSchema => ({
      type: 'object', properties: { default: { type, default: null } },
    });
    const { homes } = chainAssign([
      model('v1', { A: withDefault('string') }),
      model('v2', { A: withDefault('integer') }),
    ]);
    expect(homes[1].get('A')).toBe(1);
  });

  /**
   * The rest of the assertion keywords, one at a time. None of the three in the
   * middle occurs in any dump generated so far — they are listed because the
   * filter has to be complete to be any use, and pydantic can emit all three
   * (`Field(multiple_of=…)`, and `min_length`/`max_length` on a `dict` field).
   */
  it('does not re-declare on assertion-only changes', () => {
    const field = (extra: Partial<DefSchema>): DefSchema => ({
      type: 'object', properties: { a: { type: 'integer', ...extra } },
    });
    const cases: [Partial<DefSchema>, Partial<DefSchema>][] = [
      [{ minimum: 1 }, { minimum: 2 }],
      [{ multipleOf: 5 }, { multipleOf: 7 }],
      [{ minProperties: 1 }, { minProperties: 2 }],
      [{ maxProperties: 8 }, { maxProperties: 9 }],
      [{ minLength: 1 }, { minLength: 3 }],
      [{ pattern: '^a' }, { pattern: '^b' }],
      [{ format: 'ipv4' }, { format: 'ipv6' }],
      [{ uniqueItems: true }, { uniqueItems: false }],
    ];
    for (const [before, after] of cases) {
      const { homes } = chainAssign([model('v1', { A: field(before) }), model('v2', { A: field(after) })]);
      expect(homes[1].get('A'), Object.keys(before)[0]).toBe(0);
    }
  });

  /**
   * The two assertions that are not safe to ignore. json-schema-to-typescript
   * renders `minItems` as a non-empty tuple (`[number, ...number[]]`) and both
   * as `@minItems` / `@maxItems` JSDoc, so they reach the emitted text and a
   * change to either is a change to the shape. They are the only two: no other
   * annotation tag appears anywhere in the generated tree.
   */
  it('re-declares on minItems and maxItems changes, which the emitter does render', () => {
    const items = (extra: Partial<DefSchema>): DefSchema => ({
      type: 'object', properties: { a: { type: 'array', items: { type: 'string' }, ...extra } },
    });
    expect(chainAssign([
      model('v1', { A: items({ minItems: 1 }) }),
      model('v2', { A: items({ minItems: 2 }) }),
    ]).homes[1].get('A')).toBe(1);
    expect(chainAssign([
      model('v1', { A: items({ maxItems: 4 }) }),
      model('v2', { A: items({ maxItems: 5 }) }),
    ]).homes[1].get('A')).toBe(1);
  });


  it('re-materializes a reverted shape instead of skip-level inheriting', () => {
    const { homes, declared } = chainAssign([
      model('v1', { A: str() }),
      model('v2', { A: str({ required: ['a'] }) }),
      model('v3', { A: str() }), // reverts to the v1 shape
    ]);
    expect(homes[2].get('A')).toBe(2);
    expect(Object.keys(declared[2])).toEqual(['A']);
  });

  it('declares a version-introduced type at that version', () => {
    const { homes, declared } = chainAssign([
      model('v1', {}),
      model('v2', { New: str() }),
    ]);
    expect(homes[1].get('New')).toBe(1);
    expect(Object.keys(declared[0])).toEqual([]);
    expect(Object.keys(declared[1])).toEqual(['New']);
  });
});
