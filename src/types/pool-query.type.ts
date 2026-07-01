import { DiskQuery } from '@/types/disk-query.type';

export interface PoolQuery {
  id: number;
  guid: string;
  name: string;
  healthy: boolean;
  path: string;
  status: PoolStatus;
  size: number;
  allocated: number;
  free: number;
  used: PoolProperty;
  encryption_algorithm: PoolProperty;
  compression: PoolProperty;
  compressratio: PoolProperty;
  recordsize: PoolProperty;
  topology: { [T in PoolVdevCategory]: PoolVdev[] } | null;
}

export enum PoolVdevCategory {
  Data = 'data',
  Log = 'log',
  Cache = 'cache',
  Spare = 'spare',
  Special = 'special',
  Dedup = 'dedup',
}

interface PoolProperty {
  value: string;
}

export enum PoolStatus {
  Offline = 'OFFLINE',
  Online = 'ONLINE',
  Degraded = 'DEGRADED',
  Unknown = 'UNKNOWN',
  Faulted = 'FAULTED',
  Unavailable = 'UNAVAILABLE',
  Removed = 'REMOVED',
  Split = 'SPLIT',
}

export enum PoolVdevType {
  Stripe = 'STRIPE',
  Mirror = 'MIRROR',
  RaidZ1 = 'RAIDZ1',
  RaidZ2 = 'RAIDZ2',
  RaidZ3 = 'RAIDZ3',
  Disk = 'DISK',
}

export interface PoolVdev {
  name: string;
  type: PoolVdevType;
  path: string | null;
  guid: string;
  status: PoolStatus;
  stats: {
    size: number;
    allocated: number;
    checksum_errors: number;
    read_errors: number;
    write_errors: number;
  };
  unavail_disk: DiskQuery | null;
  children: PoolVdev[];
  disk?: string;
}
