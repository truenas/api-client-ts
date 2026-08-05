import type { QueryDirectory, QueryEntity } from '@/types/query.type';
import { TrueNasDate } from '@/types/truenas-date.type';

/**
 * What `core.get_jobs` says a job looks like, straight from the generated
 * surface.
 *
 * Taken from the base directory rather than a version folder: `core.get_jobs`
 * is one of the entries identical in every generated version, so this is
 * version-stable, and it stops compiling if that ever stops being true.
 */
type GeneratedJob = QueryEntity<QueryDirectory, 'core.get_jobs'>;

/**
 * A middleware job.
 *
 * The generated shape, refined where it is demonstrably weaker than what the
 * server sends. Each override is a field where following the dump would lose
 * information the client already has, so they are listed one by one rather
 * than the shape being replaced wholesale — anything not named here comes from
 * the generated entry and moves with it.
 *
 * - `state` is a bare `string` in the dump. {@link JobState} is the set
 *   middleware uses, and tracking a job means comparing against it to know
 *   when the job is done.
 * - `time_started` / `time_finished` are modelled as ISO strings and arrive as
 *   `{$date: <epoch ms>}` — confirmed against a live appliance, and systemic
 *   rather than specific to jobs. Following the dump would make
 *   `new Date(job.time_started)` type-check and yield `Invalid Date`. Only the
 *   encoding is corrected: both stay nullable, because that is what the dump
 *   says and nothing observed contradicts it. Narrowing one and not the other
 *   was an inconsistency inherited from the hand-written shape.
 * - `description`, and `progress.description`, are returned by the server and
 *   absent from the dump.
 * - `message_ids` is `unknown[]`. They are the JSON-RPC request ids that
 *   started the job, and `TrueNasApi.callAndGetJobId` matches its own request id
 *   against them.
 * - `result` is `unknown`, which is honest for `core.get_jobs` in general:
 *   the method returns every job at once, of every kind. It stops being honest
 *   once you know which method you started, so it becomes the parameter — but
 *   it stays nullable, because a job that has not finished has no result.
 *   Measured on a live appliance: a `RUNNING` emission carries `result: null`,
 *   and only the terminal one carries the value. A failed job ends with `null`
 *   too, so reaching a terminal state is not on its own enough to assume a
 *   result — check `error`, or check `state` against `JobState.Success`.
 *
 * `progress` is the one place the generated shape is kept rather than replaced.
 * It gains `description`, which the server sends and the dump omits, and keeps
 * `percent` nullable and `extra` present: the dump says `percent` may be null
 * and nothing observed disproves that, so narrowing it would be inventing a
 * guarantee rather than correcting one.
 *
 * @typeParam R - the job's result once it reaches a terminal state. Supplied
 * by `TrueNasApi.job` from the job directory. Defaults to `unknown`,
 * which is what a job reached by id alone deserves — an id carries no evidence
 * of what the job returns.
 */
export type Job<R = unknown> = Omit<
  GeneratedJob,
  | 'state'
  | 'result'
  | 'progress'
  | 'time_started'
  | 'time_finished'
  | 'message_ids'
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
