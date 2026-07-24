import { TrueNasDate } from '@/types/truenas-date.type';

/**
 * A middleware job.
 *
 * DIVERGES-FROM-DUMP: this is deliberately NOT the generated
 * `CoreGetJobsItem`, and `TrueNasApi.trackJob` casts to it. The generated
 * shape is wrong about dates — it models `time_started`/`time_finished` as
 * `string | null`, but the wire format is TrueNAS's `{$date: number}`
 * envelope, which production code reads directly (the Connect UI does
 * `job.time_started.$date` when sorting, and `new Date(job.time_finished.$date)`
 * when formatting). Adopting the generated shape would break that.
 *
 * Other recorded divergences: the generated item has no `description`, types
 * `state` as `string` rather than the JobState enum, `arguments` as
 * `unknown[]`, `message_ids` as a required `unknown[]`, and models progress as
 * `{percent: number | null; extra: unknown}` with no `description`.
 *
 * The divergences are pinned by a type test in `api-surface.spec-d.ts` so
 * they cannot grow silently: if middleware's modelling changes, that test
 * fails and this comment gets re-reviewed rather than the cast quietly
 * absorbing something new. See [[dump-api-retroactive-removal]] for the other
 * known dump-fidelity gaps.
 */
export interface Job<R = unknown> {
  id: number;
  method: string;
  arguments: string[];
  description: string | null;
  abortable: boolean;
  logs_path: string | null;
  logs_excerpt: string | null;
  progress: JobProgress;
  error: string | null;
  time_started: TrueNasDate;
  time_finished: TrueNasDate | null;
  state: JobState;
  /**
   * The job's final result — `null` until the job reaches a terminal
   * success state. Typed end-to-end (from the generated job directory)
   * when the job is started via `TrueNasApi.job()`.
   */
  result?: R | null;
  /**
   * Array of JSON-RPC request IDs that triggered this job.
   * Used in v26+ to correlate API calls with their jobs.
   */
  message_ids?: string[];
}

export interface JobProgress {
  percent: number;
  description: string;
}

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
