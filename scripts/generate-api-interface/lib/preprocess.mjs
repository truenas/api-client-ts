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
 * `$defs`-preserving dump variant. Keep it disposable.
 */

/** Use-site keys that `replace_refs` merges over the definition body. */
const OVERLAY_KEYS = ['title', 'description', 'default', 'examples'];

const JOB_DOC_MARKER = 'This method is a job.';

/** JSON.stringify with recursively sorted object keys, for stable hashing. */
function stableStringify(node) {
  if (Array.isArray(node)) {
    return `[${node.map(stableStringify).join(',')}]`;
  }
  if (node !== null && typeof node === 'object') {
    const keys = Object.keys(node).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(node[k])}`).join(',')}}`;
  }
  return JSON.stringify(node);
}

/** Structural identity of a schema, ignoring top-level use-site overlays. */
function structuralHash(node) {
  const clone = { ...node };
  for (const key of OVERLAY_KEYS) {
    delete clone[key];
  }
  return stableStringify(clone);
}

const isPascalTitle = (title) => typeof title === 'string' && /^[A-Z][A-Za-z0-9_]*$/.test(title);

/** "user.query" + "options" -> "UserQueryOptions"; collapses repeated token runs. */
export function pascalName(...parts) {
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
    .replace(/(\d)([a-z])/g, (_, d, c) => d + c.toUpperCase());
}

class DefRegistry {
  constructor() {
    /** @type {Map<string, {schema: object, titles: Map<string, number>, contexts: Map<string, number>, kind: 'object'|'enum'}>} */
    this.byHash = new Map();
  }

  add(node, contextName, kind, usage) {
    const hash = structuralHash(node);
    let entry = this.byHash.get(hash);
    if (!entry) {
      entry = { schema: node, titles: new Map(), contexts: new Map(), kind, usages: new Set() };
      this.byHash.set(hash, entry);
    }
    const bump = (map, key) => key && map.set(key, (map.get(key) ?? 0) + 1);
    if (isPascalTitle(node.title)) {
      bump(entry.titles, node.title);
    }
    bump(entry.contexts, contextName);
    if (usage) entry.usages.add(usage);
    return hash;
  }

  /** Assign final names (most common Pascal title, else context name), dedupe collisions. */
  assignNames() {
    const mostCommon = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const taken = new Map(); // name -> count of uses, for suffixing
    const names = new Map(); // hash -> final name
    // Deterministic order: by preferred name, then hash
    // json-schema-to-typescript normalizes declared names (uppercasing the
    // letter after a digit, 2fa -> 2Fa); apply the same rule so our $refs and
    // its declarations agree even for names that come from middleware titles.
    const normalize = (name) => name.replace(/(\d)([a-z])/g, (_, d, c) => d + c.toUpperCase());
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
function hoist(node, registry, contextName, usage) {
  if (Array.isArray(node)) {
    return node.map((item) => hoist(item, registry, contextName, usage));
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }

  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([prop, sub]) => [prop, hoist(sub, registry, pascalName(prop), usage)]),
      );
    } else {
      out[key] = hoist(value, registry, contextName, usage);
    }
  }

  const isHoistableObject = out.type === 'object'
    && out.properties && Object.keys(out.properties).length > 0
    && (isPascalTitle(out.title) || contextName);
  const isHoistableEnum = Array.isArray(out.enum) && out.enum.length > 1 && isPascalTitle(out.title);

  if (isHoistableObject || isHoistableEnum) {
    const hash = registry.add(out, isPascalTitle(out.title) ? null : contextName, isHoistableEnum ? 'enum' : 'object', usage);
    const ref = { $ref: `#/definitions/${encodeURIComponent(hash)}` };
    // Preserve use-site overlays that matter downstream (tuple optionality, docs).
    if (out.description) ref.description = out.description;
    if ('default' in out) ref.default = out.default;
    return ref;
  }
  return out;
}

/** Rewrite hash-keyed $refs to final names, in defs and method/event schemas alike. */
function renameRefs(node, names) {
  if (Array.isArray(node)) {
    return node.map((item) => renameRefs(item, names));
  }
  if (node === null || typeof node !== 'object') {
    return node;
  }
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      const hash = decodeURIComponent(value.replace('#/definitions/', ''));
      out[key] = `#/definitions/${names.get(hash) ?? hash}`;
    } else {
      out[key] = renameRefs(value, names);
    }
  }
  return out;
}

/**
 * @param versionDump one entry of the dump's `versions` array
 * @param includePrefixes e.g. ['user.', 'alert.'] — empty means everything
 */
export function preprocess(versionDump, includePrefixes = []) {
  const included = (name) => includePrefixes.length === 0
    || includePrefixes.some((prefix) => name.startsWith(prefix));

  const registry = new DefRegistry();

  const methods = versionDump.methods.filter((m) => included(m.name)).map((method) => {
    const { properties } = method.schemas;
    const params = (properties['Call parameters'].prefixItems ?? []).map((item) => ({
      name: item.title,
      optional: 'default' in item,
      doc: item.description ?? null,
      schema: hoist(item, registry, pascalName(method.name, item.title), `${method.name} (params)`),
    }));
    const returns = hoist(
      properties['Return value'], registry, pascalName(method.name, 'result'), `${method.name} (response)`,
    );
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

  const events = versionDump.events.filter((e) => included(e.name)).map((event) => ({
    name: event.name,
    doc: event.doc,
    roles: event.roles,
    models: Object.fromEntries(
      Object.entries(event.schemas.properties).map(([variant, schema]) => [
        variant,
        hoist(schema, registry, pascalName(event.name, variant, 'event'), `${event.name} (event)`),
      ]),
    ),
  }));

  const names = registry.assignNames();
  const definitions = {};
  for (const [hash, entry] of registry.byHash) {
    const name = names.get(hash);
    definitions[name] = renameRefs({ ...entry.schema, title: name }, names);
    definitions[name]._kind = entry.kind;
    definitions[name]._usedBy = [...entry.usages].sort();
  }

  return {
    version: versionDump.version,
    definitions,
    methods: renameRefs(methods, names),
    events: renameRefs(events, names),
  };
}
