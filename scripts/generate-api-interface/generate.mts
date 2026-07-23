#!/usr/bin/env node
/**
 * Generate TypeScript API types from a `middlewared --dump-api --keep-refs`
 * JSON dump.
 *
 * Usage (offline, from a dump file):
 *   yarn generate:api \
 *     --schema dump.json \
 *     --api-version v25.10.5,v26.0.0,v27.0.0 \
 *     --out scripts/generate-api-interface/generated
 *
 * Usage (fetch a fresh dump via the middleware container — no local setup):
 *   yarn generate:api --fetch docker --api-version all
 *
 * `--fetch docker` pulls the published middleware image (default
 * ghcr.io/truenas/middleware:master) and runs its bundled `middlewared`
 * (`--dump-api --keep-refs`). The bundled copy is a snapshot from image
 * build time (nightly-ish); its package version is logged so every run
 * records what it generated from.
 *
 * To generate from exact code instead — a specific commit, branch, or local
 * changes — pass `--middleware-repo <path>`: the checkout is mounted over
 * the bundled copy and supplies the code, while the image supplies only the
 * dependency environment. With `--fetch`, `--schema` (if given) becomes the
 * cache path the fetched dump is written to.
 *
 * The dump may be either a full `{"versions": [...]}` document or a single
 * version object. `--include` limits generation to method/event name prefixes
 * (comma-separated); omit it to generate the full API surface. With several
 * versions the output is a chain: each type is declared in the version where
 * its shape first appeared and re-exported by later versions.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

import { generateFromDump } from './lib/pipeline.mts';
import type { ApiDumpFile, ApiDumpVersion } from './lib/types.mts';

const { values: args } = parseArgs({
  options: {
    schema: { type: 'string' },
    fetch: { type: 'string' },
    image: { type: 'string', default: 'ghcr.io/truenas/middleware:master' },
    'middleware-repo': { type: 'string' },
    'api-version': { type: 'string' },
    include: { type: 'string', default: '' },
    out: { type: 'string', default: path.resolve(import.meta.dirname, '../../src/generated') },
  },
});

function runDocker(dockerArgs: string[]): SpawnSyncReturns<string> {
  const result = spawnSync('docker', dockerArgs, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 });
  if (result.error && 'code' in result.error && result.error.code === 'ENOENT') {
    console.error('docker not found on PATH — install Docker or use --schema <file> instead.');
    process.exit(1);
  }
  return result;
}

/** Run `middlewared --dump-api --keep-refs` inside the published middleware container. */
function fetchDumpViaDocker(): string {
  const repo = args['middleware-repo'];
  let result;
  if (repo) {
    // Pinned mode: the mounted checkout supplies the code, the image only the deps.
    console.error(`Dumping API from ${repo} via ${args.image}...`);
    result = runDocker([
      'run', '--rm',
      '-e', 'FAKE_ENV=1',
      '-v', `${repo}:/mnt/middleware`,
      '-w', '/mnt/middleware/src/middlewared',
      args.image,
      'sh', '-c', 'PYTHONPATH=. python3 -m middlewared.main --dump-api --keep-refs',
    ]);
  } else {
    // Default: latest image, its bundled middlewared. Record what we ran.
    console.error(`Pulling ${args.image} and dumping from its bundled middlewared...`);
    const stamp = runDocker([
      'run', '--pull', 'always', '--rm', args.image,
      'dpkg-query', '-W', '-f', '${Package} ${Version}', 'middlewared',
    ]);
    if (stamp.status === 0) console.error(`image provides: ${stamp.stdout.trim()}`);
    result = runDocker([
      'run', '--rm',
      '-e', 'FAKE_ENV=1',
      args.image,
      'python3', '-m', 'middlewared.main', '--dump-api', '--keep-refs',
    ]);
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
const apiVersions = args['api-version']?.split(',').map((s) => s.trim()).filter(Boolean);
const includePrefixes = args.include.split(',').map((s) => s.trim()).filter(Boolean);

let files: Map<string, string>;
try {
  files = await generateFromDump(dump, { apiVersions, includePrefixes, log: console.log });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

for (const [relPath, content] of files) {
  const target = path.join(args.out, relPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}
console.log(`Wrote ${files.size} files -> ${args.out}`);
