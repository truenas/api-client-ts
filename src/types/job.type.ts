import type { ApiCallDirectoryV25_10_0 } from '@/generated';
import type { QueryEntity } from '@/types/query.type';
import { TrueNasDate } from '@/types/truenas-date.type';

/**
 * What `core.get_jobs` says a job looks like, straight from the generated
 * surface.
 *
 * Taken from the oldest supported version rather than the base directory.
 * It was the base until v26 added `exc_info.errname`, which made
 * `core.get_jobs` stop being one of the entries identical in every version —
 * the base dropped it and this stopped compiling, which is what the previous
 * note here promised it would do. The floor is the honest choice for a type
 * every version shares; `errname` is added back below as optional.
 */
type GeneratedJob = QueryEntity<ApiCallDirectoryV25_10_0, 'core.get_jobs'>;

/**
 * A middleware job: the generated shape, overridden only where the dump is
 * weaker than what the server sends.
 *
 * - `state`: a bare `string` in the dump; {@link JobState} is the real set.
 * - `time_started` / `time_finished`: ISO strings in the dump, `{$date}` on the wire.
 * - `description` / `progress.description`: sent but missing from the dump.
 * - `result`: `null` while running and after a failure, so check `error` or
 *   `state`, not just that the job finished.
 *
 * @typeParam R - the job's result, supplied by `TrueNasApi.job` from the job
 * directory; `unknown` for a job reached by id alone.
 */
export type Job<R = unknown> = Omit<
  GeneratedJob,
  | 'state'
  | 'result'
  | 'progress'
  | 'time_started'
  | 'time_finished'
  | 'message_ids'
  | 'exc_info'
> & {
  state: JobState;
  /** The job's result once it succeeds; `null` while it runs, and on failure. */
  result: R | null;
  progress: JobProgress;
  time_started: TrueNasDate | null;
  time_finished: TrueNasDate | null;
  description: string | null;
  /**
   * Array of JSON-RPC request IDs that triggered this job.
   * Used in v26+ to correlate API calls with their jobs.
   */
  message_ids?: string[];
  /**
   * The exception, with `errname` optional: v26 added it and v25.10 does not
   * send it, so it is absent rather than wrong on an older appliance.
   */
  exc_info: (GeneratedJob['exc_info'] & { errname?: string | null }) | null;
};

/**
 * The generated progress shape plus the `description` the server sends and the
 * dump does not declare.
 */
export type JobProgress = GeneratedJob['progress'] & { description: string };

export enum JobState {
  Pending = 'PENDING',
  Running = 'RUNNING',
  Hold = 'HOLD',
  Error = 'ERROR',
  Failed = 'FAILED',
  Aborted = 'ABORTED',
  Success = 'SUCCESS',
  Finished = 'FINISHED',
  Locked = 'LOCKED',
  Waiting = 'WAITING',
}

/** The states a job does not move out of. */
const terminalStates: readonly JobState[] = [
  JobState.Success,
  JobState.Failed,
  JobState.Aborted,
  JobState.Error,
  JobState.Finished,
];

/** Whether a job has reached a state it will not move out of. */
export function isJobFinished(job: Pick<Job, 'state'>): boolean {
  return terminalStates.includes(job.state);
}
