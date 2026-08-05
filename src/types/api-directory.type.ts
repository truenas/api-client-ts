import type { ApiCallDirectoryBase } from '@/generated/shared/api-call-directory-base';
import type { ApiEventDirectoryBase } from '@/generated/shared/api-event-directory-base';
import type { ApiJobDirectoryBase } from '@/generated/shared/api-job-directory-base';

/**
 * The API surface a client is typed against.
 *
 * Every generated version emits one of these — `ApiDirectoryV26_0_0` and
 * friends — bundling the three directories that describe it: `call` for
 * request/response methods, `job` for the ones that return a job, `event` for
 * what can be subscribed to. A client takes the *bundle* as its type parameter
 * rather than one directory, because the three are facets of a single version
 * and pairing a v26 call directory with a v25.10 event directory describes no
 * server that exists.
 */
export interface ApiDirectoryShape {
  call: object;
  job: object;
  event: object;
}

/**
 * The surface assumed when a caller has not named a version: the entries whose
 * signature is identical in every generated version.
 *
 * Conservative in the direction that matters — it under-promises against every
 * server rather than over-promising against some — but it is genuinely small
 * (it cannot reach `user.query` or `pool.query`), so callers who know their
 * server should name its version. {@link ApiDirectoryByVersion} maps a version
 * string to its surface.
 *
 * Distinct from `DefaultApiDirectory`, which is what the *factory* assumes: a
 * concrete version (the oldest supported), not this intersection. The factory
 * has a hostname to connect to and can be specific; a bare `TrueNasApi` cannot.
 */
export interface BaseApiDirectory {
  call: ApiCallDirectoryBase;
  job: ApiJobDirectoryBase;
  event: ApiEventDirectoryBase;
}

/**
 * The argument list a directory entry's `params` implies.
 *
 * Params are required when the method takes any, and omissible when it does
 * not — which is not the same as "the tuple is empty". Much of the directory
 * declares tuples like `[filters?: …, options?: …]`, where passing nothing is
 * legal; `[] extends P` covers both, where a check for an empty tuple would
 * force those callers to write an explicit `[]`.
 *
 * A single optional `params?` would be simpler, and is what this replaced. It
 * let `call('pool.dataset.delete')` through with no arguments at all — that
 * method needs a dataset id — because the directory's word on what is required
 * was never consulted.
 */
export type ArgsOf<P> = [] extends P ? [params?: P] : [params: P];

/** Every request/response method a surface carries. */
export type CallMethod<D extends ApiDirectoryShape> = keyof D['call'] & string;

/** The parameter tuple a call method takes. */
export type CallParams<
  D extends ApiDirectoryShape,
  M extends CallMethod<D>,
> = D['call'][M] extends { params: infer P } ? P : never;

/** What a call method resolves to. */
export type CallResponse<
  D extends ApiDirectoryShape,
  M extends CallMethod<D>,
> = D['call'][M] extends { response: infer R } ? R : never;

/**
 * Every method a surface runs as a job.
 *
 * A separate key space from {@link CallMethod}, not a subset of it: the two
 * directories are disjoint, and which one a method lives in is a property of
 * the method rather than of how you call it. `app.start` is a job; `app.query`
 * is a call; neither appears in the other's directory.
 */
export type JobMethod<D extends ApiDirectoryShape> = keyof D['job'] & string;

/** The parameter tuple a job method takes. */
export type JobParams<
  D extends ApiDirectoryShape,
  M extends JobMethod<D>,
> = D['job'][M] extends { params: infer P } ? P : never;

/**
 * What a job method's *result* is, once the job finishes — not what the
 * request returns, which is a job id.
 */
export type JobResult<
  D extends ApiDirectoryShape,
  M extends JobMethod<D>,
> = D['job'][M] extends { response: infer R } ? R : never;

/**
 * The events a surface can be subscribed to by name alone.
 *
 * Deliberately not every key of the event directory. A few entries are *event
 * sources* rather than collections — five in the shared base
 * (`app.container_log_follow`, `app.stats`, `container.metrics`,
 * `filesystem.file_tail_follow`, `reporting.realtime`), plus
 * `virt.instance.metrics` on v25.10 — and the directory marks them by giving
 * them a `subscriptionParams` model. They take arguments at subscribe time,
 * and how those arguments travel is not something the dump records:
 * `core.subscribe` is declared as `params: [event: string]`, one string, with
 * no documented encoding for the rest.
 *
 * So they are excluded rather than typed on a guess. Subscribing to one today
 * sends its name with the arguments dropped, which is not a subscription the
 * server can honour; a compile error naming the gap is more use than a stream
 * that stays silent. Widen this once the encoding is confirmed against a live
 * appliance — `yarn live-check` is the tool for that.
 */
export type EventName<D extends ApiDirectoryShape> = {
  [E in keyof D['event']]: 'subscriptionParams' extends keyof D['event'][E]
    ? never
    : E;
}[keyof D['event']] &
  string;

/** The kinds of change a collection event reports. */
export type EventKind = 'added' | 'changed' | 'removed';

/**
 * One arm of an event union: the payload the directory declares for this kind,
 * tagged with the kind itself.
 *
 * `never` when the event does not report that kind, which is not a rare case —
 * plenty of collections declare only `added`, and an arm for a kind that never
 * arrives would invite callers to handle it.
 */
type EventArm<
  D extends ApiDirectoryShape,
  E extends EventName<D>,
  K extends EventKind,
> = K extends keyof D['event'][E] ? { msg: K } & D['event'][E][K] : never;

/**
 * What subscribing to `E` emits: a union discriminated on `msg`.
 *
 * The arms differ in more than their payload — a removal carries an `id` and
 * no `fields` in 55 of the 56 collections that declare one — so narrowing on
 * `msg` is what makes the payload safe to reach.
 */
export type EventUnion<D extends ApiDirectoryShape, E extends EventName<D>> =
  | EventArm<D, E, 'added'>
  | EventArm<D, E, 'changed'>
  | EventArm<D, E, 'removed'>;
