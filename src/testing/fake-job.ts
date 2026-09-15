import { JobState, type Job, type JobProgress } from '@/types/job.type';
import { present } from './present';

/**
 * Overrides for {@link fakeJob}. `progress` is partial one level down, so a
 * fixture naming a percent need not name the description beside it. Named so
 * a consumer can write a helper that takes one, as the other builders are.
 */
export interface FakeJobOverrides<R = unknown>
  extends Partial<Omit<Job<R>, 'progress'>> {
  progress?: Partial<JobProgress>;
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
  overrides: FakeJobOverrides<R> = {}
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
