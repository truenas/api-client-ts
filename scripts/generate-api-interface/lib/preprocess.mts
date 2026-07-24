/**
 * Preprocessor: builds the generator IR from a `middlewared --dump-api
 * --keep-refs` version dump.
 *
 * With --keep-refs (middleware commit 58b62dd6), every method emits pydantic's
 * native JSON Schema documents — `schemas: {accepts, returns}` with a `$defs`
 * table of named model definitions — and events emit one native document per
 * variant. This module merges all per-document `$defs` into one version-wide
 * definition table and unwraps the Args/Result wrapper models into per-method
 * params and return schemas.
 *
 * Merging wrinkle: pydantic renders the same model differently in validation
 * (accepts) vs serialization (returns) mode, under the same name. Where the
 * two renders differ — directly, or transitively via a referenced model that
 * differs — the definition is split: the serialization render keeps the bare
 * name (consumers read far more than they write) and the validation render
 * gets an `Input` suffix. Same-name/same-mode collisions (distinct middleware
 * models or field enums sharing a name) are qualified by origin — the owning
 * model for hoisted field enums, the defining method's service otherwise —
 * so a colliding `Status` becomes e.g. `CloudBackupEntryStatus`.
 */
import type {
  ApiDumpVersion,
  DefSchema,
  EventModel,
  MethodModel,
  Schema,
  VersionModel,
} from './types.mts';

/**
 * Names emitted by us outside api-types (query grammar template, directory
 * interfaces) — middleware model names must never claim them.
 */
const RESERVED_NAMES = new Set([
  'QueryFilter', 'QueryFilterField', 'QueryFilters', 'QueryOperator', 'QueryOptions',
  'ApiCallDirectory', 'ApiJobDirectory', 'ApiEventDirectory', 'ApiDirectory',
  'ApiCallDirectoryDelta', 'ApiJobDirectoryDelta', 'ApiEventDirectoryDelta',
  'ApiCallDirectoryBase', 'ApiJobDirectoryBase', 'ApiEventDirectoryBase',
]);

/** The uniform property set of middleware's query options model. */
const QUERY_OPTION_KEYS = new Set([
  'count', 'extra', 'force_sql_filters', 'get', 'limit', 'offset', 'order_by', 'select',
]);

type Mode = 'input' | 'output';

/** JSON.stringify with recursively sorted object keys, for stable shape identity. */
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

function directRefNames(node: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    node.forEach((n) => directRefNames(n, into));
  } else if (node !== null && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record['$ref'] === 'string') into.add(record['$ref'].replace('#/$defs/', ''));
    Object.values(record).forEach((v) => directRefNames(v, into));
  }
  return into;
}

interface DefVariant {
  schema: Schema;
  modes: Set<Mode>;
  /** Where this shape comes from: the owning model (hoisted field enums) or the method/event whose document defines it. */
  origins: Set<string>;
  /** Per mode, for every `#/$defs/X` inside `schema`: the shape hash X had in that mode's source document. */
  refHashes: { input?: Map<string, string>; output?: Map<string, string> };
  finalName?: { input: string; output: string };
}

class DefTable {
  /** model name -> shape hash -> variant */
  byName = new Map<string, Map<string, DefVariant>>();

  /** Register one `$defs` entry (or event root model) from a document of the given mode. */
  record(name: string, schema: Schema, mode: Mode, docDefs: Record<string, Schema>, origin?: string): string {
    const hash = stableStringify(schema);
    let variants = this.byName.get(name);
    if (!variants) {
      variants = new Map();
      this.byName.set(name, variants);
    }
    let variant = variants.get(hash);
    if (!variant) {
      variant = { schema, modes: new Set(), refHashes: {}, origins: new Set() };
      variants.set(hash, variant);
    }
    if (origin) variant.origins.add(origin);
    if (!variant.refHashes[mode]) {
      const refHashes = new Map<string, string>();
      for (const ref of directRefNames(schema)) {
        if (ref in docDefs) refHashes.set(ref, stableStringify(docDefs[ref]));
      }
      variant.refHashes[mode] = refHashes;
    } else {
      const existing = variant.refHashes[mode];
      for (const ref of directRefNames(schema)) {
        if (ref in docDefs && existing.has(ref) && existing.get(ref) !== stableStringify(docDefs[ref])) {
          console.warn(`warning: ${name} (${mode}) resolves reference ${ref} to different shapes in different documents; first one wins`);
        }
      }
    }
    variant.modes.add(mode);
    return hash;
  }

