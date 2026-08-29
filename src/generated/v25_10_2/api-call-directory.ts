/**
 * FROZEN — generated once, then hand-maintained. Do not regenerate.
 *
 * v25.10 is released and its API cannot change, so this directory is a record
 * rather than an output. It also carries two things no dump can reproduce, so
 * regenerating deletes them silently: the `virt.*` namespace, whose models
 * middleware removed from every version directory in b9c330ee94, and
 * `pool.dataset.encryption_algorithm_choices`, removed in 22ce5eac51.
 *
 * `yarn generate:api` still generates the whole chain — later versions are
 * deltas against this one — but leaves files carrying this marker untouched.
 */

import type { ApiCallDirectory as PreviousApiCallDirectory } from '../v25_10_1/api-call-directory';

import type {
  QueryFilters,
  QueryOptions,
} from '../shared/query-types';

import type {
  IPMIChassisInfo,
} from '../v25_10_0/api-types';
import type {
  CertificateEntry,
  CertificateQueryResultItem,
  IpmiChassisIdentifyRequest,
  IpmiChassisInfoRequest,
} from './api-types';

/** Entries added or changed in this version (directly, or through a referenced type). */
export interface ApiCallDirectoryDelta {
  'certificate.get_instance': {
    params: [id: number, options?: QueryOptions<CertificateEntry>];
    response: CertificateEntry;
  };

  'certificate.query': {
    params: [filters?: QueryFilters<CertificateEntry>, options?: QueryOptions<CertificateEntry>];
    response: CertificateEntry[] | CertificateEntry | CertificateQueryResultItem[] | CertificateQueryResultItem | number;
    entity: CertificateEntry;
  };

  'ipmi.chassis.identify': {
    params: [data?: IpmiChassisIdentifyRequest];
    response: null;
  };

  'ipmi.chassis.info': {
    params: [data?: IpmiChassisInfoRequest];
    response: IPMIChassisInfo | Record<string, unknown>;
  };
}

/** This version's surface: the previous version's, updated by the delta. */
export type ApiCallDirectory = Omit<PreviousApiCallDirectory, keyof ApiCallDirectoryDelta> & ApiCallDirectoryDelta;
