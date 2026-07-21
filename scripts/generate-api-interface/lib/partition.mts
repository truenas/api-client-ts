/**
 * Cross-version type sharing.
 *
 * Partitions the preprocessed definitions of several API versions into:
 * - shared: types whose *shape* is identical in every version that defines
 *   them (and that are defined in at least two versions). A type only
 *   qualifies if every type it references is shared too — otherwise its
 *   TypeScript shape still differs through the reference.
 * - locals: per-version definitions that are unique to, or diverged in,
 *   that version.
 *
 * The physical layout this feeds (shared/ + per-version dirs holding only
 * differences) is a hard requirement: a type's presence in a version dir is
 * the signal that the API surface diverged there.
 *
 * Shape comparison ignores documentation (description/examples/titles) so a
 * docs-only edit does not fork a type; the newest version's docs win in the
 * shared pool.
 *
 * Caveat: collision-suffixed names (UserGetUserObj2, …) are assigned
 * per-version, so adding a shape in a new version can shift suffixes and
 * surface as false divergence. Safe (never wrongly shared), but noisy —
 * middleware-supplied `$defs` names would eliminate it (MIDDLEWARE-ASKS.md,
 * ask A).
 */
import type { DefSchema, VersionModel } from './types.mts';

const DOC_KEYS = new Set(['description', 'examples', 'title', '_usedBy']);

function canonical(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(canonical);
  if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (DOC_KEYS.has(key)) continue;
      out[key] = canonical(record[key]);
    }
    return out;
  }
  return node;
}

function refNames(node: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    node.forEach((n) => refNames(n, into));
  } else if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record['$ref'] === 'string') into.add(record['$ref'].replace('#/definitions/', ''));
    Object.values(record).forEach((v) => refNames(v, into));
  }
  return into;
}

export interface Partition {
  shared: Record<string, DefSchema>;
  /** Parallel to the input models array. */
  locals: Record<string, DefSchema>[];
  /** Names defined in several versions but with diverged shapes. */
  diverged: string[];
}

/**
 * @param models preprocessed version models (ascending version order — the
 *   last one's docs win for shared types)
 */
export function partitionShared(models: VersionModel[]): Partition {
  const allNames = [...new Set(models.flatMap((m) => Object.keys(m.definitions)))];

  // Locally shareable: defined in >=2 versions, identical canonical shape.
  const shareable = new Map<string, boolean>();
  for (const name of allNames) {
    const defs = models.filter((m) => name in m.definitions).map((m) => m.definitions[name]);
    const [first, ...rest] = defs.map((d) => JSON.stringify(canonical(d)));
    shareable.set(name, defs.length >= 2 && rest.every((s) => s === first));
  }

  // Fixpoint: unshareable references poison their referrers.
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of allNames) {
      if (!shareable.get(name)) continue;
      const owner = models.find((m) => name in m.definitions);
      if (!owner) continue;
      for (const ref of refNames(owner.definitions[name])) {
        if (shareable.get(ref) === false) {
          shareable.set(name, false);
          changed = true;
          break;
        }
      }
    }
  }

  const shared: Record<string, DefSchema> = {};
  for (const name of allNames) {
    if (!shareable.get(name)) continue;
    const defs = models.filter((m) => name in m.definitions).map((m) => m.definitions[name]);
    shared[name] = {
      ...defs[defs.length - 1],
      _usedBy: [...new Set(defs.flatMap((d) => d._usedBy ?? []))].sort(),
    };
  }

  const locals = models.map((m) => Object.fromEntries(
    Object.entries(m.definitions).filter(([name]) => !(name in shared)),
  ));

  const diverged = allNames
    .filter((name) => !(name in shared) && models.filter((m) => name in m.definitions).length >= 2)
    .sort();

  return { shared, locals, diverged };
}
