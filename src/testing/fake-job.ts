import { JobState, type Job, type JobProgress } from '@/types/job.type';

/**
 * Fields whose value is literally `undefined` are dropped rather than applied.
 *
 * `Partial<Job>` makes every field optional, so `{ state: done ? Success :
 * undefined }` compiles — and spreading that over a default puts `undefined`
 * where a `JobState` is declared. The job then never finishes, because
 * `isJobFinished` is false for a state that is not there. Dropping them makes
 * an absent field mean "unchanged", which is what a partial update means
 * everywhere else here.
 */
function present<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

/**
 * A complete `Job`, so a scripted one is the shape a caller actually reads —
 * a partial fixture cast into place leaves `progress` undefined and breaks
 * `job.progress.percent`.
 *
 * Defaults are what middleware sends for a job not yet started, including
 * `result: null`. `satisfies` (not a cast) makes a regeneration that adds a
 * required field fail here.
 */
export function fakeJob<R = unknown>(
  overrides: Partial<Omit<Job<R>, 'progress'>> & { progress?: Partial<JobProgress> } = {}
): Job<R> {
  // `JobProgress.description` is `string`, not `string | null`: the generated
  // shape allows null and `job.type.ts` narrows it, because the server sends a
  // string for a job that has started.
  const progress: JobProgress = {
    percent: 0,
    description: '',
    extra: null,
    ...present(overrides.progress ?? {}),
  };

  return {
    id: 1,
    method: 'test.job',
    arguments: [],
    transient: false,
    description: null,
    abortable: false,
    logs_path: null,
    logs_excerpt: null,
    result: null,
    result_encoding_error: null,
    error: null,
    exception: null,
    exc_info: null,
    state: JobState.Running,
    time_started: null,
    time_finished: null,
    credentials: null,
    ...present(overrides),
    progress,
  } satisfies Job<R>;
}
