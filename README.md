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

### Reaching an appliance over http

By default the client discovers over `https://` and connects over `wss://`,
which is what an appliance serves. An appliance reached without TLS needs
`protocol`:

```typescript
import type { ApplianceProtocol } from '@truenas/api-client';

const protocol: ApplianceProtocol =
  location.protocol === 'http:' ? 'http:' : 'https:';

const client = await createTrueNasClient({
  uuid, hostnames: [location.host], enabled: true, protocol,
});
```

It selects both halves of the transport — `https:` gives `https` discovery and a
`wss` socket, `http:` gives `http` and `ws` — and defaults to `https:`, so
existing callers are unaffected.

`protocol` describes the **appliance**, not the page. Reading it from
`location.protocol` is right when the appliance serves the page, which is the
same-origin case this exists for. A page served from somewhere else — a dev
server on `http://localhost:5173` talking to an https appliance — must pass what
the *appliance* uses. Getting it wrong breaks both halves but reports only one:
discovery's `fetch` follows the redirect and looks fine, while the socket opens
`ws://`, meets the same redirect, and fails the handshake without naming the
scheme.

Omitting it against a plaintext appliance fails the other way, and more quietly.
Discovery tries `https://`, `fetch` rejects, and the factory cannot tell that
apart from the CORS block that v25.10.0 has on `/api/versions` — so it takes the
fallback and hands back a client pinned to `v25.10.0` on `/api/v25.10.0`, with
only a `logger.warn` to say so. Against a v26 or v27 box that is a wrong-version
client that looks configured. If the appliance is plaintext, say so.

Narrow rather than cast: `location.protocol` is a `string`, and it is genuinely
`file:` for a locally-opened page or `chrome-extension:` in an extension. Both
halves fall back to the encrypted scheme for anything off-contract, so a bad
value cannot downgrade the transport — but the compiler will not stop you
asserting one into this option, and it will not be the value you meant.

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
argument as well, forwarding `version` through a wrapper, or annotating the
options object as `CreateClientOptions` all compile, all connect to the version
you named, and all type as the default surface instead. That
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

`ops` is deliberately flat — `OperationMappings`, not parameterized by the
directory — so every operation is callable whether or not you pinned a version.
That is what lets an operation paper over a difference the type system would
otherwise force the caller to handle.

```ts
// The same call on every supported version.
const sessions = await firstValueFrom(
  client.ops.smbStatus({ infoLevel: 'SESSIONS' })
);

// A client count is this composed, not a second operation.
const count = await firstValueFrom(
  client.ops.smbStatus({
    infoLevel: 'SESSIONS',
    options: { count: true },
    statusOptions: { fast: true },
  })
);
```

`smbStatus` is worth singling out, because it is the first operation whose
v25.10 leg is invisible to `middlewared --dump-api`. `smb.status` is public on
v26+ and generated like any other method; on v25.10 it is the same method taking
the same four positional arguments and returning the same `list | dict | int`,
but middleware declares it `private=True`, so the dump omits it and no generated
v25.10 type mentions it. The v25.10 client therefore *asserts* the method exists
rather than reading it from the directory — a single narrow declaration admitting
one method name, one argument tuple and one return type, checked against
middleware source instead of against the dump.

Three consequences worth knowing before you reach for it.

**It needs a full-admin session on v25.10.** Being private there decides
authorization, not just documentation. `smb.status` declares no roles on
v25.10, and middleware role-registers a method only `if roles:` — so it is in no
role's allowlist, and only a **non-STIG full-admin** session, whose allowlist is
the wildcard `{ method: '*', resource: '*' }`, reaches it. A session holding
exactly `SHARING_SMB_READ` is refused with `EACCES` on v25.10 and succeeds on
v26+, where the method carries that role. Under STIG, full admin is expanded to
the union of its roles' allowlists rather than the wildcard, so it is refused on
v25.10 as well. The client does not pre-empt any of this: you get middleware's
own error, on the version where it applies.

**It logs server-side on every dispatch**, which matters if you poll it. v25.10
is in maintenance and that cost is accepted there, but it is not a pattern to
extend.

**The result is the union middleware sends** — which arm arrives is decided by
the options, not the info level — so callers narrow it themselves.

These types are deliberately not the generated ones. `SmbStatusOptions` is not
v26's `SMBStatusOptions`, and `SmbStatusResponse` is not that method's generated
response: the generated types describe one version's dump, while these describe
the contract both versions honour. They are named `Smb…` rather than `SMB…` so
the two cannot be confused at a call site — and `SmbStatusOptions` is the one
pair where the names sit closest, since it is the fourth positional argument on
both versions.

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
