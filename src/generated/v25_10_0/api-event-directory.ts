/**
 * FROZEN — generated once, then hand-maintained. Do not regenerate.
 *
 * v25.10 is released and its API cannot change, so this directory is a record
 * rather than an output. It also carries the `virt.*` namespace, which no dump
 * can reproduce: middleware deleted those models from every version directory
 * in b9c330ee94, so regenerating would silently delete them here too.
 *
 * `yarn generate:api` is pinned to v26.0.0 and upward for that reason. Edits
 * belong in the hand-maintained block at the foot of api-types.ts.
 */

import type {
  ACLTemplateAddedEvent,
  ACLTemplateChangedEvent,
  ACLTemplateRemovedEvent,
  AlertListAddedEvent,
  AlertListChangedEvent,
  AlertListRemovedEvent,
  AlertServiceAddedEvent,
  AlertServiceChangedEvent,
  AlertServiceRemovedEvent,
  ApiKeyAddedEvent,
  ApiKeyChangedEvent,
  ApiKeyRemovedEvent,
  AppAddedEvent,
  AppChangedEvent,
  AppContainerLogsFollowTailEventSourceArgs,
  AppContainerLogsFollowTailEventSourceEvent2,
  AppRemovedEvent,
  AppStatsEventSourceArgs,
  AppStatsEventSourceEvent,
  AuthSessionsAddedEvent,
  AuthSessionsRemovedEvent,
  BootEnvironmentAddedEvent,
  BootEnvironmentChangedEvent,
  BootEnvironmentRemovedEvent,
  CertificateAddedEvent,
  CertificateChangedEvent,
  CertificateRemovedEvent,
  CloudBackupAddedEvent,
  CloudBackupChangedEvent,
  CloudBackupRemovedEvent,
  CloudSyncAddedEvent,
  CloudSyncChangedEvent,
  CloudSyncRemovedEvent,
  ContainersMetricsEventSourceArgs,
  ContainersMetricsEventSourceEvent,
  CoreGetJobsAddedEvent,
  CoreGetJobsChangedEvent,
  CredentialsAddedEvent,
  CredentialsChangedEvent,
  CredentialsRemovedEvent,
  CronJobAddedEvent,
  CronJobChangedEvent,
  CronJobRemovedEvent,
  DirectoryServicesStatusChangedEvent,
  DiskQueryAddedEvent,
  DiskQueryChangedEvent,
  DiskQueryRemovedEvent,
  DNSAuthenticatorAddedEvent,
  DNSAuthenticatorChangedEvent,
  DNSAuthenticatorRemovedEvent,
  DockerEventsAddedEvent,
  DockerNetworkAddedEvent,
  DockerNetworkChangedEvent,
  DockerNetworkRemovedEvent,
  DockerStateChangedEvent,
  FailoverDisabledReasonsChangedEvent,
  FailoverRebootInfoChangedEvent,
  FailoverStatusChangedEvent,
  FCHostAddedEvent,
  FCHostChangedEvent,
  FCHostRemovedEvent,
  FCPortAddedEvent,
  FCPortChangedEvent,
  FCPortRemovedEvent,
  FileFollowTailEventSourceArgs,
  FilesystemFileFollowTailEventSourceEvent2,
  GroupAddedEvent,
  GroupChangedEvent,
  GroupRemovedEvent,
  InitShutdownScriptAddedEvent,
  InitShutdownScriptChangedEvent,
  InitShutdownScriptRemovedEvent,
  InterfaceAddedEvent,
  InterfaceChangedEvent,
  InterfaceRemovedEvent,
  ISCSIPortalAddedEvent,
  ISCSIPortalChangedEvent,
  ISCSIPortalRemovedEvent,
  ISCSITargetAddedEvent,
  ISCSITargetAuthCredentialAddedEvent,
  ISCSITargetAuthCredentialChangedEvent,
  ISCSITargetAuthCredentialRemovedEvent,
  ISCSITargetAuthorizedInitiatorAddedEvent,
  ISCSITargetAuthorizedInitiatorChangedEvent,
  ISCSITargetAuthorizedInitiatorRemovedEvent,
  ISCSITargetChangedEvent,
  ISCSITargetExtentAddedEvent,
  ISCSITargetExtentChangedEvent,
  ISCSITargetExtentRemovedEvent,
  ISCSITargetRemovedEvent,
  ISCSITargetToExtentAddedEvent,
  ISCSITargetToExtentChangedEvent,
  ISCSITargetToExtentRemovedEvent,
  JBOFAddedEvent,
  JBOFChangedEvent,
  JBOFRemovedEvent,
  KerberosKeytabAddedEvent,
  KerberosKeytabChangedEvent,
  KerberosKeytabRemovedEvent,
  KerberosRealmAddedEvent,
  KerberosRealmChangedEvent,
  KerberosRealmRemovedEvent,
  KeychainCredentialAddedEvent,
  KeychainCredentialChangedEvent,
  KeychainCredentialRemovedEvent,
  NTPServerAddedEvent,
  NTPServerChangedEvent,
  NTPServerRemovedEvent,
  NVMetHostAddedEvent,
  NVMetHostChangedEvent,
  NVMetHostRemovedEvent,
  NVMetHostSubsysAddedEvent,
  NVMetHostSubsysChangedEvent,
  NVMetHostSubsysRemovedEvent,
  NVMetNamespaceAddedEvent,
  NVMetNamespaceChangedEvent,
  NVMetNamespaceRemovedEvent,
  NVMetPortAddedEvent,
  NVMetPortChangedEvent,
  NVMetPortRemovedEvent,
  NVMetPortSubsysAddedEvent,
  NVMetPortSubsysChangedEvent,
  NVMetPortSubsysRemovedEvent,
  NVMetSubsysAddedEvent,
  NVMetSubsysChangedEvent,
  NVMetSubsysRemovedEvent,
  PeriodicSnapshotTaskAddedEvent,
  PeriodicSnapshotTaskChangedEvent,
  PeriodicSnapshotTaskRemovedEvent,
  PoolAddedEvent,
  PoolChangedEvent,
  PoolDatasetAddedEvent,
  PoolDatasetChangedEvent,
  PoolDatasetRemovedEvent,
  PoolRemovedEvent,
  PoolScanChangedEvent,
  PoolScrubAddedEvent,
  PoolScrubChangedEvent,
  PoolScrubRemovedEvent,
  PoolSnapshotAddedEvent,
  PoolSnapshotChangedEvent,
  PoolSnapshotRemovedEvent,
  PrivilegeAddedEvent,
  PrivilegeChangedEvent,
  PrivilegeRemovedEvent,
  ReplicationAddedEvent,
  ReplicationChangedEvent,
  ReplicationRemovedEvent,
  ReportingExportsAddedEvent,
  ReportingExportsChangedEvent,
  ReportingExportsRemovedEvent,
  ReportingRealtimeEventSourceArgs,
  ReportingRealtimeEventSourceEvent2,
  RsyncTaskAddedEvent,
  RsyncTaskChangedEvent,
  RsyncTaskRemovedEvent,
  ServiceAddedEvent,
  ServiceChangedEvent,
  ServiceRemovedEvent,
  SharingNFSAddedEvent,
  SharingNFSChangedEvent,
  SharingNFSRemovedEvent,
  SharingSMBAddedEvent,
  SharingSMBChangedEvent,
  SharingSMBRemovedEvent,
  StaticRouteAddedEvent,
  StaticRouteChangedEvent,
  StaticRouteRemovedEvent,
  SystemReadyAddedEvent,
  SystemRebootAddedEvent,
  SystemRebootInfoChangedEvent,
  SystemShutdownAddedEvent,
  TruecommandConfigChangedEvent,
  TrueNASConnectConfigChangedEvent,
  TunableAddedEvent,
  TunableChangedEvent,
  TunableRemovedEvent,
  UpdateStatusChangedEvent,
  UserAddedEvent,
  UserChangedEvent,
  UserRemovedEvent,
  UserWebUiLoginDisabledAddedEvent,
  VirtInstanceAddedEvent,
  VirtInstanceChangedEvent,
  VirtInstanceRemovedEvent,
  VMAddedEvent,
  VMChangedEvent,
  VMDeviceAddedEvent,
  VMDeviceChangedEvent,
  VMDeviceRemovedEvent,
  VMRemovedEvent,
  VMWareAddedEvent,
  VMWareChangedEvent,
  VMWareRemovedEvent,
} from './api-types';

