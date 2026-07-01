import { TrueNasDate } from '@/types/truenas-date.type';

export interface Job {
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
