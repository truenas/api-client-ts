/**
 * FROZEN — generated once, then hand-maintained. Do not regenerate.
 *
 * v25.10 is released and its API cannot change, so this directory is a record
 * rather than an output. It also carries the `virt.*` namespace, which no dump
 * can reproduce: middleware deleted those models from every version directory
 * in b9c330ee94, so regenerating would silently delete them here too.
 *
 * `yarn generate:api` still generates the whole chain — later versions are
 * deltas against this one — but leaves files carrying this marker untouched.
 */

import type {
  QueryFilters,
  QueryOptions,
} from '../shared/query-types';

import type {
  Action,
  AppCreateArgs,
  AppDelete,
  AppEntry,
  AppImagePullArgs,
  AppPullImages,
  AppRollbackOptions,
  AppUpdate,
  AuditDownloadReportArgs,
  AuditExport,
  BootAttachOptions,
  CertificateCreateArgs,
  CertificateEntry,
  CertificateUpdate,
  CloudBackupRestoreOptions,
  CloudBackupSyncOptions,
  CloudSyncCreate,
  CloudSyncSyncOptions,
  ConfigReset,
  ConfigSave,
  CoreBulkResultItem,
  DISABLED_ACLResult,
  DirectoryServicesEntry,
  DirectoryServicesLeaveArgs,
  DirectoryServicesUpdateArgs,
  DiskWipeModeInput,
  DockerEntry,
  DockerUpdateArgs,
  FailoverRebootOtherNodeOptions,
  FailoverUpgrade,
  FilesystemChownArgs,
  FilesystemPutOptions,
  FilesystemSetZfsAttributesArgs,
  FilesystemSetaclArgs,
  FilesystemSetpermArgs,
  IPMISELInfo,
  IpmiSelElistEntry,
  IpmiSelElistQueryResultItem,
  KMIPEntry,
  KMIPUpdateArgs,
  MailSendMessage,
  MailUpdate,
  NFS4ACLResult,
  POSIXACLResult,
  PoolAttach,
  PoolCreate,
  PoolDatasetChangeKeyOptions,
  PoolDatasetEncryptionSummary,
  PoolDatasetEncryptionSummaryOptions,
  PoolDatasetLockOptions,
  PoolDatasetUnlock,
  PoolDatasetUnlockOptions,
  PoolDdtPruneArgs,
  PoolEntry,
  PoolExport,
  PoolImportFind,
  PoolImportPoolArgs,
  PoolLabel,
  PoolReplace,
  PoolUpdate,
  ReplicationRunOnetimeArgs,
  ServiceControlVerb,
  ServiceOptions,
  SupportAttachTicketArgs,
  SupportNewTicketCommunity,
  SupportNewTicketEnterprise,
  SupportNewTicketResult,
  SystemDatasetEntry,
  SystemDatasetUpdate,
  SystemRebootOptions,
  SystemSecurityEntry,
  SystemSecurityUpdateArgs,
  SystemShutdownOptions,
  TunableCreate,
  TunableEntry,
  TunableUpdate,
  UpdateFileOptions,
  UpdateManualOptions,
  UpdateRunAttrs,
  UpgradeOptions,
  VMDeviceConvertArgs,
  VMStopOptions,
  ZFSFileAttrsData,
} from './api-types';

export interface ApiJobDirectory {
  'app.convert_to_custom': {
    params: [app_name: string];
    response: AppEntry;
  };

  'app.create': {
    params: [app_create: AppCreateArgs];
    response: AppEntry;
  };

  'app.delete': {
    params: [app_name: string, options?: AppDelete];
    response: true;
  };

  'app.image.pull': {
    params: [image_pull: AppImagePullArgs];
    response: null;
  };

  'app.pull_images': {
    params: [app_name: string, options?: AppPullImages];
    response: null;
  };

  'app.redeploy': {
    params: [app_name: string];
    response: AppEntry;
  };

  'app.rollback': {
    params: [app_name: string, options: AppRollbackOptions];
    response: AppEntry;
  };

  'app.start': {
    params: [app_name: string];
    response: null;
  };

  'app.stop': {
    params: [app_name: string];
    response: null;
  };

  'app.update': {
    params: [app_name: string, update?: AppUpdate];
    response: AppEntry;
  };

  'app.upgrade': {
    params: [app_name: string, options?: UpgradeOptions];
    response: AppEntry;
  };

  'audit.download_report': {
    params: [data: AuditDownloadReportArgs];
    response: null;
  };

  'audit.export': {
    params: [data?: AuditExport];
    response: string;
  };

  'boot.attach': {
    params: [dev: string, options?: BootAttachOptions];
    response: null;
  };