export interface ApiEventDirectory {
  'acme.dns.authenticator.query': {
    added: DNSAuthenticatorAddedEvent;
    changed: DNSAuthenticatorChangedEvent;
    removed: DNSAuthenticatorRemovedEvent;
  };

  'alert.list': {
    added: AlertListAddedEvent;
    changed: AlertListChangedEvent;
    removed: AlertListRemovedEvent;
  };

  'alertservice.query': {
    added: AlertServiceAddedEvent;
    changed: AlertServiceChangedEvent;
    removed: AlertServiceRemovedEvent;
  };

  'api_key.query': {
    added: ApiKeyAddedEvent;
    changed: ApiKeyChangedEvent;
    removed: ApiKeyRemovedEvent;
  };

  'app.container_log_follow': {
    subscriptionParams: AppContainerLogsFollowTailEventSourceArgs;
    added: AppContainerLogsFollowTailEventSourceEvent2;
  };

  'app.query': {
    added: AppAddedEvent;
    changed: AppChangedEvent;
    removed: AppRemovedEvent;
  };

  'app.stats': {
    subscriptionParams: AppStatsEventSourceArgs;
    added: AppStatsEventSourceEvent;
  };

  'auth.sessions': {
    added: AuthSessionsAddedEvent;
    removed: AuthSessionsRemovedEvent;
  };

