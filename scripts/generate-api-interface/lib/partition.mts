/**
 * Chained materialization: assigns every definition to the version where its
 * current shape first appeared.
 *
 * Versions form a chain (ascending). A definition is *declared* (fully
 * materialized) in version N when its shape differs from version N-1 —
 * directly, or transitively through a referenced definition that changed.
 * Versions where the shape is unchanged inherit the ancestor's declaration
 * via re-export. Every distinct shape is materialized exactly once, released
 * versions' files stay frozen as master evolves (only the newest version's
 * directory churns), and each version directory reads as the pairwise
 * changelog against its predecessor.
 *
 * Comparison is purely structural — fields and field types. The generated
 * output carries no documentation metadata (the preprocessor strips it at
 * intake), so there is nothing non-structural to compare; `title` is ignored
 * (stripped before emission; definition identity is the name).
 *
 * A shape that changes and later reverts is re-materialized at the revert
 * point (comparison is strictly against the predecessor) — rare, and keeps
 * runs contiguous.
 */
import type { DefSchema, VersionModel } from './types.mts';

const NON_EMITTED_KEYS = new Set(['title', '_usedBy']);  // _usedBy: legacy key, defensively ignored

function canonical(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(canonical);
  if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (NON_EMITTED_KEYS.has(key)) continue;
      out[key] = canonical(record[key]);
    }
    return out;
  }
  return node;
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
