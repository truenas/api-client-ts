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

  it('does not re-declare on docs-only changes, and the newest docs win', () => {
    const { declared, homes } = chainAssign([
      model('v1', { A: str({ description: 'old words' }) }),
      model('v2', { A: str({ description: 'new words' }) }),
    ]);
    expect(homes[1].get('A')).toBe(0);
    expect(declared[0]['A'].description).toBe('new words');
  });

  it('unions usage metadata across a run', () => {
    const { declared } = chainAssign([
      model('v1', { A: str({ _usedBy: ['x.one (params)'] }) }),
      model('v2', { A: str({ _usedBy: ['x.two (params)'] }) }),
    ]);
    expect(declared[0]['A']._usedBy).toEqual(['x.one (params)', 'x.two (params)']);
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
