import type { ApiCallDirectoryBase } from '@/generated/shared/api-call-directory-base';
import type { QueryOptions } from '@/generated/shared/query-types';

/**
 * Types for the query verbs — `api.query` / `queryOne` / `queryCount`.
 *
 * A `.query` method returns a list, one entry, or a count depending on `get` /
 * `count` in its options, so its generated `response` is a union. The verbs
 * move that choice into the method name; only the fields stay computed
 * ({@link QueryProjection}). Inferring the shape from options instead is
 * unsound: `count?: boolean` does not extend `{ count: true }`, so options
 * built at runtime would be typed as a list. Hence the `never` guards below.
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
 * The call directory the query verbs resolve against on a client that has not
 * committed to a version: `ApiCallDirectoryBase`, the entries whose signature
 * is identical in every generated version.
 *
 * This is the `call` facet of `BaseApiDirectory`; a client parameterised with
 * a version's `ApiDirectory` reaches that version's call directory instead,
 * including the methods the shared base cannot contain.
 */
export type QueryDirectory = ApiCallDirectoryBase;
