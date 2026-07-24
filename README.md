# @truenas/api-client

Framework-agnostic TypeScript client for the TrueNAS JSON-RPC 2.0 WebSocket API.

> **Status:** early extraction in progress. The client is being pulled out of the TrueNAS Connect UI
> into this standalone package.

The API surface — every method, its parameters, its result, and every event payload — is generated
from the TrueNAS middleware's own schema, per API version. Calling the API wrong is a compile error
rather than a runtime surprise.

## Requirements

- **Node ≥ 22** (provides a global `WebSocket`) or a browser. On older Node, supply a `WebSocket`
  implementation (e.g. the [`ws`](https://www.npmjs.com/package/ws) package) via the socket config.
- **`rxjs` ^7.8** is a peer dependency — the consuming project provides it.

## Quick start

There are two ways to get a client, and they differ in how much the compiler knows.

### You know the API version

For code shipped alongside its middleware, or a tool pinned to one system. Pass the version as a
literal and you get that version's exact API surface, with no narrowing anywhere:

```ts
import { createTrueNasClient } from '@truenas/api-client';

const client = await createTrueNasClient({
  uuid: 'system-uuid',
  hostnames: ['truenas.local'],
  enabled: true,
  version: 'v26.0.0', // literal → exact types, and discovery is skipped
});

client.api.call('pool.query').subscribe(pools => {
  // pools is fully typed, including v26-only methods and fields
});
```

### You discover the API version at runtime

For fleet tools that talk to many systems of varying vintage. Omit `version`; the client `GET`s
`/api/versions`, negotiates the newest version it supports, and connects on that version's socket:

```ts
const client = await createTrueNasClient({
  uuid: 'system-uuid',
  hostnames: ['truenas.local', 'truenas-alt.local'],
  enabled: true,
});
```

Because the version isn't known until runtime, `client.api` exposes the **version-agnostic surface**:
methods that exist, with a compatible signature, on *every* supported version. Parameters are the
intersection across that range and results are the union — so a result whose shape changed between
versions is honestly typed as either shape. In practice the vast majority of methods never changed,
and both collapse to the single real signature.

Version-specific API needs narrowing (see below).

Dispose of either client with `client.close()`.

## What the compiler catches

Each of these was a silent runtime failure before the types were generated:

| Mistake | Result |
| --- | --- |
| Typo'd method name | compile error |
| Wrong parameter shape, order, or arity | compile error |
| Reading a result field that doesn't exist | compile error |
| Passing a long-running job to `call()` | compile error — use `job()` |
| Calling v26-only API on a client that may be v25.10 | compile error until narrowed |
| Middleware changes a shape in a new release | compile error at the affected call sites when the types are regenerated |

That last row is the point of the whole exercise: widening the supported version range recomputes the
version-agnostic surface, so anything that changed shape in the newly-supported version surfaces as
an error at exactly the call sites that need review.

## Reaching version-specific API

`supports()` narrows a client to versions at or above a minimum, unlocking what those versions
guarantee:

```ts
if (client.supports('v26.0.0')) {
  client.api.call('api_key.convert_raw_key', ['raw-key']); // v26+ only
}
```

Prefer it over `instanceof`, for two reasons. Client classes cover a whole release family (one class
for all of v25.10.x), so `instanceof` can't distinguish patch-level differences — whereas
`supports()` compares the *exact* negotiated version, which is the version pinned in the WebSocket
path. And `supports()` composes: the client's type is unchanged outside the guard.

`instanceof TrueNasApiClientV26` does work for family-level branching, but keep all the work inside
the branch:

```ts
if (client instanceof TrueNasApiClientV26) {
  client.api.call('container.query', [[]]); // fine
}
client.api.call('pool.query'); // ERROR: "This expression is not callable"
```

Narrowing to a version-pinned class leaves the client as a union of differently-pinned types once the
branches merge, and the API methods are generic over the version, so TypeScript can no longer resolve
a single call signature. Version-pinned clients are deliberately not assignable to one another —
`v26` genuinely offers a different surface than `v25.10` — so this is inherent rather than a bug to
work around. Use `supports()` unless you specifically need the family.

Version differences that need different *code*, not just different types, live behind `client.ops` —
a small set of version-agnostic operations (container lifecycle, today) that each client implements
with whatever its version actually provides:

```ts
client.ops.containerQuery().subscribe(containers => { /* … */ });
```

## Jobs and events

Long-running methods are jobs. `job()` starts one and streams its lifecycle to completion, with the
final `result` typed from the generated job directory:

```ts
client.api.job('pool.create', [poolConfig]).subscribe(job => {
  console.log(job.state, job.progress.percent);
  if (job.state === 'SUCCESS') {
    job.result; // typed as the pool entry
  }
});
```

Events are typed too. The payload is a discriminated union over the notification kind, each carrying
its own `fields`:

```ts
client.api.events('alert.list').subscribe(({ params }) => {
  if (params.msg === 'added') {
    params.fields; // typed as an Alert
  }
});
```

Note that `removed` notifications carry no `fields` and are filtered out, so they are absent from the
emitted type.

## Escape hatches

When you need a method outside the typed surface — a version-specific API you'd rather not narrow
for, a dynamic method name, or something missing from the generated types (see Limits) — use the
explicitly unsafe variants. They perform no checking of the method name, parameters, or result type:

```ts
client.api.callUnsafe<MyResult>('some.method', [arg]);
client.api.callAndGetJobIdUnsafe('some.job', [arg]);
client.api.eventsUnsafe('some.collection');
```

The `Unsafe` suffix is deliberate: opting out of type safety should be visible in review and
greppable in the codebase.

## Limits

The guarantee is *"the types match the API version this client negotiated"* — not *"the types match
reality."* Three things sit outside it:

1. **The assumed-version fallback.** TrueNAS v25.10.0 doesn't send CORS headers on `/api/versions`,
   so when discovery is blocked by a network/CORS error the client falls back to an *assumed*
   version and connects anyway. Types then describe the assumption, not the server. `supports()`
   reports on the assumption too.
2. **Dump fidelity.** The generated types are only as accurate as middleware's `--dump-api` output,
   and its method roster is built from the dumping checkout rather than from each release. A method
   deleted upstream disappears from *older* versions' types even though those releases served it —
   which is why `virt.instance.*` is absent entirely and the v25.10 container operations go through
   the escape hatches. Conversely, a method retired with `removed_in=` still appears in the versions
   that dropped it. Type *shapes* are reliable; method *presence* is not, at either end of the
   version chain.
3. **Anything through an escape hatch**, by construction.

Two smaller gaps: middleware models a few fields as opaque dictionaries (notably
`auth.login_ex`'s `user_info.privilege` and `.attributes`), so the parts this client reads are
refined by hand and marked `PARTIALLY-NOT-IN-DUMP` in the source. Hand-written types that cannot come
from the dump at all are marked `NOT-IN-DUMP` — grep for either to find every shape not backed by
the schema.

## Regenerating the API types

```bash
yarn generate:api --fetch docker    # dump from the published middleware image
```

This runs `middlewared --dump-api` inside `ghcr.io/truenas/middleware:master` and regenerates
`src/generated/`. Pass `--middleware-repo <path>` to generate from an exact checkout instead (a
release tag, a branch, or local changes) — which is also how you'd recover types for a method the
master dump has lost. `src/generated/MANIFEST.md` is the greppable record of what exists in which
version, and when each thing changed.

## Documentation

The API reference is generated from the TSDoc comments in the source with
[TypeDoc](https://typedoc.org/) and published to GitHub Pages with each npm release:
<https://truenas.github.io/api-client-ts/>

```bash
yarn docs                # generate locally into docs/ (gitignored)
yarn docs:check          # validate doc comments without rendering (run in CI)
```

## Development

```bash
corepack enable          # once, to enable Yarn 4
yarn install
yarn build               # bundle to dist/ (ESM + CJS + .d.ts) via tsup
yarn typecheck           # tsc --noEmit, including the *.spec-d.ts type tests
yarn test                # vitest
yarn lint                # eslint
```

Type-level behavior is tested in `*.spec-d.ts` files, which `yarn typecheck` checks and never runs.
They assert both directions: that correct usage compiles, and — via `@ts-expect-error` — that
incorrect usage does not. A stale `@ts-expect-error` fails the build, so the negative cases can't rot.

## Layout

Sources live under `src/`, grouped by role:

```
src/
  connection/   api/   auth/   client/        # the WebSocket client, split by responsibility
  generated/                                  # generated API types, one directory per version
  types/   enums/   utils/   config/   errors/
  logger.ts   factory.ts   version-discovery.ts   index.ts
```

`src/generated/` is produced by `scripts/generate-api-interface` and should never be edited by hand.
Each version directory declares only what changed in that version and inherits the rest from the
previous one, so a type absent from a directory's text may still be part of that version's surface —
consult `MANIFEST.md` rather than the file listing.

Internal modules import each other through the `@/*` path alias (`@/* → src/*`). The alias is a
build-time convenience only — it is inlined away during bundling and never reaches consumers; the public
API is solely what `src/index.ts` (the barrel) re-exports.
