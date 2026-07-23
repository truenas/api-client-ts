/**
 * The full generation pipeline, dump JSON in -> generated files out, with no
 * filesystem writes or process control: the CLI (generate.mts) supplies I/O,
 * and the unit tests call this directly.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { preprocess } from './preprocess.mts';
import { chainAssign, refNames } from './partition.mts';
import {
  HEADER,
  emitTypes,
  emitCallDirectory,
  emitJobDirectory,
  emitEventDirectory,
  emitDirectoryBase,
  emitIndex,
  emitManifest,
  emitRootIndex,
  directoryEntry,
  eventEntry,
  type DirectoryChainLink,
  type Externals,
  type ManifestRow,
} from './emit.mts';
import type { ApiDumpFile, ApiDumpVersion, MethodModel, VersionModel } from './types.mts';

export interface PipelineOptions {
  /** Versions to generate (dump order is irrelevant), or ['all']; omit for a single-version dump. */
  apiVersions?: string[];
  /** Method/event name prefixes to include; empty means the full surface. */
  includePrefixes?: string[];
  /** Progress logger; silent by default (the CLI passes console.log). */
  log?: (message: string) => void;
}

/**
 * Drop definitions no longer referenced from the API surface — mainly the
 * generated per-method query-options models orphaned by the QueryOptions<T>
 * substitution.
 */
function pruneUnreachable(model: VersionModel): void {
  const reachable = new Set<string>();
  const queue = [...refNames({ methods: model.methods, events: model.events })];
  while (queue.length) {
    const name = queue.pop();
    if (!name || reachable.has(name) || !(name in model.definitions)) continue;
    reachable.add(name);
    queue.push(...refNames(model.definitions[name]));
  }
  model.definitions = Object.fromEntries(
    Object.entries(model.definitions).filter(([name]) => reachable.has(name)),
  );
}

const versionDir = (version: string): string => version.replaceAll('.', '_');

/**
 * @returns generated files as `relative path -> content`
 * @throws Error on a non-keep-refs dump or an unknown requested version
 */