  'boot.environment.query': {
    added: BootEnvironmentAddedEvent;
    changed: BootEnvironmentChangedEvent;
    removed: BootEnvironmentRemovedEvent;
  };

  'certificate.query': {
    added: CertificateAddedEvent;
    changed: CertificateChangedEvent;
    removed: CertificateRemovedEvent;
  };

  'cloud_backup.query': {
    added: CloudBackupAddedEvent;
    changed: CloudBackupChangedEvent;
    removed: CloudBackupRemovedEvent;
  };

  'cloudsync.credentials.query': {
    added: CredentialsAddedEvent;
    changed: CredentialsChangedEvent;
    removed: CredentialsRemovedEvent;
  };

  'cloudsync.query': {
    added: CloudSyncAddedEvent;
    changed: CloudSyncChangedEvent;
    removed: CloudSyncRemovedEvent;
  };

  'container.metrics': {
    subscriptionParams: ContainersMetricsEventSourceArgs;
    added: ContainersMetricsEventSourceEvent;
  };

  'core.get_jobs': {
    added: CoreGetJobsAddedEvent;
    changed: CoreGetJobsChangedEvent;
  };

  'cronjob.query': {
    added: CronJobAddedEvent;
    changed: CronJobChangedEvent;
    removed: CronJobRemovedEvent;
  };

  'directoryservices.status': {
    changed: DirectoryServicesStatusChangedEvent;
  };

  'disk.query': {
    added: DiskQueryAddedEvent;
    changed: DiskQueryChangedEvent;
    removed: DiskQueryRemovedEvent;
  };

  'docker.events': {
    added: DockerEventsAddedEvent;
  };

  'docker.network.query': {
    added: DockerNetworkAddedEvent;
    changed: DockerNetworkChangedEvent;
    removed: DockerNetworkRemovedEvent;
  };

  'docker.state': {
    changed: DockerStateChangedEvent;
  };

  'failover.disabled.reasons': {
    changed: FailoverDisabledReasonsChangedEvent;
  };

  'failover.reboot.info': {
    changed: FailoverRebootInfoChangedEvent;
  };

  'failover.status': {
    changed: FailoverStatusChangedEvent;
  };

  'fc.fc_host.query': {
    added: FCHostAddedEvent;
    changed: FCHostChangedEvent;
    removed: FCHostRemovedEvent;
  };

  'fcport.query': {
    added: FCPortAddedEvent;
    changed: FCPortChangedEvent;
    removed: FCPortRemovedEvent;
  };

  'filesystem.acltemplate.query': {
    added: ACLTemplateAddedEvent;
    changed: ACLTemplateChangedEvent;
    removed: ACLTemplateRemovedEvent;
  };

