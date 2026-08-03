/**
 * Typed query grammar for middleware `.query`-style methods.
 *
 * This module is hand-maintained (template in scripts/generate-api-interface)
 * and copied into the generated output verbatim: the query grammar is
 * middleware *framework* semantics — one recursive filter language shared by
 * every query method — which JSON Schema cannot express, so it is the one
 * deliberate exception to schema-derived typing. The generator instantiates
 * these generics with the entity type of each query method.
 */

export type QueryOperator =
  | '=' | '!='
  | '>' | '>=' | '<' | '<='
  /** Case-insensitive regex match. */
  | '~'
  /** Value in / not in the given list. */
  | 'in' | 'nin'
  /** Given value in / not in the field's list. */
  | 'rin' | 'rnin'
  /** Starts with / does not start with. */
  | '^' | '!^'
  /** Ends with / does not end with. */
  | '$' | '!$';

/**
 * A field reference: a property of the entity, or a dotted path for nested
 * access (e.g. 'group.bsdgrp_gid'). Dotted paths are not validated against
 * the entity shape.
 */
export type QueryFilterField<T> = (keyof T & string) | `${string}.${string}`;

/**
 * A single predicate `[field, operator, value]`, or an OR-connective over
 * nested filter lists: `['OR', [filtersA, filtersB]]`.
 */
export type QueryFilter<T> =
  | [field: QueryFilterField<T>, operator: QueryOperator, value: unknown]
  | ['OR', QueryFilters<T>[]];

/** Filters are AND-ed together. */
export type QueryFilters<T> = QueryFilter<T>[];

export interface QueryOptions<T> {
  /** Return only these fields. Dotted paths select nested values. */
  select?: QueryFilterField<T>[];
  /**
   * Sort by these fields, in order. Prefix a field with '-' for descending;
   * 'nulls_first:' / 'nulls_last:' prefixes control NULL placement.
   */
  order_by?: string[];
  /** Return the number of matching entries instead of the entries. */
  count?: boolean;
  /** Return the single matching entry; an error unless exactly one matches. */
  get?: boolean;
  /** Return at most this many entries. */
  limit?: number;
  /** Skip this many entries. */
  offset?: number;
  /** Method-specific extra options (see the method's API documentation). */
  extra?: Record<string, unknown>;
  force_sql_filters?: boolean;
}

/**
 * Options a single-entity method accepts — `get_instance` and friends.
 *
 * The dump declares the full {@link QueryOptions} model on every one of these,
 * because middleware's CRUD metaclass stamps the same signature onto each
 * `get_instance` regardless of what the implementation does with it. Nothing
 * reads that signature; it describes no behaviour.
 *
 * What the implementations actually consume is `extra`, and only `extra`. The
 * generic base reduces to it explicitly, the hand-written overrides rebuild the
 * options object around it, and two ignore even that. The classic base forwards
 * everything only because it reuses `.query` internally — which is also why
 * `count` and `get` are worse than inert there: they make `.query` return a
 * number or a bare object, and taking `[0]` of it raises.
 *
 * `select` is the one real loss. It reaches the row and subsets it on services
 * whose entry model allows extra keys — `pool.dataset.get_instance` genuinely
 * projects today. On every stricter model the projection fails validation and
 * survives only by falling back to the unvalidated dict. Use `query` when you
 * want a projection; that is the supported path for it.
 *
 * `extra` stays `Record<string, unknown>` because it is genuinely per-endpoint:
 * some 28 distinct keys across middleware, described only in prose on the
 * corresponding `query` method's docstring, and incompletely even there.
 */
export interface QueryInstanceOptions {
  /** Method-specific extra options (see the method's API documentation). */
  extra?: Record<string, unknown>;
}

/**
 * What a query verb returns for a given options object.
 *
 * `api.query` / `queryOne` / `queryCount` each fix the *shape* of the result,
 * so the only thing left to compute is which FIELDS come back. That is decided
 * by `select`, and unlike the shape it cannot be moved into the method name —
 * the fields are data.
 *
 * Plain field names project to an exact `Pick`. Dotted paths select nested
 * values whose type cannot be computed from `E`, so any select containing one
 * degrades to "some subset of `E`, plus unknown extras" — still far better than
 * the dump, which types every projection as an opaque `Record<string, unknown>`.
 *
 * The three cases are kept distinct on purpose:
 *
 *   select absent    -> `E`, every field present
 *   select literal   -> exactly those fields
 *   select unknown   -> `Partial<E>`, because fields MAY be missing
 *
 * The last one matters. Options built into a variable widen `select` to
 * `QueryFilterField<E>[] | undefined`, and claiming `E` there would promise
 * fields that a projection will not return.
 */
type SelectOf<O> = 'select' extends keyof O ? O['select'] : undefined;

export type QueryProjection<E, O> = [SelectOf<O>] extends [undefined]
  ? E
  : SelectOf<O> extends readonly (infer S)[]
    ? [Extract<S, `${string}.${string}`>] extends [never]
      ? Pick<E, Extract<S, keyof E>>
      : Partial<E> & Record<string, unknown>
    : Partial<E>;
