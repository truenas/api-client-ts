/**
 * Chained materialization: assigns every definition to the version where its
 * current shape first appeared.
 *
 * A definition is declared in version N when its shape differs from N-1,
 * directly or through a referenced definition; otherwise it is re-exported.
 * Comparison is structural and strictly against the predecessor, so a shape
 * that changes and later reverts is re-materialized at the revert.
 */
import type { DefSchema, VersionModel } from './types.mts';

/**
 * Keywords that never reach the emitted output, so a change to one is not a
 * change to the shape. JSON Schema's assertions are not TypeScript's, and
 * json-schema-to-typescript renders none of these. `minItems` and `maxItems`
 * are absent deliberately: it turns those into tuple types and `@minItems` /
 * `@maxItems` JSDoc, the only annotation tags anywhere in the generated tree.
 *
 * A denylist, not an allowlist of structural keywords, because the failure
 * directions differ: a keyword wrongly listed makes two different shapes
 * compare equal and a version silently under-declares, while one wrongly
 * omitted only re-declares a type needlessly. `_usedBy` is internal.
 */
const NON_EMITTED_KEYWORDS = new Set([
  '_usedBy',
  'title',
  'default',
  'format',
  'pattern',
  'uniqueItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'minLength',
  'maxLength',
]);

/** Keywords whose value maps *names* to schemas — those keys are field names. */
const SCHEMA_MAPS = new Set(['properties', '$defs', 'definitions', 'patternProperties', 'dependentSchemas']);
/** Keywords whose value is a single schema. */
const SCHEMA_VALUES = new Set(['items', 'additionalProperties', 'additionalItems', 'not', 'if', 'then',
  'else', 'contains', 'propertyNames', 'unevaluatedItems', 'unevaluatedProperties']);
/** Keywords whose value is a list of schemas. */
const SCHEMA_LISTS = new Set(['anyOf', 'oneOf', 'allOf', 'prefixItems']);

/** Deep key sort, for values compared verbatim: shape equality must not depend on key order. */
function sortDeep(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sortDeep);
  if (node === null || typeof node !== 'object') return node;
  const record = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) out[key] = sortDeep(record[key]);
  return out;
}

/**
 * The comparable shape of a schema, with non-emitted keywords dropped.
 *
 * Which keys are keywords depends on position, not on the value's type, and
 * getting that wrong deletes real fields: a model with a field called `title`
 * or `default` (328 and 216 of them respectively in the 2026-10-01 dump) keeps
 * both, because inside a `properties` map the keys are field names. The
 * previous value-type test — a title is a string, a field is its schema object
 * — cannot separate the two for `default`, whose keyword value is an object as
 * often as not.
 */
function canonical(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(canonical);
  if (node === null || typeof node !== 'object') return node;
  const record = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (NON_EMITTED_KEYWORDS.has(key)) continue;
    const value = record[key];
    if (SCHEMA_MAPS.has(key) && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const members = value as Record<string, unknown>;
      const mapped: Record<string, unknown> = {};
      for (const name of Object.keys(members).sort()) mapped[name] = canonical(members[name]);
      out[key] = mapped;
    } else if (SCHEMA_VALUES.has(key)) {
      out[key] = canonical(value);
    } else if (SCHEMA_LISTS.has(key) && Array.isArray(value)) {
      out[key] = value.map(canonical);
    } else {
      out[key] = sortDeep(value);
    }
  }
  return out;
}

export function refNames(node: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    node.forEach((n) => refNames(n, into));
  } else if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record['$ref'] === 'string') into.add(record['$ref'].replace('#/definitions/', ''));
    Object.values(record).forEach((v) => refNames(v, into));
  }
  return into;
}

export interface ChainedDefs {
  /** Parallel to models: the definitions materialized in each version. */
  declared: Record<string, DefSchema>[];
  /** Parallel to models: for every name in that version's surface, the model index of its declaration. */
  homes: Map<string, number>[];
  /**
   * Parallel to models: 'refs' marks a re-declared name whose own body is
   * byte-identical — pulled in because a referenced definition changed.
   * Absent = structural change or first appearance.
   */
  changeKind: Map<string, 'refs'>[];
}

export function chainAssign(models: VersionModel[]): ChainedDefs {
  const canonMemo = new Map<DefSchema, string>();
  const shape = (def: DefSchema): string => {
    let s = canonMemo.get(def);
    if (s === undefined) {
      s = JSON.stringify(canonical(def));
      canonMemo.set(def, s);
    }
    return s;
  };

  const homes: Map<string, number>[] = [];
  const changeKind: Map<string, 'refs'>[] = [];
  for (let i = 0; i < models.length; i++) {
    const defs = models[i].definitions;
    const prev = i > 0 ? models[i - 1].definitions : {};
    const prevHomes: Map<string, number> = i > 0 ? homes[i - 1] : new Map();

    const changed = new Set<string>();
    for (const name of Object.keys(defs)) {
      if (!(name in prev) || shape(defs[name]) !== shape(prev[name])) changed.add(name);
    }
    // Transitive: a definition referencing a changed definition changed too,
    // even if its own body is byte-identical.
    let again = true;
    while (again) {
      again = false;
      for (const name of Object.keys(defs)) {
        if (changed.has(name)) continue;
        for (const ref of refNames(defs[name])) {
          if (changed.has(ref)) {
            changed.add(name);
            again = true;
            break;
          }
        }
      }
    }

    const kinds = new Map<string, 'refs'>();
    for (const name of changed) {
      if (!(name in prev)) continue; // first appearance, not a change
      if (shape(defs[name]) === shape(prev[name])) kinds.set(name, 'refs');
    }
    changeKind.push(kinds);

    const h = new Map<string, number>();
    for (const name of Object.keys(defs)) {
      h.set(name, changed.has(name) ? i : (prevHomes.get(name) ?? i));
    }
    homes.push(h);
  }

  // Materialize each run once; run members are emission-identical, so the
  // declaring version's body is the body.
  const declared: Record<string, DefSchema>[] = models.map(() => ({}));
  for (let h = 0; h < models.length; h++) {
    for (const name of Object.keys(models[h].definitions)) {
      if (homes[h].get(name) === h) declared[h][name] = models[h].definitions[name];
    }
  }

  return { declared, homes, changeKind };
}
