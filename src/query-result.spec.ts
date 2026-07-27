/**
 * Type-level tests for the query-response resolver, run against the REAL
 * generated tree rather than the generator's fixture.
 *
 * The fixture tests in `scripts/generate-api-interface` prove the generator
 * emits `entity`. These prove the emitted output actually resolves — that
 * `QueryResult` plus a `const` type parameter recovers the correlation
 * middleware's schema states but does not discriminate:
 *
 *   options            response
 *   (none)             Entry[]
 *   {count: true}      number
 *   {get: true}        Entry
 *   {select: [...]}    exactly those fields
 *
 * The assertions are compile-time; the `it` block exists so the file is picked
 * up by `tsconfig.spec.json` and the runtime suite.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { ApiDirectoryByVersion, v25_10_0 } from '@/generated';

type Dir = ApiDirectoryByVersion['v25.10.0']['call'];
type EntityOf<M extends keyof Dir> = Dir[M] extends { entity: infer E }
  ? E
  : never;
type PoolEntry = v25_10_0.PoolEntry;

/**
 * Stands in for `TrueNasApi.call` until the client binds to this. The `const`
 * type parameter is load-bearing — without it `{count: true}` widens to
 * `{count: boolean}` and every case collapses to the list shape.
 *
 * A typed no-op rather than a `declare`d signature: `expectTypeOf` evaluates
 * its argument, so the call has to exist at runtime even though only its type
 * is under test.
 */
const call = (() => undefined) as unknown as <M extends keyof Dir, const O>(
  method: M,
  params?: [filters?: unknown, options?: O]
) => v25_10_0.QueryResult<EntityOf<M>, O>;

/** Not a literal, so its type is `boolean` rather than `true`. */
const dynamicCount: boolean = Boolean(process.env['X']);

describe('QueryResult against the generated directory', () => {
  it('resolves the response from the options passed', () => {
    expectTypeOf(call('pool.query')).toEqualTypeOf<PoolEntry[]>();
    expectTypeOf(call('pool.query', [[]])).toEqualTypeOf<PoolEntry[]>();

    expectTypeOf(call('pool.query', [[], { count: true }])).toEqualTypeOf<number>();
    expectTypeOf(call('pool.query', [[], { get: true }])).toEqualTypeOf<PoolEntry>();

    // `select` projects to the exact fields. The dump models this as an opaque
    // `Record<string, unknown>` (every `*QueryResultItem` is exactly that), so
    // this is strictly better than the schema states.
    expectTypeOf(
      call('pool.query', [[], { select: ['id', 'name'] }])
    ).toEqualTypeOf<Pick<PoolEntry, 'id' | 'name'>[]>();
    expectTypeOf(
      call('pool.query', [[], { get: true, select: ['name'] }])
    ).toEqualTypeOf<Pick<PoolEntry, 'name'>>();
  });

  it('holds for every query method, not just pool.query', () => {
    expectTypeOf(call('user.query', [[], { count: true }])).toEqualTypeOf<number>();
    expectTypeOf(call('user.query', [[], { get: true }])).toEqualTypeOf<
      v25_10_0.UserEntry
    >();
    expectTypeOf(call('app.query')).toEqualTypeOf<v25_10_0.AppEntry[]>();
  });

  it('falls back to the list shape when options are not literal', () => {
    // Options built into a variable first lose their literal types, so the
    // correlation cannot be recovered. Degrading to the list is the honest
    // answer — and the reason the docs steer callers to inline options.
    const prebuilt: v25_10_0.QueryOptions<PoolEntry> = { count: true };
    expectTypeOf(call('pool.query', [[], prebuilt])).toEqualTypeOf<PoolEntry[]>();

    // A non-literal boolean likewise: unknown at compile time, so not a count.
    expectTypeOf(
      call('pool.query', [[], { count: dynamicCount }])
    ).toEqualTypeOf<PoolEntry[]>();
  });

  it('leaves non-query methods alone', () => {
    // get_instance takes QueryOptions but returns exactly one entry, so it
    // carries no `entity` and nothing is resolved from its options.
    expectTypeOf<Dir['pool.get_instance']>().not.toHaveProperty('entity');
    expectTypeOf<Dir['core.ping']>().not.toHaveProperty('entity');
  });
});
