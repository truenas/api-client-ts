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

import type { ApiJobDirectory as PreviousApiJobDirectory } from '../v25_10_1/api-job-directory';

import type {
  CertificateCreateArgs,
  CertificateUpdate,
} from '../v25_10_0/api-types';
import type {
  CertificateEntry,
} from './api-types';

/** Entries added or changed in this version (directly, or through a referenced type). */
export interface ApiJobDirectoryDelta {
  'certificate.create': {
    params: [certificate_create: CertificateCreateArgs];
    response: CertificateEntry;
  };

  'certificate.update': {
    params: [id: number, certificate_update?: CertificateUpdate];
    response: CertificateEntry;
  };
}

/** This version's surface: the previous version's, updated by the delta. */
export type ApiJobDirectory = Omit<PreviousApiJobDirectory, keyof ApiJobDirectoryDelta> & ApiJobDirectoryDelta;
