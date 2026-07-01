export interface ReplicationTask {
  name: string;
  direction: string;
  enabled: boolean;
  state: {
    state: string;
  };
  transport: string;
  ssh_credentials: string;
  source_datasets: string[];
  target_dataset: string;
  recursive: boolean;
  auto: boolean;
}

/** Replication transport type */
export enum ReplicationTransport {
  Ssh = 'SSH',
  Local = 'LOCAL',
  Legacy = 'LEGACY',
}

/** Replication retention policy */
export enum ReplicationRetentionPolicy {
  Source = 'SOURCE',
  Custom = 'CUSTOM',
  None = 'NONE',
}

/** Replication lifetime unit */
export enum ReplicationLifetimeUnit {
  Hour = 'HOUR',
  Day = 'DAY',
  Week = 'WEEK',
  Month = 'MONTH',
  Year = 'YEAR',
}

/** Configuration for creating a replication task */
export interface ReplicationCreateConfig {
  /** Name of the replication task */
  name: string;
  /** Direction of replication (PUSH or PULL) */
  direction: string;
  /** Transport method */
  transport: ReplicationTransport;
  /** SSH credentials ID for SSH transport */
  ssh_credentials: number;
  /** IDs of periodic snapshot tasks to bind (PUSH direction only) */
  periodic_snapshot_tasks?: number[];
  /** Source datasets to replicate */
  source_datasets: string[];
  /** Target dataset path */
  target_dataset: string;
  /** Whether to replicate child datasets recursively */
  recursive: boolean;
  /** Whether to automatically create snapshots */
  auto: boolean;
  /** Snapshot retention policy */
  retention_policy: ReplicationRetentionPolicy;
  /** Retention lifetime value */
  lifetime_value: number;
  /** Retention lifetime unit */
  lifetime_unit: ReplicationLifetimeUnit;
  /** Cron schedule for the replication task */
  schedule: {
    /** Minute (0-59 or *) */
    minute: string;
    /** Hour (0-23 or *) */
    hour: string;
    /** Day of month (1-31 or *) */
    dom: string;
    /** Month (1-12 or *) */
    month: string;
    /** Day of week (0-6 or *) */
    dow: string;
  };
  /** Whether to allow replication from scratch */
  allow_from_scratch: boolean;
  /** Naming schema for snapshots */
  naming_schema: string[];
  /** Additional naming schemas to include */
  also_include_naming_schema: string[];
  /** Whether the task is enabled */
  enabled: boolean;
}
