# Migrating

## Unreleased — the client is typed against the generated API surface

Every method name the client accepts now comes from types generated from
`middlewared --dump-api`, per API version. Naming a method the declared version
does not have is a compile error rather than a runtime one, and params and
responses come from the same source.

Four things changed for callers. Most of them fail at build time, so the
compiler will find those sites for you. Three do **not** — the removals that
now arrive (§4) and the two `client.ops` behaviours at the end — so read those
even if your build is green.

### 1. Clients take a version's whole surface, not its call directory

```diff
- const client = await createTrueNasClient<ApiCallDirectoryV26_0_0>(opts);
+ const client = await createTrueNasClient<ApiDirectoryV26_0_0>(opts);
```

`ApiDirectoryV26_0_0` bundles the three directories that describe a version —
`call`, `job`, `event` — because the verbs read different ones and pairing a
v26 call directory with a v25.10 event directory describes no server that
exists. `TrueNasApi` and `TrueNasApiClient` take the same parameter.

Callers who never named a version are unaffected.

### 2. `TrueNasEndpoint` is gone; pass the method name

```diff
- api.call(TrueNasEndpoint.SystemInfo);
+ api.call('system.info');
```

The constants named 65 of the 641 methods the directories carry, so they were
never the surface — and once `call` keys off the directory, autocomplete comes
from there and covers all of it. A string enum could not have stayed either:
its members are nominal, so `TrueNasEndpoint.AppStart` has type
`TrueNasEndpoint.AppStart` rather than `'app.start'`, and cannot key a
directory keyed by string literals.

Two names were not obvious from their constant and are worth having to hand:
`ExtendedSystemInfo` was `'webui.main.dashboard.sys_info'`, and `AuthLogin` was
`'auth.login_ex'` — not `'auth.login'`, which is a different method.

`ApiCallDirectory`, `ApiCallMethod`, `ApiCallParams` and `ApiCallResponse` are
removed with it. Their replacements take the surface as a parameter:
`CallMethod<D>`, `CallParams<D, M>`, `CallResponse<D, M>`.

### 3. Jobs are their own key space, and `call` requires params

`call` and the job verbs no longer accept each other's method names. Which
directory a method lives in is a fact about the method: `app.start` runs as a
job, `app.query` does not, and neither appears in the other's directory.

```diff
- api.callAndGetJobId(TrueNasEndpoint.AppStart, ['my-app'])
-    .pipe(switchMap(id => api.trackJob(id)))
+ api.job('app.start', ['my-app'])
```

`job` starts the method and follows it to completion, emitting progress and
completing on a terminal state. Prefer it over composing the two by hand: the
composition loses the link between the method and its result, and the job comes
back with `result: unknown`. `callAndGetJobId` and `trackJob` remain for the
cases where you only want the id, or already have one.

`params` is now required exactly when the directory says the method takes
arguments — `call('pool.dataset.delete')` with no arguments used to compile.

`Job` becomes `Job<R>`, defaulting to `unknown`, and `job(...)` fills in `R`
from the job directory. Two fields on it changed shape:

- `result` is `R | null`. A job that has not finished has no result — measured
  on a live appliance, a `RUNNING` emission carries `null` — and a failed job
  ends with `null` too. Since `job()` emits progress as well as the final
  state, check before reaching into it.
- `arguments` is `unknown[]` rather than `string[]`, and `progress.percent` is
  `number | null`, both because `Job` now tracks the generated `core.get_jobs`
  entity instead of a hand-written shape. `job.arguments[0].toUpperCase()` and
  bare arithmetic on `percent` stop compiling; narrow or default them.

### 4. `events` emits the change, not the frame

```diff
- api.events('app.query').subscribe(message => {
-   render(message.params.fields);
- });
+ api.events('app.query').subscribe(event => {
+   if (event.msg === 'removed') return drop(event.id);
+   render(event.fields);
+ });
```

The emitted value is a union discriminated on `msg`. Narrowing is not optional:
a removal carries an `id` and no `fields` in 55 of the 56 collections that
declare one, so reaching `fields` unconditionally is wrong for almost all of
them.

**Removals now arrive at all.** The previous filter required
`fields !== undefined`, so the `removed` branch matched and then discarded
every event it matched. Code that assumed removals never came through will now
see them.

**Event sources do not compile.** `app.container_log_follow`, `app.stats`,
`container.metrics`, `filesystem.file_tail_follow`, `reporting.realtime` and —
on v25.10 — `virt.instance.metrics` take subscribe-time arguments, and how
those arguments travel is not recorded in the dump: `core.subscribe` is
declared as a single string. Subscribing to one previously sent its name with
the arguments dropped, which is not a subscription the server can honour, so
the stream stayed empty. They are excluded until the encoding is confirmed
against a live appliance.

### Version-agnostic operations are unchanged

`client.ops` — `containerQuery`, `containerStart`, `containerStop`,
`containerRestart` — has the same shape and resolves version differences at
runtime as before. Two behaviours it exposes did change, in the direction of
matching what the server actually sends:

- On v25.10, `Container.status` was the raw `virt.instance` state passed
  through a field typed as one of four `AppState` values, and the API reports
  ten. Unrecognised states now narrow to `Stopped`, which is what the v26 path
  always did.
- On v25.10, `cpu`, `memory` and `image` were typed as always present and
  could arrive as `null`. They are `undefined` when absent, which is what
  `Container` declares them to mean.
- `Container.status` gains `Deploying` on v25.10: `virt.instance`'s `STARTING`
  used to fold into `Stopped`, which read as "at rest" for a container that was
  coming up. The remaining unmapped states (`ERROR`, `FROZEN`, `ABORTING`,
  `THAWED`) still arrive as `Stopped`.
