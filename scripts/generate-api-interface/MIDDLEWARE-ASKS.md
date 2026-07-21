# `--dump-api` adjustments for TypeScript type generation

## Context

We (webui / api-client-ts) are generating TypeScript interfaces, enums, and typed
method directories for the JSON-RPC API directly from `middlewared --dump-api`, to
replace the hand-maintained interfaces in webui that chronically drift from
middleware reality. A working generator exists (api-client-ts,
`scripts/generate-api-interface/`) producing the full 815-method v26 surface today.
The dump is already 95% of what we need — the asks below remove the workarounds.

Ranked by impact. **A and D are the important ones.**

---

## A. Preserve `$defs` instead of inlining (the big one)

Pydantic natively emits shared, *named* definitions. For example,
`model_json_schema(AuthLoginExArgs)` (real output from `v26_0_0/auth.py`):

```json
{
  "$defs": {
    "AuthApiKeyPlain": { "...": "..." },
    "AuthCommonOptions": { "...": "..." },
    "AuthOTPToken": { "...": "..." },
    "AuthPasswordPlain": { "...": "..." },
    "AuthSCRAM": { "...": "..." },
    "AuthTokenPlain": { "...": "..." }
  },
  "properties": {
    "login_data": {
      "discriminator": {
        "propertyName": "mechanism",
        "mapping": {
          "API_KEY_PLAIN": "#/$defs/AuthApiKeyPlain",
          "PASSWORD_PLAIN": "#/$defs/AuthPasswordPlain",
          "...": "..."
        }
      },
      "oneOf": [
        { "$ref": "#/$defs/AuthApiKeyPlain" },
        { "$ref": "#/$defs/AuthPasswordPlain" }
      ]
    }
  }
}
```

`--dump-api` then runs this through `replace_refs()`
(`middlewared/api/base/jsonschema.py`, called from `APIDumper._dump_method_schemas`
in `middlewared/api/base/server/doc.py`), which recursively splices every
definition body into its use site. After that:

- The `$defs` table and the names `AuthApiKeyPlain` etc. are gone; every use site
  carries an anonymous inlined copy (`NFS4ACE` is repeated 10×, the cloud-sync
  credential models 16×, query `options` 74× — ~30% of the dump is duplicated
  bytes).
- `discriminator.mapping` still points at `#/$defs/...` — references that no
  longer resolve (visible in the JSON above: after inlining, the mapping is
  dangling).

We currently reverse this on our side by structurally hashing every titled
subschema to reconstruct names — it works, but name reconstruction is heuristic:
when two models collide on a title we generate suffixes (`Basic2`,
`Credentials2`), and those suffixes can shift between API versions, polluting our
cross-version divergence tracking with false positives. The real model identities
exist in middleware and are destroyed one function call before output.

**Ask:** a dump variant that skips `replace_refs` — either a flag
(`--dump-api --keep-refs`) or an additional `schemas_with_defs` field per method.
The docs pipeline keeps its current shape; we consume the ref-preserving one.

Pydantic reference: [JSON Schema — Generating JSON Schema / top-level `$defs`,
`ref_template`](https://pydantic.dev/docs/validation/latest/concepts/json_schema/).
Pydantic's default output is exactly what we want; no custom generation needed.

## B. Enum member names (`x-enum-varnames`)

Pydantic emits enum *values* only. From the v26 dump:

```json
{ "enum": ["owner@", "group@", "everyone@", "USER", "GROUP"], "title": "Tag", "type": "string" }
```

We generate TS enum-like objects from these, deriving member names from values —
which collides (`group@` and `GROUP` both want to be `Group`) and produces ugly
names for values like `1M`. The Python `Enum` member names that would resolve
this exist in middleware but aren't emitted.

**Ask:** include member names using the established `x-enum-varnames` convention
(or `x-enumNames`) for `Enum`-class fields:

```json
{ "enum": ["owner@", "group@"], "x-enum-varnames": ["OWNER", "GROUP"], "...": "..." }
```

Implementation options in pydantic: `json_schema_extra` on the field/type, or a
`GenerateJsonSchema` subclass hook — see
[Customizing the JSON Schema Generation Process](https://pydantic.dev/docs/validation/latest/concepts/json_schema/#customizing-the-json-schema-generation-process).
(`Literal[...]` unions have no member names; `Enum` classes are the target.)

## C. Structured `job` flag

`APIDumpMethod` encodes job-ness only by appending `"This method is a job."` to
the doc *text* (`doc.py` — there's already a `FIXME` on this). We string-match
the docstring to route methods into our job directory.

**Ask:** add `job: bool` (and ideally the job's `pipes`/`check_pipes` are already
there) to `APIDumpMethod`.

## D. Publish the dump as a build artifact

We currently run the dump via the nightly `ghcr.io/truenas/middleware:26` image
with a middleware checkout mounted. Works, but every downstream consumer
shouldn't need docker + a checkout.

**Ask:** run `middlewared --dump-api` in CI and publish the JSON into the build's
`assets/` directory (per release/nightly). Single-version files
(`api-v26.0.0.json`) would keep them small, but one combined file is fine too.

## E. Consistent `required` between query results and entries

`user.query`'s result-item schema has an **empty** `required` list (0 of 31
properties) while `user.get_instance` returns the same model with a populated
one. Downstream, that forks one model into two TS types (`UserEntry` vs
`UserQueryResultItem`, everything optional) — multiplied across every service.
~100 of our generated type near-duplicates trace to this.

**Ask:** is the empty `required` on query results intentional? If it's an
artifact of how the query result model is constructed, aligning it with the
entry model halves our type count.

## F. Bare `dict` fields (opportunistic)

Fields typed as plain `dict` emit `{"type": "object"}` with no shape — e.g.
`UserEntry.group`, which webui previously hand-typed as
`{ id; bsdgrp_gid; bsdgrp_group }`. They become `Record<string, unknown>` in TS.
Not asking for a sweep — just flagging that anywhere a model replaces a `dict`,
generated types improve for free.

## G. Treat the dump format as a consumed interface

Once the above lands, webui/api-client-ts/TrueNAS Connect build their types from
this output. **Ask:** consider `APIDump`'s shape a supported interface (a
heads-up on changes is enough — our CI will catch breakage immediately).