  /**
   * Decide which names must split into Input/output variants: a name splits
   * when its renders differ between modes, or anything it references splits.
   */
  private computeSplit(): Set<string> {
    const split = new Set<string>();
    for (const [name, variants] of this.byName) {
      if (variants.size > 1) {
        const modes = [...variants.values()].flatMap((v) => [...v.modes]);
        if (modes.includes('input') && modes.includes('output')) split.add(name);
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const [name, variants] of this.byName) {
        if (split.has(name)) continue;
        for (const variant of variants.values()) {
          if (variant.modes.size < 2) continue;
          const refs = new Set([
            ...(variant.refHashes.input?.keys() ?? []),
            ...(variant.refHashes.output?.keys() ?? []),
          ]);
          if ([...refs].some((ref) => split.has(ref))) {
            split.add(name);
            changed = true;
            break;
          }
        }
      }
    }
    return split;
  }

  /** Assign final TypeScript names to every variant, per mode. */
  assignNames(): void {
    const split = this.computeSplit();
    const used = new Set<string>();
    const claim = (want: string): string => {
      let name = want;
      let i = 2;
      while (used.has(name)) name = `${want}${i++}`;
      used.add(name);
      return name;
    };
    /**
     * PascalCase qualifier from a variant's origin: the owning model for
     * hoisted field enums ('CloudBackupEntry'), or the service of the
     * defining method ('pool.scrub.create' -> 'PoolScrub').
     */
    const qualifierFor = (variant: DefVariant): string => {
      const origin = [...variant.origins].sort()[0] ?? '';
      const stem = origin.includes('.')
        ? (origin.split('.').slice(0, -1).join(' ') || origin)
        : origin.replace(/(Args|Result)$/, '');
      return stem.split(/[^A-Za-z0-9]+/).filter(Boolean)
        .map((t) => t[0].toUpperCase() + t.slice(1)).join('');
    };
    const qualified = (variant: DefVariant, stem: string): string => {
      const qualifier = qualifierFor(variant);
      return claim(qualifier && !stem.startsWith(qualifier) ? `${qualifier}${stem}` : stem);
    };

    const prepared = [...this.byName.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, variants]) => {
        // Match json-schema-to-typescript's declared-name normalization
        // (leading capital, uppercase after digits: iSCSITargetEntry ->
        // ISCSITargetEntry, Renew2fa -> Renew2Fa) so our references and its
        // declarations agree. Underscores pass through unchanged.
        const normalized = (name[0].toUpperCase() + name.slice(1))
          .replace(/(\d)([a-z])/g, (_, d: string, c: string) => d + c.toUpperCase());
        const base = RESERVED_NAMES.has(normalized) ? `${normalized}Model` : normalized;
        const ordered = [...variants.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
        const isSplit = split.has(name);
        return {
          base,
          ordered,
          isSplit,
          // Mode-split: serialization render keeps the bare name (consumers
          // read far more than they write), validation render gets Input.
          inputs: isSplit ? ordered.filter((v) => v.modes.has('input')) : [],
          outputs: isSplit ? ordered.filter((v) => v.modes.has('output')) : [],
        };
      });

