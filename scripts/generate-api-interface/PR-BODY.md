# Generated API types from middleware — end of hand-rolled interfaces

## What

Adds a generator that derives this package's entire API type surface —
interfaces, enums, and typed method/job/event directories — directly from the
middleware's pydantic models via `middlewared --dump-api --keep-refs`, and
commits the generated output for **every supported API version (v25.04.0 →
v27.0.0)** into `src/generated/`, published with the package.

Hand-written API types drift from middleware reality every release; that drift
is a documented source of UI bugs. After this PR, every API type in the package
traces mechanically to middleware's own models, and API changes surface as
compile errors instead of runtime surprises.

## How it works

```
middleware checkout (master) ──┐
ghcr.io/truenas/middleware:master ──┴─▶ middlewared --dump-api --keep-refs
                                              │  (pydantic-native JSON Schemas, named $defs)
                                              ▼
                    scripts/generate-api-interface (TypeScript, unit-tested)
                                              │
                                              ▼
                                       src/generated/
```

- **Fetch**: `yarn generate:api --fetch docker` runs the dump inside the
  nightly middleware image with a local middleware checkout mounted (image =
  dependency env, checkout = code). Works against any branch; no TrueNAS box
  needed. The `--keep-refs` dump format and structured `job` flag were added
  by the middleware team for this pipeline (NAS-141908, NAS-141910).
- **Chained materialization**: each type is declared once, in the version where
  its shape first appeared (transitively ref-aware); later versions re-export
  it. Version directories read as pairwise changelogs — e.g. `v25.10.3/4/5`
  declare **zero** types, independently confirming middleware's `aliases.py`
  (those patches are byte-identical API surfaces). Released versions' files
  stay frozen; only the newest version churns as master evolves.
- **Directories**: per-version `ApiCallDirectory` / `ApiJobDirectory` /
  `ApiEventDirectory` with labeled-tuple params, TSDoc (docstrings, `@roles`,
  `@deprecated`), plus shared base interfaces for the entries identical across
  all versions.
- **Query grammar**: the recursive filter language JSON Schema can't express is
  a hand-maintained template (`QueryFilters<T>` / `QueryOptions<T>`), which the
  generator instantiates with each query method's entity type — typo'd field
  names and invalid operators are compile errors.
- **Version registry**: the root index emits `ApiDirectoryByVersion`,
  `SupportedApiVersion`, and `SUPPORTED_API_VERSIONS` — the compile-time bridge
  the client factory will bind against (follow-up PR).

## Testing

- 49 generator unit tests: golden snapshot over a purpose-built two-version
  fixture, determinism, chain invariants (inherit / re-declare / transitive /
  revert / docs-only), preprocessor edge cases (mode splits, enum hoisting,
  name normalization, reserved names), `tsExpr` table, tuple-optionality rule.
- Full output passes `tsc --strict`, ESLint, tsup build, publint/attw; a
  12-point spot-check battery validated chain placement, content fidelity
  against the raw dump, and byte-identical regeneration.
- 164 existing client tests unaffected.

## Next steps (deliberately not in this PR)

This PR delivers the type pipeline and the packaged generated surface; the
client itself still binds to the hand-written directory. Planned follow-ups,
in order:

1. **Client integration** (next PR): make the client generic over a version's
   directory (`TrueNasApiClient<D>`), bind it in the factory via the generated
   `ApiDirectoryByVersion` registry — pinned mode (`version: 'v27.0.0'` →
   fully-typed client, discovery validates) and discovered mode (negotiated
   version, base-directory typing plus `is()`/`supports()` narrowing). Ends
   with deleting `src/types/*` hand-written API shapes and `TrueNasEndpoint`
   — the semver-major release. Consumers can migrate imports to the generated
   names beforehand, since both surfaces co-exist as of this PR.
2. **CI drift check**: a scheduled workflow running
   `yarn generate:api --fetch docker && git diff --exit-code src/generated`
   against middleware master — API drift becomes a red build with a readable
   diff instead of a runtime bug report.
3. **Runtime conformance harness**: we now hold a JSON Schema for every
   method's response, so a smoke test can call read-only endpoints on a lab
   box and validate live payloads against the schemas (ajv). Closes the one
   assumption types can't prove — that middleware's serialized output always
   matches its returns models — and doubles as a middleware regression
   detector.
4. **Query ergonomics**: `call()` overloads so `{count: true}` returns
   `number` and `{get: true}` returns the entry itself; a `byVersion()`
   helper for consumers with per-version behavior forks.
5. **Upstream niceties (middleware asks, non-blocking)**: enum member names
   (`x-enum-varnames`) would make generated enum keys exact instead of
   value-derived; consistent `required` between query-result and entry models
   would collapse most remaining `*QueryResultItem` near-duplicates and make
   entry fields non-optional where they're always present on the wire.

## Notes for reviewers

- `src/generated/**` is marked `linguist-generated` — the reviewable surface is
  `scripts/generate-api-interface/` (~1,100 lines) plus the barrel/config
  changes.
- Drift check (future CI): `yarn generate:api --fetch docker && git diff
  --exit-code src/generated`.
- The hand-written types in `src/types/` intentionally remain until the client
  is rebound to the generated directories (next PR: generic
  `TrueNasApiClient<D>`, factory binding via the version registry, then
  deletion of the hand-written surface).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
