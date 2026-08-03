import type { ApiCallDirectoryBase } from '@/generated/shared/api-call-directory-base';
import type { QueryOptions } from '@/generated/shared/query-types';

/**
 * Types for the query verbs — `api.query` / `queryOne` / `queryCount`.
 *
 * Middleware's `.query` methods are polymorphic in their *options*: the same
 * endpoint returns a list, a single entry, or a count depending on whether
 * `get` or `count` was passed. The generated directory has to describe that
 * honestly, so every query method's `response` is a five-way union, and every
 * call site would have to narrow it.
 *
 * The verbs remove the narrowing by moving the choice into the method name.
 * Which shape comes back is decided by which verb you call, so there is nothing
 * to infer and no way to infer it wrongly. Only the *fields* stay computed —
 * `select` is data, not a method choice — and that is {@link QueryProjection}.
 *
 * Inferring the shape from the options object instead was the obvious
 * alternative, and it is unsound rather than merely imprecise. `QueryOptions`
 * declares `count?: boolean`, which does not extend `{ count: true }`, so a
 * conditional keyed on it silently picks the list branch for options assembled
 * at runtime — promising an array where the server returns a number. Hence the
 * `never` guards below.
 */

/** A directory entry the generator marked as a polymorphic query. */
interface QueryEntry {
  entity: unknown;
}

/**
 * The query methods of a directory: exactly those the generator marked with an
 * `entity`. A method is marked when it accepts query options *and* returns the
 * polymorphic union — which is not the same as being named `.query`, so
 * `core.get_jobs` qualifies and `pool.get_instance` does not.
 */
export type QueryMethod<Dir> = {
  [K in keyof Dir]: Dir[K] extends QueryEntry ? K : never;
}[keyof Dir];

/** The entity a query method returns rows of. */
export type QueryEntity<Dir, M extends keyof Dir> = Dir[M] extends {
  entity: infer E;
}
  ? E
  : never;

/**
 * Forbids a key rather than merely omitting it.
 *
 * `Omit<QueryOptions<E>, 'count'>` does not stop a caller passing a variable of
 * type `QueryOptions<E>`: width subtyping lets an object with extra properties
 * satisfy a type without them, and excess-property checking only applies to
 * fresh literals. Declaring `count?: never` makes `count?: boolean`
 * genuinely unassignable, so the shape a verb promises cannot be contradicted
 * by the options it is handed.
 */
type Forbid<K extends PropertyKey> = { [P in K]?: never };

/** Options for `TrueNasApi.query` — everything except the shape switches. */
export type QueryListOptions<E> = Omit<QueryOptions<E>, 'count' | 'get'> &
  Forbid<'count' | 'get'>;

/**
 * Options for `TrueNasApi.queryOne`. `limit` and `offset` are forbidden
 * alongside the shape switches: middleware errors unless exactly one entry
 * matches, so paginating the result is incoherent.
 */
export type QuerySingleOptions<E> = Omit<
  QueryOptions<E>,
  'count' | 'get' | 'limit' | 'offset'
> &
  Forbid<'count' | 'get' | 'limit' | 'offset'>;

/**
 * The directory a `TrueNasApi` types its verbs against.
 *
 * Defaults to `ApiCallDirectoryBase` — the entries whose signature is
 * identical in every generated version — so a client that has not committed to
 * a version is still sound. Version-specific clients substitute their own
 * family's directory to reach the methods the base cannot include.
 */
export type QueryDirectory = ApiCallDirectoryBase;
