import { Job } from '@/types/job.type';
import { MinimalKeychainCredentialEntry } from '@/types/keychain-credential.type';
import { PeriodicSnapshotTask } from '@/types/periodic-snapshot-task.type';
import { TrueNasDate } from '@/types/truenas-date.type';

export enum ReplicationDirection {
  Push = 'PUSH',
  Pull = 'PULL',
}

export enum ReplicationTransport {
  Ssh = 'SSH',
  SshNetcat = 'SSH+NETCAT',
  Local = 'LOCAL',
}

export type ReplicationReadonly = 'SET' | 'REQUIRE' | 'IGNORE';
export type ReplicationRetentionPolicy = 'SOURCE' | 'CUSTOM' | 'NONE';
export type ReplicationCompression = 'LZ4' | 'PIGZ' | 'PLZIP';
export type ReplicationEncryptionKeyFormat = 'HEX' | 'PASSPHRASE';
export type ReplicationLifetimeUnit =
  | 'HOUR'
  | 'DAY'
  | 'WEEK'
  | 'MONTH'
  | 'YEAR';
export type ReplicationLogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';
export type ReplicationNetcatActiveSide = 'LOCAL' | 'REMOTE';

export interface ReplicationSchedule {
  minute: string;
  hour: string;
  dom: string;
  month: string;
  dow: string;
}

export interface ReplicationLifetime {
  schedule: {
    minute: string;
    hour: string;
    dom: string;
    month: string;
    dow: string;
  };
  lifetime_value: number;
  lifetime_unit: ReplicationLifetimeUnit;
}

/**
 * Complete ReplicationQuery interface matching backend API response.
 * Represents all fields that the backend CAN return from replication.query endpoint.
 *
 * Note: Frontend typically uses a subset via `select` parameter - see SystemReplicationQuery.
 */
export interface ReplicationQuery {
  // Core identification
  id: number;
  name: string;
  direction: ReplicationDirection;
  transport: ReplicationTransport;
  enabled: boolean;

  // SSH/Network configuration
  ssh_credentials: MinimalKeychainCredentialEntry | null;
  netcat_active_side: ReplicationNetcatActiveSide | null;
  netcat_active_side_listen_address: string | null;
  netcat_active_side_port_min: number | null;
  netcat_active_side_port_max: number | null;
  netcat_passive_side_connect_address: string | null;
  sudo: boolean;

  // Dataset configuration
  source_datasets: string[];
  target_dataset: string;
  recursive: boolean;
  exclude: string[];

  // Property handling
  properties: boolean;
  properties_exclude: string[];
  properties_override: Record<string, string>;
  replicate: boolean;

  // Encryption
  encryption: boolean;
  encryption_inherit: boolean | null;
  encryption_key: string | null;
  encryption_key_format: ReplicationEncryptionKeyFormat | null;
  encryption_key_location: string | null;
  has_encrypted_dataset_keys: boolean;

  // Snapshot selection
  periodic_snapshot_tasks: PeriodicSnapshotTask[];
  naming_schema: string[];
  also_include_naming_schema: string[];
  name_regex: string | null;

  // Scheduling
  auto: boolean;
  schedule: ReplicationSchedule | null;
  restrict_schedule: ReplicationSchedule | null;
  only_matching_schedule: boolean;

  // Behavior options
  allow_from_scratch: boolean;
  readonly: ReplicationReadonly;
  hold_pending_snapshots: boolean;

  // Retention policy
  retention_policy: ReplicationRetentionPolicy;
  lifetime_value: number | null;
  lifetime_unit: ReplicationLifetimeUnit | null;
  lifetimes: ReplicationLifetime[];

  // Performance
  compression: ReplicationCompression | null;
  speed_limit: number | null;
  large_block: boolean;
  embed: boolean;
  compressed: boolean;

  // Error handling
  retries: number;
  logging_level: ReplicationLogLevel | null;

  // Runtime state
  state: { state: string; datetime: TrueNasDate };
  job: Job | null;

  // Legacy/optional fields (may not be in all responses)
  description?: string;
}
