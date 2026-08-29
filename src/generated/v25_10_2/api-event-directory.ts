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

import type { ApiEventDirectory as PreviousApiEventDirectory } from '../v25_10_1/api-event-directory';

import type {
  CertificateRemovedEvent,
} from '../v25_10_0/api-types';
import type {
  CertificateAddedEvent,
  CertificateChangedEvent,
} from './api-types';

/** Entries added or changed in this version (directly, or through a referenced type). */
export interface ApiEventDirectoryDelta {
  'certificate.query': {
    added: CertificateAddedEvent;
    changed: CertificateChangedEvent;
    removed: CertificateRemovedEvent;
  };
}

/** This version's surface: the previous version's, updated by the delta. */
export type ApiEventDirectory = Omit<PreviousApiEventDirectory, keyof ApiEventDirectoryDelta> & ApiEventDirectoryDelta;
