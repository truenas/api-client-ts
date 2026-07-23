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
  emitRootIndex,
  directoryEntry,
  eventEntry,
  type DirectoryBase,
  type Externals,
} from './emit.mts';
import type { ApiDumpFile, ApiDumpVersion, MethodModel, VersionModel } from './types.mts';

export interface PipelineOptions {
  /** Versions to generate (dump order is irrelevant); omit for a single-version dump. */
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
  if (apiVersions?.length) {
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
  const { declared, homes } = multi
    ? chainAssign(models)
    : { declared: models.map((m) => m.definitions), homes: models.map((m) => new Map(Object.keys(m.definitions).map((n) => [n, 0]))) };

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
  const baseFor = (kind: 'call' | 'job' | 'event'): DirectoryBase | undefined => (bases ? {
    names: bases[kind],
    interfaceName: `Api${kind[0].toUpperCase()}${kind.slice(1)}DirectoryBase`,
    path: `../shared/api-${kind}-directory-base`,
  } : undefined);

  if (multi && bases) {
    // Base entries render from the newest version's models (identical
    // everywhere); their type imports resolve to the chain root.
    const newest = models[models.length - 1];
    const baseCalls = newest.methods.filter((m) => !m.job && bases.call.has(m.name));
    const baseJobs = newest.methods.filter((m) => m.job && bases.job.has(m.name));
    const baseEvents = newest.events.filter((e) => bases.event.has(e.name));
    const rootExternals: Externals = new Map([...chainStable].map((name) => [name, `../${dirOf(0)}/api-types`]));
    write('shared', 'query-types.ts', queryTypesSource);
    write('shared', 'api-call-directory-base.ts', emitDirectoryBase('ApiCallDirectoryBase', baseCalls.map(directoryEntry),
      baseCalls.map((m) => [m.params.map((p) => p.schema), m.returns]), rootExternals));
    write('shared', 'api-job-directory-base.ts', emitDirectoryBase('ApiJobDirectoryBase', baseJobs.map(directoryEntry),
      baseJobs.map((m) => [m.params.map((p) => p.schema), m.returns]), rootExternals));
    write('shared', 'api-event-directory-base.ts', emitDirectoryBase('ApiEventDirectoryBase', baseEvents.map(eventEntry),
      baseEvents.map((e) => e.models), rootExternals));
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

    if (!multi) write('', 'query-types.ts', queryTypesSource);
    write(outDir, 'api-types.ts', await emitTypes(declared[i], externals));
    write(outDir, 'api-call-directory.ts', emitCallDirectory(model.methods, externals, queryPath, baseFor('call')));
    write(outDir, 'api-job-directory.ts', emitJobDirectory(model.methods, externals, queryPath, baseFor('job')));
    write(outDir, 'api-event-directory.ts', emitEventDirectory(model.events, externals, baseFor('event')));
    write(outDir, 'index.ts', emitIndex({ inherited, queryPath }));

    const declaredCount = Object.keys(declared[i]).length;
    const inheritedCount = homes[i].size - declaredCount;
    log(`Generated ${model.version}: ${model.methods.length} methods (${model.methods.filter((m) => m.job).length} jobs), ${model.events.length} events, ${declaredCount} declared + ${inheritedCount} inherited types`);
  }

  if (multi) {
    files.set('index.ts', emitRootIndex(models.map((m) => versionDir(m.version))));
    log(`Chain: root ${models[0].version} declares ${Object.keys(declared[0]).length} types; ${chainStable.size} stable across the whole chain`);
  }

  return files;
}
