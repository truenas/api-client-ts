/**
 * Base API Call Directory
 * Common API methods shared across all supported TrueNAS API versions.
 *
 * This interface defines the method signatures for all API calls that are
 * consistent across versions v25.10.x and v26.x.y.
 *
 * Version-specific directories extend this base and override methods
 * that differ between versions.
 *
 * Pattern inspired by webui's api-call-directory.interface.ts
 */

import { TrueNasAuthMechanism } from '@/enums/truenas-auth-mechanism.enum';
import { ProductType } from '@/enums/product-type.enum';
import { VirtVariant } from '@/enums/virt-variant.enum';
import { FailoverNode, FailoverStatus } from '@/types/failover.type';
import { VirtualizationStopParams } from '@/types/virtualization-stop-params.type';
import { Alert } from '@/types/alert.type';
import { ApiKeyCreate } from '@/types/api-key-create.type';
import { AppQuery } from '@/types/app-query.type';
import { AppUpgradeParams } from '@/types/app-upgrade.type';
import { AuthResponse } from '@/types/auth.type';
import { CloudBackupQuery } from '@/types/cloud-backup-query.type';
import { CloudSyncQuery } from '@/types/cloudsync-query.type';
import {
  ContainerQueryV26,
  ContainerStopOptionsV26,
} from '@/types/container.type';
import { CoreDownload } from '@/types/core-download.type';
import { Dataset } from '@/types/dataset.type';
import { DeviceType, GpuDevice } from '@/types/device-get-info.type';
import { DiskQuery } from '@/types/disk-query.type';
import { InterfaceEntry } from '@/types/interface.type';
import { Job } from '@/types/job.type';
import {
  KeychainCredentialCreate,
  RemoteSshHostKeyScanParams,
  SSHCredentialsEntry,
  SSHKeyPair,
  SSHKeyPairEntry,
} from '@/types/keychain-credential.type';
import { NetworkConfiguration } from '@/types/network-configuration.type';
import {
  PeriodicSnapshotTask,
  PeriodicSnapshotTaskCreate,
} from '@/types/periodic-snapshot-task.type';
import { PoolQuery } from '@/types/pool-query.type';
import { ReplicationQuery } from '@/types/replication-query.type';
import { ReplicationCreateConfig } from '@/types/replication-task.type';
import {
  ServiceControlAction,
  ServiceEntry,
  ServiceOptions,
  ServiceUpdate,
} from '@/types/service.type';
import { SystemInfo } from '@/types/system-info.type';
import { UpdateStatusResponse } from '@/types/update-status.type';
import { TrueNasUser, TrueNasUserUpdate } from '@/types/user.type';
import { VirtualInstanceQuery } from '@/types/virtual-instance-query.type';
import { VMQuery } from '@/types/vm-query.type';
import {
  CountEligibleSnapshotsParams,
  CreateZfsSnapshot,
  EligibleSnapshotsCount,
  ZfsSnapshot,
} from '@/types/zfs-snapshot.type';

/**
 * API query filter format: [field, operator, value]
 * Example: ['id', '=', 123]
 */
export type ApiQueryFilter = [string, string, string | number | boolean];

/**
 * Base API Call Directory
 * All methods that are common across v25.10.x and v26.x.y.
 */
export interface ApiCallDirectoryBase {
  // Core methods
  'core.ping': { params: undefined; response: undefined };
  'core.download': {
    params: [
      method: 'config.save' | 'debug.save' | 'system.debug',
      params: { secretseed?: boolean }[] | [],
      filename: string,
      buffered: boolean,
    ];
    response: CoreDownload;
  };
  'core.get_jobs': {
    params: [[[string, string, number]]];
    response: Job[];
  };
  'core.subscribe': {
    params: string[];
    response: unknown;
  };

  // Update
  'update.status': {
    params: undefined;
    response: UpdateStatusResponse;
  };

  // Apps
  'app.query': { params: undefined; response: AppQuery[] };
  'app.start': { params: string[]; response: number };
  'app.stop': { params: string[]; response: number };
  'app.redeploy': { params: string[]; response: number };
  'app.upgrade': {
    params: [string, AppUpgradeParams];
    response: number;
  };

  // Replication
  'replication.query': {
    params: [[], { select: string[] }];
    response: ReplicationQuery[];
  };
  'replication.run': {
    params: [number]; // task ID
    response: number; // job ID
  };
  'replication.create': {
    params: [ReplicationCreateConfig];
    response: ReplicationQuery;
  };

  // Network interface
  'interface.query': {
    params: undefined;
    response: InterfaceEntry[];
  };
  'network.configuration.config': {
    params: undefined;
    response: NetworkConfiguration;
  };

  // Cloud backup
  'cloud_backup.query': {
    params: [[], { select: string[] }];
    response: CloudBackupQuery[];
  };

  // Cloud sync
  'cloudsync.query': {
    params: [[], { select: string[] }];
    response: CloudSyncQuery[];
  };

  // System
  'system.info': { params: undefined; response: SystemInfo };
  'system.product_type': {
    params: undefined;
    response: ProductType;
  };
  'webui.main.dashboard.sys_info': { params: undefined; response: SystemInfo };

  // Disk
  'disk.query': {
    params: [[], { extra: { pools: boolean; passwords: boolean } }];
    response: DiskQuery[];
  };

  // Device
  'device.get_info': {
    params: [{ type: DeviceType }];
    response: GpuDevice[];
  };

