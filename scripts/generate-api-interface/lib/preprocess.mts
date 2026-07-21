/**
 * Preprocessor: reconstructs named, shared schema definitions from a
 * `middlewared --dump-api` version dump.
 *
 * The middleware dump runs every schema through `replace_refs`, which inlines
 * all `$defs` at their use sites (merging use-site keys like `description` and
 * `default` over the definition). This module reverses that: it hash-conses
 * structurally identical titled subschemas back into a single `$defs`-style
 * table and replaces occurrences with `$ref`s.
 *
 * NOTE: this whole pass becomes obsolete if/when middleware ships a
 * `$defs`-preserving dump variant (MIDDLEWARE-ASKS.md, ask A). Keep it
 * disposable.
 */
import type {
  ApiDumpVersion,
  DefKind,
  DefSchema,
  EventModel,
  MethodModel,
  Schema,
  VersionModel,
} from './types.mts';

/** Use-site keys that `replace_refs` merges over the definition body. */
const OVERLAY_KEYS = ['title', 'description', 'default', 'examples'];

const JOB_DOC_MARKER = 'This method is a job.';

/**
 * Names emitted by us outside api-types (query grammar template, directory
 * interfaces) — generated definitions must never claim them.
 */
const RESERVED_NAMES = [
  'QueryFilter', 'QueryFilterField', 'QueryFilters', 'QueryOperator', 'QueryOptions',
  'ApiCallDirectory', 'ApiJobDirectory', 'ApiEventDirectory', 'ApiDirectory',
];

/** The uniform property set of middleware's query options model. */
const QUERY_OPTION_KEYS = new Set([
  'count', 'extra', 'force_sql_filters', 'get', 'limit', 'offset', 'order_by', 'select',
]);

/** JSON.stringify with recursively sorted object keys, for stable hashing. */
function stableStringify(node: unknown): string {
  if (Array.isArray(node)) {
    return `[${node.map(stableStringify).join(',')}]`;
  }
  if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
  }
  return JSON.stringify(node);
}

/** Structural identity of a schema, ignoring top-level use-site overlays. */
function structuralHash(node: Schema): string {
  const clone: Schema = { ...node };
  for (const key of OVERLAY_KEYS) {
    delete clone[key];
  }
  return stableStringify(clone);
}

const isPascalTitle = (title: unknown): title is string => typeof title === 'string' && /^[A-Z][A-Za-z0-9_]*$/.test(title);

/** "user.query" + "options" -> "UserQueryOptions"; collapses repeated token runs. */
export function pascalName(...parts: string[]): string {
  const tokens = parts
    .flatMap((p) => String(p).split(/[^A-Za-z0-9]+|(?=[A-Z])/))
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  // Collapse repeated runs: user create user create -> user create
  const half = Math.floor(tokens.length / 2);
  for (let size = half; size >= 1; size--) {
    for (let i = 0; i + 2 * size <= tokens.length; i++) {
      const a = tokens.slice(i, i + size).join(' ');
      const b = tokens.slice(i + size, i + 2 * size).join(' ');
      if (a === b) {
        tokens.splice(i + size, size);
        size = Math.min(Math.floor(tokens.length / 2), size);
        i--;
      }
    }
  }
  return tokens
    .map((t) => t[0].toUpperCase() + t.slice(1))
    .join('')
    // Match json-schema-to-typescript's normalizer, which uppercases the
    // letter following a digit (2fa -> 2Fa) — our declarations and its
    // references must agree on the name.
    .replace(/(\d)([a-z])/g, (_, d: string, c: string) => d + c.toUpperCase());
}

interface RegistryEntry {
  schema: Schema;
  titles: Map<string, number>;
  contexts: Map<string, number>;
  kind: DefKind;
  usages: Set<string>;
}

class DefRegistry {
  byHash = new Map<string, RegistryEntry>();