export async function generateFromDump(
  dump: ApiDumpFile | ApiDumpVersion,
  { apiVersions, includePrefixes = [], log = () => {} }: PipelineOptions = {},
): Promise<Map<string, string>> {
  const available: ApiDumpVersion[] = (dump as ApiDumpFile).versions ?? [dump as ApiDumpVersion];
  if (available[0] && !available[0].methods[0]?.schemas?.accepts) {
    throw new Error('Dump is not in --keep-refs format (methods lack schemas.accepts). '
      + 'Regenerate it with `middlewared --dump-api --keep-refs` (middleware master, commit 58b62dd6+).');
  }
  let versions = available;
  if (apiVersions?.length === 1 && apiVersions[0] === 'all') {
    versions = available;
  } else if (apiVersions?.length) {
    versions = apiVersions.map((wanted) => {
      const found = available.find((v) => v.version === wanted);
      if (!found) {
        throw new Error(`No version ${wanted} in dump. Available: ${available.map((v) => v.version).join(', ')}`);
      }
      return found;
    });
  }
  if (versions.length > 1 && !apiVersions?.length) {
    throw new Error(`Dump contains ${versions.length} versions; pick with apiVersions.`);
  }

  // Middleware's dumper version-filters methods (a method is omitted from
  // versions that lack its models) but emits the SAME event set for every
  // version — so e.g. the zfs.tier.rewrite_job_query event source appears in
  // v25.04 dumps although the feature ships in v26. Mitigate for method-named
  // events (dynamic event sources and CRUD-change events): keep such an event
  // only in versions where its method exists. Events not named after any
  // method in any generated version are kept everywhere (nothing to infer
  // from). Proper fix is upstream: version-filter events in --dump-api.
  const allMethodNames = new Set(versions.flatMap((v) => v.methods.map((m) => m.name)));
  versions = versions.map((v) => {
    const own = new Set(v.methods.map((m) => m.name));
    return {
      ...v,
      events: v.events.filter((e) => own.has(e.name) || !allMethodNames.has(e.name)),
    };
  });

  const multi = versions.length > 1;
  const files = new Map<string, string>();
  const write = (dir: string, name: string, content: string) => files.set(dir ? `${dir}/${name}` : name, content);

  // Ascending version order: the chain runs oldest -> newest, and a run's docs
  // come from its newest version.
  const models = versions
    .map((v) => preprocess(v, includePrefixes))
    .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
  models.forEach(pruneUnreachable);

  // Chained materialization: each shape is declared once, in the version where
  // it first appeared; later versions re-export from the declaring version.
  const { declared, homes, changeKind } = multi
    ? chainAssign(models)
    : {
      declared: models.map((m) => m.definitions),
      homes: models.map((m) => new Map(Object.keys(m.definitions).map((n) => [n, 0]))),
      changeKind: models.map(() => new Map<string, 'refs'>()),
    };

  const dirOf = (i: number): string => versionDir(models[i].version);

  /** Import path map for files inside version dir `i`: inherited name -> ancestor api-types. */
  const externalsFor = (i: number): Externals => new Map(
    [...homes[i]].filter(([, home]) => home !== i).map(([name, home]) => [name, `../${dirOf(home)}/api-types`]),
  );

  /** Names whose shape never changes across the whole chain (declared once, at the root). */
  const chainStable = new Set(
    Object.keys(declared[0] ?? {}).filter((name) => models.every((_, i) => homes[i].get(name) === 0)),
  );

  // The query grammar is hand-maintained framework semantics, copied verbatim
  // from the template into the generated tree.
  const queryTypesSource = HEADER + '\n'
    + await readFile(path.join(import.meta.dirname, 'templates/query-types.ts'), 'utf8');
  const queryPath = multi ? '../shared/query-types' : './query-types';

  /**
   * Base-directory eligibility: an entry hoists into shared/ iff its emitted
   * text is identical in every version AND every type it references is
   * chain-stable (identical text over re-declared types would mean different
   * things per version).
   */
  function computeDirectoryBase<T extends { name: string }>(
    perVersion: T[][],
    entryText: (item: T) => string,
    refs: (item: T) => Set<string>,
  ): Set<string> {
    const [first, ...rest] = perVersion.map((items) => new Map(items.map((it) => [it.name, it])));
    const eligible = new Set<string>();
    for (const [name, item] of first) {
      const everywhere = rest.every((m) => m.has(name) && entryText(m.get(name) as T) === entryText(item));
      if (everywhere && [...refs(item)].every((r) => chainStable.has(r))) {
        eligible.add(name);
      }
    }
    return eligible;
  }

  const methodRefs = (m: MethodModel) => refNames({ params: m.params.map((p) => p.schema), returns: m.returns });
  const bases = multi ? {
    call: computeDirectoryBase(models.map((m) => m.methods.filter((x) => !x.job)), directoryEntry, methodRefs),
    job: computeDirectoryBase(models.map((m) => m.methods.filter((x) => x.job)), directoryEntry, methodRefs),
    event: computeDirectoryBase(models.map((m) => m.events), eventEntry, (e) => refNames(e.models)),
  } : null;

  /**
   * Directory chain deltas: an entry belongs to version i's delta when it is
   * new, its emitted text changed, or a type it references was re-declared in
   * version i (identical text over a re-declared type means something
   * different). Entries of the previous version absent here are removals.
   */
  function directoryDelta<T extends { name: string }>(
    perVersion: T[][],
    entryText: (item: T) => string,
    refs: (item: T) => Set<string>,
  ): { own: T[][]; removed: string[][]; kinds: Map<string, 'refs'>[] } {
    const own: T[][] = [];
    const removed: string[][] = [];
    const kinds: Map<string, 'refs'>[] = [];
    for (let i = 0; i < perVersion.length; i++) {
      if (i === 0 || !multi) {
        own.push(perVersion[i]);
        removed.push([]);
        kinds.push(new Map());
        continue;
      }
      const prev = new Map(perVersion[i - 1].map((item) => [item.name, item]));
      const versionKinds = new Map<string, 'refs'>();
      own.push(perVersion[i].filter((item) => {
        const before = prev.get(item.name);
        if (!before || entryText(before) !== entryText(item)) return true;
        if ([...refs(item)].some((r) => homes[i].get(r) === i)) {
          // Entry text identical; pulled in because a referenced type was
          // re-declared here.
          versionKinds.set(item.name, 'refs');
          return true;
        }
        return false;
      }));
      kinds.push(versionKinds);
      const current = new Set(perVersion[i].map((item) => item.name));
      removed.push(perVersion[i - 1].filter((item) => !current.has(item.name)).map((item) => item.name));
    }
    return { own, removed, kinds };
  }

  const callDelta = directoryDelta(models.map((m) => m.methods.filter((x) => !x.job)), directoryEntry, methodRefs);
  const jobDelta = directoryDelta(models.map((m) => m.methods.filter((x) => x.job)), directoryEntry, methodRefs);
  const eventDelta = directoryDelta(models.map((m) => m.events), eventEntry, (e) => refNames(e.models));

  if (multi && bases) {
    write('shared', 'query-types.ts', queryTypesSource);
    write('shared', 'api-call-directory-base.ts', emitDirectoryBase('ApiCallDirectoryBase', 'ApiCallDirectory',
      `../${dirOf(0)}/api-call-directory`, [...bases.call]));
    write('shared', 'api-job-directory-base.ts', emitDirectoryBase('ApiJobDirectoryBase', 'ApiJobDirectory',
      `../${dirOf(0)}/api-job-directory`, [...bases.job]));
    write('shared', 'api-event-directory-base.ts', emitDirectoryBase('ApiEventDirectoryBase', 'ApiEventDirectory',
      `../${dirOf(0)}/api-event-directory`, [...bases.event]));
    log(`Directory bases: ${bases.call.size} calls, ${bases.job.size} jobs, ${bases.event.size} events shared across versions`);
  }

  for (const [i, model] of models.entries()) {
    const outDir = multi ? versionDir(model.version) : '';
    const externals = multi ? externalsFor(i) : new Map<string, string>();

    // Inherited names, grouped by declaring version for index re-exports.
    const byHome = new Map<number, string[]>();
    for (const [name, home] of homes[i]) {
      if (home !== i) byHome.set(home, [...(byHome.get(home) ?? []), name]);
    }
    const inherited = [...byHome.entries()].sort(([a], [b]) => a - b).map(([home, names]) => ({
      path: `../${dirOf(home)}/api-types`,
      enums: names.filter((n) => declared[home][n]._kind === 'enum').sort(),
      types: names.filter((n) => declared[home][n]._kind !== 'enum').sort(),
    }));

    const link = (kind: string): DirectoryChainLink | undefined => (multi && i > 0
      ? { prevPath: `../${dirOf(i - 1)}/api-${kind}-directory`, removed: [] }
      : undefined);
    const linkFor = (kind: string, removed: string[]): DirectoryChainLink | undefined => {
      const l = link(kind);
      return l ? { ...l, removed } : undefined;
    };

    if (!multi) write('', 'query-types.ts', queryTypesSource);
    write(outDir, 'api-types.ts', await emitTypes(declared[i], externals));
    write(outDir, 'api-call-directory.ts', emitCallDirectory(callDelta.own[i], externals, queryPath, linkFor('call', callDelta.removed[i])));
    write(outDir, 'api-job-directory.ts', emitJobDirectory(jobDelta.own[i], externals, queryPath, linkFor('job', jobDelta.removed[i])));
    write(outDir, 'api-event-directory.ts', emitEventDirectory(eventDelta.own[i], externals, linkFor('event', eventDelta.removed[i])));
    write(outDir, 'index.ts', emitIndex({ inherited, queryPath }));

    const declaredCount = Object.keys(declared[i]).length;
    const inheritedCount = homes[i].size - declaredCount;
    log(`Generated ${model.version}: ${model.methods.length} methods (${model.methods.filter((m) => m.job).length} jobs), ${model.events.length} events, ${declaredCount} declared + ${inheritedCount} inherited types`);
  }

  if (multi) {
    const KIND_LABEL = { refs: ' (via referenced types)' } as const;
    const manifestRows: ManifestRow[] = [];
    const collectRows = (
      kind: ManifestRow['kind'],
      delta: { own: { name: string }[][]; removed: string[][]; kinds: Map<string, 'refs'>[] },
    ) => {
      const byName = new Map<string, ManifestRow>();
      delta.own.forEach((items, i) => {
        for (const item of items) {
          const row = byName.get(item.name) ?? { name: item.name, kind, declaredIn: [], removedIn: [] };
          const reason = delta.kinds[i].get(item.name);
          row.declaredIn.push(`${models[i].version}${reason ? KIND_LABEL[reason] : ''}`);
          byName.set(item.name, row);
        }
      });
      delta.removed.forEach((names, i) => {
        for (const name of names) byName.get(name)?.removedIn.push(models[i].version);
      });
      manifestRows.push(...byName.values());
    };
    collectRows('call', callDelta);
    collectRows('job', jobDelta);
    collectRows('event', eventDelta);

    // Types get their own section: declared where materialized, labeled with
    // the change reason; removed when they leave a version's reachable surface.
    const typeRows = new Map<string, ManifestRow>();
    models.forEach((model, i) => {
      for (const name of Object.keys(declared[i])) {
        const row = typeRows.get(name) ?? { name, kind: 'type', declaredIn: [], removedIn: [] };
        const reason = changeKind[i].get(name);
        row.declaredIn.push(`${model.version}${reason ? KIND_LABEL[reason] : ''}`);
        typeRows.set(name, row);
      }
      if (i > 0) {
        for (const name of Object.keys(models[i - 1].definitions)) {
          if (!(name in model.definitions)) typeRows.get(name)?.removedIn.push(model.version);
        }
      }
    });
    manifestRows.push(...typeRows.values());
    files.set('MANIFEST.md', emitManifest(manifestRows, models.map((m) => m.version)));

    files.set('index.ts', emitRootIndex(models.map((m) => m.version)));
    log(`Chain: root ${models[0].version} declares ${Object.keys(declared[0]).length} types; ${chainStable.size} stable across the whole chain`);
  }

  return files;
}
