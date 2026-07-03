import { TrueNasAuthMechanism } from '@/enums/truenas-auth-mechanism.enum';
import { ProductType } from '@/enums/product-type.enum';
import { TrueNasEndpoint } from '@/enums/truenas-endpoint.enum';
import { VirtVariant } from '@/enums/virt-variant.enum';
import { FailoverStatus, FailoverNode } from '@/types/failover.type';
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

export interface ApiCallDirectory {
  [TrueNasEndpoint.CoreDownload]: {
    params: [
      method: 'config.save' | 'debug.save' | 'system.debug',
      params: { secretseed?: boolean }[] | [],
      filename: string,
      buffered: boolean,
    ];
    response: CoreDownload;
  };
  [TrueNasEndpoint.CoreGetJobs]: {
    params: [[[string, string, number]]];
    response: Job[];
  };
  [TrueNasEndpoint.CorePing]: { params: undefined; response: undefined };

  [TrueNasEndpoint.UpdateStatus]: {
    params: undefined;
    response: UpdateStatusResponse;
  };
  [TrueNasEndpoint.AppQuery]: { params: undefined; response: AppQuery[] };
  [TrueNasEndpoint.AppStart]: { params: string[]; response: number };
  [TrueNasEndpoint.AppStop]: { params: string[]; response: number };
  [TrueNasEndpoint.AppRedeploy]: { params: string[]; response: number };
  [TrueNasEndpoint.AppUpgrade]: {
    params: [string, AppUpgradeParams];
    response: number;
  };
  [TrueNasEndpoint.ReplicationQuery]: {
    params: [[], { select: string[] }];
    response: ReplicationQuery[];
  };
  [TrueNasEndpoint.ReplicationRun]: {
    params: [number]; // task ID
    response: number; // job ID
  };
  [TrueNasEndpoint.ReplicationCreate]: {
    params: [ReplicationCreateConfig];
    response: ReplicationQuery;
  };
  [TrueNasEndpoint.InterfaceQuery]: {
    params: undefined;
    response: InterfaceEntry[];
  };
  [TrueNasEndpoint.NetworkConfiguration]: {
    params: undefined;
    response: NetworkConfiguration;
  };
  [TrueNasEndpoint.CloudBackupQuery]: {
    params: [[], { select: string[] }];
    response: CloudBackupQuery[];
  };
  [TrueNasEndpoint.CloudSyncQuery]: {
    params: [[], { select: string[] }];
    response: CloudSyncQuery[];
  };
  [TrueNasEndpoint.SystemInfo]: { params: undefined; response: SystemInfo };
  [TrueNasEndpoint.SystemProductType]: {
    params: undefined;
    response: ProductType;
  };
  // it's worth noting that, despite this API call returning `SystemInfo`, it's not exact.
  // there are some optional fields missing. (and some others included)
  [TrueNasEndpoint.ExtendedSystemInfo]: { params: undefined; response: SystemInfo };
  [TrueNasEndpoint.DiskQuery]: {
    params: [[], { extra: { pools: boolean; passwords: boolean } }];
    response: DiskQuery[];
  };
  [TrueNasEndpoint.DeviceGetInfo]: {
    params: [{ type: DeviceType }];
    response: GpuDevice[];
  };
  [TrueNasEndpoint.GenerateToken]: {
    params: [number, Record<string, unknown>, boolean, boolean];
    response: string;
  };
  [TrueNasEndpoint.AlertList]: { params: string[]; response: Alert[] };
  [TrueNasEndpoint.UserQuery]: {
    params: [ApiQueryFilter[]];
    response: TrueNasUser[];
  };
  [TrueNasEndpoint.UserUpdate]: {
    params: [number, TrueNasUserUpdate];
    response: TrueNasUser;
  };
  [TrueNasEndpoint.ServiceQuery]: {
    params: [ApiQueryFilter[]];
    response: ServiceEntry[];
  };
  [TrueNasEndpoint.ServiceUpdate]: {
    params: [string | number, ServiceUpdate];
    response: number;
  };
  [TrueNasEndpoint.ServiceControl]: {
    params: [ServiceControlAction, string, ServiceOptions?];
    response: boolean;
  };
  [TrueNasEndpoint.AuthLogin]: {
    params: {
      mechanism: TrueNasAuthMechanism;
      username: string;
      api_key: string;
    };
    response: AuthResponse;
  };
  [TrueNasEndpoint.AuthLogout]: { params: undefined; response: boolean };
  [TrueNasEndpoint.ApiKeyCreate]: {
    params: [{ name: string; username: string }];
    response: ApiKeyCreate;
  };
  [TrueNasEndpoint.ApiKeyDelete]: { params: [number]; response: boolean };
  [TrueNasEndpoint.KeychainCredentialGenerateSshKeyPair]: {
    params: [];
    response: SSHKeyPair;
  };
  [TrueNasEndpoint.KeychainCredentialCreate]: {
    params: [KeychainCredentialCreate];
    response: SSHKeyPairEntry | SSHCredentialsEntry;
  };
  [TrueNasEndpoint.KeychainCredentialRemoteSshHostKeyScan]: {
    params: [RemoteSshHostKeyScanParams];
    response: string;
  };
  [TrueNasEndpoint.KeychainCredentialDelete]: {
    params: [number];
    response: null;
  };
  [TrueNasEndpoint.FailOverStatus]: {
    params: undefined;
    response: FailoverStatus;
  };
  [TrueNasEndpoint.FailOverNode]: {
    params: undefined;
    response: FailoverNode;
  };
  [TrueNasEndpoint.FailOverDisabledReasons]: {
    params: undefined;
    response: string[];
  };
  [TrueNasEndpoint.PoolQuery]: {
    params: undefined;
    response: PoolQuery[];
  };
  [TrueNasEndpoint.BootGetState]: {
    params: undefined;
    response: PoolQuery;
  };
  [TrueNasEndpoint.DatasetQuery]: {
    params: [
      ApiQueryFilter[],
      { extra: { retrieve_children: boolean; properties?: string[] } },
    ];
    response: Dataset[];
  };
  [TrueNasEndpoint.DatasetCreate]: {
    params: [{ name: string; type: string }];
    response: Dataset;
  };
  [TrueNasEndpoint.DatasetDelete]: {
    params: [string, { recursive: boolean }];
    response: boolean | null;
  };
  [TrueNasEndpoint.SnapshotTaskCreate]: {
    params: [PeriodicSnapshotTaskCreate];
    response: PeriodicSnapshotTask;
  };
  [TrueNasEndpoint.SnapshotTaskQuery]: {
    params: [ApiQueryFilter[]];
    response: PeriodicSnapshotTask[];
  };
  [TrueNasEndpoint.SnapshotTaskDelete]: {
    params: [number];
    response: boolean;
  };
  [TrueNasEndpoint.SnapshotCreate]: {
    params: [CreateZfsSnapshot];
    response: ZfsSnapshot;
  };
  [TrueNasEndpoint.SnapshotDelete]: {
    params: [string];
    response: boolean;
  };
  [TrueNasEndpoint.ReplicationCountEligibleSnapshots]: {
    params: [CountEligibleSnapshotsParams];
    response: EligibleSnapshotsCount;
  };
  [TrueNasEndpoint.VirtualInstanceQuery]: {
    params: [ApiQueryFilter[]];
    response: VirtualInstanceQuery[];
  };
  [TrueNasEndpoint.VirtualInstanceStart]: {
    params: string[];
    response: number;
  };
  [TrueNasEndpoint.VirtualInstanceStop]: {
    params: [string, Omit<VirtualizationStopParams, 'force_after_timeout'>];
    response: number;
  };
  [TrueNasEndpoint.VirtualInstanceRestart]: {
    params: [string, Omit<VirtualizationStopParams, 'force_after_timeout'>];
    response: number;
  };
  // Container endpoints (v26+)
  [TrueNasEndpoint.ContainerQuery]: {
    params: [ApiQueryFilter[]];
    response: ContainerQueryV26[];
  };
  [TrueNasEndpoint.ContainerStart]: {
    params: [number];
    response: number;
  };
  [TrueNasEndpoint.ContainerStop]: {
    params: [number, ContainerStopOptionsV26];
    response: number;
  };
  [TrueNasEndpoint.VmQuery]: {
    params: [ApiQueryFilter[]];
    response: VMQuery[];
  };
  [TrueNasEndpoint.VmStart]: {
    params: [number, { overcommit?: boolean }];
    response: number;
  };
  [TrueNasEndpoint.VmStop]: {
    params: [number, { force?: boolean; force_after_timeout?: boolean }];
    response: number;
  };
  [TrueNasEndpoint.VmRestart]: {
    params: [number];
    response: number;
  };
  [TrueNasEndpoint.CoreSubscribe]: {
    params: string[];
    response: unknown;
  };
  [TrueNasEndpoint.HardwareVirtualizationVariant]: {
    params: undefined;
    response: VirtVariant;
  };
}

export type ApiQueryFilter = [string, string, string | number | boolean];

export type ApiCallMethod = keyof ApiCallDirectory;
export type ApiCallParams<T extends ApiCallMethod> =
  ApiCallDirectory[T]['params'];
export type ApiCallResponse<T extends ApiCallMethod> =
  ApiCallDirectory[T]['response'];