  'filesystem.file_tail_follow': {
    subscriptionParams: FileFollowTailEventSourceArgs;
    added: FilesystemFileFollowTailEventSourceEvent2;
  };

  'group.query': {
    added: GroupAddedEvent;
    changed: GroupChangedEvent;
    removed: GroupRemovedEvent;
  };

  'initshutdownscript.query': {
    added: InitShutdownScriptAddedEvent;
    changed: InitShutdownScriptChangedEvent;
    removed: InitShutdownScriptRemovedEvent;
  };

  'interface.query': {
    added: InterfaceAddedEvent;
    changed: InterfaceChangedEvent;
    removed: InterfaceRemovedEvent;
  };

  'iscsi.auth.query': {
    added: ISCSITargetAuthCredentialAddedEvent;
    changed: ISCSITargetAuthCredentialChangedEvent;
    removed: ISCSITargetAuthCredentialRemovedEvent;
  };

  'iscsi.extent.query': {
    added: ISCSITargetExtentAddedEvent;
    changed: ISCSITargetExtentChangedEvent;
    removed: ISCSITargetExtentRemovedEvent;
  };

  'iscsi.initiator.query': {
    added: ISCSITargetAuthorizedInitiatorAddedEvent;
    changed: ISCSITargetAuthorizedInitiatorChangedEvent;
    removed: ISCSITargetAuthorizedInitiatorRemovedEvent;
  };

  'iscsi.portal.query': {
    added: ISCSIPortalAddedEvent;
    changed: ISCSIPortalChangedEvent;
    removed: ISCSIPortalRemovedEvent;
  };

  'iscsi.target.query': {
    added: ISCSITargetAddedEvent;
    changed: ISCSITargetChangedEvent;
    removed: ISCSITargetRemovedEvent;
  };

  'iscsi.targetextent.query': {
    added: ISCSITargetToExtentAddedEvent;
    changed: ISCSITargetToExtentChangedEvent;
    removed: ISCSITargetToExtentRemovedEvent;
  };

  'jbof.query': {
    added: JBOFAddedEvent;
    changed: JBOFChangedEvent;
    removed: JBOFRemovedEvent;
  };

  'kerberos.keytab.query': {
    added: KerberosKeytabAddedEvent;
    changed: KerberosKeytabChangedEvent;
    removed: KerberosKeytabRemovedEvent;
  };

  'kerberos.realm.query': {
    added: KerberosRealmAddedEvent;
    changed: KerberosRealmChangedEvent;
    removed: KerberosRealmRemovedEvent;
  };

  'keychaincredential.query': {
    added: KeychainCredentialAddedEvent;
    changed: KeychainCredentialChangedEvent;
    removed: KeychainCredentialRemovedEvent;
  };

  'nvmet.host.query': {
    added: NVMetHostAddedEvent;
    changed: NVMetHostChangedEvent;
    removed: NVMetHostRemovedEvent;
  };

  'nvmet.host_subsys.query': {
    added: NVMetHostSubsysAddedEvent;
    changed: NVMetHostSubsysChangedEvent;
    removed: NVMetHostSubsysRemovedEvent;
  };

  'nvmet.namespace.query': {
    added: NVMetNamespaceAddedEvent;
    changed: NVMetNamespaceChangedEvent;
    removed: NVMetNamespaceRemovedEvent;
  };

  'nvmet.port.query': {
    added: NVMetPortAddedEvent;
    changed: NVMetPortChangedEvent;
    removed: NVMetPortRemovedEvent;
  };

  'nvmet.port_subsys.query': {
    added: NVMetPortSubsysAddedEvent;
    changed: NVMetPortSubsysChangedEvent;
    removed: NVMetPortSubsysRemovedEvent;
  };

  'nvmet.subsys.query': {
    added: NVMetSubsysAddedEvent;
    changed: NVMetSubsysChangedEvent;
    removed: NVMetSubsysRemovedEvent;
  };

  'pool.dataset.query': {
    added: PoolDatasetAddedEvent;
    changed: PoolDatasetChangedEvent;
    removed: PoolDatasetRemovedEvent;
  };

