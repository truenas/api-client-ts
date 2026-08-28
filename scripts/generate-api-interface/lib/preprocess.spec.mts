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
  /**
   * A titled inline enum is hoisted into `$defs` under its title, so one title
   * can name several distinct shapes across documents. Names are then assigned
   * in two passes: the first names a mode that has exactly one variant, the
   * second gives origin-qualified names where a mode has several.
   *
   * The two collided. A title with several *output* variants and exactly one
   * *input* variant had its input name assigned by the first pass and then
   * discarded by the second, which replaced the whole record rather than adding
   * to it. Input references then fell back to the bare title — which, depending
   * on what else claimed it, either names nothing (a hard failure downstream) or
   * silently names the *other* shape, so a request would be typed with the
   * wrong enum.
   *
   * Reached once a dump carries a second output shape under an existing title,
   * which is what `--dump-api` describing previously free-form objects produces.
   * Asserted on the resolved shape rather than the chosen name: the point is
   * that the input reference still reaches its own enum.
   */
  it('keeps the input name when a title has several output variants', () => {
    const zfsSource: Schema = {
      type: 'string', title: 'Source',
      enum: ['NONE', 'DEFAULT', 'LOCAL', 'INHERITED'],
    };
    const authSource: Schema = {
      type: 'string', title: 'Source',
      enum: ['TOKEN', 'PASSWORD'],
    };

    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (...parts: unknown[]) => void warnings.push(parts.join(' '));
    let result;
    try {
      result = preprocess(version([
        // Two different shapes sharing the title, both on the way out.
        method('pool.snapshot.query', args({}, []), returnsDoc({
          type: 'object', properties: { source: zfsSource }, required: ['source'],
        })),
        method('auth.me', args({}, []), returnsDoc({
          type: 'object', properties: { source: authSource }, required: ['source'],
        })),
        // One of them also arrives as input, which is the name that was dropped.
        method('pool.snapshot.update', args({ source: zfsSource }, ['source']),
          returnsDoc({ type: 'null' })),
      ]));
    } finally {
      console.warn = realWarn;
    }
    const { definitions, methods } = result;

    expect(warnings.filter((w) => w.includes('unresolved'))).toEqual([]);

    const update = methods.find((m) => m.name === 'pool.snapshot.update');
    const ref = (update?.params[0].schema as { $ref?: string }).$ref ?? '';
    const target = definitions[ref.replace('#/definitions/', '')] as { enum?: string[] } | undefined;

    // Its own enum, not the one `auth.me` returns under the same title.
    expect(target?.enum).toEqual(['NONE', 'DEFAULT', 'LOCAL', 'INHERITED']);
  });

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

  /**
   * `description` is both a docstring key and a real field name — middleware
   * declares the field on ~30 models, `CronJobEntry` and `VMEntry` among them.
   * Stripping by key alone deleted the field with the prose, so the emitted
   * `CronJobEntry` had no `description` and a create call that set one did not
   * compile, for a field the appliance accepts and returns.
   *
   * The two are told apart by type: prose is a string, a field is its own
   * schema object. Both appear here, on the same model, so a fix that removes
   * the wrong one fails rather than passing on the easy half.
   */
  it('keeps a model field named description while stripping the prose beside it', () => {
    const { definitions } = preprocess(version([
      method('cronjob.get', args({}, []), returnsDoc({ $ref: '#/$defs/CronJob' }, {
        CronJob: {
          title: 'CronJob', type: 'object', additionalProperties: false,
          description: 'A cron job.', // prose about the model
          properties: {
            command: { type: 'string', description: 'Shell command to run.' }, // prose about a field
            description: { type: 'string', description: 'What this job does.' }, // the field itself
          },
        },
      })),
    ]));
    expect(Object.keys(definitions['CronJob'].properties ?? {})).toEqual(['command', 'description']);
    // The field survives as a schema; the prose on it does not.
    expect(definitions['CronJob'].properties?.['description']).toEqual({ type: 'string' });
    expect(definitions['CronJob'].properties?.['command']).toEqual({ type: 'string' });
    // ...and neither does the prose on the model itself. Asserted directly:
    // `toHaveProperty('description.description')` reads the string as a path
    // and passes whether or not the prose survived, so it checked nothing.
    expect(definitions['CronJob'].description).toBeUndefined();
  });

  /**
   * `examples` had no model declaring a field by that name when this was
   * written, which is exactly the guarantee `description` had until one did.
   * Discriminated on shape instead: documentation is an array, a field schema
   * is an object.
   */
  it('keeps a model field named examples while stripping the examples list beside it', () => {
    const { definitions } = preprocess(version([
      method('x.get', args({}, []), returnsDoc({ $ref: '#/$defs/Sample' }, {
        Sample: {
          title: 'Sample', type: 'object', additionalProperties: false,
          examples: [{ examples: 'x' }], // documentation on the model
          properties: {
            examples: { type: 'string', examples: ['one', 'two'] }, // the field
          },
        },
      })),
    ]));
    expect(Object.keys(definitions['Sample'].properties ?? {})).toEqual(['examples']);
    // The field survives; the documentation array on it does not...
    expect(definitions['Sample'].properties?.['examples']).toEqual({ type: 'string' });
    // ...and neither does the one on the model.
    expect(definitions['Sample'].examples).toBeUndefined();
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

  // The dump's query return is `anyOf: [entity[], entity, projection[],
  // projection, count]` with no discriminator. BOTH array members carry a
  // $ref, so choosing by position would hand the projection model — which is
  // content-free — to every query method the moment pydantic reorders the
  // union. Entity selection must depend on content, not order.
  describe('query entity selection', () => {
    const queryReturn = (order: 'entity-first' | 'projection-first'): Schema => {
      const entityList = { type: 'array', items: { $ref: '#/$defs/ThingEntry' } } as Schema;
      const projList = { type: 'array', items: { $ref: '#/$defs/ThingQueryResultItem' } } as Schema;
      return {
        anyOf: order === 'entity-first'
          ? [entityList, { $ref: '#/$defs/ThingEntry' }, projList, { type: 'integer' }]
          : [projList, entityList, { $ref: '#/$defs/ThingEntry' }, { type: 'integer' }],
      };
    };
    const defs = {
      ThingEntry: {
        type: 'object', additionalProperties: false, title: 'ThingEntry',
        properties: { id: { type: 'integer' }, name: { type: 'string' } }, required: ['id', 'name'],
      } as Schema,
      // Exactly how middleware models a `select` projection: no shape at all.
      ThingQueryResultItem: { type: 'object', title: 'ThingQueryResultItem' } as Schema,
    };
    const queryArgs = args({
      filters: { type: 'array', title: 'Filters' },
      options: { $ref: '#/$defs/ThingQueryOptions', title: 'Options' },
    }, [], {
      ...defs,
      ThingQueryOptions: {
        type: 'object', title: 'ThingQueryOptions',
        properties: { count: { type: 'boolean' }, get: { type: 'boolean' }, select: { type: 'array' } },
      } as Schema,
    });

    it('picks the content-bearing entity regardless of union order', () => {
      for (const order of ['entity-first', 'projection-first'] as const) {
        const { methods } = preprocess(version([
          method('thing.query', structuredClone(queryArgs), returnsDoc(queryReturn(order), structuredClone(defs))),
        ]));
        expect(methods[0].queryEntity, `order: ${order}`).toBe('ThingEntry');
      }
    });

    // Some services have no response model at all, so BOTH array members are
    // `{"type": "object"}` — disk.query returns
    // `DiskEntry[] | DiskQueryResultItem[]` with neither carrying a shape.
    // There is nothing to prefer, so the first still wins: it has the better
    // name, and resolving to `DiskEntry[]` beats the raw union regardless.
    it('falls back to the first candidate when none is content-bearing', () => {
      const { methods } = preprocess(version([
        method('thing.query', structuredClone(queryArgs), returnsDoc(
          {
            anyOf: [
              { type: 'array', items: { $ref: '#/$defs/ThingEntry' } },
              { type: 'array', items: { $ref: '#/$defs/ThingQueryResultItem' } },
              { type: 'integer' },
            ],
          },
          {
            ThingEntry: { type: 'object', title: 'ThingEntry' } as Schema,
            ThingQueryResultItem: structuredClone(defs.ThingQueryResultItem),
          },
        )),
      ]));
      expect(methods[0].queryEntity).toBe('ThingEntry');
    });
  });
});
