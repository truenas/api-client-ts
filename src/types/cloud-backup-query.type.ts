import { Job } from '@/types/job.type';
import { Schedule } from '@/types/schedule.type';

export interface CloudBackupQuery {
  id: number;
  description: string;
  enabled: boolean;
  schedule: Schedule;
  job?: Job;
  name?: string;
}
