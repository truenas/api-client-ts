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
 * The shape a `select` projection returns.
 *
 * Plain field names project to an exact `Pick`. Dotted paths select nested
 * values whose type cannot be computed from `E`, so any select containing one
 * degrades to "some subset of `E`, plus unknown extras" — still far better
 * than the dump's model, which types every projection as an opaque
 * `Record<string, unknown>`.
 */
type Projected<E, O> = O extends { select: readonly (infer S)[] }
  ? [Extract<S, `${string}.${string}`>] extends [never]
    ? Pick<E, Extract<S, keyof E>>
    : Partial<E> & Record<string, unknown>
  : E;

/**
 * What a query method actually returns, resolved from the options passed.
 *
 * Middleware's query signature is polymorphic in `options`: `count` returns a
 * number, `get` returns one entry, otherwise a list, and `select` projects
 * whichever of those. The dump states all four outcomes as one flat `anyOf`
 * with no discriminator, so the generated response is an unusable union — this
 * recovers the correlation the schema cannot express.
 *
 * `count` is checked first because middleware evaluates it first.
 *
 * Resolution needs literal types, so it only fires when options are passed
 * inline (a `const` type parameter preserves the literals). Options built into
 * a variable widen `count: true` to `count?: boolean`, and the correlation is
 * genuinely gone.
 *
 * The critical distinction is between "provably not a count or a get" and
 * "cannot tell". Only the former may be narrowed to a list: assuming a list
 * whenever `{count: true}` fails to match would hand back `E[]` for a call that
 * returns a number at runtime, which is worse than the union this replaces —
 * the caller gets `.map is not a function` instead of a compile error. Where
 * the literals were lost, the honest answer is every shape still possible.
 */
/**
 * The value of one option flag, or `false` when the key is absent entirely.
 *
 * Tested per key rather than by matching the whole options object against
 * `{count?: false; get?: false}`: an all-optional target is a *weak type*, and
 * TypeScript rejects sources sharing no properties with it — so `{select: [...]}`
 * and `{limit: 10}` would fail to match despite plainly setting no flags.
 *
 * `K extends keyof O` distinguishes the two cases that matter: a key that is
 * absent (definitely not set) from one that is present but widened to
 * `boolean | undefined` (unknowable).
 */
type OptionFlag<O, K extends PropertyKey> = K extends keyof O ? O[K] : false;

export type QueryResult<E, O> = [O] extends [undefined]
  ? E[]
  : unknown extends O
    ? // Options omitted entirely, so `O` never got inferred.
      E[]
    : OptionFlag<O, 'count'> extends true
      ? number
      : OptionFlag<O, 'get'> extends true
        ? Projected<E, O>
        : [OptionFlag<O, 'count'>] extends [false | undefined]
          ? [OptionFlag<O, 'get'>] extends [false | undefined]
            ? // Both flags known absent or false — not assumed, established.
              Projected<E, O>[]
            : number | Partial<E> | Partial<E>[]
          : // Literals lost. `Partial<E>` because a `select` may or may not
            // have been passed, so fields may or may not be present.
            number | Partial<E> | Partial<E>[];