  add(node: Schema, contextName: string | null, kind: DefKind, usage: string): string {
    const hash = structuralHash(node);
    let entry = this.byHash.get(hash);
    if (!entry) {
      entry = { schema: node, titles: new Map(), contexts: new Map(), kind, usages: new Set() };
      this.byHash.set(hash, entry);
    }
    const bump = (map: Map<string, number>, key: string | null) => {
      if (key) map.set(key, (map.get(key) ?? 0) + 1);
    };
    if (isPascalTitle(node.title)) {
      bump(entry.titles, node.title);
    }
    bump(entry.contexts, contextName);
    entry.usages.add(usage);
    return hash;
  }

  /** Assign final names (most common Pascal title, else context name), dedupe collisions. */
  assignNames(): Map<string, string> {
    const mostCommon = (map: Map<string, number>) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    // json-schema-to-typescript normalizes declared names (uppercasing the
    // letter after a digit, 2fa -> 2Fa); apply the same rule so our $refs and
    // its declarations agree even for names that come from middleware titles.
    const normalize = (name: string) => name.replace(/(\d)([a-z])/g, (_, d: string, c: string) => d + c.toUpperCase());
    const taken = new Map<string, number>(RESERVED_NAMES.map((n) => [n, 1])); // name -> count of uses, for suffixing
    const names = new Map<string, string>(); // hash -> final name
    // Deterministic order: by preferred name, then hash
    const entries = [...this.byHash.entries()].map(([hash, entry]) => ({
      hash,
      entry,
      preferred: normalize(mostCommon(entry.titles) ?? mostCommon(entry.contexts) ?? 'Anonymous'),
    }));
    entries.sort((a, b) => a.preferred.localeCompare(b.preferred) || a.hash.localeCompare(b.hash));
    for (const { hash, preferred } of entries) {
      const n = taken.get(preferred) ?? 0;
      taken.set(preferred, n + 1);
      names.set(hash, n === 0 ? preferred : `${preferred}${n + 1}`);
    }
    return names;
  }
}

/**
 * Post-order walk that hoists titled object/enum schemas into the registry,
 * replacing them with `{$ref}` placeholders keyed by structural hash.
 */
function hoist(node: unknown, registry: DefRegistry, contextName: string | null, usage: string): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => hoist(item, registry, contextName, usage));
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }

  const out: Schema = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(
          ([prop, sub]) => [prop, hoist(sub, registry, pascalName(prop), usage)],
        ),
      ) as Record<string, Schema>;
    } else {
      out[key] = hoist(value, registry, contextName, usage);
    }
  }

  const isHoistableObject = out.type === 'object'
    && out.properties && Object.keys(out.properties).length > 0
    && (isPascalTitle(out.title) || contextName !== null);
  const isHoistableEnum = Array.isArray(out.enum) && out.enum.length > 1 && isPascalTitle(out.title);

  if (isHoistableObject || isHoistableEnum) {
    const hash = registry.add(out, isPascalTitle(out.title) ? null : contextName, isHoistableEnum ? 'enum' : 'object', usage);
    const ref: Schema = { $ref: `#/definitions/${encodeURIComponent(hash)}` };
    // Preserve use-site overlays that matter downstream (tuple optionality, docs).
    if (out.description) ref.description = out.description;
    if ('default' in out) ref.default = out.default;
    return ref;
  }
  return out;
}

/** Rewrite hash-keyed $refs to final names, in defs and method/event schemas alike. */
function renameRefs<T>(node: T, names: Map<string, string>): T {
  if (Array.isArray(node)) {
    return node.map((item) => renameRefs(item, names)) as T;
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      const hash = decodeURIComponent(value.replace('#/definitions/', ''));
      out[key] = `#/definitions/${names.get(hash) ?? hash}`;
    } else {
      out[key] = renameRefs(value, names);
    }
  }
  return out as T;
}

const refIn = (s: Schema | boolean | undefined): string | null => (
  s && typeof s === 'object' && typeof s.$ref === 'string' ? s.$ref.replace('#/definitions/', '') : null
);

/**
 * Entity type expression of a query method, from its return schema — the
 * standard shape is `anyOf: [array-of-entity, single-entity, count]`.
 */
function inferEntityExpr(returns: Schema): string | null {
  const variants = returns.anyOf ?? returns.oneOf ?? [returns];
  for (const variant of variants) {
    if (variant.type !== 'array' || !variant.items) continue;
    const single = refIn(variant.items);
    if (single) return single;
    const union = variant.items.anyOf ?? variant.items.oneOf;
    if (union && union.every((u) => refIn(u))) {
      return union.map((u) => refIn(u)).join(' | ');
    }
  }
  return null;
}

