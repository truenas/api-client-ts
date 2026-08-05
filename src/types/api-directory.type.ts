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
