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

import type { ApiEventDirectory as PreviousApiEventDirectory } from '../v25_10_3/api-event-directory';

/** Identical to the previous version's surface. */
export type ApiEventDirectory = PreviousApiEventDirectory;
