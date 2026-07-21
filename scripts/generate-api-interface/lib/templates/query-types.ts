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
