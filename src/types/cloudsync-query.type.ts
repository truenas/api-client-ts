import { Job } from '@/types/job.type';

export interface CloudSyncQuery {
  id: number;
  description: string;
  path: string;
  attributes: {
    folder: string;
    fast_list: boolean;
    acknowledge_abuse: boolean;
  };
  snapshot: boolean;
  include: string[];
  exclude: string[];
  transfers: number;
  enabled: boolean;
  job?: Job;
  direction: 'PUSH' | 'PULL';
  transfer_mode: 'COPY' | 'SYNC' | 'MOVE';
  encryption: boolean;
  filename_encryption: boolean;
  follow_symlinks: boolean;
  schedule: {
    minute: string;
    hour: string;
    dom: string;
    month: string;
    dow: string;
  };
  locked: boolean;
  name?: string;
}
