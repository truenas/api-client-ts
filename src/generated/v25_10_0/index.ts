/**
 * FROZEN — generated once, then hand-maintained. Do not regenerate.
 *
 * v25.10 is released and its API cannot change, so this directory is a record
 * rather than an output. It also carries two things no dump can reproduce, so
 * regenerating deletes them silently: the `virt.*` namespace, whose models
 * middleware removed from every version directory in b9c330ee94, and
 * `pool.dataset.encryption_algorithm_choices`, removed in 22ce5eac51.
 *
 * And one thing the dump gets wrong: the `pool.dataset.query` event payload.
 * Every slice's events carry the running tree's models rather than that
 * version's, so a dump taken from master describes this one with v26's shape.
 * It is held at the call side's shape here — see `src/generated-hand-maintained.spec.ts`.
 *
 * `yarn generate:api` still generates the whole chain — later versions are
 * deltas against this one — but leaves files carrying this marker untouched.
 */


import type { ApiCallDirectory } from './api-call-directory';
import type { ApiEventDirectory } from './api-event-directory';
import type { ApiJobDirectory } from './api-job-directory';

export type {
  QueryFilter,
  QueryFilterField,
  QueryFilters,
  QueryOperator,
  QueryOptions,
  QueryProjection,
} from '../shared/query-types';

export * from './api-types';
export type { ApiCallDirectory } from './api-call-directory';
export type { ApiJobDirectory } from './api-job-directory';
export type { ApiEventDirectory } from './api-event-directory';

/** The complete typed surface of this API version. */
export interface ApiDirectory {
  call: ApiCallDirectory;
  job: ApiJobDirectory;
  event: ApiEventDirectory;
}
