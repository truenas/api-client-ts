# @truenas/api-client

The TypeScript client for the TrueNAS API. Every method, parameter and response
middleware exposes is checked at compile time, and every request travels over
one self-healing WebSocket.

```typescript
const users = await firstValueFrom(
  client.api.query('user.query', [['builtin', '=', false]], { select: ['id', 'username'] })
);
// users: Pick<UserEntry, 'id' | 'username'>[]
```

## Why this client

- **Typed from the source.** Types are generated from `middlewared --dump-api`
  for every supported release. A misspelled method, a missing parameter or a
  filter on a field that doesn't exist fails the build, not the user.
- **Version-aware.** The client asks the appliance which API it speaks and
  builds the matching implementation. API versions v25.10.0 through v27.0.0
  are supported side by side.
- **One call across releases.** `client.ops` keeps working when middleware
  renames or reshapes an endpoint between versions.
- **Queries that know their shape.** List, single entry or count is chosen by
  the method you call, and `select` narrows the result to the fields you asked
  for.
- **Jobs and events as streams.** Jobs report progress until they finish.
  Collection subscriptions deliver typed changes and come back after a
  reconnect.
- **Built to stay connected.** It races every hostname you give it, retries,
  keeps the socket alive, holds requests made while it reconnects, and logs
  password and API-key sessions back in.
- **Framework-agnostic.** Plain RxJS, no framework. ESM and CommonJS, Node 22+
  or any modern browser, and your own logger.

## Install

```bash
npm install @truenas/api-client rxjs
```

`rxjs` ^7.8 is a peer dependency.

## Quick start

```typescript
import { createTrueNasClient } from '@truenas/api-client';
import { firstValueFrom } from 'rxjs';

const client = await createTrueNasClient({
  uuid: systemUuid,
  hostnames: ['truenas.local', '192.168.1.50'],
  enabled: true,
});

await firstValueFrom(
  client.authenticator.loginWithApiKey({ username: 'admin', key: apiKey })
);

const info = await firstValueFrom(client.api.call('system.info'));
console.log(`${info.hostname} runs ${info.version}`);

client.close();
```

Every request is a cold `Observable`: nothing is sent until you subscribe, so
requests compose with the rest of RxJS. `firstValueFrom` turns one into a
promise.

## Logging in

| Method | Use it for |
|---|---|
| `loginWithUserPass(username, password)` | Interactive logins. Resolves with `response_type: 'OTP_REQUIRED'` when two-factor is on. |
| `loginWithOtp(code)` | The second step of a two-factor login. |
| `loginWithApiKey({ username, key })` | Services and scripts. |
| `loginWithToken(token)` | Opening another session from a previous login's `reconnect_token`. |

All four live on `client.authenticator`. Password and API-key sessions log back
in by themselves after a reconnect. `authenticated$` tracks the session,
`logout()` ends it, and a rejected login errors with an `AuthError` carrying an
`AuthErrorCode`.

## Calls

```typescript
client.api.call('system.info');                 // Observable<SystemInfoResult>
client.api.call('alert.dismiss', ['uuid-1']);   // params checked against the method
client.api.call('nope.nope');                   // ✗ compile error
```

A failed call errors with middleware's own message.

## Queries

```typescript
client.api.query('user.query', [['uid', '>', 1000]]);                // UserEntry[]
client.api.query('user.query', [], { select: ['id', 'username'] });  // Pick<UserEntry, 'id' | 'username'>[]
client.api.queryOne('user.query', [['username', '=', 'root']]);      // UserEntry
client.api.queryCount('user.query');                                 // number
client.api.query('user.query', [['uidd', '>', 1000]]);               // ✗ no such field
```

When you build options in a variable, write `satisfies QueryListOptions<…>`
rather than a type annotation, so the result keeps its precise type.

## Jobs

```typescript
client.api.job('pool.dataset.export_key', ['tank/encrypted']).subscribe(job => {
  progress.set(job.progress.percent ?? 0);

  if (job.state === JobState.Success) save(job.result);
  if (job.state === JobState.Failed) report(job.error);
});
```

