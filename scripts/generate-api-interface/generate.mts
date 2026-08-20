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

import { dumpDigests } from './lib/dump-digest.mts';
import { generateFromDump, versionDir } from './lib/pipeline.mts';
import { compareVersionStrings, selectVersions } from './lib/select-versions.mts';
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
    'manifest-appendix': { type: 'string', default: path.resolve(import.meta.dirname, 'manifest-appendix.md') },
    'frozen-hashes': { type: 'string', default: path.resolve(import.meta.dirname, 'frozen-hashes.json') },
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
/**
 * Frozen-file baselines, taken here rather than next to the check that uses
 * them: `generateFromDump` mutates the dump in place, so this has to happen
 * before it runs. See `dumpDigests`.
 */
const digests = dumpDigests(dump);
const availableVersions = ((dump as ApiDumpFile).versions ?? [dump as ApiDumpVersion]).map((v) => v.version);
const includePrefixes = args.include.split(',').map((s) => s.trim()).filter(Boolean);

// `--min-version` is how the committed tree is produced: the supported floor,
// with everything newer following automatically. `--api-version` remains for
// ad-hoc runs (previewing one version, narrowing a repro).
let apiVersions: string[] | undefined;
try {
  apiVersions = selectVersions({
    available: availableVersions,
    minVersion: args['min-version'],
    apiVersions: args['api-version']?.split(',').map((s) => s.trim()).filter(Boolean),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
if (args['min-version']) console.error(`Generating ${apiVersions?.length ?? 0} versions from ${args['min-version']} upward.`);

/**
 * Lowest version in a list, ordered the way `generateFromDump` orders its
 * models — ascending, numeric-aware — so this names whatever lands at
 * `models[0]`.
 *
 * Borrowed rather than rewritten: `compareVersionStrings` already carries the
 * reason numeric collation is required (`v25.04.0 < v25.10.0`), and a third
 * copy of that rule would make agreement with the pipeline a claim in a comment
 * instead of a shared function.
 */
const oldestOf = (versions: string[]): string =>
  [...versions].sort(compareVersionStrings)[0];

/**
 * The version the pipeline will treat as the chain root for this run.
 *
 * `'all'` is the sentinel for an unnarrowed run, where the root is simply the
 * oldest version the dump carries — which makes `chainRootOf` and `oldestOf`
 * agree, and is why the two checks below have to be written separately rather
 * than one being a special case of the other.
 */
function chainRootOf(selected: string[], available: string[]): string {
  return oldestOf(selected.includes('all') ? available : selected);
}

/**
 * Version -> hand-declared removals, from the hand-removed manifest.
 *
 * Two forms, validated below and separated by the pipeline: namespace prefixes
 * ending in `.`, and exact `call|job|event:name` entries. Both are interpolated
 * into emitted TypeScript — prefixes as a template literal, exact entries as a
 * quoted literal — so a stray backtick, quote or `${` would emit broken
 * TypeScript rather than fail here. Rejected loudly instead. `$comment` keys
 * are skipped, which is how the file documents itself.
 *
 * A key can also name a version this run cannot apply the removal to. That is
 * fatal only when no run ever could; a narrowed run says so and skips.
 */
function parseHandRemoved(raw: unknown, selected: string[], available: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [version, value] of Object.entries(raw as Record<string, unknown>)) {
    if (version.startsWith('$')) continue;
    if (!available.includes(version)) {
      // Names no version this dump has: stale, and its symptom is the namespace
      // silently reappearing. Fatal.
      console.error(
        `hand-removed: '${version}' is not a version in this dump ` +
        `(${available.join(', ')}). Update the key.`
      );
      process.exit(1);
    }
    // Everything that can be wrong with the manifest is judged here, before
    // either applicability skip below — so a narrowed run rejects exactly what
    // a full run rejects, which is the property the preview path is worth
    // having. Judged in the other order, `--min-version v26.0.0` exited 0 on a
    // manifest that `yarn generate:api` exits 1 on: the array shape had been
    // moved up but the per-entry form and the oldest-version check had not, and
    // both sat behind a `continue`.
    if (!Array.isArray(value) || value.some((p) => typeof p !== 'string')) {
      console.error(`hand-removed: '${version}' must map to an array of strings.`);
      process.exit(1);
    }
    for (const entry of value as string[]) {
      // Two forms, both interpolated into emitted TypeScript, so anything that
      // is neither is rejected here rather than emitted as broken code.
      //
      // `virt.` — a namespace prefix, rendered as a template literal. The
      // trailing dot is required: `virt` would emit `\`virt${string}\`` and
      // swallow a future `virtual.*`.
      //
      // `call:pool.dataset.encryption_algorithm_choices` — one exact entry,
      // rendered as a quoted literal. A single method deleted upstream cannot
      // be stated as a prefix, and its kind has to be given rather than
      // inferred: the dump that would say whether it was a call, a job or an
      // event is the very thing that no longer describes it.
      const isExact = /^(call|job|event):[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$/.test(entry);
      if (!isExact && !/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*\.$/.test(entry)) {
        console.error(
          `hand-removed: '${entry}' is neither a namespace prefix ending in '.' ` +
          `nor an exact entry of the form 'call|job|event:name'.`
        );
        process.exit(1);
      }
    }
    // A removal is an `Omit` applied to what the previous version's directory
    // declared, so a chain root has nothing to subtract from: the pipeline emits
    // no link for `i === 0` and the entry is a silent no-op.
    //
    // Whether that is a defect depends on why the version is the root, which is
    // why the two cases are answered separately and not together: this one is
    // about the manifest and belongs above the applicability skips, the one
    // further down is about this invocation and belongs below them.
    if (version === oldestOf(available)) {
      // Keyed to the dump's oldest version: no invocation can ever apply it,
      // because that version is the root of every possible run. The manifest is
      // wrong however you call the generator, so this is the fatal one.
      console.error(
        `hand-removed: '${version}' is the oldest version in this dump, so it is the ` +
        `root of every run and has no previous version to omit from — the entry can ` +
        `never apply. Move the removal to the version that inherits it.`
      );
      process.exit(1);
    }
    if (!selected.includes(version) && !selected.includes('all')) {
      // In the dump but outside this run's range — a narrowed --api-version or
      // --min-version. Not an error: the key is fine, it just does not apply.
      continue;
    }
    if (version === chainRootOf(selected, available)) {
      // Root only because this run was narrowed. The manifest is correct and
      // `yarn generate:api` applies it; this invocation simply cannot. Making
      // that fatal took away the preview path `select-versions.mts` documents
      // ("previewing one version, narrowing a repro") — `--api-version v26.0.0`
      // would have exited 1 on a manifest that is fine, with editing a tracked
      // file as the only way through. Warned and skipped, like the
      // not-selected case immediately above — both are facts about this run
      // rather than about the manifest, which is why they sit here and the
      // correctness checks sit above them.
      console.error(
        `::warning::hand-removed: '${version}' is the root of this narrowed run, so its ` +
        `entries cannot be applied here and are skipped. The manifest is fine — a full ` +
        `run from an earlier version applies them.`
      );
      continue;
    }
    out[version] = value as string[];
  }
  return out;
}

/**
 * Rows for entries no dump describes. Absent is fine — most trees have none —
 * but an unreadable file is not, because the symptom is a manifest quietly
 * claiming completeness it no longer has.
 */
async function readManifestAppendix(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    console.error(`Cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
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
    handRemoved: parseHandRemoved(handRemoved, apiVersions ?? availableVersions, availableVersions),
    manifestAppendix: await readManifestAppendix(args['manifest-appendix']),
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

/**
 * A frozen file is skipped on the premise that the dump still describes its
 * version the same way — later versions are deltas against the freshly
 * generated model, while the emitted code references the file on disk, and
 * nothing else compares the two. Middleware does backport into released version
 * directories, so the premise is not guaranteed.
 *
 * Keyed on a hash of the dump's slice for that version, not on the emitted
 * content: the emitted content also moves whenever the generator moves, which
 * would report every emitter change as "the dump changed" and, worse, make the
 * re-seed silently re-bless whatever the dump happened to say at that moment.
 * The dump slice isolates the thing actually being assumed — which is why the
 * digests are taken off the parsed dump before generation touches it, in
 * `dumpDigests`, rather than here.
 */

let recorded: Record<string, string>;
try {
  recorded = JSON.parse(await readFile(args['frozen-hashes'], 'utf8')) as Record<string, string>;
} catch (error) {
  console.error(
    `Cannot read ${args['frozen-hashes']}: ${error instanceof Error ? error.message : String(error)}\n` +
    'It records what the dump said about each frozen version; without it a frozen ' +
    'file cannot be checked for drift. Write {} to start from nothing.'
  );
  process.exit(1);
}

/**
 * `v25_10_0/api-types.ts` -> `v25.10.0`.
 *
 * Constructed forwards with the pipeline's own `versionDir` rather than parsed
 * backwards: a reimplementation here would drift the day that changes, and the
 * symptom would be frozen files silently mapping to no version, leaving the
 * drift check covering nothing.
 */
const versionOfPath = (relPath: string): string | undefined => {
  const dir = relPath.split('/')[0];
  return [...digests.keys()].find((v) => versionDir(v) === dir);
};

const unmapped = frozen.filter((f) => versionOfPath(f) === undefined);
if (unmapped.length > 0) {
  // The only way the check can go quiet now that a missing baseline is fatal:
  // no version means no baseline to miss, so it would pass while covering
  // nothing.
  console.error(
    `Cannot tell which version these frozen files belong to:\n` +
    unmapped.map((f) => `  ${f}`).join('\n') +
    '\nThey would be skipped without being checked against the dump.'
  );
  process.exit(1);
}

const frozenVersions = [...new Set(frozen.map(versionOfPath).filter((v): v is string => !!v))];
const drifted: string[] = [];
const missing: Record<string, string> = {};
for (const version of frozenVersions) {
  const digest = digests.get(version);
  if (digest === undefined) {
    // Unreachable: `frozenVersions` comes from `versionOfPath`, which only
    // returns versions this map has. Loud rather than defaulted, because a
    // stand-in value would compare unequal to every recorded baseline and
    // report drift on a dump that has not moved.
    console.error(`No digest was computed for frozen version '${version}'.`);
    process.exit(1);
  }
  const before = recorded[version];
  if (before === undefined) missing[version] = digest;
  else if (before !== digest) drifted.push(`  ${version} (${before} -> ${digest})`);
}

if (Object.keys(missing).length > 0) {
  console.error(
    `No baseline recorded for ${Object.keys(missing).length.toString()} frozen version(s), ` +
    'so their files cannot be checked against the dump. Add to ' +
    `${args['frozen-hashes']}:\n${JSON.stringify(missing, null, 2)}`
  );
  process.exit(1);
}

if (drifted.length > 0) {
  console.error(
    `The dump no longer matches ${drifted.length.toString()} frozen version(s):\n` +
    drifted.join('\n') +
    '\n\nTheir files are frozen and would have been left untouched, so the rest of ' +
    'the tree would have been generated against a model they do not hold — later ' +
    'versions may reference entries the frozen files lack, and stale shapes will ' +
    'not be re-declared.\n' +
    `Reconcile them by hand, then update ${args['frozen-hashes']}.`
  );
  process.exit(1);
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
