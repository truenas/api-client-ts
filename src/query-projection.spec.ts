/**
 * Type-level tests for the query surface, run against the REAL generated tree
 * rather than the generator's fixture.
 *
 * Under the verb design the *shape* of a query result is chosen by which method
 * the caller invokes — `api.query` / `queryOne` / `queryCount` — so there is no
 * shape to infer and no way to be wrong about it. What remains computed is
 * which FIELDS come back, because `select` is data rather than a method choice.
 * These pin that, and pin which methods the verbs apply to.
 *
 * The assertions are compile-time; the `it` blocks exist so the file is picked
 * up by `tsconfig.spec.json` and the runtime suite.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { ApiDirectoryByVersion, v25_10_0 } from '@/generated';

type Dir = ApiDirectoryByVersion['v25.10.0']['call'];
type PoolEntry = v25_10_0.PoolEntry;
type Projection<O> = v25_10_0.QueryProjection<PoolEntry, O>;

/** Query methods are exactly those the generator marked with an entity. */
type QueryMethod = {
  [K in keyof Dir]: Dir[K] extends { entity: unknown } ? K : never;
}[keyof Dir];

/** Stands in for `api.query` until the client binds to this. */
const query = (() => undefined) as unknown as <M extends QueryMethod, const O>(
  method: M,
  filters?: unknown,
  options?: O
) => Projection<O>[];

describe('query verbs against the generated directory', () => {
  it('returns whole entities when no projection is requested', () => {
    expectTypeOf(query('pool.query')).toEqualTypeOf<PoolEntry[]>();
    expectTypeOf(query('pool.query', [], {})).toEqualTypeOf<PoolEntry[]>();
    expectTypeOf(query('pool.query', [], { limit: 10 })).toEqualTypeOf<
      PoolEntry[]
    >();
  });

  it('projects to exactly the selected fields', () => {
    // The dump models a projection as an opaque `Record<string, unknown>` —
    // every `*QueryResultItem` is literally that — so this is more precise
    // than the schema states.
    expectTypeOf(query('pool.query', [], { select: ['id', 'name'] })).toEqualTypeOf<
      Pick<PoolEntry, 'id' | 'name'>[]
    >();
  });

  // The soundness case. A `select` built into a variable loses its literal
  // types, so which fields come back is genuinely unknown. Claiming `PoolEntry`
  // would promise fields a projection will not return, so it degrades to
  // `Partial` and the caller has to check.
  it('degrades to Partial when the selection is not literal', () => {
    const opts: v25_10_0.QueryOptions<PoolEntry> = { select: ['id'] };
    expectTypeOf(query('pool.query', [], opts)).toEqualTypeOf<
      Partial<PoolEntry>[]
    >();
  });

  it('applies only to polymorphic query methods', () => {
    // Marked: accepts query options AND returns list | single | count.
    expectTypeOf<'pool.query'>().toExtend<QueryMethod>();
    expectTypeOf<'user.query'>().toExtend<QueryMethod>();

    // Returns one entry unconditionally — nothing to disambiguate, so it stays
    // on `call` even though it accepts QueryOptions.
    expectTypeOf<'pool.get_instance'>().not.toExtend<QueryMethod>();

    // Returns an array but accepts no options at all — 55 methods like this.
    // Marking them would have offered filters to methods that take none.
    expectTypeOf<'alert.list'>().not.toExtend<QueryMethod>();
    expectTypeOf<'alert.list_policies'>().not.toExtend<QueryMethod>();
    expectTypeOf<'app.categories'>().not.toExtend<QueryMethod>();

    // Conversely, a name not ending in `.query` can still be a real query:
    // both of these take filters and options and return the polymorphic union.
    // `trackJob` already calls core.get_jobs with a filters array.
    expectTypeOf<'core.get_jobs'>().toExtend<QueryMethod>();
    expectTypeOf<'auth.sessions'>().toExtend<QueryMethod>();

    // Not a query by any reading.
    expectTypeOf<'core.ping'>().not.toExtend<QueryMethod>();
  });
});