The stream emits each state and completes when the job finishes. A failed job
completes too, with `state` and `error` set.

## Events

```typescript
client.api.events('app.query').subscribe(change => {
  if (change.msg === 'removed') return removeRow(change.id);
  upsertRow(change.fields);
});
```

Changes are typed per collection and discriminated on `msg`. One server
subscription is shared by every subscriber and re-registered after each
reconnect.

## Working across versions

Without a hint, the client is typed as the oldest supported version, since that
is a safe floor against any appliance. Reach newer methods one of two ways:

```typescript
// Discover the version, and write against v26:
const client = await createTrueNasClient<ApiDirectoryV26_0_0>(options);
client.api.query('container.query');

// Or skip discovery, and let the types follow the version:
const pinned = await createTrueNasClient({ ...options, version: 'v27.0.0' });
pinned.api.query('container.query');
```

A type argument is a claim about the appliance. Discovery still decides which
client you get. A named `version` skips discovery and also selects the
WebSocket endpoint, so name the version the appliance actually runs. The types
follow it when the version is a literal.

For code that must run against any supported release, use `client.ops`. It
offers the same calls on every version and maps them onto whatever that version
provides:

```typescript
client.ops.containerQuery();                    // Observable<Container[]>
client.ops.containerStop(id, { force: true });  // Observable<Job | null>
client.ops.smbStatus({ infoLevel: 'SESSIONS' });
```

Per-version details, such as permissions that differ between releases, are in
the `OperationMappings` reference.

## Connection

```typescript
client.connection.opened.subscribe(open => indicator.set(open));
client.connection.setEnabled(false);   // disconnect; true connects again
client.close();                        // disconnect for good
```

The connection reconnects on its own and never gives up, so an appliance
rebooting or failing over just comes back. `retryDelay` (default 10 s) sets the
pause between failed attempts. `maxRetry` (default 3) sets how many retries run
before `hasConnectionError$` reports an error; retrying carries on after that.
Pass `maxRetry: Infinity` so failed attempts never report one. Losing a live
socket still does, until a socket opens again:

```typescript
const client = await createTrueNasClient({
  uuid, hostnames, enabled: true, retryDelay: 5_000, maxRetry: Infinity,
});
```

The one close that stops retrying is 1008: the appliance refusing this client,
for example because its address is not in Allowed IP Addresses. `closes$`
reports every socket close with its code, so the two cases can be told apart:

```typescript
client.connection.closes$.subscribe(({ code, reason, refused }) => {
  if (refused) showAccessDeniedDialog(reason);
});
```

`setEndpoint` re-points a live client at new hostnames or a new protocol, for
example after the GUI address changes. The socket reconnects there; the API
version stays the same, so a different version needs a new client:

```typescript
client.connection.setEndpoint({ hostnames: ['10.0.0.5'], protocol: 'http:' });
```

An appliance served without TLS needs `protocol: 'http:'`, which switches
discovery to `http` and the socket to `ws`. It describes the appliance, not the
page, and defaults to `https:`.

Pass `logger: consoleLogger`, or any object implementing `Logger`, to see what
the client is doing.

## Errors

- **Calls** error with middleware's message.
- **Logins** error with `AuthError`. Check `code` against `AuthErrorCode`.
- **`createTrueNasClient`** rejects with a `VersionDiscoveryError` subclass, such
  as `VersionTooOldError`, `VersionTooNewError` or
  `VersionDiscoveryNetworkError`.

## Documentation

The full API reference is at <https://truenas.github.io/api-client-ts/>,
generated from the source with each release.

## Development

```bash
corepack enable          # once, for Yarn 4
yarn install
yarn build               # ESM + CJS + .d.ts into dist/
yarn typecheck           # sources, specs and scripts
yarn test
yarn lint
yarn generate:api        # regenerate src/generated from middleware dumps
```

Releases are automated from commit titles. See [RELEASING.md](RELEASING.md).
