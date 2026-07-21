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
import { partitionShared, refNames } from './lib/partition.mts';
import {
  HEADER,
  emitTypes,
  emitCallDirectory,
  emitJobDirectory,
  emitEventDirectory,
  emitIndex,
  emitRootIndex,
} from './lib/emit.mts';
import type { ApiDumpFile, ApiDumpVersion, DefSchema, VersionModel } from './lib/types.mts';

const { values: args } = parseArgs({
  options: {
    schema: { type: 'string' },
    fetch: { type: 'string' },
    image: { type: 'string', default: 'ghcr.io/truenas/middleware:26' },
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
    'sh', '-c', 'PYTHONPATH=. python3 -m middlewared.main --dump-api',
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

// Ascending version order so the newest version's docs win for shared types.
const models = versions
  .map((v) => preprocess(v, includePrefixes))
  .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));
models.forEach(pruneUnreachable);

// Cross-version dedup: identical types go to shared/, version dirs hold only
// what is unique to or diverged in that version.
const { shared, locals, diverged } = multi
  ? partitionShared(models)
  : { shared: {} as Record<string, DefSchema>, locals: models.map((m) => m.definitions), diverged: [] as string[] };

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

if (multi) {
  await writeFiles(path.join(args.out, 'shared'), {
    'api-types.ts': await emitTypes(shared),
    'query-types.ts': queryTypesSource,
  });
}

for (const [i, model] of models.entries()) {
  const outDir = multi ? path.join(args.out, versionDir(model.version)) : args.out;
  const sharedNames = new Set(Object.keys(shared).filter((name) => name in model.definitions));

  await writeFiles(outDir, {
    ...(multi ? {} : { 'query-types.ts': queryTypesSource }),
    'api-types.ts': await emitTypes(locals[i], sharedNames),
    'api-call-directory.ts': emitCallDirectory(model.methods, sharedNames, queryPath),
    'api-job-directory.ts': emitJobDirectory(model.methods, sharedNames, queryPath),
    'api-event-directory.ts': emitEventDirectory(model.events, sharedNames),
    'index.ts': emitIndex({
      sharedEnums: [...sharedNames].filter((n) => shared[n]._kind === 'enum').sort(),
      sharedTypes: [...sharedNames].filter((n) => shared[n]._kind !== 'enum').sort(),
      queryPath,
    }),
  });

  const localCount = Object.keys(locals[i]).length;
  console.log(`Generated ${model.version}: ${model.methods.length} methods (${model.methods.filter((m) => m.job).length} jobs), ${model.events.length} events, ${sharedNames.size} shared + ${localCount} version-local types -> ${outDir}`);
}

if (multi) {
  await writeFile(path.join(args.out, 'index.ts'), emitRootIndex(models.map((m) => versionDir(m.version))));
  const enumCount = Object.values(shared).filter((d) => d._kind === 'enum').length;
  console.log(`Shared pool: ${Object.keys(shared).length} types (${enumCount} enums); ${diverged.length} diverged between versions${diverged.length ? `:\n  ${diverged.slice(0, 20).join(', ')}${diverged.length > 20 ? ` … +${diverged.length - 20} more` : ''}` : ''}`);
}