  // Auth
  'auth.generate_token': {
    params: [number, Record<string, unknown>, boolean, boolean];
    response: string;
  };
  'auth.login_ex': {
    params: {
      mechanism: TrueNasAuthMechanism;
      username: string;
      api_key: string;
    };
    response: AuthResponse;
  };
  'auth.logout': { params: undefined; response: boolean };

  // API Key
  'api_key.create': {
    params: [{ name: string; username: string }];
    response: ApiKeyCreate;
  };
  'api_key.delete': { params: [number]; response: boolean };

  // Failover
  'failover.status': {
    params: undefined;
    response: FailoverStatus;
  };
  'failover.node': {
    params: undefined;
    response: FailoverNode;
  };
  'failover.disabled.reasons': {
    params: undefined;
    response: string[];
  };

  // Pool
  'pool.query': {
    params: undefined;
    response: PoolQuery[];
  };

  // Boot
  'boot.get_state': {
    params: undefined;
    response: PoolQuery;
  };

  // Dataset
  'pool.dataset.query': {
    params: [
      ApiQueryFilter[],
      { extra: { retrieve_children: boolean; properties?: string[] } },
    ];
    response: Dataset[];
  };
  'pool.dataset.create': {
    params: [{ name: string; type: string }];
    response: Dataset;
  };
  'pool.dataset.delete': {
    params: [string, { recursive: boolean }];
    response: boolean | null;
  };

  // Periodic Snapshot Task
  'pool.snapshottask.create': {
    params: [PeriodicSnapshotTaskCreate];
    response: PeriodicSnapshotTask;
  };
  'pool.snapshottask.query': {
    params: [ApiQueryFilter[]];
    response: PeriodicSnapshotTask[];
  };
  'pool.snapshottask.delete': {
    params: [number];
    response: boolean;
  };

  // Snapshot
  'pool.snapshot.create': {
    params: [CreateZfsSnapshot];
    response: ZfsSnapshot;
  };
  'pool.snapshot.delete': {
    params: [string];
    response: boolean;
  };

  // Replication
  'replication.count_eligible_manual_snapshots': {
    params: [CountEligibleSnapshotsParams];
    response: EligibleSnapshotsCount;
  };

  // Keychain Credential
  'keychaincredential.generate_ssh_key_pair': {
    params: [];
    response: SSHKeyPair;
  };
  'keychaincredential.create': {
    params: [KeychainCredentialCreate];
    response: SSHKeyPairEntry | SSHCredentialsEntry;
  };
  'keychaincredential.remote_ssh_host_key_scan': {
    params: [RemoteSshHostKeyScanParams];
    response: string;
  };
  'keychaincredential.delete': {
    params: [number];
    response: null;
  };

  // Alerts
  'alert.list': { params: string[]; response: Alert[] };

  // User
  'user.query': {
    params: [ApiQueryFilter[]];
    response: TrueNasUser[];
  };
  'user.update': {
    params: [number, TrueNasUserUpdate];
    response: TrueNasUser;
  };

  // Service
  'service.query': {
    params: [ApiQueryFilter[]];
    response: ServiceEntry[];
  };
  'service.update': {
    params: [string | number, ServiceUpdate];
    response: number;
  };
  'service.control': {
    params: [ServiceControlAction, string, ServiceOptions?];
    response: boolean;
  };

  // Virtualization (virt) - v25.10
  'virt.instance.query': {
    params: [ApiQueryFilter[]];
    response: VirtualInstanceQuery[];
  };
  'virt.instance.start': {
    params: string[];
    response: number;
  };
  'virt.instance.stop': {
    params: [string, Omit<VirtualizationStopParams, 'force_after_timeout'>];
    response: number;
  };
  'virt.instance.restart': {
    params: [string, Omit<VirtualizationStopParams, 'force_after_timeout'>];
    response: number;
  };

  // Container - v26+
  'container.query': {
    params: [ApiQueryFilter[]];
    response: ContainerQueryV26[];
  };
  'container.start': {
    params: [number];
    response: number;
  };
  'container.stop': {
    params: [number, ContainerStopOptionsV26];
    response: number;
  };

  // VM
  'vm.query': {
    params: [ApiQueryFilter[]];
    response: VMQuery[];
  };
  'vm.start': {
    params: [number, { overcommit?: boolean }];
    response: number;
  };
  'vm.stop': {
    params: [number, { force?: boolean; force_after_timeout?: boolean }];
    response: number;
  };
  'vm.restart': {
    params: [number];
    response: number;
  };

  // Hardware
  'hardware.virtualization.variant': {
    params: undefined;
    response: VirtVariant;
  };
}

/**
 * Helper types for type-safe API calls
 */
export type ApiCallMethod<V extends ApiCallDirectoryBase> = keyof V;
// NOTE (Phase 3 deviation from verbatim): the source writes these as
// `V[M]['params']` / `V[M]['response']`, which does not type-check under
// `tsc --noEmit --strict` (TS2536 — a generic indexed access `V[M]` is not
// provably indexable). tncui never surfaces this because it builds via
// `ng build` (esbuild), not `tsc`. The `extends { … : infer T } ? T : never`
// form resolves to the identical type for every concrete V/M. Worth upstreaming.
export type ApiCallParams<
  V extends ApiCallDirectoryBase,
  M extends ApiCallMethod<V>,
> = V[M] extends { params: infer T } ? T : never;
export type ApiCallResponse<
  V extends ApiCallDirectoryBase,
  M extends ApiCallMethod<V>,
> = V[M] extends { response: infer T } ? T : never;