  'pool.query': {
    added: PoolAddedEvent;
    changed: PoolChangedEvent;
    removed: PoolRemovedEvent;
  };

  'pool.scan': {
    changed: PoolScanChangedEvent;
  };

  'pool.scrub.query': {
    added: PoolScrubAddedEvent;
    changed: PoolScrubChangedEvent;
    removed: PoolScrubRemovedEvent;
  };

  'pool.snapshot.query': {
    added: PoolSnapshotAddedEvent;
    changed: PoolSnapshotChangedEvent;
    removed: PoolSnapshotRemovedEvent;
  };

  'pool.snapshottask.query': {
    added: PeriodicSnapshotTaskAddedEvent;
    changed: PeriodicSnapshotTaskChangedEvent;
    removed: PeriodicSnapshotTaskRemovedEvent;
  };

  'privilege.query': {
    added: PrivilegeAddedEvent;
    changed: PrivilegeChangedEvent;
    removed: PrivilegeRemovedEvent;
  };

  'replication.query': {
    added: ReplicationAddedEvent;
    changed: ReplicationChangedEvent;
    removed: ReplicationRemovedEvent;
  };

  'reporting.exporters.query': {
    added: ReportingExportsAddedEvent;
    changed: ReportingExportsChangedEvent;
    removed: ReportingExportsRemovedEvent;
  };

  'reporting.realtime': {
    subscriptionParams: ReportingRealtimeEventSourceArgs;
    added: ReportingRealtimeEventSourceEvent2;
  };

  'rsynctask.query': {
    added: RsyncTaskAddedEvent;
    changed: RsyncTaskChangedEvent;
    removed: RsyncTaskRemovedEvent;
  };

  'service.query': {
    added: ServiceAddedEvent;
    changed: ServiceChangedEvent;
    removed: ServiceRemovedEvent;
  };

  'sharing.nfs.query': {
    added: SharingNFSAddedEvent;
    changed: SharingNFSChangedEvent;
    removed: SharingNFSRemovedEvent;
  };

  'sharing.smb.query': {
    added: SharingSMBAddedEvent;
    changed: SharingSMBChangedEvent;
    removed: SharingSMBRemovedEvent;
  };

  'staticroute.query': {
    added: StaticRouteAddedEvent;
    changed: StaticRouteChangedEvent;
    removed: StaticRouteRemovedEvent;
  };

  'system.ntpserver.query': {
    added: NTPServerAddedEvent;
    changed: NTPServerChangedEvent;
    removed: NTPServerRemovedEvent;
  };

  'system.ready': {
    added: SystemReadyAddedEvent;
  };

  'system.reboot': {
    added: SystemRebootAddedEvent;
  };

  'system.reboot.info': {
    changed: SystemRebootInfoChangedEvent;
  };

  'system.shutdown': {
    added: SystemShutdownAddedEvent;
  };

  'tn_connect.config': {
    changed: TrueNASConnectConfigChangedEvent;
  };

  'truecommand.config': {
    changed: TruecommandConfigChangedEvent;
  };

  'tunable.query': {
    added: TunableAddedEvent;
    changed: TunableChangedEvent;
    removed: TunableRemovedEvent;
  };

  'update.status': {
    changed: UpdateStatusChangedEvent;
  };

  'user.query': {
    added: UserAddedEvent;
    changed: UserChangedEvent;
    removed: UserRemovedEvent;
  };

  'user.web_ui_login_disabled': {
    added: UserWebUiLoginDisabledAddedEvent;
  };

  'virt.instance.query': {
    added: VirtInstanceAddedEvent;
    changed: VirtInstanceChangedEvent;
    removed: VirtInstanceRemovedEvent;
  };

  'vm.device.query': {
    added: VMDeviceAddedEvent;
    changed: VMDeviceChangedEvent;
    removed: VMDeviceRemovedEvent;
  };

  'vm.query': {
    added: VMAddedEvent;
    changed: VMChangedEvent;
    removed: VMRemovedEvent;
  };

  'vmware.query': {
    added: VMWareAddedEvent;
    changed: VMWareChangedEvent;
    removed: VMWareRemovedEvent;
  };
}
