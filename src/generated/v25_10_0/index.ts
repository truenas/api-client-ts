/**
 * FROZEN — generated once, then hand-maintained. Do not regenerate.
 *
 * v25.10 is released and its API cannot change, so this directory is a record
 * rather than an output. The series also carries the `virt.*` namespace, which
 * no dump can reproduce: middleware deleted those models from every version
 * directory in b9c330ee94, so regenerating would silently delete them here too.
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
