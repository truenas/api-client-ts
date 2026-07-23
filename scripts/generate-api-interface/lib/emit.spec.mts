import { describe, expect, it } from 'vitest';
import { directoryEntry, emitTypes, tsExpr } from './emit.mts';
import type { MethodModel, Schema } from './types.mts';

describe('tsExpr', () => {
  const cases: [string, Schema | boolean | undefined, string][] = [
    ['string', { type: 'string' }, 'string'],
    ['integer', { type: 'integer' }, 'number'],
    ['null', { type: 'null' }, 'null'],
    ['boolean schema (permissive)', true, 'unknown'],
    ['missing schema', undefined, 'unknown'],
    ['$ref', { $ref: '#/definitions/UserEntry' }, 'UserEntry'],
    ['tsType passthrough', { tsType: 'QueryFilters<X>' }, 'QueryFilters<X>'],
    ['const', { const: 'FIXED' }, "'FIXED'"],
    ['inline enum', { enum: ['A', 'B'] }, "'A' | 'B'"],
    ['anyOf union, deduped', { anyOf: [{ type: 'string' }, { type: 'integer' }, { type: 'number' }] }, 'string | number'],
    ['nullable type array', { type: ['string', 'null'] }, 'string | null'],
    ['array of ref', { type: 'array', items: { $ref: '#/definitions/X' } }, 'X[]'],
    ['array of union gets parens', { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'null' }] } }, '(string | null)[]'],
    ['tuple', { type: 'array', prefixItems: [{ type: 'string' }, { type: 'integer' }], items: false }, '[string, number]'],
    ['open dict', { type: 'object' }, 'Record<string, unknown>'],
    ['closed empty object', { type: 'object', additionalProperties: false }, 'Record<string, never>'],
    ['typed dict', { type: 'object', additionalProperties: { $ref: '#/definitions/X' } }, 'Record<string, X>'],
    ['patternProperties dict', { type: 'object', patternProperties: { '^x': { type: 'integer' } } }, 'Record<string, number>'],
    ['inline object', { type: 'object', properties: { a: { type: 'string' }, 'b-c': { type: 'integer' } }, required: ['a'] }, "{ a: string; 'b-c'?: number }"],
  ];
  it.each(cases)('%s', (_label, schema, expected) => {
    expect(tsExpr(schema)).toBe(expected);
  });
});

describe('directoryEntry', () => {
  const makeMethod = (params: [string, boolean][]): MethodModel => ({
    name: 'x.do',
    doc: null,
    roles: [],
    removedIn: null,
    job: false,
    params: params.map(([name, optional]) => ({ name, optional, doc: null, schema: { type: 'string' } })),
    returns: { type: 'null' },
  });

  it('only marks params optional when everything after them is optional too', () => {
    // Python allows defaulted-before-required; TS tuples do not.
    const entry = directoryEntry(makeMethod([['a', false], ['b', true], ['c', false], ['d', true]]));
    expect(entry).toContain('params: [a: string, b: string, c: string, d?: string];');
  });

});

describe('emitTypes enum emission', () => {
  it('derives member names and falls back to quoted values on collisions', async () => {
    const out = await emitTypes({
      Tag: { _kind: 'enum', title: 'Tag', type: 'string', enum: ['owner@', 'group@', 'GROUP', 'ACTIVE DIRECTORY'] },
    });
    expect(out).toContain("Owner: 'owner@',");
    expect(out).toContain("Group: 'group@',");
    expect(out).toContain("'GROUP': 'GROUP',"); // collides with group@ -> quoted raw value
    expect(out).toContain("ActiveDirectory: 'ACTIVE DIRECTORY',");
    expect(out).toContain('export type Tag = (typeof Tag)[keyof typeof Tag];');
  });

  it('declares non-object roots itself (json-schema-to-typescript drops them)', async () => {
    const out = await emitTypes({
      Names: { _kind: 'object', title: 'Names', type: 'array', items: { type: 'string' } },
      EmptyDict: { _kind: 'object', title: 'EmptyDict', type: 'object', additionalProperties: false, properties: {} },
    });
    expect(out).toContain('export type Names = string[];');
    expect(out).toContain('export type EmptyDict = Record<string, never>;');
  });
});
