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

import type { ApiJobDirectory as PreviousApiJobDirectory } from '../v25_10_4/api-job-directory';

/** Identical to the previous version's surface. */
export type ApiJobDirectory = PreviousApiJobDirectory;
