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

The version is discovered at runtime; the types are fixed at compile time.
`createTrueNasClient` defaults to the oldest supported version, which
understates a newer server rather than promising methods it lacks. Name a
version to reach the rest:

```typescript
const client = await createTrueNasClient<ApiDirectoryV26_0_0>(opts);
client.api.query('container.query');                   // v26-only, reachable
```

That is a claim about the server, not a guarantee — the client you get is
whichever version discovery found. Operations that must work across versions
belong on `client.ops`, which resolves them at runtime.

Upgrading from a version before the generated types landed? See
[MIGRATING.md](MIGRATING.md).

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