    // Phase 1: unambiguous names — middleware's own — claim their bare names
    // first, so origin-qualified collision names can never displace them.
    for (const p of prepared) {
      if (!p.isSplit) {
        if (p.ordered.length === 1) {
          const n = claim(p.base);
          p.ordered[0].finalName = { input: n, output: n };
        }
      } else {
        if (p.outputs.length === 1) {
          p.outputs[0].finalName = { input: '', output: claim(p.base) };
        }
        if (p.inputs.length === 1) {
          const v = p.inputs[0];
          v.finalName = { ...(v.finalName ?? { output: '' }), input: claim(`${p.base}Input`) };
        }
      }
    }
    // Phase 2: same-name/same-mode collisions (distinct middleware models or
    // field enums sharing a name) get origin-qualified names — Status becomes
    // CloudBackupEntryStatus, not Status2.
    for (const p of prepared) {
      if (!p.isSplit) {
        if (p.ordered.length > 1) {
          for (const v of p.ordered) {
            const n = qualified(v, p.base);
            v.finalName = { input: n, output: n };
          }
        }
      } else {
        if (p.outputs.length > 1) {
          for (const v of p.outputs) {
            v.finalName = { input: '', output: qualified(v, p.base) };
          }
        }
        if (p.inputs.length > 1) {
          for (const v of p.inputs) {
            v.finalName = { ...(v.finalName ?? { output: '' }), input: qualified(v, `${p.base}Input`) };
          }
        }
      }
    }
  }

  /** Resolve a `#/$defs/` reference from a document of the given mode to a final name. */
  resolve(name: string, mode: Mode, docDefs: Record<string, Schema>): string {
    const source = docDefs[name];
    const variant = source !== undefined
      ? this.byName.get(name)?.get(stableStringify(source))
      : undefined;
    const final = variant?.finalName?.[mode];
    if (!final) {
      console.warn(`warning: unresolved $defs reference '${name}' (${mode})`);
      return name;
    }
    return final;
  }

  /** Emit the merged definition table with all references rewritten to final names. */
  definitions(): Record<string, DefSchema> {
    const out: Record<string, DefSchema> = {};
    const emit = (variant: DefVariant, mode: Mode, docDefsProxy: Record<string, Schema>) => {
      const finalName = variant.finalName?.[mode];
      if (!finalName || finalName in out) return;
      const def: DefSchema = rewriteRefs(variant.schema, this, mode, docDefsProxy) as DefSchema;
      def.title = finalName;
      def._kind = Array.isArray(def.enum) ? 'enum' : 'object';
      out[finalName] = def;
    };
    for (const variants of this.byName.values()) {
      for (const variant of variants.values()) {
        // Reconstruct enough of each mode's source-document $defs context to
        // resolve this definition's own references.
        for (const mode of ['output', 'input'] as const) {
          if (!variant.modes.has(mode)) continue;
          const docDefsProxy: Record<string, Schema> = {};
          for (const [ref, hash] of variant.refHashes[mode] ?? []) {
            const target = this.byName.get(ref)?.get(hash);
            if (target) docDefsProxy[ref] = target.schema;
          }
          emit(variant, mode, docDefsProxy);
        }
      }
    }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
  }
}

/** Rewrite `#/$defs/X` references to `#/definitions/<finalName>` and drop `$defs` tables. */
function rewriteRefs(node: unknown, table: DefTable, mode: Mode, docDefs: Record<string, Schema>): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => rewriteRefs(item, table, mode, docDefs));
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$defs') continue;
    if (key === '$ref' && typeof value === 'string') {
      out[key] = `#/definitions/${table.resolve(value.replace('#/$defs/', ''), mode, docDefs)}`;
    } else {
      out[key] = rewriteRefs(value, table, mode, docDefs);
    }
  }
  return out;
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

const isPascalTitle = (title: unknown): title is string => typeof title === 'string' && /^[A-Z][A-Za-z0-9_]*$/.test(title);

/** Keys that belong to the field site, not the enum definition. */
const ENUM_USE_SITE_KEYS = ['description', 'default', 'examples'];

/**
 * Pydantic inlines most middleware enums at their field sites (only true Enum
 * classes reach `$defs`). Hoist titled inline enums into the document's
 * `$defs` (mutating the document) so they flow through the normal definition
 * machinery and get emitted as named const-object enums.
 */
function hoistInlineEnums(node: unknown, doc: Schema, owners: Map<string, string>, owner: string, isDefRoot = false): unknown {
  if (Array.isArray(node)) return node.map((n) => hoistInlineEnums(n, doc, owners, owner));
  if (node === null || typeof node !== 'object') return node;
  const schema = node as Schema;
  const out: Schema = {};
  for (const [key, value] of Object.entries(schema)) {
    out[key] = key === '$defs' ? value : hoistInlineEnums(value, doc, owners, owner);
  }
  // A def body is already named — hoisting it would replace the definition
  // with a self-referential $ref.
  if (!isDefRoot && Array.isArray(out.enum) && out.enum.length > 1 && isPascalTitle(out.title) && !out.$ref) {
    const body: Schema = { ...out };
    const useSite: Schema = {};
    for (const key of ENUM_USE_SITE_KEYS) {
      if (key in body) {
        useSite[key] = body[key];
        delete body[key];
      }
    }
    const defs = (doc.$defs ??= {});
    const existing = defs[out.title];
    if (existing === undefined || stableStringify(existing) === stableStringify(body)) {
      defs[out.title] = body;
      if (!owners.has(out.title)) owners.set(out.title, owner);
      return { $ref: `#/$defs/${out.title}`, ...useSite };
    }
  }
  return out;
}

/**
 * Remove documentation prose from a schema document. By team decision the
 * generated output carries no docstring metadata (descriptions/examples):
 * api.truenas.com is the documentation home, and prose edits are not API
 * drift. Semantic annotations (roles, removed_in, usage cross-references)
 * are kept — they are not docstrings.
 */
function stripDocs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripDocs);
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'description' || key === 'examples') continue;
    out[key] = stripDocs(value);
  }
  return out;
}