/**
 * Replace the untypeable `filters`/`options` params of query methods with the
 * hand-written generics from the query-types template, instantiated with the
 * method's entity type. The orphaned generated options definitions are
 * removed later by reachability pruning.
 */
function applyQueryTyping(methods: MethodModel[], definitions: Record<string, DefSchema>): void {
  // Keep structured refs alongside the opaque tsType so import collection
  // still sees the entity type(s).
  const entityRefs = (entity: string) => entity.split(' | ')
    .filter((name) => name in definitions)
    .map((name) => ({ $ref: `#/definitions/${name}` }));
  const isQueryOptionsDef = (schema: Schema): boolean => {
    const def = definitions[refIn(schema) ?? ''];
    const props = Object.keys(def?.properties ?? {});
    return props.length > 0 && props.every((k) => QUERY_OPTION_KEYS.has(k));
  };

  for (const method of methods) {
    // `.query`-style: entity is the result item; single-entity methods
    // (`.get_instance(id, options)`): entity is the returned entry itself.
    const entity = inferEntityExpr(method.returns) ?? refIn(method.returns) ?? 'Record<string, unknown>';

    for (let i = 0; i < method.params.length; i++) {
      const param = method.params[i];
      if (param.name === 'filters' && method.params[i + 1]?.name === 'options') {
        param.schema = { tsType: `QueryFilters<${entity}>`, _refs: entityRefs(entity) };
      } else if (param.name === 'options' && isQueryOptionsDef(param.schema)) {
        param.schema = { tsType: `QueryOptions<${entity}>`, _refs: entityRefs(entity) };
      }
    }
  }
}

/**
 * @param versionDump one entry of the dump's `versions` array
 * @param includePrefixes e.g. ['user.', 'alert.'] — empty means everything
 */
export function preprocess(versionDump: ApiDumpVersion, includePrefixes: string[] = []): VersionModel {
  const included = (name: string) => includePrefixes.length === 0
    || includePrefixes.some((prefix) => name.startsWith(prefix));

  const registry = new DefRegistry();

  const methods: MethodModel[] = versionDump.methods.filter((m) => included(m.name)).map((method) => {
    const properties = method.schemas.properties ?? {};
    const params = (properties['Call parameters']?.prefixItems ?? []).map((item) => ({
      name: item.title ?? '',
      optional: 'default' in item,
      doc: item.description ?? null,
      schema: hoist(item, registry, pascalName(method.name, item.title ?? ''), `${method.name} (params)`) as Schema,
    }));
    const returns = hoist(
      properties['Return value'], registry, pascalName(method.name, 'result'), `${method.name} (response)`,
    ) as Schema;
    return {
      name: method.name,
      doc: method.doc,
      roles: method.roles,
      removedIn: method.removed_in,
      job: (method.doc ?? '').includes(JOB_DOC_MARKER),
      params,
      returns,
    };
  });

  const events: EventModel[] = versionDump.events.filter((e) => included(e.name)).map((event) => ({
    name: event.name,
    doc: event.doc,
    roles: event.roles,
    models: Object.fromEntries(
      Object.entries(event.schemas.properties ?? {}).map(([variant, schema]) => [
        variant,
        hoist(schema, registry, pascalName(event.name, variant, 'event'), `${event.name} (event)`) as Schema,
      ]),
    ),
  }));

  const names = registry.assignNames();
  const definitions: Record<string, DefSchema> = {};
  for (const [hash, entry] of registry.byHash) {
    const name = names.get(hash);
    if (!name) continue;
    const def: DefSchema = renameRefs({ ...entry.schema, title: name }, names);
    def._kind = entry.kind;
    def._usedBy = [...entry.usages].sort();
    definitions[name] = def;
  }

  const finalMethods = renameRefs(methods, names);
  applyQueryTyping(finalMethods, definitions);

  return {
    version: versionDump.version,
    definitions,
    methods: finalMethods,
    events: renameRefs(events, names),
  };
}