  'boot.replace': {
    params: [label: string, dev: string];
    response: null;
  };

  'boot.scrub': {
    params: [];
    response: null;
  };

  'catalog.sync': {
    params: [];
    response: null;
  };

  'certificate.create': {
    params: [certificate_create: CertificateCreateArgs];
    response: CertificateEntry;
  };

  'certificate.delete': {
    params: [id: number, force?: boolean];
    response: boolean;
  };

  'certificate.update': {
    params: [id: number, certificate_update?: CertificateUpdate];
    response: CertificateEntry;
  };

  'cloud_backup.delete_snapshot': {
    params: [id: number, snapshot_id: string];
    response: null;
  };

  'cloud_backup.restore': {
    params: [id: number, snapshot_id: string, subfolder: string, destination_path: string, options?: CloudBackupRestoreOptions];
    response: null;
  };

  'cloud_backup.sync': {
    params: [id: number, options?: CloudBackupSyncOptions];
    response: null;
  };

  'cloudsync.sync': {
    params: [id: number, cloud_sync_sync_options?: CloudSyncSyncOptions];
    response: null;
  };

  'cloudsync.sync_onetime': {
    params: [cloud_sync_sync_onetime: CloudSyncCreate, cloud_sync_sync_onetime_options?: CloudSyncSyncOptions];
    response: null;
  };

  'config.reset': {
    params: [options?: ConfigReset];
    response: null;
  };

  'config.save': {
    params: [options?: ConfigSave];
    response: null;
  };

  'config.upload': {
    params: [];
    response: null;
  };

  'core.bulk': {
    params: [method: string, params: unknown[][], description?: string | null];
    response: CoreBulkResultItem[];
  };

  'core.job_wait': {
    params: [id: number];
    response: unknown;
  };

  'cronjob.run': {
    params: [id: number, skip_disabled?: boolean];
    response: null;
  };

  'directoryservices.cache_refresh': {
    params: [];
    response: null;
  };

  'directoryservices.leave': {
    params: [credential: DirectoryServicesLeaveArgs];
    response: null;
  };

  'directoryservices.update': {
    params: [directoryservices_update?: DirectoryServicesUpdateArgs];
    response: DirectoryServicesEntry;
  };

  'disk.wipe': {
    params: [dev: string, mode: DiskWipeModeInput, synccache?: boolean];
    response: null;
  };

  'docker.backup': {
    params: [backup_name?: string | null];
    response: string;
  };

  'docker.backup_to_pool': {
    params: [target_pool: string];
    response: null;
  };

  'docker.restore_backup': {
    params: [backup_name: string];
    response: null;
  };

  'docker.update': {
    params: [docker_update?: DockerUpdateArgs];
    response: DockerEntry;
  };

  'failover.reboot.other_node': {
    params: [options?: FailoverRebootOtherNodeOptions];
    response: null;
  };

  'failover.upgrade': {
    params: [failover_upgrade?: FailoverUpgrade];
    response: boolean;
  };

  'filesystem.chown': {
    params: [filesystem_chown: FilesystemChownArgs];
    response: null;
  };

  'filesystem.get': {
    params: [path: string];
    response: null;
  };

  'filesystem.put': {
    params: [path: string, options?: FilesystemPutOptions];
    response: true;
  };

  'filesystem.set_zfs_attributes': {
    params: [set_zfs_file_attributes: FilesystemSetZfsAttributesArgs];
    response: ZFSFileAttrsData;
  };

  'filesystem.setacl': {
    params: [filesystem_acl: FilesystemSetaclArgs];
    response: NFS4ACLResult | POSIXACLResult | DISABLED_ACLResult;
  };

  'filesystem.setperm': {
    params: [filesystem_setperm: FilesystemSetpermArgs];
    response: null;
  };

  'idmap.clear_idmap_cache': {
    params: [];
    response: null;
  };

  'ipmi.sel.clear': {
    params: [];
    response: null;
  };

  'ipmi.sel.elist': {
    params: [filters?: QueryFilters<IpmiSelElistEntry>, options?: QueryOptions<IpmiSelElistEntry>];
    response: IpmiSelElistEntry[] | IpmiSelElistEntry | IpmiSelElistQueryResultItem[] | IpmiSelElistQueryResultItem | number;
    entity: IpmiSelElistEntry;
  };

  'ipmi.sel.info': {
    params: [];
    response: IPMISELInfo | Record<string, unknown>;
  };

  'kmip.update': {
    params: [kmip_update?: KMIPUpdateArgs];
    response: KMIPEntry;
  };

