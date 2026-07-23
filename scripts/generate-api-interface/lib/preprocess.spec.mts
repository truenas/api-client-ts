import { describe, expect, it } from 'vitest';
import { preprocess } from './preprocess.mts';
import type { ApiDumpMethod, ApiDumpVersion, Schema } from './types.mts';

const method = (name: string, accepts: Schema, returns: Schema, extra: Partial<ApiDumpMethod> = {}): ApiDumpMethod => ({
  name,
  roles: [],
  doc: null,
  removed_in: null,
  job: false,
  schemas: { accepts, returns },
  ...extra,
});

const args = (properties: Record<string, Schema>, required: string[], $defs: Record<string, Schema> = {}): Schema => ({
  type: 'object', additionalProperties: false, properties, required, $defs,
});

const returnsDoc = (result: Schema, $defs: Record<string, Schema> = {}): Schema => ({
  type: 'object', additionalProperties: false, properties: { result }, required: ['result'], $defs,
});

const version = (methods: ApiDumpMethod[], events: ApiDumpVersion['events'] = []): ApiDumpVersion => ({
  version: 'v1.0.0', version_title: 'v1.0.0', methods, events,
});

describe('preprocess', () => {
  it('extracts params in order with optionality from the required list', () => {
    const { methods } = preprocess(version([
      method('x.do', args({
        first: { type: 'integer', title: 'First' },
        second: { type: 'string', title: 'Second', default: 'y', description: 'Optional one.' },
      }, ['first']), returnsDoc({ type: 'null' })),
    ]));
    expect(methods[0].params.map((p) => p.name)).toEqual(['first', 'second']);
    expect(methods[0].params.map((p) => p.optional)).toEqual([false, true]);
    expect(methods[0].params[1].doc).toBeNull(); // docs are stripped at intake
    expect(methods[0].returns).toEqual({ type: 'null' });
  });

  it('splits a model rendered differently per mode into Name and NameInput', () => {
    const inputRender: Schema = { title: 'W', type: 'object', additionalProperties: false, properties: { a: { type: 'string' } } };
    const outputRender: Schema = { title: 'W', type: 'object', additionalProperties: false, properties: { a: { type: 'string' }, b: { type: 'integer' } } };
    const { definitions, methods } = preprocess(version([
      method('x.update', args({ w: { $ref: '#/$defs/W' } }, ['w'], { W: inputRender }), returnsDoc({ type: 'null' })),
      method('x.get', args({}, []), returnsDoc({ $ref: '#/$defs/W' }, { W: outputRender })),
    ]));
    expect(Object.keys(definitions).sort()).toEqual(['W', 'WInput']);
    expect(definitions['W'].properties).toHaveProperty('b'); // output render keeps the bare name
    expect(methods[0].params[0].schema.$ref).toBe('#/definitions/WInput');
  });

  it('renames middleware models that collide with reserved query-grammar names', () => {
    const { definitions } = preprocess(version([
      method('x.get', args({}, []), returnsDoc({ $ref: '#/$defs/QueryFilters' }, {
        QueryFilters: { title: 'QueryFilters', type: 'object', additionalProperties: false, properties: { a: { type: 'string' } } },
      })),
    ]));
    expect(definitions).toHaveProperty('QueryFiltersModel');
    expect(definitions).not.toHaveProperty('QueryFilters');
  });

  it('normalizes names the way json-schema-to-typescript will declare them', () => {
    const { definitions } = preprocess(version([
      method('x.get', args({}, []), returnsDoc({ $ref: '#/$defs/iThing' }, {
        iThing: { title: 'iThing', type: 'object', additionalProperties: false, properties: { renew_2fa: { type: 'string' } } },
      })),
    ]));
    expect(definitions).toHaveProperty('IThing');
  });

  it('hoists titled inline enums into named definitions', () => {
    const { definitions } = preprocess(version([
      method('x.get', args({}, []), returnsDoc({ $ref: '#/$defs/Box' }, {
        Box: {
          title: 'Box', type: 'object', additionalProperties: false,
          properties: { color: { enum: ['RED', 'BLUE'], title: 'Color', type: 'string', description: 'site docs' } },
        },
      })),
    ]));
    expect(definitions['Color']?._kind).toBe('enum');
    expect(definitions['Box'].properties?.['color'].$ref).toBe('#/definitions/Color');
  });

  it('substitutes query grammar generics with the inferred entity', () => {
    const entry: Schema = { title: 'Entry', type: 'object', additionalProperties: false, properties: { id: { type: 'integer' } } };
    const queryOptions: Schema = {
      title: 'QueryOptions', type: 'object', additionalProperties: false,
      properties: { count: { type: 'boolean' }, get: { type: 'boolean' }, limit: { type: 'integer' } },
    };
    const { methods } = preprocess(version([
      method('x.query', args({
        filters: { title: 'filters', type: 'array', items: {}, default: [] },
        options: { $ref: '#/$defs/QueryOptions', default: {} },
      }, [], { QueryOptions: queryOptions }), returnsDoc({
        anyOf: [{ type: 'array', items: { $ref: '#/$defs/Entry' } }, { $ref: '#/$defs/Entry' }, { type: 'integer' }],
      }, { Entry: entry })),
      method('x.get_instance', args({
        id: { title: 'Id', type: 'integer' },
        options: { $ref: '#/$defs/QueryOptions', default: {} },
      }, ['id'], { QueryOptions: queryOptions }), returnsDoc({ $ref: '#/$defs/Entry' }, { Entry: entry })),
    ]));
    expect(methods[0].params[0].schema.tsType).toBe('QueryFilters<Entry>');
    expect(methods[0].params[1].schema.tsType).toBe('QueryOptions<Entry>');
    expect(methods[1].params[1].schema.tsType).toBe('QueryOptions<Entry>');
    // non-uniform options models are left alone
    const { methods: other } = preprocess(version([
      method('y.do', args({ options: { $ref: '#/$defs/Custom' } }, [], {
        Custom: { title: 'Custom', type: 'object', additionalProperties: false, properties: { special: { type: 'string' } } },
      }), returnsDoc({ type: 'null' })),
    ]));
    expect(other[0].params[0].schema.tsType).toBeUndefined();
  });

  it('qualifies same-name collisions by origin instead of numeric suffixes', () => {
    // Two distinct middleware classes named 'Status' in different services.
    const { definitions } = preprocess(version([
      method('pool.scrub.query', args({}, []), returnsDoc({ $ref: '#/$defs/Status' }, {
        Status: { title: 'Status', enum: ['RUNNING', 'DONE'], type: 'string' },
      })),
      method('smart.test.query', args({}, []), returnsDoc({ $ref: '#/$defs/Status' }, {
        Status: { title: 'Status', enum: ['PASSED', 'FAILED'], type: 'string' },
      })),
    ]));
    expect(Object.keys(definitions).sort()).toEqual(['PoolScrubStatus', 'SmartTestStatus']);

    // Hoisted field enums colliding: qualified by their owning model.
    const entry = (state: string[]): Schema => ({
      title: 'E', type: 'object', additionalProperties: false,
      properties: { state: { enum: state, title: 'State', type: 'string' } },
    });
    const { definitions: hoisted } = preprocess(version([
      method('a.get', args({}, []), returnsDoc({ $ref: '#/$defs/AEntry' }, { AEntry: { ...entry(['UP', 'DOWN']), title: 'AEntry' } })),
      method('b.get', args({}, []), returnsDoc({ $ref: '#/$defs/BEntry' }, { BEntry: { ...entry(['ON', 'OFF']), title: 'BEntry' } })),
    ]));
    expect(hoisted['AEntryState']?._kind).toBe('enum');
    expect(hoisted['BEntryState']?._kind).toBe('enum');
    expect(hoisted).not.toHaveProperty('State');

    // A middleware-real name is never displaced by a qualified collision name.
    const { definitions: real } = preprocess(version([
      method('pool.scrub.get', args({}, []), returnsDoc({ $ref: '#/$defs/Action' }, {
        Action: { title: 'Action', enum: ['START'], type: 'string' },
      })),
      method('pool.scrub.run', args({}, []), returnsDoc({ $ref: '#/$defs/Action' }, {
        Action: { title: 'Action', enum: ['STOP'], type: 'string' },
      })),
      method('other.get', args({}, []), returnsDoc({ $ref: '#/$defs/PoolScrubAction' }, {
        PoolScrubAction: { title: 'PoolScrubAction', type: 'object', additionalProperties: false, properties: { x: { type: 'string' } } },
      })),
    ]));
    expect(real['PoolScrubAction'].properties).toHaveProperty('x'); // the real class keeps its name
    expect(Object.keys(real).filter((n) => n.startsWith('PoolScrubAction')).sort()).toEqual(['PoolScrubAction', 'PoolScrubAction2', 'PoolScrubAction3']);
  });

  it('passes the structured job flag through and filters by prefix', () => {
    const dump = version([
      method('a.run', args({}, []), returnsDoc({ type: 'boolean' }), { job: true }),
      method('b.get', args({}, []), returnsDoc({ type: 'null' })),
    ]);
    expect(preprocess(dump).methods.map((m) => m.job)).toEqual([true, false]);
    expect(preprocess(dump, ['a.']).methods.map((m) => m.name)).toEqual(['a.run']);
  });
});
