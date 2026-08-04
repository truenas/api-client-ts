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

import type { ApiEventDirectory as PreviousApiEventDirectory } from '../v25_10_0/api-event-directory';

import type {
  SharingSMBRemovedEvent,
} from '../v25_10_0/api-types';
import type {
  SharingSMBAddedEvent,
  SharingSMBChangedEvent,
} from './api-types';

/** Entries added or changed in this version (directly, or through a referenced type). */
export interface ApiEventDirectoryDelta {
  'sharing.smb.query': {
    added: SharingSMBAddedEvent;
    changed: SharingSMBChangedEvent;
    removed: SharingSMBRemovedEvent;
  };
}

/** This version's surface: the previous version's, updated by the delta. */
export type ApiEventDirectory = Omit<PreviousApiEventDirectory, keyof ApiEventDirectoryDelta> & ApiEventDirectoryDelta;