  'mail.send': {
    params: [message: MailSendMessage, config?: MailUpdate];
    response: boolean;
  };

  'pool.attach': {
    params: [oid: number, options: PoolAttach];
    response: null;
  };

  'pool.create': {
    params: [data: PoolCreate];
    response: PoolEntry;
  };

  'pool.dataset.change_key': {
    params: [id: string, options?: PoolDatasetChangeKeyOptions];
    response: null;
  };

  'pool.dataset.encryption_summary': {
    params: [id: string, options?: PoolDatasetEncryptionSummaryOptions];
    response: PoolDatasetEncryptionSummary[];
  };

  'pool.dataset.export_key': {
    params: [id: string, download?: boolean];
    response: string | null;
  };

  'pool.dataset.export_keys': {
    params: [id: string];
    response: null;
  };

  'pool.dataset.export_keys_for_replication': {
    params: [id: number];
    response: null;
  };

  'pool.dataset.lock': {
    params: [id: string, options?: PoolDatasetLockOptions];
    response: true;
  };

  'pool.dataset.unlock': {
    params: [id: string, options?: PoolDatasetUnlockOptions];
    response: PoolDatasetUnlock;
  };

  'pool.ddt_prefetch': {
    params: [pool_name: string];
    response: null;
  };

  'pool.ddt_prune': {
    params: [options: PoolDdtPruneArgs];
    response: null;
  };

  'pool.expand': {
    params: [id: number];
    response: null;
  };

  'pool.export': {
    params: [id: number, options?: PoolExport];
    response: null;
  };

  'pool.import_find': {
    params: [];
    response: PoolImportFind[];
  };

  'pool.import_pool': {
    params: [pool_import: PoolImportPoolArgs];
    response: true;
  };

  'pool.remove': {
    params: [id: number, options: PoolLabel];
    response: null;
  };

  'pool.replace': {
    params: [id: number, options: PoolReplace];
    response: true;
  };

  'pool.scrub': {
    params: [id: number, action: Action];
    response: null;
  };

  'pool.scrub.scrub': {
    params: [name: string, action?: Action];
    response: null;
  };

  'pool.snapshottask.run': {
    params: [id: number];
    response: null;
  };

  'pool.update': {
    params: [id: number, data: PoolUpdate];
    response: PoolEntry;
  };

  'replication.run': {
    params: [id: number];
    response: null;
  };

  'replication.run_onetime': {
    params: [replication_run_onetime: ReplicationRunOnetimeArgs];
    response: null;
  };

  'rsynctask.run': {
    params: [id: number];
    response: null;
  };

  'service.control': {
    params: [verb: ServiceControlVerb, service: string, options?: ServiceOptions];
    response: boolean;
  };

  'support.attach_ticket': {
    params: [data: SupportAttachTicketArgs];
    response: null;
  };

  'support.new_ticket': {
    params: [data: SupportNewTicketEnterprise | SupportNewTicketCommunity];
    response: SupportNewTicketResult;
  };

  'system.debug': {
    params: [];
    response: null;
  };

  'system.reboot': {
    params: [reason: string, options?: SystemRebootOptions];
    response: null;
  };

  'system.security.update': {
    params: [system_security_update?: SystemSecurityUpdateArgs];
    response: SystemSecurityEntry;
  };

  'system.shutdown': {
    params: [reason: string, options?: SystemShutdownOptions];
    response: null;
  };

  'systemdataset.update': {
    params: [data: SystemDatasetUpdate];
    response: SystemDatasetEntry;
  };

  'truenas.set_production': {
    params: [production: boolean, attach_debug?: boolean];
    response: Record<string, unknown> | null;
  };

  'tunable.create': {
    params: [data: TunableCreate];
    response: TunableEntry;
  };

  'tunable.delete': {
    params: [id: number];
    response: null;
  };

  'tunable.update': {
    params: [id: number, data: TunableUpdate];
    response: TunableEntry;
  };

  'update.download': {
    params: [train?: string | null, version?: string | null];
    response: boolean;
  };

  'update.file': {
    params: [options?: UpdateFileOptions];
    response: null;
  };

  'update.manual': {
    params: [path: string, options?: UpdateManualOptions];
    response: null;
  };

  'update.run': {
    params: [attrs?: UpdateRunAttrs];
    response: true;
  };

  'vm.device.convert': {
    params: [vm_convert: VMDeviceConvertArgs];
    response: boolean;
  };

  'vm.log_file_download': {
    params: [id: number];
    response: null;
  };

  'vm.restart': {
    params: [id: number];
    response: null;
  };

  'vm.stop': {
    params: [id: number, options?: VMStopOptions];
    response: null;
  };
}
