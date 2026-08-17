import { createHash } from 'node:crypto';

import type { ApiDumpFile, ApiDumpVersion } from './types.mts';

/**
 * Digest of one version's slice of a dump, used as the frozen-file baseline.
 *
 * Documentation is excluded. It is not part of the generated output — the
 * preprocessor drops `description` and `examples` at intake
 * (`preprocess.mts`, "the generated output carries no docstring metadata") and
 * the manifest says so in its own header — and middleware backports docstring
 * edits into released version directories routinely. Including it would fire
 * the drift check on changes that provably cannot affect a single emitted byte,
 * and a check that cries wolf is a check that gets re-blessed reflexively.
 *
 * `doc` and `description` are discriminated on type, not key alone:
 * `description` is also a legitimate model *field* name (31 models in v25.10
 * declare one), and dropping those schema nodes would hide a real change.
 * Documentation is always a string; a field named `description` is always an
 * object. `examples` needs no such guard — it is not a field name, and the
 * preprocessor strips it unconditionally.
 */
export function dumpDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value, (key, v: unknown) =>
      (key === 'examples')
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
