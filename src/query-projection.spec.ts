/**
 * Type-level tests for the query surface, run against the REAL generated tree
 * rather than the generator's fixture, and against the REAL `TrueNasApi`.
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
import type { Observable } from 'rxjs';
import { describe, expectTypeOf, it } from 'vitest';
import { TrueNasApi } from '@/api/truenas-api';
import type { ApiCallDirectoryV25_10_0, v25_10_0 } from '@/generated';
import type { QueryListOptions, QueryMethod } from '@/types/query.type';

type Dir = ApiCallDirectoryV25_10_0;
type PoolEntry = v25_10_0.PoolEntry;

/**
 * The verbs as a v25.10 client exposes them. Only the *type* is under test, but
 * the `it` bodies still execute, so the methods have to be callable — hence a
 * stub rather than a `declare const`.
 */
const api = {
  query: () => undefined,
  queryOne: () => undefined,
  queryCount: () => undefined,
} as unknown as TrueNasApi<Dir>;

describe('query verbs against the generated directory', () => {
  it('returns whole entities when no projection is requested', () => {
    expectTypeOf(api.query('pool.query')).toEqualTypeOf<
      Observable<PoolEntry[]>
    >();
    expectTypeOf(api.query('pool.query', [], {})).toEqualTypeOf<
      Observable<PoolEntry[]>
    >();
    expectTypeOf(api.query('pool.query', [], { limit: 10 })).toEqualTypeOf<
      Observable<PoolEntry[]>
    >();
  });

  it('projects to exactly the selected fields', () => {
    // The dump models a projection as an opaque `Record<string, unknown>` —
    // every `*QueryResultItem` is literally that — so this is more precise
    // than the schema states.
    expectTypeOf(
      api.query('pool.query', [], { select: ['id', 'name'] })
    ).toEqualTypeOf<Observable<Pick<PoolEntry, 'id' | 'name'>[]>>();
  });

  // The soundness case. A `select` built into a variable loses its literal
  // types, so which fields come back is genuinely unknown. Claiming `PoolEntry`
  // would promise fields a projection will not return, so it degrades to
  // `Partial` and the caller has to check.
  it('degrades to Partial when the selection is not literal', () => {
    const opts: QueryListOptions<PoolEntry> = { select: ['id'] };
    expectTypeOf(api.query('pool.query', [], opts)).toEqualTypeOf<
      Observable<Partial<PoolEntry>[]>
    >();
  });

  it('fixes the shape by verb, not by options', () => {
    expectTypeOf(api.queryOne('pool.query')).toEqualTypeOf<
      Observable<PoolEntry>
    >();
    expectTypeOf(
      api.queryOne('pool.query', [], { select: ['id'] })
    ).toEqualTypeOf<Observable<Pick<PoolEntry, 'id'>>>();
    expectTypeOf(api.queryCount('pool.query')).toEqualTypeOf<
      Observable<number>
    >();
  });

  /**
   * The reason the verbs exist. `QueryOptions` declares `count?: boolean`,
   * which does not extend `{ count: true }` — so a return type conditional on
   * the options object silently picks the list branch for options assembled at
   * runtime, promising an array where the server returns a number. Forbidding
   * the shape switches outright makes that unrepresentable, and `Omit` alone
   * would not: width subtyping lets a `QueryOptions` variable satisfy a type
   * that merely lacks the key.
   */
  it('rejects options that would contradict the verb', () => {
    const runtimeOptions: v25_10_0.QueryOptions<PoolEntry> = { count: true };

    // @ts-expect-error `count` would make this a number, not a list.
    api.query('pool.query', [], { count: true });
    // @ts-expect-error `get` would make this a single entry, not a list.
    api.query('pool.query', [], { get: true });
    // @ts-expect-error a variable carrying `count` is rejected too, not just a literal.
    api.query('pool.query', [], runtimeOptions);
    // @ts-expect-error exactly one entry matches, so paginating is incoherent.
    api.queryOne('pool.query', [], { limit: 5 });
    // @ts-expect-error a count takes no options at all.
    api.queryCount('pool.query', [], { select: ['id'] });
  });

  it('applies only to polymorphic query methods', () => {
    // Marked: accepts query options AND returns list | single | count.
    expectTypeOf<'pool.query'>().toExtend<QueryMethod<Dir>>();
    expectTypeOf<'user.query'>().toExtend<QueryMethod<Dir>>();

    // Returns one entry unconditionally — nothing to disambiguate, so it stays
    // on `call` even though it accepts QueryOptions.
    expectTypeOf<'pool.get_instance'>().not.toExtend<QueryMethod<Dir>>();

    // Returns an array but accepts no options at all — 55 methods like this.
    // Marking them would have offered filters to methods that take none.
    expectTypeOf<'alert.list'>().not.toExtend<QueryMethod<Dir>>();
    expectTypeOf<'alert.list_policies'>().not.toExtend<QueryMethod<Dir>>();
    expectTypeOf<'app.categories'>().not.toExtend<QueryMethod<Dir>>();

    // Conversely, a name not ending in `.query` can still be a real query:
    // both of these take filters and options and return the polymorphic union.
    // `trackJob` already calls core.get_jobs with a filters array.
    expectTypeOf<'core.get_jobs'>().toExtend<QueryMethod<Dir>>();
    expectTypeOf<'auth.sessions'>().toExtend<QueryMethod<Dir>>();

    // Not a query by any reading.
    expectTypeOf<'core.ping'>().not.toExtend<QueryMethod<Dir>>();
  });

  it('rejects methods that are not queries', () => {
    // @ts-expect-error `core.ping` takes no filters and returns no entity.
    api.query('core.ping');
    // @ts-expect-error `pool.get_instance` is not polymorphic.
    api.query('pool.get_instance');
  });
});
