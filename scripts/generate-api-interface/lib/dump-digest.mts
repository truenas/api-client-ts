import { createHash } from 'node:crypto';

import type { ApiDumpFile, ApiDumpVersion } from './types.mts';

/**
 * Digest of one version's slice of a dump, used as the frozen-file baseline.
 *
 * Documentation is excluded: it never reaches the output (`stripDocs`) and
 * middleware backports docstring edits routinely, so it would only cry wolf.
 * Discriminated on type, matching `stripDocs`, since `description`/`examples`
 * can also be field names: docs are a string/array, a field is an object.
 */
export function dumpDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value, (key, v: unknown) =>
      (key === 'examples' && Array.isArray(v))
      || ((key === 'doc' || key === 'description') && typeof v === 'string')
        ? undefined
        : v))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Version -> digest, for every version the dump carries.
 *
 * Taken from the dump as parsed, and taken *before* generation: `generateFromDump`
 * mutates the dump in place — `hoistInlineEnums` accumulates hoisted enums into
 * each document's `$defs` — so a digest computed afterwards is a hash of the
 * dump plus whatever the emitter did to it. That is the one thing this baseline
 * must not be. It is meant to isolate what the dump says, so that an emitter
 * change does not read as "the dump changed"; hashing the mutated structure
 * reintroduces exactly the coupling the baseline exists to avoid, and the
 * symptom is a drift failure on a run where no dump moved at all.
 */
export function dumpDigests(dump: ApiDumpFile | ApiDumpVersion): Map<string, string> {
  const versions = (dump as ApiDumpFile).versions ?? [dump as ApiDumpVersion];
  return new Map(versions.map((v) => [v.version, dumpDigest(v)]));
}
