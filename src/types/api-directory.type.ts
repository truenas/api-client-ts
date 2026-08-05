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
