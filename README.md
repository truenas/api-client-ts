# @truenas/api-client

Framework-agnostic TypeScript client for the TrueNAS JSON-RPC 2.0 WebSocket API.

> **Status:** early extraction in progress. The client is being pulled out of the TrueNAS Connect UI
> into this standalone package.

## Requirements

- **Node ≥ 22** (provides a global `WebSocket`) or a browser. On older Node, supply a `WebSocket`
  implementation (e.g. the [`ws`](https://www.npmjs.com/package/ws) package) via the socket config.
- **`rxjs` ^7.8** is a peer dependency — the consuming project provides it.

## Usage

```typescript
import { createTrueNasClient } from '@truenas/api-client';

const client = await createTrueNasClient({
  uuid: 'system-uuid',
  hostnames: ['truenas.local'],
  enabled: true,
});
```

`createTrueNasClient` does not take credentials, so log in before calling
anything — middleware refuses an unauthenticated call, and `authenticated$`
only turns true once one of these resolves:

```typescript
await firstValueFrom(
  client.authenticator.loginWithApiKey({ username, key })
);
// or client.authenticator.loginWithUserPass(username, password)
```

Everything below hangs off `client.api`, and every method name it accepts comes
from types generated from `middlewared --dump-api`. A name the declared version
does not have is a compile error, and params and responses come from the same
source — there is no list of endpoint constants to import.

```typescript
client.api.call('system.info');                        // SystemInfoResult
client.api.call('alert.dismiss', ['uuid-1']);          // params required
client.api.call('nope.nope');                          // ✗ compile error
```

**Queries.** Middleware's `.query` methods are polymorphic in their options —
the same endpoint returns a list, one entry, or a count. Which you get is
chosen by the verb, so there is nothing to narrow:

```typescript
client.api.query('user.query', [['uid', '>', 1000]]);  // UserEntry[]
client.api.queryOne('user.query', [['id', '=', 1]]);   // UserEntry
client.api.queryCount('user.query');                   // number

client.api.query('user.query', [], { select: ['id', 'username'] });
                                     // Pick<UserEntry, 'id' | 'username'>[]
```

Use `satisfies` rather than an annotation when building options into a
variable — an annotated `QueryListOptions<E>` widens `select`, and the result
degrades to `Partial<E>[]`.

**Jobs.** A separate key space from `call`: `app.start` runs as a job and does
not appear in the call directory. `job` starts one and follows it to
completion, typing the result from the job directory:

```typescript
client.api.job('pool.dataset.export_key', ['tank/enc'])
  .subscribe(job => report(job.progress.percent));     // Job<string | null>
```

**Events.** Emits the change as a union discriminated on `msg`. Narrowing is
load-bearing: a removal carries an `id` and no `fields` in almost every
collection.

```typescript
client.api.events('app.query').subscribe(event => {
  if (event.msg === 'removed') return drop(event.id);
  render(event.fields);
});
```

### Naming a version

By default the version is discovered at runtime while the types are fixed at
compile time, and `createTrueNasClient` assumes the oldest supported version —
which understates a newer server rather than promising methods it lacks. There
are two ways to reach the rest, and they differ in more than syntax.

**Assert the surface** when you do not know the version but intend to write
against a particular one:

```typescript
const client = await createTrueNasClient<ApiDirectoryV26_0_0>(opts);
client.api.query('container.query');                   // v26-only, reachable
```

Discovery still runs and still decides which client is built. The type argument
is a claim about the server, not a guarantee — the client you get is whichever
version discovery found, so a wrong claim fails at runtime.

**State the version** when you already know it — a UI served by the appliance,
a harness against a pinned image:

```typescript
const client = await createTrueNasClient({
  uuid, hostnames, enabled: true, version: 'v27.0.0',
});
client.api.query('container.query');   // typed v27, derived from the string
```

This skips discovery entirely: no `GET /api/versions`, no CORS fallback. The
surface is *derived* rather than asserted, so there is no type argument to get
wrong, and a version the package ships no types for does not compile.

It is the stronger claim of the two, because the version also selects the
websocket path. Naming `v27.0.0` at a v26 appliance connects on `/api/v27.0.0`
with v27 types over a v26 server, and discovery cannot correct it — declining
discovery is the point.

The derivation needs the version to be literal at the call site. Passing a type
argument as well, forwarding an optional `version` through a wrapper, or
annotating the options object as `CreateClientOptions` all compile, all connect
to the version you named, and all type as the default surface instead. That
errs safely — understated types fail at the method call, not at runtime — but
silently, so keep the literal where the call is.

Compatibility is still checked, and two kinds of refusal reach a caller. A string that
is not a supported version — reachable only from JavaScript — throws a plain
`Error` naming the ones that are. A supported version this build has no client
for throws `VersionTooNewError`, the same type discovery raises; that happens
when types have been generated for a release before its client was written.
There is no `VersionTooOldError` here, because the oldest version you can name
is the oldest one supported.

Operations that must work across versions belong on `client.ops`. On the
discovery route that resolves against whatever the appliance turned out to be.
On the named route it cannot: the client class is picked from the version you
stated, so `ops` is that version's mappings whether or not the server agrees.

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
yarn typecheck           # tsc --noEmit
yarn test                # vitest
yarn lint                # eslint
```

## Layout

Sources live under `src/`, grouped by role:

```
src/
  connection/   api/   auth/   client/        # the WebSocket client, split by responsibility
  types/   enums/   utils/   config/   errors/
  logger.ts   factory.ts   version-discovery.ts   index.ts
```

Internal modules import each other through the `@/*` path alias (`@/* → src/*`). The alias is a
build-time convenience only — it is inlined away during bundling and never reaches consumers; the public
API is solely what `src/index.ts` (the barrel) re-exports.
