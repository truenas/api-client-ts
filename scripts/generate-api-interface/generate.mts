#!/usr/bin/env node
/**
 * Generate TypeScript API types from a `middlewared --dump-api --keep-refs`
 * JSON dump.
 *
 * Usage (offline, from a dump file):
 *   yarn generate:api \
 *     --schema dump.json \
 *     --min-version v25.10.0 \
 *     --out scripts/generate-api-interface/generated
 *
 * Usage (fetch a fresh dump via the middleware container — no local setup):
 *   yarn generate:api --fetch docker --min-version v25.10.0
 *
 * Files carrying the FROZEN marker are left untouched (released versions are a
 * record, not an output); everything else in the chain is still generated.
 *
 * `--min-version` generates that version and everything newer, which is how
 * the committed tree is produced: the supported floor is stated once and new
 * middleware releases are picked up by regenerating. `--api-version` selects
 * exact versions (or `all`) instead, for ad-hoc runs — previewing a single
 * version, or narrowing a repro. The two are mutually exclusive.
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
import { selectVersions } from './lib/select-versions.mts';
import type { ApiDumpFile, ApiDumpVersion } from './lib/types.mts';

const { values: args } = parseArgs({
  options: {
    schema: { type: 'string' },
    fetch: { type: 'string' },
    image: { type: 'string', default: 'ghcr.io/truenas/middleware:master' },
    'middleware-repo': { type: 'string' },
    'min-version': { type: 'string' },
    'api-version': { type: 'string' },
    include: { type: 'string', default: '' },
    'hand-removed': { type: 'string', default: path.resolve(import.meta.dirname, 'hand-removed.json') },
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
if (args.fetch && args.fetch !== 'docker') {
  console.error(`Unknown --fetch mode '${args.fetch}' (supported: docker).`);
  process.exit(1);
} else if (args.fetch === 'docker' || !args.schema) {
  // Docker fetch is the default: with no --schema there is nothing to read
  // locally, so a bare `yarn generate:api` fetches a fresh dump.
  if (!args.fetch) console.error('No --schema given — fetching a fresh dump via docker (pass --schema <file> for offline use).');
  raw = fetchDumpViaDocker();
  if (args.schema) {
    await writeFile(args.schema, raw);
    console.error(`Cached dump to ${args.schema}`);
  }
} else {
  raw = await readFile(args.schema, 'utf8');
}

const dump = JSON.parse(raw) as ApiDumpFile | ApiDumpVersion;
const includePrefixes = args.include.split(',').map((s) => s.trim()).filter(Boolean);

// `--min-version` is how the committed tree is produced: the supported floor,
// with everything newer following automatically. `--api-version` remains for
// ad-hoc runs (previewing one version, narrowing a repro).
let apiVersions: string[] | undefined;
try {
  apiVersions = selectVersions({
    available: ((dump as ApiDumpFile).versions ?? [dump as ApiDumpVersion]).map((v) => v.version),
    minVersion: args['min-version'],
    apiVersions: args['api-version']?.split(',').map((s) => s.trim()).filter(Boolean),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
if (args['min-version']) console.error(`Generating ${apiVersions?.length ?? 0} versions from ${args['min-version']} upward.`);

/**
 * Version -> namespace prefixes, from the hand-removed manifest.
 *
 * Prefixes are interpolated into an emitted template literal, so a stray
 * backtick or `${` would emit broken TypeScript rather than fail here. Rejected
 * loudly instead. `$comment` keys are skipped, which is how the file documents
 * itself.
 */
function parseHandRemoved(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [version, value] of Object.entries(raw as Record<string, unknown>)) {
    if (version.startsWith('$')) continue;
    if (!Array.isArray(value) || value.some((p) => typeof p !== 'string')) {
      console.error(`hand-removed: '${version}' must map to an array of strings.`);
      process.exit(1);
    }
    for (const prefix of value as string[]) {
      if (!/^[A-Za-z0-9_.]+$/.test(prefix)) {
        console.error(`hand-removed: '${prefix}' is not a bare namespace prefix.`);
        process.exit(1);
      }
    }
    out[version] = value as string[];
  }
  return out;
}

let files: Map<string, string>;
try {
  const handRemoved = JSON.parse(
    await readFile(args['hand-removed'], 'utf8')
  ) as Record<string, string[] | string>;
  files = await generateFromDump(dump, {
    apiVersions,
    includePrefixes,
    log: console.log,
    handRemoved: parseHandRemoved(handRemoved),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

/**
 * Marker a released version's files carry once they are no longer an output.
 *
 * A released API cannot change, so its directory is a record. Some of them also
 * hold entries no dump can reproduce — v25.10's `virt.*` namespace was deleted
 * from every version directory in middleware, so regenerating that directory
 * deletes it here rather than restoring it.
 *
 * Checked against what is already on disk rather than against a version number,
 * because the version number would need maintaining and this does not: freeze a
 * version by writing the marker into its files, unfreeze it by removing it.
 *
 * Skipped rather than fatal. The whole chain still has to be generated — later
 * versions are deltas against the frozen one, and the root index enumerates
 * every version — so refusing to run would leave no way to pick up a new
 * release, and narrowing `--min-version` past the frozen version would make the
 * next one the chain root and drop the earlier ones from the package entirely.
 * Skipping is safe precisely because a frozen file does not change: the rest of
 * the tree is generated against the same model it already holds.
 */
const FROZEN_MARKER = 'FROZEN — generated once, then hand-maintained.';

const frozen: string[] = [];
for (const relPath of files.keys()) {
  const target = path.join(args.out, relPath);
  const existing = await readFile(target, 'utf8').catch((error: NodeJS.ErrnoException) => {
    // Absent is fine — that is a new file. Anything else means we cannot tell
    // whether it is frozen, and guessing "no" is the destructive guess.
    if (error.code === 'ENOENT') return null;
    console.error(`Cannot read ${target} to check for the frozen marker: ${error.message}`);
    process.exit(1);
  });
  if (existing?.includes(FROZEN_MARKER)) frozen.push(relPath);
}

for (const [relPath, content] of files) {
  if (frozen.includes(relPath)) continue;
  const target = path.join(args.out, relPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

if (frozen.length > 0) {
  console.error(
    `Left ${frozen.length.toString()} frozen file(s) untouched:\n` +
    frozen.map((f) => `  ${f}`).join('\n') +
    '\nThose versions are released; their directories are a record rather than ' +
    'an output, and some carry hand-maintained entries no dump can reproduce.\n' +
    'Remove the marker from a file to let generation overwrite it.'
  );
}
console.log(`Wrote ${(files.size - frozen.length).toString()} files -> ${args.out}`);