/** Apply enum hoisting to a whole document: def bodies first, then the root. */
function hoistDocEnums(doc: Schema): { doc: Schema; owners: Map<string, string> } {
  doc.$defs ??= {};
  const owners = new Map<string, string>();
  for (const name of Object.keys(doc.$defs)) {
    doc.$defs[name] = hoistInlineEnums(doc.$defs[name], doc, owners, name, true) as Schema;
  }
  const transformed = hoistInlineEnums(doc, doc, owners, String(doc.title ?? '')) as Schema;
  transformed.$defs = doc.$defs;
  return { doc: transformed, owners };
}

/** Record every `$defs` entry of one document into the table. */
function recordDoc(table: DefTable, doc: Schema, mode: Mode, docOrigin: string, owners: Map<string, string>): void {
  const docDefs = (doc.$defs ?? {}) as Record<string, Schema>;
  for (const [name, schema] of Object.entries(docDefs)) {
    table.record(name, schema, mode, docDefs, owners.get(name) ?? docOrigin);
  }
}

/**
 * @param versionDump one entry of the dump's `versions` array
 * @param includePrefixes e.g. ['user.', 'alert.'] — empty means everything
 */
export function preprocess(versionDump: ApiDumpVersion, includePrefixes: string[] = []): VersionModel {
  const included = (name: string) => includePrefixes.length === 0
    || includePrefixes.some((prefix) => name.startsWith(prefix));

  const methods = versionDump.methods.filter((m) => included(m.name));
  const events = versionDump.events.filter((e) => included(e.name));

  const table = new DefTable();
  for (const method of methods) {
    const accepts = hoistDocEnums(stripDocs(method.schemas.accepts) as Schema);
    const returns = hoistDocEnums(stripDocs(method.schemas.returns) as Schema);
    method.schemas.accepts = accepts.doc;
    method.schemas.returns = returns.doc;
    recordDoc(table, accepts.doc, 'input', method.name, accepts.owners);
    recordDoc(table, returns.doc, 'output', method.name, returns.owners);
  }
  for (const event of events) {
    for (const [variant, rawDoc] of Object.entries(event.schemas)) {
      const hoisted = hoistDocEnums(stripDocs(rawDoc) as Schema);
      const doc = hoisted.doc;
      event.schemas[variant] = doc;
      recordDoc(table, doc, 'input', event.name, hoisted.owners);
      // The event root itself is a named model; hoist it like a $defs entry.
      const { $defs, ...root } = doc;
      if (typeof root.title === 'string') {
        table.record(root.title, root as Schema, 'input', ($defs ?? {}) as Record<string, Schema>, event.name);
      }
    }
  }
  table.assignNames();
  const definitions = table.definitions();

  const methodModels: MethodModel[] = methods.map((method) => {
    const accepts = method.schemas.accepts;
    const acceptsDefs = (accepts.$defs ?? {}) as Record<string, Schema>;
    const required = new Set(accepts.required ?? []);
    const params = Object.entries(accepts.properties ?? {}).map(([name, schema]) => ({
      name,
      optional: !required.has(name),
      doc: schema.description ?? null,
      schema: rewriteRefs(schema, table, 'input', acceptsDefs) as Schema,
    }));
    const returnsDoc = method.schemas.returns;
    const returns = rewriteRefs(
      (returnsDoc.properties ?? {})['result'] ?? {},
      table,
      'output',
      (returnsDoc.$defs ?? {}) as Record<string, Schema>,
    ) as Schema;
    return {
      name: method.name,
      doc: method.doc,
      roles: method.roles,
      removedIn: method.removed_in,
      job: method.job,
      params,
      returns,
    };
  });

  const eventModels: EventModel[] = events.map((event) => ({
    name: event.name,
    doc: event.doc,
    roles: event.roles,
    models: Object.fromEntries(
      Object.entries(event.schemas).map(([variant, doc]) => {
        const docDefs = (doc.$defs ?? {}) as Record<string, Schema>;
        const model: Schema = typeof doc.title === 'string'
          ? { $ref: `#/definitions/${table.resolve(doc.title, 'input', { ...docDefs, [doc.title]: stripDefs(doc) })}` }
          : rewriteRefs(doc, table, 'input', docDefs) as Schema;
        return [variant, model];
      }),
    ),
  }));

  applyQueryTyping(methodModels, definitions);


  return {
    version: versionDump.version,
    definitions,
    methods: methodModels,
    events: eventModels,
  };
}

function stripDefs(doc: Schema): Schema {
  const rest: Schema = { ...doc };
  delete rest.$defs;
  return rest;
}
