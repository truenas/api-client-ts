#!/usr/bin/env node
/**
 * Generate TypeScript API types from a `middlewared --dump-api` JSON dump.
 *
 * Usage (offline, from a dump file):
 *   yarn generate:api \
 *     --schema 26.schema.json \
 *     --api-version v25.10.5,v26.0.0 \
 *     --out scripts/generate-api-interface/generated
 *
 * Usage (fetch a fresh dump via the nightly middleware container):
 *   yarn generate:api \
 *     --fetch docker \
 *     --middleware-repo ~/Projects/middleware \
 *     --api-version v25.10.5,v26.0.0
 *
 * `--fetch docker` runs `middlewared --dump-api` inside the published
 * middleware image (default ghcr.io/truenas/middleware:26) with the local
 * middleware checkout mounted — the image supplies the dependency
 * environment, the checkout supplies the code, so the dump reflects
 * whatever branch is checked out. With `--fetch`, `--schema` (if given)
 * becomes the cache path the fetched dump is written to.
 *
 * The dump may be either a full `{"versions": [...]}` document or a single
 * version object. `--include` limits generation to method/event name prefixes
 * (comma-separated); omit it to generate the full API surface. With several
 * versions, identical types are deduplicated into shared/ and each version
 * directory holds only its own divergences.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

import { preprocess } from './lib/preprocess.mts';
import { chainAssign, refNames } from './lib/partition.mts';
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
} from './lib/emit.mts';
import type { ApiDumpFile, ApiDumpVersion, MethodModel, VersionModel } from './lib/types.mts';

const { values: args } = parseArgs({
  options: {
    schema: { type: 'string' },
    fetch: { type: 'string' },
    image: { type: 'string', default: 'ghcr.io/truenas/middleware:master' },
    'middleware-repo': { type: 'string', default: path.resolve(import.meta.dirname, '../../../middleware') },
    'api-version': { type: 'string' },
    include: { type: 'string', default: '' },
    out: { type: 'string', default: path.join(import.meta.dirname, 'generated') },
  },
});

/** Run `middlewared --dump-api` inside the published middleware container. */
function fetchDumpViaDocker(): string {
  const repo = args['middleware-repo'];
  console.error(`Dumping API from ${repo} via ${args.image}...`);
  const result = spawnSync('docker', [
    'run', '--rm',
    '-e', 'FAKE_ENV=1',
    '-v', `${repo}:/mnt/middleware`,
    '-w', '/mnt/middleware/src/middlewared',
    args.image,
    'sh', '-c', 'PYTHONPATH=. python3 -m middlewared.main --dump-api --keep-refs',
  ], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
  if (result.error && 'code' in result.error && result.error.code === 'ENOENT') {
    console.error('docker not found on PATH — install Docker or use --schema <file> instead.');
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(result.stderr?.split('\n').slice(-15).join('\n'));
    console.error(`docker run failed with exit code ${result.status} (is the Docker daemon running?)`);
    process.exit(1);
  }
  return result.stdout;
}

let raw: string;
if (args.fetch === 'docker') {
  raw = fetchDumpViaDocker();
  if (args.schema) {
    await writeFile(args.schema, raw);
    console.error(`Cached dump to ${args.schema}`);
  }
} else if (args.fetch) {
  console.error(`Unknown --fetch mode '${args.fetch}' (supported: docker).`);
  process.exit(1);
} else {
  raw = await readFile(args.schema ?? path.join(import.meta.dirname, '26.schema.json'), 'utf8');
}

const dump = JSON.parse(raw) as ApiDumpFile | ApiDumpVersion;
const available: ApiDumpVersion[] = (dump as ApiDumpFile).versions ?? [dump as ApiDumpVersion];
if (available[0] && !available[0].methods[0]?.schemas?.accepts) {
  console.error('Dump is not in --keep-refs format (methods lack schemas.accepts). '
    + 'Regenerate it with `middlewared --dump-api --keep-refs` (middleware master, commit 58b62dd6+).');
  process.exit(1);
}
let versions = available;
if (args['api-version']) {
  const wanted = args['api-version'].split(',').map((s) => s.trim()).filter(Boolean);
  versions = wanted.map((w) => {
    const found = available.find((v) => v.version === w);
    if (!found) {
      console.error(`No version ${w} in dump. Available: ${available.map((v) => v.version).join(', ')}`);
      process.exit(1);
    }
    return found;
  });
}
if (versions.length > 1 && !args['api-version']) {
  console.error(`Dump contains ${versions.length} versions; pick with --api-version (comma-separated for several).`);
  process.exit(1);
}

const includePrefixes = args.include.split(',').map((s) => s.trim()).filter(Boolean);
const multi = versions.length > 1;
const versionDir = (version: string): string => version.replaceAll('.', '_');

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

async function writeFiles(dir: string, files: Record<string, string>): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(dir, name), content);
  }
}

// The query grammar is hand-maintained framework semantics, copied verbatim
// from the template into the generated tree.
const queryTypesSource = HEADER + '\n'
  + await readFile(path.join(import.meta.dirname, 'lib/templates/query-types.ts'), 'utf8');
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
  await writeFiles(path.join(args.out, 'shared'), {
    'query-types.ts': queryTypesSource,
    'api-call-directory-base.ts': emitDirectoryBase('ApiCallDirectoryBase', baseCalls.map(directoryEntry),
      baseCalls.map((m) => [m.params.map((p) => p.schema), m.returns]), rootExternals),
    'api-job-directory-base.ts': emitDirectoryBase('ApiJobDirectoryBase', baseJobs.map(directoryEntry),
      baseJobs.map((m) => [m.params.map((p) => p.schema), m.returns]), rootExternals),
    'api-event-directory-base.ts': emitDirectoryBase('ApiEventDirectoryBase', baseEvents.map(eventEntry),
      baseEvents.map((e) => e.models), rootExternals),
  });
  console.log(`Directory bases: ${bases.call.size} calls, ${bases.job.size} jobs, ${bases.event.size} events shared across versions`);
}

for (const [i, model] of models.entries()) {
  const outDir = multi ? path.join(args.out, versionDir(model.version)) : args.out;
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

  await writeFiles(outDir, {
    ...(multi ? {} : { 'query-types.ts': queryTypesSource }),
    'api-types.ts': await emitTypes(declared[i], externals),
    'api-call-directory.ts': emitCallDirectory(model.methods, externals, queryPath, baseFor('call')),
    'api-job-directory.ts': emitJobDirectory(model.methods, externals, queryPath, baseFor('job')),
    'api-event-directory.ts': emitEventDirectory(model.events, externals, baseFor('event')),
    'index.ts': emitIndex({ inherited, queryPath }),
  });

  const declaredCount = Object.keys(declared[i]).length;
  const inheritedCount = homes[i].size - declaredCount;
  console.log(`Generated ${model.version}: ${model.methods.length} methods (${model.methods.filter((m) => m.job).length} jobs), ${model.events.length} events, ${declaredCount} declared + ${inheritedCount} inherited types -> ${outDir}`);
}

if (multi) {
  await writeFile(path.join(args.out, 'index.ts'), emitRootIndex(models.map((m) => versionDir(m.version))));
  console.log(`Chain: root ${models[0].version} declares ${Object.keys(declared[0]).length} types; ${chainStable.size} stable across the whole chain`);
}
