/**
 * FROZEN — generated once, then hand-maintained. Do not regenerate.
 *
 * v25.10 is released and its API cannot change, so this directory is a record
 * rather than an output. It also carries two things no dump can reproduce, so
 * regenerating deletes them silently: the `virt.*` namespace, whose models
 * middleware removed from every version directory in b9c330ee94, and
 * `pool.dataset.encryption_algorithm_choices`, removed in 22ce5eac51.
 *
 * `yarn generate:api` still generates the whole chain — later versions are
 * deltas against this one — but leaves files carrying this marker untouched.
 */

import type {
  QueryFilters,
  QueryOptions,
} from '../shared/query-types';

import type {
  ACLTemplateByPathArgs,
  ACLTemplateEntry,
  ACLTemplateQueryResultItem,
  ACMEDNSAuthenticatorSchema,
  ACMEDNSAuthenticatorUpdate,
  AclTemplateCreate,
  AclTemplateUpdate,
  Alert,
  AlertCategory,
  AlertClassesEntry,
  AlertClassesUpdate,
  AlertServiceCreate,
  AlertServiceEntry,
  AlertServiceQueryResultItem,
  ApiKeyCreate,
  ApiKeyEntry,
  ApiKeyEntryWithKey,
  ApiKeyQueryResultItem,
  ApiKeyUpdate,
  AppAvailableItem,
  AppCertificate,
  AppContainerIDOptions,
  AppContainerResponse,
  AppEntry,
  AppGPUResponse,
  AppImageDeleteOptions,
  AppImageDockerhubRateLimitResult,
  AppImageEntry,
  AppImageQueryResultItem,
  AppQueryResultItem,
  AppRegistryCreate,
  AppRegistryEntry,
  AppRegistryQueryResultItem,
  AppRegistryUpdate,
  AppUpgradeSummaryResult,
  AppsIxVolumeEntry,
  AppsIxVolumeQueryResultItem,
  AuditEntry,
  AuditQuery,
  AuditQueryResultItem,
  AuditUpdate,
  AuthApiKeyPlain,
  AuthGenerateOnetimePasswordArgs,
  AuthMeResult,
  AuthOTPToken,
  AuthPasswordPlain,
  AuthRespAuthErr,
  AuthRespAuthRedirect,
  AuthRespExpired,
  AuthRespOTPRequired,
  AuthRespSuccess,
  AuthSessionsEntry,
  AuthSessionsQueryResultItem,
  AuthTokenPlain,
  AzureBlobCredentialsModel,
  B2CredentialsModel,
  BootEnvironmentActivateArgs,
  BootEnvironmentCloneArgs,
  BootEnvironmentDestroyArgs,
  BootEnvironmentEntry,
  BootEnvironmentKeepArgs,
  BootEnvironmentQueryResultItem,
  BootGetState,
  BoxCredentialsModel,
  CSRProfilesModel,
  CatalogAppInfo,
  CatalogAppVersionDetails,
  CatalogAppsArgs,
  CatalogEntry,
  CatalogTrainInfo,
  CatalogUpdateArgs,
  CertificateEntry,
  CertificateQueryResultItem,
  CloudBackupCreate,
  CloudBackupEntry,
  CloudBackupQueryResultItem,
  CloudBackupS3CredentialsModelInput2,
  CloudBackupSnapshot,
  CloudBackupSnapshotItem,
  CloudBackupUpdate,
  CloudCredentialCreate,
  CloudCredentialUpdate,
  CloudSyncCreate,
  CloudSyncCreateDirectionInput,
  CloudSyncEntry,
  CloudSyncListDirectoryArgs,
  CloudSyncOneDriveListDrivesArgs,
  CloudSyncOneDriveListDrivesDrive,
  CloudSyncProvider,
  CloudSyncQueryResultItem,
  CloudSyncUpdate,
  CoreArpArgs,
  CoreGetJobsItem,
  CoreGetJobsItemQueryResultItem,
  CoreOptions,
  CorePingRemoteArgs,
  CredentialsEntry,
  CredentialsQueryResultItem,
  CredentialsVerifyResult,
  CronJobCreate,
  CronJobEntry,
  CronJobQueryResultItem,
  CronJobUpdate,
  DISABLED_ACLResult,
  DNSAuthenticatorCreateArgs,
  DNSAuthenticatorEntry,
  DNSAuthenticatorQueryResultItem,
  DNSQueryItem,
  DNSQueryItemQueryResultItem,
  DeviceGetInfoDisk,
  DeviceGetInfoOther,
  DirectoryServicesEntry,
  DirectoryServicesStatusResult,
  DiskDetails,
  DiskEntry,
  DiskQueryResultItem,
  DiskTemperatureAggEntry,
  DiskUpdate,
  DisplayDevice,
  DisplayWebURIOptions,
  DockerBackupInfo,
  DockerEntry,
  DockerNetworkEntry,
  DockerNetworkQueryResultItem,
  DropboxCredentialsModel,
  EmptyDict,
  Enclosure2Entry,
  Enclosure2QueryResultItem,
  Enclosure2SetSlotStatusArgs,
  FCHostCreate,
  FCHostEntry,
  FCHostQueryResultItem,
  FCHostUpdate,
  FCPortChoiceEntry,
  FCPortCreate,
  FCPortEntry,
  FCPortQueryResultItem,
  FCPortUpdate,
  FTPCredentialsModel,
  FTPEntry,
  FTPUpdateArgs,
  FailoverEntry,
  FailoverRebootInfoResult,
  FailoverSyncToPeer,
  FailoverUpdate,
  Feature,
  FilesystemDirEntry,
  FilesystemDirQueryResultItem,
  FilesystemMkdirArgs,
  FilesystemStatData,
  FilesystemStatfsData,
  GPUInfo,
  GoogleCloudStorageCredentialsModel,
  GoogleDriveCredentialsModel,
  GooglePhotosCredentialsModel,
  GraphIdentifier,
  GroupCreate,
  GroupDeleteOptions,
  GroupEntry,
  GroupGetGroupObjArgs,
  GroupGetGroupObjResult,
  GroupQueryResultItem,
  GroupUpdate,
  HTTPCredentialsModel,
  HubicCredentialsModel,
  IPMIChassisInfo,
  IPMILanEntry,
  IPMILanQuery,
  IPMILanQueryResultItem,
  IPMILanUpdateOptionsDHCP,
  IPMILanUpdateOptionsStatic,
  ISCSIGlobalEntry,
  ISCSIGlobalUpdateArgs,
  ISCSIPortalEntry,
  ISCSIPortalQueryResultItem,
  ISCSITargetAuthCredentialEntry,
  ISCSITargetAuthCredentialQueryResultItem,
  ISCSITargetAuthorizedInitiatorEntry,
  ISCSITargetAuthorizedInitiatorQueryResultItem,
  ISCSITargetEntry,
  ISCSITargetExtentEntry,
  ISCSITargetExtentQueryResultItem,
  ISCSITargetQueryResultItem,
  ISCSITargetToExtentEntry,
  ISCSITargetToExtentQueryResultItem,
  InitShutdownScriptCreate,
  InitShutdownScriptEntry,
  InitShutdownScriptQueryResultItem,
  InitShutdownScriptUpdate,
  InterfaceChoicesOptions,
  InterfaceCommitOptions,
  InterfaceCreate,
  InterfaceEntry,
  InterfaceIPInUseItem,
  InterfaceIPInUseOptions,
  InterfaceLacpduRateChoicesResult,
  InterfaceQueryResultItem,
  InterfaceSaveNetworkConfigArgs,
  InterfaceServicesRestartedOnSyncItem,
  InterfaceUpdate,
  InterfaceXmitHashPolicyChoicesResult,
  IpmiChassisIdentifyVerb,
  IscsiAuthCreate,
  IscsiAuthUpdate,
  IscsiExtentCreate,
  IscsiExtentUpdate,
  IscsiInitiatorCreate,
  IscsiInitiatorUpdate,
  IscsiPortalCreate,
  IscsiPortalUpdate,
  IscsiSession,
  IscsiTargetCreate,
  IscsiTargetToExtentCreate,
  IscsiTargetToExtentUpdate,
  IscsiTargetUpdate,
  JBOFCreate,
  JBOFEntry,
  JBOFQueryResultItem,
  JBOFUpdate,
  KMIPEntry,
  KerberosEntry,
  KerberosKeytabCreate,
  KerberosKeytabEntry,
  KerberosKeytabQueryResultItem,
  KerberosKeytabUpdate,
  KerberosRealmCreate,
  KerberosRealmEntry,
  KerberosRealmQueryResultItem,
  KerberosRealmUpdate,
  KerberosUpdateArgs,
  KeychainCredentialCreateSSHCredentialsEntry,
  KeychainCredentialCreateSSHKeyPairEntry,
  KeychainCredentialDeleteOptions,
  KeychainCredentialEntry,
  KeychainCredentialGenerateSshKeyPairResult,
  KeychainCredentialQueryResultItem,
  KeychainCredentialRemoteSSHSemiautomaticSetup,
  KeychainCredentialRemoteSshHostKeyScanArgs,
  KeychainCredentialUpdateSSHCredentialsEntry,
  KeychainCredentialUpdateSSHKeyPairEntry,
  MailEntry,
  MailUpdate,
  MegaCredentialsModel,
  NFS4ACLResult,
  NFSEntry,
  NFSGetNfs3ClientsEntry,
  NFSGetNfs3ClientsQueryResultItem,
  NFSGetNfs4ClientsEntry,
  NFSGetNfs4ClientsQueryResultItem,
  NFSUpdateArgs,
  NTPServerCreate,
  NTPServerEntry,
  NTPServerQueryResultItem,
  NTPServerUpdate,
  NVMetGlobalEntry,
  NVMetGlobalUpdateArgs,
  NVMetHostCreate,
  NVMetHostDeleteOptions,
  NVMetHostEntry,
  NVMetHostQueryResultItem,
  NVMetHostSubsysCreate,
  NVMetHostSubsysEntry,
  NVMetHostSubsysQueryResultItem,
  NVMetHostSubsysUpdate,
  NVMetHostUpdate,
  NVMetNamespaceCreate,
  NVMetNamespaceDeleteOptions,
  NVMetNamespaceEntry,
  NVMetNamespaceQueryResultItem,
  NVMetNamespaceUpdate,
  NVMetPortCreateFC,
  NVMetPortCreateRDMATCP,
  NVMetPortDeleteOptions,
  NVMetPortEntry,
  NVMetPortQueryResultItem,
  NVMetPortSubsysCreate,
  NVMetPortSubsysEntry,
  NVMetPortSubsysQueryResultItem,
  NVMetPortSubsysUpdate,
  NVMetPortUpdateFC,
  NVMetPortUpdateRDMATCP,
  NVMetSubsysCreate,
  NVMetSubsysDeleteOptions,
  NVMetSubsysEntry,
  NVMetSubsysQueryResultItem,
  NVMetSubsysUpdate,
  NetWorkConfigurationUpdate,
  NetworkConfigurationEntry,
  NetworkGeneralSummaryResult,
  NfsShareCreate,
  NfsShareUpdate,
  OneDriveCredentialsModel,
  PCloudCredentialsModel,
  POSIXACLResult,
  PeriodicSnapshotTaskEntry,
  PeriodicSnapshotTaskQueryResultItem,
  PoolAttachment,
  PoolDatasetChecksumChoicesResult,
  PoolDatasetCreateFilesystem,
  PoolDatasetCreateVolume,
  PoolDatasetDatasetQuota,
  PoolDatasetDeleteOptions,
  PoolDatasetDeleteResult,
  PoolDatasetEncryptionAlgorithmChoicesResult,
  PoolDatasetEntry,
  PoolDatasetProjectQuota,
  PoolDatasetQueryResultItem,
  PoolDatasetRenameOptions,
  PoolDatasetSetQuota,
  PoolDatasetUpdate,
  PoolDatasetUserGroupQuota,
  PoolDetachOptions,
  PoolEntry,
  PoolLabel,
  PoolProcess,
  PoolQueryResultItem,
  PoolResilverEntry,
  PoolResilverUpdate,
  PoolScrubCreate,
  PoolScrubEntry,
  PoolScrubQueryResultItem,
  PoolScrubUpdate,
  PoolSnapshotCloneArgs,
  PoolSnapshotCreateUpdateEntry,
  PoolSnapshotCreateWithName,
  PoolSnapshotCreateWithSchema,
  PoolSnapshotDeleteOptions,
  PoolSnapshotEntry,
  PoolSnapshotHoldOptions,
  PoolSnapshotQueryResultItem,
  PoolSnapshotReleaseOptions,
  PoolSnapshotRenameOptions,
  PoolSnapshotRollbackOptions,
  PoolSnapshotTaskCreate,
  PoolSnapshotTaskDeleteOptions,
  PoolSnapshotTaskUpdate,
  PoolSnapshotTaskUpdateWillChangeRetentionFor,
  PoolSnapshotUpdate,
  PrivilegeCreate,
  PrivilegeEntry,
  PrivilegeQueryResultItem,
  PrivilegeRolesEntry,
  PrivilegeRolesQueryResultItem,
  PrivilegeUpdate,
  QueryOptionsModel,
  RdmaCardConfig,
  RebootInfo,
  ReplicationConfigEntry,
  ReplicationConfigUpdateArgs,
  ReplicationCountEligibleManualSnapshotsArgs,
  ReplicationCountEligibleManualSnapshotsResult,
  ReplicationCountEligibleManualSnapshotsTransportInput,
  ReplicationCreate,
  ReplicationEntry,
  ReplicationQueryResultItem,
  ReplicationRestoreOptions,
  ReplicationUpdate,
  ReportingEntry,
  ReportingExporterSchema,
  ReportingExporterUpdate,
  ReportingExportsCreateArgs,
  ReportingExportsEntry,
  ReportingExportsQueryResultItem,
  ReportingGetDataResponse,
  ReportingQuery,
  ReportingUpdateArgs,
  RestoreOpts,
  RouteSystemRoutesItem,
  RouteSystemRoutesItemQueryResultItem,
  RsyncTaskCreate,
  RsyncTaskEntry,
  RsyncTaskQueryResultItem,
  RsyncTaskUpdate,
  SFTPCredentialsModel,
  SMBEntry,
  SMBShareAcl,
  SMBUpdateArgs,
  SNMPEntry,
  SNMPUpdateArgs,
  SSHCredentialsEntry,
  SSHEntry,
  SSHKeyPairEntry,
  SSHUpdate,
  SerialInfo,
  ServiceEntry,
  ServiceQueryResultItem,
  ServiceUpdate,
  SetupSSHConnectionManual,
  SetupSSHConnectionSemiautomatic,
  SharingNFSEntry,
  SharingNFSQueryResultItem,
  SharingSMBEntry,
  SharingSMBGetaclArgs,
  SharingSMBQueryResultItem,
  SharingSMBSetaclArgs,
  SharingSMBSharePrecheckArgs,
  SmbShareCreate,
  SmbShareUpdate,
  StaticRouteCreate,
  StaticRouteEntry,
  StaticRouteQueryResultItem,
  StaticRouteUpdate,
  StatusResult,
  StorjIxCredentialsModelInput,
  SupportEntry,
  SupportSimilarIssue,
  SupportUpdate,
  SwiftCredentialsModel,
  SysInfo,
  SystemAdvancedEntry,
  SystemAdvancedUpdate,
  SystemDatasetEntry,
  SystemGeneralEntry,
  SystemGeneralUpdateArgs,
  SystemInfoResult,
  SystemProductTypeResult,
  SystemSecurityEntry,
  SystemStateResult,
  Target,
  TrueNASConnectEntry,
  TrueNASConnectUpdateArgs,
  TruecommandEntry,
  TruecommandUpdateArgs,
  TunableEntry,
  TunableQueryResultItem,
  TunableTunableTypeChoices,
  TwoFactorAuthEntry,
  TwoFactorAuthUpdate,
  TwofactorOptions,
  UPSEntry,
  UPSUpdateArgs,
  USBPassthroughDevice,
  USBPassthroughInfo,
  UpdateAvailableVersion,
  UpdateEntry,
  UpdateProfileChoice,
  UpdateStatus,
  UpdateUpdate,
  UpgradeSummaryOptions,
  UsedKeychainCredential,
  UserCreate,
  UserCreateUpdateResult,
  UserDeleteOptions,
  UserEntry,
  UserGetUserObj,
  UserGetUserObjArgs,
  UserQueryResultItem,
  UserRenew2FaSecretResult,
  UserSetPasswordArgs,
  UserSetupLocalAdministratorOptions,
  UserUpdate,
  Username,
  VMBootloaderOptionsResult,
  VMBootloaderOvmfChoicesResult,
  VMCpuModelChoicesResult,
  VMCreateArgs,
  VMDeleteOptions,
  VMDeviceBindChoicesResult,
  VMDeviceCreateArgs,
  VMDeviceDeleteOptions,
  VMDeviceDiskChoices,
  VMDeviceEntry,
  VMDeviceIotypeChoicesResult,
  VMDeviceNicAttachChoicesResult,
  VMDevicePassthroughDevice,
  VMDevicePassthroughInfo,
  VMDeviceQueryResultItem,
  VMDeviceUpdate,
  VMDeviceUsbControllerChoicesResult,
  VMEntry,
  VMFlagsResult,
  VMGetDisplayWebUriResult,
  VMGetVmMemoryInfoResult,
  VMGetVmemoryInUseResult,
  VMGuestArchitectureAndMachineChoicesResult,
  VMPortWizardResult,
  VMQueryResultItem,
  VMStartOptions,
  VMStatus,
  VMUpdate,
  VMVirtualizationDetailsResult,
  VMWareCreate,
  VMWareEntry,
  VMWareGetDatastoresArgs,
  VMWareMatchDatastoresWithDatasetsArgs,
  VMWareMatchDatastoresWithDatasetsResult,
  VMWareQueryResultItem,
  VMWareUpdate,
  VirtDeviceGpuChoice,
  VirtDeviceType,
  VirtDeviceUsbChoice,
  VirtGlobalEntry,
  VirtGlobalNetwork,
  VirtInstanceEntry,
  VirtInstanceImageChoice,
  VirtInstanceQueryResultItem,
  VirtVolumeCreate,
  VirtVolumeEntry,
  VirtVolumeQueryResultItem,
  VirtVolumeUpdate,
  WebDavCredentialsModel,
  YandexCredentialsModel,
  ZFSFileAttrsData,
  ZFSResourceEntry,
  ZFSResourceQuery,
} from './api-types';

export interface ApiCallDirectory {
  'acme.dns.authenticator.authenticator_schemas': {
    params: [];
    response: ACMEDNSAuthenticatorSchema[];
  };

  'acme.dns.authenticator.create': {
    params: [dns_authenticator_create: DNSAuthenticatorCreateArgs];
    response: DNSAuthenticatorEntry;
  };

  'acme.dns.authenticator.delete': {
    params: [id: number];
    response: boolean;
  };

  'acme.dns.authenticator.get_instance': {
    params: [id: number, options?: QueryOptions<DNSAuthenticatorEntry>];
    response: DNSAuthenticatorEntry;
  };

  'acme.dns.authenticator.query': {
    params: [filters?: QueryFilters<DNSAuthenticatorEntry>, options?: QueryOptions<DNSAuthenticatorEntry>];
    response: DNSAuthenticatorEntry[] | DNSAuthenticatorEntry | DNSAuthenticatorQueryResultItem[] | DNSAuthenticatorQueryResultItem | number;
    entity: DNSAuthenticatorEntry;
  };

  'acme.dns.authenticator.update': {
    params: [id: number, dns_authenticator_update: ACMEDNSAuthenticatorUpdate];
    response: DNSAuthenticatorEntry;
  };

  'alert.dismiss': {
    params: [uuid: string];
    response: null;
  };

  'alert.list': {
    params: [];
    response: Alert[];
  };

  'alert.list_categories': {
    params: [];
    response: AlertCategory[];
  };

  'alert.list_policies': {
    params: [];
    response: string[];
  };

  'alert.restore': {
    params: [uuid: string];
    response: null;
  };

  'alertclasses.config': {
    params: [];
    response: AlertClassesEntry;
  };

  'alertclasses.update': {
    params: [alert_class_update: AlertClassesUpdate];
    response: AlertClassesEntry;
  };

  'alertservice.create': {
    params: [alert_service_create: AlertServiceCreate];
    response: AlertServiceEntry;
  };

  'alertservice.delete': {
    params: [id: number];
    response: boolean;
  };

  'alertservice.get_instance': {
    params: [id: number, options?: QueryOptions<AlertServiceEntry>];
    response: AlertServiceEntry;
  };

  'alertservice.query': {
    params: [filters?: QueryFilters<AlertServiceEntry>, options?: QueryOptions<AlertServiceEntry>];
    response: AlertServiceEntry[] | AlertServiceEntry | AlertServiceQueryResultItem[] | AlertServiceQueryResultItem | number;
    entity: AlertServiceEntry;
  };

  'alertservice.test': {
    params: [alert_service_create: AlertServiceCreate];
    response: boolean;
  };

  'alertservice.update': {
    params: [id: number, alert_service_update: AlertServiceCreate];
    response: AlertServiceEntry;
  };

  'api_key.create': {
    params: [api_key_create: ApiKeyCreate];
    response: ApiKeyEntryWithKey;
  };

  'api_key.delete': {
    params: [id: number];
    response: true;
  };

  'api_key.get_instance': {
    params: [id: number, options?: QueryOptions<ApiKeyEntry>];
    response: ApiKeyEntry;
  };

  'api_key.my_keys': {
    params: [];
    response: ApiKeyEntry[];
  };

  'api_key.query': {
    params: [filters?: QueryFilters<ApiKeyEntry>, options?: QueryOptions<ApiKeyEntry>];
    response: ApiKeyEntry[] | ApiKeyEntry | ApiKeyQueryResultItem[] | ApiKeyQueryResultItem | number;
    entity: ApiKeyEntry;
  };

  'api_key.update': {
    params: [id: number, api_key_update: ApiKeyUpdate];
    response: ApiKeyEntryWithKey | ApiKeyEntry;
  };

  'app.available_space': {
    params: [];
    response: number;
  };

  'app.categories': {
    params: [];
    response: string[];
  };

  'app.certificate_choices': {
    params: [];
    response: AppCertificate[];
  };

  'app.config': {
    params: [app_name: string];
    response: Record<string, unknown>;
  };

  'app.container_console_choices': {
    params: [app_name: string];
    response: AppContainerResponse;
  };

  'app.container_ids': {
    params: [app_name: string, options?: AppContainerIDOptions];
    response: AppContainerResponse;
  };

  'app.get_instance': {
    params: [id: string, options?: QueryOptions<AppEntry>];
    response: AppEntry;
  };

  'app.gpu_choices': {
    params: [];
    response: AppGPUResponse;
  };

  'app.image.delete': {
    params: [image_id: string, options?: AppImageDeleteOptions];
    response: true;
  };

  'app.image.dockerhub_rate_limit': {
    params: [];
    response: AppImageDockerhubRateLimitResult;
  };

  'app.image.get_instance': {
    params: [id: string, options?: QueryOptions<AppImageEntry>];
    response: AppImageEntry;
  };

  'app.image.query': {
    params: [filters?: QueryFilters<AppImageEntry>, options?: QueryOptions<AppImageEntry>];
    response: AppImageEntry[] | AppImageEntry | AppImageQueryResultItem[] | AppImageQueryResultItem | number;
    entity: AppImageEntry;
  };

  'app.ip_choices': {
    params: [];
    response: Record<string, string>;
  };

  'app.ix_volume.exists': {
    params: [name: string];
    response: boolean;
  };

  'app.ix_volume.query': {
    params: [filters?: QueryFilters<AppsIxVolumeEntry>, options?: QueryOptions<AppsIxVolumeEntry>];
    response: AppsIxVolumeEntry[] | AppsIxVolumeEntry | AppsIxVolumeQueryResultItem[] | AppsIxVolumeQueryResultItem | number;
    entity: AppsIxVolumeEntry;
  };

  'app.outdated_docker_images': {
    params: [app_name: string];
    response: string[];
  };

  'app.query': {
    params: [filters?: QueryFilters<AppEntry>, options?: QueryOptions<AppEntry>];
    response: AppEntry[] | AppEntry | AppQueryResultItem[] | AppQueryResultItem | number;
    entity: AppEntry;
  };

  'app.registry.create': {
    params: [app_registry_create: AppRegistryCreate];
    response: AppRegistryEntry;
  };

  'app.registry.delete': {
    params: [id: number];
    response: null;
  };

  'app.registry.get_instance': {
    params: [id: number, options?: QueryOptions<AppRegistryEntry>];
    response: AppRegistryEntry;
  };

  'app.registry.query': {
    params: [filters?: QueryFilters<AppRegistryEntry>, options?: QueryOptions<AppRegistryEntry>];
    response: AppRegistryEntry[] | AppRegistryEntry | AppRegistryQueryResultItem[] | AppRegistryQueryResultItem | number;
    entity: AppRegistryEntry;
  };

  'app.registry.update': {
    params: [id: number, data: AppRegistryUpdate];
    response: AppRegistryEntry;
  };

  'app.rollback_versions': {
    params: [app_name: string];
    response: string[];
  };

  'app.similar': {
    params: [app_name: string, train: string];
    response: AppAvailableItem[];
  };

  'app.upgrade_summary': {
    params: [app_name: string, options?: UpgradeSummaryOptions];
    response: AppUpgradeSummaryResult;
  };

  'app.used_host_ips': {
    params: [];
    response: Record<string, string[]>;
  };

  'app.used_ports': {
    params: [];
    response: number[];
  };

  'audit.config': {
    params: [];
    response: AuditEntry;
  };

  'audit.query': {
    params: [data?: AuditQuery];
    response: number | AuditQueryResultItem | AuditQueryResultItem[];
  };

  'audit.update': {
    params: [data: AuditUpdate];
    response: AuditEntry;
  };

  'auth.generate_onetime_password': {
    params: [generate_single_use_password: AuthGenerateOnetimePasswordArgs];
    response: string;
  };

  'auth.generate_token': {
    params: [ttl?: number | null, attrs?: Record<string, unknown>, match_origin?: boolean, single_use?: boolean];
    response: string;
  };

  'auth.login': {
    params: [username: string, password: string, otp_token?: string | null];
    response: boolean;
  };

  'auth.login_ex': {
    params: [login_data: AuthApiKeyPlain | AuthPasswordPlain | AuthTokenPlain | AuthOTPToken];
    response: AuthRespSuccess | AuthRespAuthErr | AuthRespExpired | AuthRespOTPRequired | AuthRespAuthRedirect;
  };

  'auth.login_ex_continue': {
    params: [login_data: AuthOTPToken];
    response: AuthRespSuccess | AuthRespAuthErr | AuthRespExpired | AuthRespOTPRequired | AuthRespAuthRedirect;
  };

  'auth.login_with_api_key': {
    params: [api_key: string];
    response: boolean;
  };

  'auth.login_with_token': {
    params: [token: string];
    response: boolean;
  };

  'auth.logout': {
    params: [];
    response: true;
  };

  'auth.me': {
    params: [];
    response: AuthMeResult;
  };

  'auth.mechanism_choices': {
    params: [];
    response: string[];
  };

  'auth.sessions': {
    params: [filters?: QueryFilters<AuthSessionsEntry>, options?: QueryOptions<AuthSessionsEntry>];
    response: AuthSessionsEntry[] | AuthSessionsEntry | AuthSessionsQueryResultItem[] | AuthSessionsQueryResultItem | number;
    entity: AuthSessionsEntry;
  };

  'auth.set_attribute': {
    params: [key: string, value: unknown];
    response: null;
  };

  'auth.terminate_other_sessions': {
    params: [];
    response: true;
  };

  'auth.terminate_session': {
    params: [id: string];
    response: boolean;
  };

  'auth.twofactor.config': {
    params: [];
    response: TwoFactorAuthEntry;
  };

  'auth.twofactor.update': {
    params: [auth_twofactor_update: TwoFactorAuthUpdate];
    response: TwoFactorAuthEntry;
  };

  'boot.detach': {
    params: [dev: string];
    response: null;
  };

  'boot.environment.activate': {
    params: [boot_environment_activate: BootEnvironmentActivateArgs];
    response: BootEnvironmentEntry;
  };

  'boot.environment.clone': {
    params: [boot_environment_clone: BootEnvironmentCloneArgs];
    response: BootEnvironmentEntry;
  };

  'boot.environment.destroy': {
    params: [boot_environment_destroy: BootEnvironmentDestroyArgs];
    response: null;
  };

  'boot.environment.get_instance': {
    params: [id: string, options?: QueryOptions<BootEnvironmentEntry>];
    response: BootEnvironmentEntry;
  };

  'boot.environment.keep': {
    params: [boot_environment_destroy: BootEnvironmentKeepArgs];
    response: BootEnvironmentEntry;
  };

  'boot.environment.query': {
    params: [filters?: QueryFilters<BootEnvironmentEntry>, options?: QueryOptions<BootEnvironmentEntry>];
    response: BootEnvironmentEntry[] | BootEnvironmentEntry | BootEnvironmentQueryResultItem[] | BootEnvironmentQueryResultItem | number;
    entity: BootEnvironmentEntry;
  };

  'boot.get_disks': {
    params: [];
    response: string[];
  };

  'boot.get_state': {
    params: [];
    response: BootGetState;
  };

  'boot.set_scrub_interval': {
    params: [interval: number];
    response: number;
  };

  'catalog.apps': {
    params: [catalog_apps_options?: CatalogAppsArgs];
    response: Record<string, CatalogTrainInfo>;
  };

  'catalog.config': {
    params: [];
    response: CatalogEntry;
  };

  'catalog.get_app_details': {
    params: [app_name: string, app_version_details: CatalogAppVersionDetails];
    response: CatalogAppInfo;
  };

  'catalog.trains': {
    params: [];
    response: string[];
  };

  'catalog.update': {
    params: [catalog_update?: CatalogUpdateArgs];
    response: CatalogEntry;
  };

  'certificate.acme_server_choices': {
    params: [];
    response: Record<string, string>;
  };

  'certificate.country_choices': {
    params: [];
    response: Record<string, string>;
  };

  'certificate.ec_curve_choices': {
    params: [];
    response: Record<string, string>;
  };

  'certificate.extended_key_usage_choices': {
    params: [];
    response: Record<string, string>;
  };

  'certificate.get_instance': {
    params: [id: number, options?: QueryOptions<CertificateEntry>];
    response: CertificateEntry;
  };

  'certificate.query': {
    params: [filters?: QueryFilters<CertificateEntry>, options?: QueryOptions<CertificateEntry>];
    response: CertificateEntry[] | CertificateEntry | CertificateQueryResultItem[] | CertificateQueryResultItem | number;
    entity: CertificateEntry;
  };

  'cloud_backup.abort': {
    params: [id: number];
    response: boolean;
  };

  'cloud_backup.create': {
    params: [cloud_backup: CloudBackupCreate];
    response: CloudBackupEntry;
  };

  'cloud_backup.delete': {
    params: [id: number];
    response: true;
  };

  'cloud_backup.get_instance': {
    params: [id: number, options?: QueryOptions<CloudBackupEntry>];
    response: CloudBackupEntry;
  };

  'cloud_backup.list_snapshot_directory': {
    params: [id: number, snapshot_id: string, path: string];
    response: CloudBackupSnapshotItem[];
  };

  'cloud_backup.list_snapshots': {
    params: [id: number];
    response: CloudBackupSnapshot[];
  };

  'cloud_backup.query': {
    params: [filters?: QueryFilters<CloudBackupEntry>, options?: QueryOptions<CloudBackupEntry>];
    response: CloudBackupEntry[] | CloudBackupEntry | CloudBackupQueryResultItem[] | CloudBackupQueryResultItem | number;
    entity: CloudBackupEntry;
  };

  'cloud_backup.transfer_setting_choices': {
    params: [];
    response: ('DEFAULT' | 'PERFORMANCE' | 'FAST_STORAGE')[];
  };

  'cloud_backup.update': {
    params: [id: number, data: CloudBackupUpdate];
    response: CloudBackupEntry;
  };

  'cloudsync.abort': {
    params: [id: number];
    response: boolean;
  };

  'cloudsync.create': {
    params: [cloud_sync_create: CloudSyncCreate];
    response: CloudSyncEntry;
  };

  'cloudsync.create_bucket': {
    params: [credentials_id: number, name: string];
    response: null;
  };

  'cloudsync.credentials.create': {
    params: [cloud_sync_credentials_create: CloudCredentialCreate];
    response: CredentialsEntry;
  };

  'cloudsync.credentials.delete': {
    params: [id: number];
    response: boolean;
  };

  'cloudsync.credentials.get_instance': {
    params: [id: number, options?: QueryOptions<CredentialsEntry>];
    response: CredentialsEntry;
  };

  'cloudsync.credentials.query': {
    params: [filters?: QueryFilters<CredentialsEntry>, options?: QueryOptions<CredentialsEntry>];
    response: CredentialsEntry[] | CredentialsEntry | CredentialsQueryResultItem[] | CredentialsQueryResultItem | number;
    entity: CredentialsEntry;
  };

  'cloudsync.credentials.update': {
    params: [id: number, cloud_sync_credentials_update: CloudCredentialUpdate];
    response: CredentialsEntry;
  };

  'cloudsync.credentials.verify': {
    params: [cloud_sync_credentials_create: AzureBlobCredentialsModel | B2CredentialsModel | BoxCredentialsModel | DropboxCredentialsModel | FTPCredentialsModel | GoogleCloudStorageCredentialsModel | GoogleDriveCredentialsModel | GooglePhotosCredentialsModel | HTTPCredentialsModel | HubicCredentialsModel | MegaCredentialsModel | OneDriveCredentialsModel | PCloudCredentialsModel | CloudBackupS3CredentialsModelInput2 | SFTPCredentialsModel | StorjIxCredentialsModelInput | SwiftCredentialsModel | WebDavCredentialsModel | YandexCredentialsModel];
    response: CredentialsVerifyResult;
  };

  'cloudsync.delete': {
    params: [id: number];
    response: true;
  };

  'cloudsync.get_instance': {
    params: [id: number, options?: QueryOptions<CloudSyncEntry>];
    response: CloudSyncEntry;
  };

  'cloudsync.list_buckets': {
    params: [credentials_id: number];
    response: (Record<string, unknown>)[];
  };

  'cloudsync.list_directory': {
    params: [cloud_sync_ls: CloudSyncListDirectoryArgs];
    response: (Record<string, unknown>)[];
  };

  'cloudsync.onedrive_list_drives': {
    params: [onedrive_list_drives: CloudSyncOneDriveListDrivesArgs];
    response: CloudSyncOneDriveListDrivesDrive[];
  };

  'cloudsync.providers': {
    params: [];
    response: CloudSyncProvider[];
  };

  'cloudsync.query': {
    params: [filters?: QueryFilters<CloudSyncEntry>, options?: QueryOptions<CloudSyncEntry>];
    response: CloudSyncEntry[] | CloudSyncEntry | CloudSyncQueryResultItem[] | CloudSyncQueryResultItem | number;
    entity: CloudSyncEntry;
  };

  'cloudsync.restore': {
    params: [id: number, opts: RestoreOpts];
    response: CloudSyncEntry;
  };

  'cloudsync.update': {
    params: [id: number, cloud_sync_update: CloudSyncUpdate];
    response: CloudSyncEntry;
  };

  'core.arp': {
    params: [options?: CoreArpArgs];
    response: Record<string, string>;
  };

  'core.download': {
    params: [method: string, args: unknown[], filename: string, buffered?: boolean];
    response: unknown[];
  };

  'core.get_jobs': {
    params: [filters?: QueryFilters<CoreGetJobsItem>, options?: QueryOptions<CoreGetJobsItem>];
    response: CoreGetJobsItem[] | CoreGetJobsItem | CoreGetJobsItemQueryResultItem[] | CoreGetJobsItemQueryResultItem | number;
    entity: CoreGetJobsItem;
  };

  'core.get_methods': {
    params: [service?: string | null, target?: Target];
    response: Record<string, unknown>;
  };

  'core.get_services': {
    params: [target?: Target];
    response: Record<string, unknown>;
  };

  'core.job_abort': {
    params: [id: number];
    response: null;
  };

  'core.job_download_logs': {
    params: [id: number, filename: string, buffered?: boolean];
    response: string;
  };

  'core.ping': {
    params: [];
    response: 'pong';
  };

  'core.ping_remote': {
    params: [options: CorePingRemoteArgs];
    response: boolean;
  };

  'core.resize_shell': {
    params: [id: string, cols: number, rows: number];
    response: null;
  };

  'core.set_options': {
    params: [options: CoreOptions];
    response: CoreOptions;
  };

  'core.subscribe': {
    params: [event: string];
    response: string;
  };

  'core.unsubscribe': {
    params: [id_: string];
    response: null;
  };

  'cronjob.create': {
    params: [data: CronJobCreate];
    response: CronJobEntry;
  };

  'cronjob.delete': {
    params: [id: number];
    response: true;
  };

  'cronjob.get_instance': {
    params: [id: number, options?: QueryOptions<CronJobEntry>];
    response: CronJobEntry;
  };

  'cronjob.query': {
    params: [filters?: QueryFilters<CronJobEntry>, options?: QueryOptions<CronJobEntry>];
    response: CronJobEntry[] | CronJobEntry | CronJobQueryResultItem[] | CronJobQueryResultItem | number;
    entity: CronJobEntry;
  };

  'cronjob.update': {
    params: [id: number, data: CronJobUpdate];
    response: CronJobEntry;
  };

  'device.get_info': {
    params: [data: DeviceGetInfoDisk | DeviceGetInfoOther];
    response: Record<string, string> | Record<string, Record<string, unknown>> | SerialInfo[] | GPUInfo[];
  };

  'directoryservices.certificate_choices': {
    params: [];
    response: Record<string, string>;
  };

  'directoryservices.config': {
    params: [];
    response: DirectoryServicesEntry;
  };

  'directoryservices.status': {
    params: [];
    response: DirectoryServicesStatusResult;
  };

  'disk.details': {
    params: [data?: DiskDetails];
    response: unknown[] | Record<string, unknown>;
  };

  'disk.get_used': {
    params: [join_partitions?: boolean];
    response: unknown[];
  };

  'disk.query': {
    params: [filters?: QueryFilters<DiskEntry>, options?: QueryOptions<DiskEntry>];
    response: DiskEntry[] | DiskEntry | DiskQueryResultItem[] | DiskQueryResultItem | number;
    entity: DiskEntry;
  };

  'disk.temperature_agg': {
    params: [names: string[], days?: number];
    response: Record<string, DiskTemperatureAggEntry>;
  };

  'disk.temperature_alerts': {
    params: [names: string[]];
    response: Alert[];
  };

  'disk.temperatures': {
    params: [name?: string[], include_thresholds?: boolean];
    response: Record<string, unknown>;
  };

  'disk.update': {
    params: [id: string, data: DiskUpdate];
    response: DiskEntry;
  };

  'dns.query': {
    params: [filters?: QueryFilters<DNSQueryItem>, options?: QueryOptions<DNSQueryItem>];
    response: DNSQueryItem[] | DNSQueryItem | DNSQueryItemQueryResultItem[] | DNSQueryItemQueryResultItem | number;
    entity: DNSQueryItem;
  };

  'docker.config': {
    params: [];
    response: DockerEntry;
  };

  'docker.delete_backup': {
    params: [backup_name: string];
    response: null;
  };

  'docker.list_backups': {
    params: [];
    response: DockerBackupInfo;
  };

  'docker.network.get_instance': {
    params: [id: string | null, options?: QueryOptions<DockerNetworkEntry>];
    response: DockerNetworkEntry;
  };

  'docker.network.query': {
    params: [filters?: QueryFilters<DockerNetworkEntry>, options?: QueryOptions<DockerNetworkEntry>];
    response: DockerNetworkEntry[] | DockerNetworkEntry | DockerNetworkQueryResultItem[] | DockerNetworkQueryResultItem | number;
    entity: DockerNetworkEntry;
  };

  'docker.nvidia_present': {
    params: [];
    response: boolean;
  };

  'docker.status': {
    params: [];
    response: StatusResult;
  };

  'enclosure.label.set': {
    params: [id: string, label: string];
    response: null;
  };

  'enclosure2.query': {
    params: [filters?: QueryFilters<Enclosure2Entry>, options?: QueryOptions<Enclosure2Entry>];
    response: Enclosure2Entry[] | Enclosure2Entry | Enclosure2QueryResultItem[] | Enclosure2QueryResultItem | number;
    entity: Enclosure2Entry;
  };

  'enclosure2.set_slot_status': {
    params: [Enclosure2SetSlotStatus: Enclosure2SetSlotStatusArgs];
    response: null;
  };

  'failover.become_passive': {
    params: [];
    response: null;
  };

  'failover.config': {
    params: [];
    response: FailoverEntry;
  };

  'failover.disabled.reasons': {
    params: [];
    response: string[];
  };

  'failover.get_ips': {
    params: [];
    response: string[];
  };

  'failover.licensed': {
    params: [];
    response: boolean;
  };

  'failover.node': {
    params: [];
    response: string;
  };

  'failover.reboot.info': {
    params: [];
    response: FailoverRebootInfoResult;
  };

  'failover.status': {
    params: [];
    response: string;
  };

  'failover.sync_from_peer': {
    params: [];
    response: null;
  };

  'failover.sync_to_peer': {
    params: [options?: FailoverSyncToPeer];
    response: null;
  };

  'failover.update': {
    params: [data: FailoverUpdate];
    response: FailoverEntry;
  };

  'fc.capable': {
    params: [];
    response: boolean;
  };

  'fc.fc_host.create': {
    params: [fc_host_create: FCHostCreate];
    response: FCHostEntry;
  };

  'fc.fc_host.delete': {
    params: [id: number];
    response: true;
  };

  'fc.fc_host.get_instance': {
    params: [id: number, options?: QueryOptions<FCHostEntry>];
    response: FCHostEntry;
  };

  'fc.fc_host.query': {
    params: [filters?: QueryFilters<FCHostEntry>, options?: QueryOptions<FCHostEntry>];
    response: FCHostEntry[] | FCHostEntry | FCHostQueryResultItem[] | FCHostQueryResultItem | number;
    entity: FCHostEntry;
  };

  'fc.fc_host.update': {
    params: [id: number, fc_host_update: FCHostUpdate];
    response: FCHostEntry;
  };

  'fcport.create': {
    params: [fc_Port_create: FCPortCreate];
    response: FCPortEntry;
  };

  'fcport.delete': {
    params: [id: number];
    response: true;
  };

  'fcport.get_instance': {
    params: [id: number, options?: QueryOptions<FCPortEntry>];
    response: FCPortEntry;
  };

  'fcport.port_choices': {
    params: [include_used?: boolean];
    response: Record<string, FCPortChoiceEntry>;
  };

  'fcport.query': {
    params: [filters?: QueryFilters<FCPortEntry>, options?: QueryOptions<FCPortEntry>];
    response: FCPortEntry[] | FCPortEntry | FCPortQueryResultItem[] | FCPortQueryResultItem | number;
    entity: FCPortEntry;
  };

  'fcport.status': {
    params: [filters?: QueryFilters<Record<string, unknown>>, options?: QueryOptions<Record<string, unknown>>];
    response: unknown[];
  };

  'fcport.update': {
    params: [id: number, fc_Port_update: FCPortUpdate];
    response: FCPortEntry;
  };

  'filesystem.acltemplate.by_path': {
    params: [filesystem_acl?: ACLTemplateByPathArgs];
    response: ACLTemplateEntry[];
  };

  'filesystem.acltemplate.create': {
    params: [acltemplate_create: AclTemplateCreate];
    response: ACLTemplateEntry;
  };

  'filesystem.acltemplate.delete': {
    params: [id: number];
    response: true;
  };

  'filesystem.acltemplate.get_instance': {
    params: [id: number, options?: QueryOptions<ACLTemplateEntry>];
    response: ACLTemplateEntry;
  };

  'filesystem.acltemplate.query': {
    params: [filters?: QueryFilters<ACLTemplateEntry>, options?: QueryOptions<ACLTemplateEntry>];
    response: ACLTemplateEntry[] | ACLTemplateEntry | ACLTemplateQueryResultItem[] | ACLTemplateQueryResultItem | number;
    entity: ACLTemplateEntry;
  };

  'filesystem.acltemplate.update': {
    params: [id: number, acltemplate_update: AclTemplateUpdate];
    response: ACLTemplateEntry;
  };

  'filesystem.get_zfs_attributes': {
    params: [path: string];
    response: ZFSFileAttrsData;
  };

  'filesystem.getacl': {
    params: [path: string, simplified?: boolean, resolve_ids?: boolean];
    response: NFS4ACLResult | POSIXACLResult | DISABLED_ACLResult;
  };

  'filesystem.listdir': {
    params: [path: string, query_filters?: unknown[], query_options?: QueryOptionsModel];
    response: FilesystemDirEntry[] | FilesystemDirEntry | FilesystemDirQueryResultItem[] | FilesystemDirQueryResultItem | number;
  };

  'filesystem.mkdir': {
    params: [filesystem_mkdir: FilesystemMkdirArgs];
    response: FilesystemDirEntry;
  };

  'filesystem.stat': {
    params: [path: string];
    response: FilesystemStatData;
  };

  'filesystem.statfs': {
    params: [path: string];
    response: FilesystemStatfsData;
  };

  'ftp.config': {
    params: [];
    response: FTPEntry;
  };

  'ftp.update': {
    params: [ftp_update?: FTPUpdateArgs];
    response: FTPEntry;
  };

  'group.create': {
    params: [group_create: GroupCreate];
    response: number;
  };

  'group.delete': {
    params: [id: number, options?: GroupDeleteOptions];
    response: number;
  };

  'group.get_group_obj': {
    params: [get_group_obj?: GroupGetGroupObjArgs];
    response: GroupGetGroupObjResult;
  };

  'group.get_instance': {
    params: [id: number, options?: QueryOptions<GroupEntry>];
    response: GroupEntry;
  };

  'group.get_next_gid': {
    params: [];
    response: number;
  };

  'group.has_password_enabled_user': {
    params: [gids: number[], exclude_user_ids?: number[]];
    response: boolean;
  };

  'group.query': {
    params: [filters?: QueryFilters<GroupEntry>, options?: QueryOptions<GroupEntry>];
    response: GroupEntry[] | GroupEntry | GroupQueryResultItem[] | GroupQueryResultItem | number;
    entity: GroupEntry;
  };

  'group.update': {
    params: [id: number, group_update: GroupUpdate];
    response: number;
  };

  'hardware.virtualization.variant': {
    params: [];
    response: string;
  };

  'initshutdownscript.create': {
    params: [data: InitShutdownScriptCreate];
    response: InitShutdownScriptEntry;
  };

  'initshutdownscript.delete': {
    params: [id: number];
    response: true;
  };

  'initshutdownscript.get_instance': {
    params: [id: number, options?: QueryOptions<InitShutdownScriptEntry>];
    response: InitShutdownScriptEntry;
  };

  'initshutdownscript.query': {
    params: [filters?: QueryFilters<InitShutdownScriptEntry>, options?: QueryOptions<InitShutdownScriptEntry>];
    response: InitShutdownScriptEntry[] | InitShutdownScriptEntry | InitShutdownScriptQueryResultItem[] | InitShutdownScriptQueryResultItem | number;
    entity: InitShutdownScriptEntry;
  };

  'initshutdownscript.update': {
    params: [id: number, data: InitShutdownScriptUpdate];
    response: InitShutdownScriptEntry;
  };

  'interface.bridge_members_choices': {
    params: [id?: string | null];
    response: Record<string, string>;
  };

  'interface.cancel_rollback': {
    params: [];
    response: null;
  };

  'interface.checkin': {
    params: [];
    response: null;
  };

  'interface.checkin_waiting': {
    params: [];
    response: number | null;
  };

  'interface.choices': {
    params: [options?: InterfaceChoicesOptions];
    response: Record<string, string>;
  };

  'interface.commit': {
    params: [options?: InterfaceCommitOptions];
    response: null;
  };

  'interface.create': {
    params: [data: InterfaceCreate];
    response: InterfaceEntry;
  };

  'interface.delete': {
    params: [id: string];
    response: string;
  };

  'interface.get_instance': {
    params: [id: string, options?: QueryOptions<InterfaceEntry>];
    response: InterfaceEntry;
  };

  'interface.has_pending_changes': {
    params: [];
    response: boolean;
  };

  'interface.ip_in_use': {
    params: [options?: InterfaceIPInUseOptions];
    response: InterfaceIPInUseItem[];
  };

  'interface.lacpdu_rate_choices': {
    params: [];
    response: InterfaceLacpduRateChoicesResult;
  };

  'interface.lag_ports_choices': {
    params: [id?: string | null];
    response: Record<string, string>;
  };

  'interface.network_config_to_be_removed': {
    params: [];
    response: ('ipv4gateway' | 'nameserver1' | 'nameserver2' | 'nameserver3')[];
  };

  'interface.query': {
    params: [filters?: QueryFilters<InterfaceEntry>, options?: QueryOptions<InterfaceEntry>];
    response: InterfaceEntry[] | InterfaceEntry | InterfaceQueryResultItem[] | InterfaceQueryResultItem | number;
    entity: InterfaceEntry;
  };

  'interface.rollback': {
    params: [];
    response: null;
  };

  'interface.save_network_config': {
    params: [config: InterfaceSaveNetworkConfigArgs];
    response: null;
  };

  'interface.services_restarted_on_sync': {
    params: [];
    response: InterfaceServicesRestartedOnSyncItem[];
  };

  'interface.update': {
    params: [id: string, data: InterfaceUpdate];
    response: InterfaceEntry;
  };

  'interface.vlan_parent_interface_choices': {
    params: [];
    response: Record<string, string>;
  };

  'interface.websocket_interface': {
    params: [];
    response: InterfaceEntry | null;
  };

  'interface.websocket_local_ip': {
    params: [];
    response: '' | string | null;
  };

  'interface.xmit_hash_policy_choices': {
    params: [];
    response: InterfaceXmitHashPolicyChoicesResult;
  };

  'ipmi.chassis.identify': {
    params: [verb?: IpmiChassisIdentifyVerb];
    response: null;
  };

  'ipmi.chassis.info': {
    params: [];
    response: IPMIChassisInfo | Record<string, unknown>;
  };

  'ipmi.is_loaded': {
    params: [];
    response: boolean;
  };

  'ipmi.lan.channels': {
    params: [];
    response: number[];
  };

  'ipmi.lan.query': {
    params: [data?: IPMILanQuery];
    response: IPMILanEntry[] | IPMILanEntry | IPMILanQueryResultItem[] | IPMILanQueryResultItem | number;
  };

  'ipmi.lan.update': {
    params: [channel: number, data: IPMILanUpdateOptionsDHCP | IPMILanUpdateOptionsStatic];
    response: number;
  };

  'iscsi.auth.create': {
    params: [data: IscsiAuthCreate];
    response: ISCSITargetAuthCredentialEntry;
  };

  'iscsi.auth.delete': {
    params: [id: number];
    response: true;
  };

  'iscsi.auth.get_instance': {
    params: [id: number, options?: QueryOptions<ISCSITargetAuthCredentialEntry>];
    response: ISCSITargetAuthCredentialEntry;
  };

  'iscsi.auth.query': {
    params: [filters?: QueryFilters<ISCSITargetAuthCredentialEntry>, options?: QueryOptions<ISCSITargetAuthCredentialEntry>];
    response: ISCSITargetAuthCredentialEntry[] | ISCSITargetAuthCredentialEntry | ISCSITargetAuthCredentialQueryResultItem[] | ISCSITargetAuthCredentialQueryResultItem | number;
    entity: ISCSITargetAuthCredentialEntry;
  };

  'iscsi.auth.update': {
    params: [id: number, data: IscsiAuthUpdate];
    response: ISCSITargetAuthCredentialEntry;
  };

  'iscsi.extent.create': {
    params: [iscsi_extent_create: IscsiExtentCreate];
    response: ISCSITargetExtentEntry;
  };

  'iscsi.extent.delete': {
    params: [id: number, remove?: boolean, force?: boolean];
    response: true;
  };

  'iscsi.extent.disk_choices': {
    params: [];
    response: Record<string, string>;
  };

  'iscsi.extent.get_instance': {
    params: [id: number, options?: QueryOptions<ISCSITargetExtentEntry>];
    response: ISCSITargetExtentEntry;
  };

  'iscsi.extent.query': {
    params: [filters?: QueryFilters<ISCSITargetExtentEntry>, options?: QueryOptions<ISCSITargetExtentEntry>];
    response: ISCSITargetExtentEntry[] | ISCSITargetExtentEntry | ISCSITargetExtentQueryResultItem[] | ISCSITargetExtentQueryResultItem | number;
    entity: ISCSITargetExtentEntry;
  };

  'iscsi.extent.update': {
    params: [id: number, iscsi_extent_update: IscsiExtentUpdate];
    response: ISCSITargetExtentEntry;
  };

  'iscsi.global.alua_enabled': {
    params: [];
    response: boolean;
  };

  'iscsi.global.client_count': {
    params: [];
    response: number;
  };

  'iscsi.global.config': {
    params: [];
    response: ISCSIGlobalEntry;
  };

  'iscsi.global.iser_enabled': {
    params: [];
    response: boolean;
  };

  'iscsi.global.sessions': {
    params: [filters?: QueryFilters<IscsiSession>, options?: QueryOptions<IscsiSession>];
    response: IscsiSession[];
    entity: IscsiSession;
  };

  'iscsi.global.update': {
    params: [iscsi_update?: ISCSIGlobalUpdateArgs];
    response: ISCSIGlobalEntry;
  };

  'iscsi.initiator.create': {
    params: [iscsi_initiator_create: IscsiInitiatorCreate];
    response: ISCSITargetAuthorizedInitiatorEntry;
  };

  'iscsi.initiator.delete': {
    params: [id: number];
    response: true;
  };

  'iscsi.initiator.get_instance': {
    params: [id: number, options?: QueryOptions<ISCSITargetAuthorizedInitiatorEntry>];
    response: ISCSITargetAuthorizedInitiatorEntry;
  };

  'iscsi.initiator.query': {
    params: [filters?: QueryFilters<ISCSITargetAuthorizedInitiatorEntry>, options?: QueryOptions<ISCSITargetAuthorizedInitiatorEntry>];
    response: ISCSITargetAuthorizedInitiatorEntry[] | ISCSITargetAuthorizedInitiatorEntry | ISCSITargetAuthorizedInitiatorQueryResultItem[] | ISCSITargetAuthorizedInitiatorQueryResultItem | number;
    entity: ISCSITargetAuthorizedInitiatorEntry;
  };

  'iscsi.initiator.update': {
    params: [id: number, iscsi_initiator_update: IscsiInitiatorUpdate];
    response: ISCSITargetAuthorizedInitiatorEntry;
  };

  'iscsi.portal.create': {
    params: [iscsi_portal_create: IscsiPortalCreate];
    response: ISCSIPortalEntry;
  };

  'iscsi.portal.delete': {
    params: [id: number];
    response: true;
  };

  'iscsi.portal.get_instance': {
    params: [id: number, options?: QueryOptions<ISCSIPortalEntry>];
    response: ISCSIPortalEntry;
  };

  'iscsi.portal.listen_ip_choices': {
    params: [];
    response: Record<string, string>;
  };

  'iscsi.portal.query': {
    params: [filters?: QueryFilters<ISCSIPortalEntry>, options?: QueryOptions<ISCSIPortalEntry>];
    response: ISCSIPortalEntry[] | ISCSIPortalEntry | ISCSIPortalQueryResultItem[] | ISCSIPortalQueryResultItem | number;
    entity: ISCSIPortalEntry;
  };

  'iscsi.portal.update': {
    params: [id: number, iscsi_portal_update: IscsiPortalUpdate];
    response: ISCSIPortalEntry;
  };

  'iscsi.target.create': {
    params: [iscsi_target_create: IscsiTargetCreate];
    response: ISCSITargetEntry;
  };

  'iscsi.target.delete': {
    params: [id: number, force?: boolean, delete_extents?: boolean];
    response: true;
  };

  'iscsi.target.get_instance': {
    params: [id: number, options?: QueryOptions<ISCSITargetEntry>];
    response: ISCSITargetEntry;
  };

  'iscsi.target.query': {
    params: [filters?: QueryFilters<ISCSITargetEntry>, options?: QueryOptions<ISCSITargetEntry>];
    response: ISCSITargetEntry[] | ISCSITargetEntry | ISCSITargetQueryResultItem[] | ISCSITargetQueryResultItem | number;
    entity: ISCSITargetEntry;
  };

  'iscsi.target.update': {
    params: [id: number, iscsi_target_update: IscsiTargetUpdate];
    response: ISCSITargetEntry;
  };

  'iscsi.target.validate_name': {
    params: [name: string, existing_id?: number | null];
    response: string | null;
  };

  'iscsi.targetextent.create': {
    params: [iscsi_target_to_extent_create: IscsiTargetToExtentCreate];
    response: ISCSITargetToExtentEntry;
  };

  'iscsi.targetextent.delete': {
    params: [id: number, force?: boolean];
    response: true;
  };

  'iscsi.targetextent.get_instance': {
    params: [id: number, options?: QueryOptions<ISCSITargetToExtentEntry>];
    response: ISCSITargetToExtentEntry;
  };

  'iscsi.targetextent.query': {
    params: [filters?: QueryFilters<ISCSITargetToExtentEntry>, options?: QueryOptions<ISCSITargetToExtentEntry>];
    response: ISCSITargetToExtentEntry[] | ISCSITargetToExtentEntry | ISCSITargetToExtentQueryResultItem[] | ISCSITargetToExtentQueryResultItem | number;
    entity: ISCSITargetToExtentEntry;
  };

  'iscsi.targetextent.update': {
    params: [id: number, iscsi_target_to_extent_update: IscsiTargetToExtentUpdate];
    response: ISCSITargetToExtentEntry;
  };

  'jbof.create': {
    params: [data: JBOFCreate];
    response: JBOFEntry;
  };

  'jbof.delete': {
    params: [id: number, force?: boolean];
    response: true;
  };

  'jbof.get_instance': {
    params: [id: number, options?: QueryOptions<JBOFEntry>];
    response: JBOFEntry;
  };

  'jbof.licensed': {
    params: [];
    response: number;
  };

  'jbof.query': {
    params: [filters?: QueryFilters<JBOFEntry>, options?: QueryOptions<JBOFEntry>];
    response: JBOFEntry[] | JBOFEntry | JBOFQueryResultItem[] | JBOFQueryResultItem | number;
    entity: JBOFEntry;
  };

  'jbof.reapply_config': {
    params: [];
    response: null;
  };

  'jbof.update': {
    params: [id: number, data: JBOFUpdate];
    response: JBOFEntry;
  };

  'kerberos.config': {
    params: [];
    response: KerberosEntry;
  };

  'kerberos.keytab.create': {
    params: [data: KerberosKeytabCreate];
    response: KerberosKeytabEntry;
  };

  'kerberos.keytab.delete': {
    params: [id: number];
    response: null;
  };

  'kerberos.keytab.get_instance': {
    params: [id: number, options?: QueryOptions<KerberosKeytabEntry>];
    response: KerberosKeytabEntry;
  };

  'kerberos.keytab.query': {
    params: [filters?: QueryFilters<KerberosKeytabEntry>, options?: QueryOptions<KerberosKeytabEntry>];
    response: KerberosKeytabEntry[] | KerberosKeytabEntry | KerberosKeytabQueryResultItem[] | KerberosKeytabQueryResultItem | number;
    entity: KerberosKeytabEntry;
  };

  'kerberos.keytab.update': {
    params: [id: number, data: KerberosKeytabUpdate];
    response: KerberosKeytabEntry;
  };

  'kerberos.realm.create': {
    params: [data: KerberosRealmCreate];
    response: KerberosRealmEntry;
  };

  'kerberos.realm.delete': {
    params: [id: number];
    response: null;
  };

  'kerberos.realm.get_instance': {
    params: [id: number, options?: QueryOptions<KerberosRealmEntry>];
    response: KerberosRealmEntry;
  };

  'kerberos.realm.query': {
    params: [filters?: QueryFilters<KerberosRealmEntry>, options?: QueryOptions<KerberosRealmEntry>];
    response: KerberosRealmEntry[] | KerberosRealmEntry | KerberosRealmQueryResultItem[] | KerberosRealmQueryResultItem | number;
    entity: KerberosRealmEntry;
  };

  'kerberos.realm.update': {
    params: [id: number, data: KerberosRealmUpdate];
    response: KerberosRealmEntry;
  };

  'kerberos.update': {
    params: [kerberos_update?: KerberosUpdateArgs];
    response: KerberosEntry;
  };

  'keychaincredential.create': {
    params: [keychain_credential_create: KeychainCredentialCreateSSHKeyPairEntry | KeychainCredentialCreateSSHCredentialsEntry];
    response: SSHKeyPairEntry | SSHCredentialsEntry;
  };

  'keychaincredential.delete': {
    params: [id: number, options?: KeychainCredentialDeleteOptions];
    response: null;
  };

  'keychaincredential.generate_ssh_key_pair': {
    params: [];
    response: KeychainCredentialGenerateSshKeyPairResult;
  };

  'keychaincredential.get_instance': {
    params: [id: number, options?: QueryOptions<KeychainCredentialEntry>];
    response: KeychainCredentialEntry;
  };

  'keychaincredential.query': {
    params: [filters?: QueryFilters<KeychainCredentialEntry>, options?: QueryOptions<KeychainCredentialEntry>];
    response: KeychainCredentialEntry[] | KeychainCredentialEntry | KeychainCredentialQueryResultItem[] | KeychainCredentialQueryResultItem | number;
    entity: KeychainCredentialEntry;
  };

  'keychaincredential.remote_ssh_host_key_scan': {
    params: [keychain_remote_ssh_host_key_scan: KeychainCredentialRemoteSshHostKeyScanArgs];
    response: string;
  };

  'keychaincredential.remote_ssh_semiautomatic_setup': {
    params: [data: KeychainCredentialRemoteSSHSemiautomaticSetup];
    response: SSHCredentialsEntry;
  };

  'keychaincredential.setup_ssh_connection': {
    params: [options: SetupSSHConnectionManual | SetupSSHConnectionSemiautomatic];
    response: SSHCredentialsEntry;
  };

  'keychaincredential.update': {
    params: [id: number, keychain_credential_update: KeychainCredentialUpdateSSHKeyPairEntry | KeychainCredentialUpdateSSHCredentialsEntry];
    response: SSHKeyPairEntry | SSHCredentialsEntry;
  };

  'keychaincredential.used_by': {
    params: [id: number];
    response: UsedKeychainCredential[];
  };

  'kmip.clear_sync_pending_keys': {
    params: [];
    response: null;
  };

  'kmip.config': {
    params: [];
    response: KMIPEntry;
  };

  'kmip.kmip_sync_pending': {
    params: [];
    response: boolean;
  };

  'kmip.sync_keys': {
    params: [];
    response: null;
  };

  'mail.config': {
    params: [];
    response: MailEntry;
  };

  'mail.local_administrator_email': {
    params: [];
    response: string | null;
  };

  'mail.update': {
    params: [data: MailUpdate];
    response: MailEntry;
  };

  'network.configuration.activity_choices': {
    params: [];
    response: string[][];
  };

  'network.configuration.config': {
    params: [];
    response: NetworkConfigurationEntry;
  };

  'network.configuration.update': {
    params: [data: NetWorkConfigurationUpdate];
    response: NetworkConfigurationEntry;
  };

  'network.general.summary': {
    params: [];
    response: NetworkGeneralSummaryResult;
  };

  'nfs.bindip_choices': {
    params: [];
    response: Record<string, string>;
  };

  'nfs.client_count': {
    params: [];
    response: number;
  };

  'nfs.config': {
    params: [];
    response: NFSEntry;
  };

  'nfs.get_nfs3_clients': {
    params: [filters?: QueryFilters<NFSGetNfs3ClientsEntry>, options?: QueryOptions<NFSGetNfs3ClientsEntry>];
    response: NFSGetNfs3ClientsEntry[] | NFSGetNfs3ClientsEntry | NFSGetNfs3ClientsQueryResultItem[] | NFSGetNfs3ClientsQueryResultItem | number;
    entity: NFSGetNfs3ClientsEntry;
  };

  'nfs.get_nfs4_clients': {
    params: [filters?: QueryFilters<NFSGetNfs4ClientsEntry>, options?: QueryOptions<NFSGetNfs4ClientsEntry>];
    response: NFSGetNfs4ClientsEntry[] | NFSGetNfs4ClientsEntry | NFSGetNfs4ClientsQueryResultItem[] | NFSGetNfs4ClientsQueryResultItem | number;
    entity: NFSGetNfs4ClientsEntry;
  };

  'nfs.update': {
    params: [nfs_update?: NFSUpdateArgs];
    response: NFSEntry;
  };

  'nvmet.global.config': {
    params: [];
    response: NVMetGlobalEntry;
  };

  'nvmet.global.update': {
    params: [nvmet_update?: NVMetGlobalUpdateArgs];
    response: NVMetGlobalEntry;
  };

  'nvmet.host.create': {
    params: [nvmet_host_create: NVMetHostCreate];
    response: NVMetHostEntry;
  };

  'nvmet.host.delete': {
    params: [id: number, options?: NVMetHostDeleteOptions];
    response: true;
  };

  'nvmet.host.dhchap_dhgroup_choices': {
    params: [];
    response: ('2048-BIT' | '3072-BIT' | '4096-BIT' | '6144-BIT' | '8192-BIT')[];
  };

  'nvmet.host.dhchap_hash_choices': {
    params: [];
    response: ('SHA-256' | 'SHA-384' | 'SHA-512')[];
  };

  'nvmet.host.generate_key': {
    params: [dhchap_hash?: 'SHA-256' | 'SHA-384' | 'SHA-512', nqn?: string | null];
    response: string;
  };

  'nvmet.host.get_instance': {
    params: [id: number, options?: QueryOptions<NVMetHostEntry>];
    response: NVMetHostEntry;
  };

  'nvmet.host.query': {
    params: [filters?: QueryFilters<NVMetHostEntry>, options?: QueryOptions<NVMetHostEntry>];
    response: NVMetHostEntry[] | NVMetHostEntry | NVMetHostQueryResultItem[] | NVMetHostQueryResultItem | number;
    entity: NVMetHostEntry;
  };

  'nvmet.host.update': {
    params: [id: number, nvmet_host_update: NVMetHostUpdate];
    response: NVMetHostEntry;
  };

  'nvmet.host_subsys.create': {
    params: [nvmet_host_subsys_create: NVMetHostSubsysCreate];
    response: NVMetHostSubsysEntry;
  };

  'nvmet.host_subsys.delete': {
    params: [id: number];
    response: true;
  };

  'nvmet.host_subsys.get_instance': {
    params: [id: number, options?: QueryOptions<NVMetHostSubsysEntry>];
    response: NVMetHostSubsysEntry;
  };

  'nvmet.host_subsys.query': {
    params: [filters?: QueryFilters<NVMetHostSubsysEntry>, options?: QueryOptions<NVMetHostSubsysEntry>];
    response: NVMetHostSubsysEntry[] | NVMetHostSubsysEntry | NVMetHostSubsysQueryResultItem[] | NVMetHostSubsysQueryResultItem | number;
    entity: NVMetHostSubsysEntry;
  };

  'nvmet.host_subsys.update': {
    params: [id: number, nvmet_host_subsys_update: NVMetHostSubsysUpdate];
    response: NVMetHostSubsysEntry;
  };

  'nvmet.namespace.create': {
    params: [nvmet_namespace_create: NVMetNamespaceCreate];
    response: NVMetNamespaceEntry;
  };

  'nvmet.namespace.delete': {
    params: [id: number, options?: NVMetNamespaceDeleteOptions];
    response: true;
  };

  'nvmet.namespace.get_instance': {
    params: [id: number, options?: QueryOptions<NVMetNamespaceEntry>];
    response: NVMetNamespaceEntry;
  };

  'nvmet.namespace.query': {
    params: [filters?: QueryFilters<NVMetNamespaceEntry>, options?: QueryOptions<NVMetNamespaceEntry>];
    response: NVMetNamespaceEntry[] | NVMetNamespaceEntry | NVMetNamespaceQueryResultItem[] | NVMetNamespaceQueryResultItem | number;
    entity: NVMetNamespaceEntry;
  };

  'nvmet.namespace.update': {
    params: [id: number, nvmet_namespace_update: NVMetNamespaceUpdate];
    response: NVMetNamespaceEntry;
  };

  'nvmet.port.create': {
    params: [nvmet_port_create: NVMetPortCreateRDMATCP | NVMetPortCreateFC];
    response: NVMetPortEntry;
  };

  'nvmet.port.delete': {
    params: [id: number, options?: NVMetPortDeleteOptions];
    response: true;
  };

  'nvmet.port.get_instance': {
    params: [id: number, options?: QueryOptions<NVMetPortEntry>];
    response: NVMetPortEntry;
  };

  'nvmet.port.query': {
    params: [filters?: QueryFilters<NVMetPortEntry>, options?: QueryOptions<NVMetPortEntry>];
    response: NVMetPortEntry[] | NVMetPortEntry | NVMetPortQueryResultItem[] | NVMetPortQueryResultItem | number;
    entity: NVMetPortEntry;
  };

  'nvmet.port.transport_address_choices': {
    params: [addr_trtype: 'TCP' | 'RDMA' | 'FC', force_ana?: boolean];
    response: Record<string, string>;
  };

  'nvmet.port.update': {
    params: [id: number, nvmet_port_update: NVMetPortUpdateRDMATCP | NVMetPortUpdateFC];
    response: NVMetPortEntry;
  };

  'nvmet.port_subsys.create': {
    params: [nvmet_port_subsys_create: NVMetPortSubsysCreate];
    response: NVMetPortSubsysEntry;
  };

  'nvmet.port_subsys.delete': {
    params: [id: number];
    response: true;
  };

  'nvmet.port_subsys.get_instance': {
    params: [id: number, options?: QueryOptions<NVMetPortSubsysEntry>];
    response: NVMetPortSubsysEntry;
  };

  'nvmet.port_subsys.query': {
    params: [filters?: QueryFilters<NVMetPortSubsysEntry>, options?: QueryOptions<NVMetPortSubsysEntry>];
    response: NVMetPortSubsysEntry[] | NVMetPortSubsysEntry | NVMetPortSubsysQueryResultItem[] | NVMetPortSubsysQueryResultItem | number;
    entity: NVMetPortSubsysEntry;
  };

  'nvmet.port_subsys.update': {
    params: [id: number, nvmet_port_subsys_update: NVMetPortSubsysUpdate];
    response: NVMetPortSubsysEntry;
  };

  'nvmet.subsys.create': {
    params: [nvmet_subsys_create: NVMetSubsysCreate];
    response: NVMetSubsysEntry;
  };

  'nvmet.subsys.delete': {
    params: [id: number, options?: NVMetSubsysDeleteOptions];
    response: true;
  };

  'nvmet.subsys.get_instance': {
    params: [id: number, options?: QueryOptions<NVMetSubsysEntry>];
    response: NVMetSubsysEntry;
  };

  'nvmet.subsys.query': {
    params: [filters?: QueryFilters<NVMetSubsysEntry>, options?: QueryOptions<NVMetSubsysEntry>];
    response: NVMetSubsysEntry[] | NVMetSubsysEntry | NVMetSubsysQueryResultItem[] | NVMetSubsysQueryResultItem | number;
    entity: NVMetSubsysEntry;
  };

  'nvmet.subsys.update': {
    params: [id: number, nvmet_subsys_update: NVMetSubsysUpdate];
    response: NVMetSubsysEntry;
  };

  'pool.attachments': {
    params: [id: number];
    response: PoolAttachment[];
  };

  'pool.dataset.attachments': {
    params: [id: string];
    response: PoolAttachment[];
  };

  'pool.dataset.checksum_choices': {
    params: [];
    response: PoolDatasetChecksumChoicesResult;
  };

  'pool.dataset.compression_choices': {
    params: [];
    response: Record<string, string>;
  };

  'pool.dataset.create': {
    params: [data: PoolDatasetCreateFilesystem | PoolDatasetCreateVolume];
    response: PoolDatasetEntry;
  };

  'pool.dataset.delete': {
    params: [id: string, options?: PoolDatasetDeleteOptions];
    response: PoolDatasetDeleteResult;
  };

  'pool.dataset.details': {
    params: [];
    response: (Record<string, unknown>)[];
  };

  'pool.dataset.encryption_algorithm_choices': {
    params: [];
    response: PoolDatasetEncryptionAlgorithmChoicesResult;
  };

  'pool.dataset.get_instance': {
    params: [id: string, options?: QueryOptions<PoolDatasetEntry>];
    response: PoolDatasetEntry;
  };

  'pool.dataset.get_quota': {
    params: [dataset: string, quota_type: 'USER' | 'GROUP' | 'DATASET' | 'PROJECT', filters?: QueryFilters<PoolDatasetUserGroupQuota | PoolDatasetDatasetQuota | PoolDatasetProjectQuota>, options?: QueryOptions<PoolDatasetUserGroupQuota | PoolDatasetDatasetQuota | PoolDatasetProjectQuota>];
    response: (PoolDatasetUserGroupQuota | PoolDatasetDatasetQuota | PoolDatasetProjectQuota)[];
    entity: PoolDatasetUserGroupQuota | PoolDatasetDatasetQuota | PoolDatasetProjectQuota;
  };

  'pool.dataset.inherit_parent_encryption_properties': {
    params: [id: string];
    response: null;
  };

  'pool.dataset.processes': {
    params: [id: string];
    response: PoolProcess[];
  };

  'pool.dataset.promote': {
    params: [id: string];
    response: null;
  };

  'pool.dataset.query': {
    params: [filters?: QueryFilters<PoolDatasetEntry>, options?: QueryOptions<PoolDatasetEntry>];
    response: PoolDatasetEntry[] | PoolDatasetEntry | PoolDatasetQueryResultItem[] | PoolDatasetQueryResultItem | number;
    entity: PoolDatasetEntry;
  };

  'pool.dataset.recommended_zvol_blocksize': {
    params: [pool: string];
    response: string;
  };

  'pool.dataset.recordsize_choices': {
    params: [pool_name?: string | null];
    response: string[];
  };

  'pool.dataset.rename': {
    params: [id: string, data: PoolDatasetRenameOptions];
    response: null;
  };

  'pool.dataset.set_quota': {
    params: [dataset: string, quotas?: PoolDatasetSetQuota[]];
    response: null;
  };

  'pool.dataset.snapshot_count': {
    params: [dataset: string];
    response: number;
  };

  'pool.dataset.update': {
    params: [id: string, data: PoolDatasetUpdate];
    response: PoolDatasetEntry;
  };

  'pool.detach': {
    params: [id: number, options: PoolDetachOptions];
    response: true;
  };

  'pool.filesystem_choices': {
    params: [types?: ('FILESYSTEM' | 'VOLUME')[]];
    response: string[];
  };

  'pool.get_disks': {
    params: [id?: number | null];
    response: string[];
  };

  'pool.get_instance': {
    params: [id: number, options?: QueryOptions<PoolEntry>];
    response: PoolEntry;
  };

  'pool.is_upgraded': {
    params: [id: number];
    response: boolean;
  };

  'pool.offline': {
    params: [id: number, options: PoolLabel];
    response: true;
  };

  'pool.online': {
    params: [id: number, options: PoolLabel];
    response: true;
  };

  'pool.processes': {
    params: [id: number];
    response: PoolProcess[];
  };

  'pool.query': {
    params: [filters?: QueryFilters<PoolEntry>, options?: QueryOptions<PoolEntry>];
    response: PoolEntry[] | PoolEntry | PoolQueryResultItem[] | PoolQueryResultItem | number;
    entity: PoolEntry;
  };

  'pool.resilver.config': {
    params: [];
    response: PoolResilverEntry;
  };

  'pool.resilver.update': {
    params: [data: PoolResilverUpdate];
    response: PoolResilverEntry;
  };

  'pool.scrub.create': {
    params: [data: PoolScrubCreate];
    response: PoolScrubEntry;
  };

  'pool.scrub.delete': {
    params: [id_: number];
    response: true;
  };

  'pool.scrub.get_instance': {
    params: [id: number, options?: QueryOptions<PoolScrubEntry>];
    response: PoolScrubEntry;
  };

  'pool.scrub.query': {
    params: [filters?: QueryFilters<PoolScrubEntry>, options?: QueryOptions<PoolScrubEntry>];
    response: PoolScrubEntry[] | PoolScrubEntry | PoolScrubQueryResultItem[] | PoolScrubQueryResultItem | number;
    entity: PoolScrubEntry;
  };

  'pool.scrub.run': {
    params: [name: string, threshold?: number];
    response: null;
  };

  'pool.scrub.update': {
    params: [id_: number, data: PoolScrubUpdate];
    response: PoolScrubEntry;
  };

  'pool.snapshot.clone': {
    params: [data: PoolSnapshotCloneArgs];
    response: true;
  };

  'pool.snapshot.create': {
    params: [data: PoolSnapshotCreateWithName | PoolSnapshotCreateWithSchema];
    response: PoolSnapshotCreateUpdateEntry;
  };

  'pool.snapshot.delete': {
    params: [id: string, options?: PoolSnapshotDeleteOptions];
    response: true;
  };

  'pool.snapshot.get_instance': {
    params: [id: string, options?: QueryOptions<PoolSnapshotEntry>];
    response: PoolSnapshotEntry;
  };

  'pool.snapshot.hold': {
    params: [id: string, options?: PoolSnapshotHoldOptions];
    response: null;
  };

  'pool.snapshot.query': {
    params: [filters?: QueryFilters<PoolSnapshotEntry>, options?: QueryOptions<PoolSnapshotEntry>];
    response: PoolSnapshotEntry[] | PoolSnapshotEntry | PoolSnapshotQueryResultItem[] | PoolSnapshotQueryResultItem | number;
    entity: PoolSnapshotEntry;
  };

  'pool.snapshot.release': {
    params: [id: string, options?: PoolSnapshotReleaseOptions];
    response: null;
  };

  'pool.snapshot.rename': {
    params: [id: string, options: PoolSnapshotRenameOptions];
    response: null;
  };

  'pool.snapshot.rollback': {
    params: [id: string, options?: PoolSnapshotRollbackOptions];
    response: null;
  };

  'pool.snapshot.update': {
    params: [id: string, data: PoolSnapshotUpdate];
    response: PoolSnapshotCreateUpdateEntry;
  };

  'pool.snapshottask.create': {
    params: [data: PoolSnapshotTaskCreate];
    response: PeriodicSnapshotTaskEntry;
  };

  'pool.snapshottask.delete': {
    params: [id: number, options?: PoolSnapshotTaskDeleteOptions];
    response: true;
  };

  'pool.snapshottask.delete_will_change_retention_for': {
    params: [id: number];
    response: Record<string, string[]>;
  };

  'pool.snapshottask.get_instance': {
    params: [id: number, options?: QueryOptions<PeriodicSnapshotTaskEntry>];
    response: PeriodicSnapshotTaskEntry;
  };

  'pool.snapshottask.max_count': {
    params: [];
    response: number;
  };

  'pool.snapshottask.max_total_count': {
    params: [];
    response: number;
  };

  'pool.snapshottask.query': {
    params: [filters?: QueryFilters<PeriodicSnapshotTaskEntry>, options?: QueryOptions<PeriodicSnapshotTaskEntry>];
    response: PeriodicSnapshotTaskEntry[] | PeriodicSnapshotTaskEntry | PeriodicSnapshotTaskQueryResultItem[] | PeriodicSnapshotTaskQueryResultItem | number;
    entity: PeriodicSnapshotTaskEntry;
  };

  'pool.snapshottask.update': {
    params: [id: number, data: PoolSnapshotTaskUpdate];
    response: PeriodicSnapshotTaskEntry;
  };

  'pool.snapshottask.update_will_change_retention_for': {
    params: [id: number, data: PoolSnapshotTaskUpdateWillChangeRetentionFor];
    response: Record<string, string[]>;
  };

  'pool.upgrade': {
    params: [id: number];
    response: true;
  };

  'pool.validate_name': {
    params: [pool_name: string];
    response: true;
  };

  'privilege.create': {
    params: [privilege_create: PrivilegeCreate];
    response: PrivilegeEntry;
  };

  'privilege.delete': {
    params: [id: number];
    response: boolean;
  };

  'privilege.get_instance': {
    params: [id: number, options?: QueryOptions<PrivilegeEntry>];
    response: PrivilegeEntry;
  };

  'privilege.query': {
    params: [filters?: QueryFilters<PrivilegeEntry>, options?: QueryOptions<PrivilegeEntry>];
    response: PrivilegeEntry[] | PrivilegeEntry | PrivilegeQueryResultItem[] | PrivilegeQueryResultItem | number;
    entity: PrivilegeEntry;
  };

  'privilege.roles': {
    params: [filters?: QueryFilters<PrivilegeRolesEntry>, options?: QueryOptions<PrivilegeRolesEntry>];
    response: PrivilegeRolesEntry[] | PrivilegeRolesEntry | PrivilegeRolesQueryResultItem[] | PrivilegeRolesQueryResultItem | number;
    entity: PrivilegeRolesEntry;
  };

  'privilege.update': {
    params: [id: number, privilege_update: PrivilegeUpdate];
    response: PrivilegeEntry;
  };

  'rdma.capable_protocols': {
    params: [];
    response: ('ISER' | 'NFS' | 'NVMET')[];
  };

  'rdma.get_card_choices': {
    params: [];
    response: RdmaCardConfig[];
  };

  'replication.config.config': {
    params: [];
    response: ReplicationConfigEntry;
  };

  'replication.config.update': {
    params: [replication_config_update?: ReplicationConfigUpdateArgs];
    response: ReplicationConfigEntry;
  };

  'replication.count_eligible_manual_snapshots': {
    params: [count_eligible_manual_snapshots: ReplicationCountEligibleManualSnapshotsArgs];
    response: ReplicationCountEligibleManualSnapshotsResult;
  };

  'replication.create': {
    params: [replication_create: ReplicationCreate];
    response: ReplicationEntry;
  };

  'replication.create_dataset': {
    params: [dataset: string, transport: ReplicationCountEligibleManualSnapshotsTransportInput, ssh_credentials?: number | null];
    response: null;
  };

  'replication.delete': {
    params: [id: number];
    response: boolean;
  };

  'replication.get_instance': {
    params: [id: number, options?: QueryOptions<ReplicationEntry>];
    response: ReplicationEntry;
  };

  'replication.list_datasets': {
    params: [transport: ReplicationCountEligibleManualSnapshotsTransportInput, ssh_credentials?: number | null];
    response: string[];
  };

  'replication.list_naming_schemas': {
    params: [];
    response: string[];
  };

  'replication.query': {
    params: [filters?: QueryFilters<ReplicationEntry>, options?: QueryOptions<ReplicationEntry>];
    response: ReplicationEntry[] | ReplicationEntry | ReplicationQueryResultItem[] | ReplicationQueryResultItem | number;
    entity: ReplicationEntry;
  };

  'replication.restore': {
    params: [id: number, replication_restore: ReplicationRestoreOptions];
    response: ReplicationEntry;
  };

  'replication.target_unmatched_snapshots': {
    params: [direction: CloudSyncCreateDirectionInput, source_datasets: string[], target_dataset: string, transport: ReplicationCountEligibleManualSnapshotsTransportInput, ssh_credentials?: number | null];
    response: Record<string, string>;
  };

  'replication.update': {
    params: [id: number, replication_update: ReplicationUpdate];
    response: ReplicationEntry;
  };

  'reporting.config': {
    params: [];
    response: ReportingEntry;
  };

  'reporting.exporters.create': {
    params: [reporting_exporter_create: ReportingExportsCreateArgs];
    response: ReportingExportsEntry;
  };

  'reporting.exporters.delete': {
    params: [id: number];
    response: boolean;
  };

  'reporting.exporters.exporter_schemas': {
    params: [];
    response: ReportingExporterSchema[];
  };

  'reporting.exporters.get_instance': {
    params: [id: number, options?: QueryOptions<ReportingExportsEntry>];
    response: ReportingExportsEntry;
  };

  'reporting.exporters.query': {
    params: [filters?: QueryFilters<ReportingExportsEntry>, options?: QueryOptions<ReportingExportsEntry>];
    response: ReportingExportsEntry[] | ReportingExportsEntry | ReportingExportsQueryResultItem[] | ReportingExportsQueryResultItem | number;
    entity: ReportingExportsEntry;
  };

  'reporting.exporters.update': {
    params: [id: number, reporting_exporter_update: ReportingExporterUpdate];
    response: ReportingExportsEntry;
  };

  'reporting.get_data': {
    params: [graphs: GraphIdentifier[], query?: ReportingQuery];
    response: ReportingGetDataResponse[];
  };

  'reporting.graph': {
    params: [str: string, query?: ReportingQuery];
    response: ReportingGetDataResponse[];
  };

  'reporting.netdata_get_data': {
    params: [graphs: GraphIdentifier[], query?: ReportingQuery];
    response: ReportingGetDataResponse[];
  };

  'reporting.netdata_graph': {
    params: [str: string, query?: ReportingQuery];
    response: ReportingGetDataResponse[];
  };

  'reporting.update': {
    params: [reporting_update?: ReportingUpdateArgs];
    response: ReportingEntry;
  };

  'route.ipv4gw_reachable': {
    params: [ipv4_gateway: string];
    response: boolean;
  };

  'route.system_routes': {
    params: [filters?: QueryFilters<RouteSystemRoutesItem>, options?: QueryOptions<RouteSystemRoutesItem>];
    response: RouteSystemRoutesItem[] | RouteSystemRoutesItem | RouteSystemRoutesItemQueryResultItem[] | RouteSystemRoutesItemQueryResultItem | number;
    entity: RouteSystemRoutesItem;
  };

  'rsynctask.create': {
    params: [rsync_task_create: RsyncTaskCreate];
    response: RsyncTaskEntry;
  };

  'rsynctask.delete': {
    params: [id: number];
    response: boolean;
  };

  'rsynctask.get_instance': {
    params: [id: number, options?: QueryOptions<RsyncTaskEntry>];
    response: RsyncTaskEntry;
  };

  'rsynctask.query': {
    params: [filters?: QueryFilters<RsyncTaskEntry>, options?: QueryOptions<RsyncTaskEntry>];
    response: RsyncTaskEntry[] | RsyncTaskEntry | RsyncTaskQueryResultItem[] | RsyncTaskQueryResultItem | number;
    entity: RsyncTaskEntry;
  };

  'rsynctask.update': {
    params: [id: number, rsync_task_update: RsyncTaskUpdate];
    response: RsyncTaskEntry;
  };

  'service.get_instance': {
    params: [id: number, options?: QueryOptions<ServiceEntry>];
    response: ServiceEntry;
  };

  'service.query': {
    params: [filters?: QueryFilters<ServiceEntry>, options?: QueryOptions<ServiceEntry>];
    response: ServiceEntry[] | ServiceEntry | ServiceQueryResultItem[] | ServiceQueryResultItem | number;
    entity: ServiceEntry;
  };

  'service.started': {
    params: [service: string];
    response: boolean;
  };

  'service.started_or_enabled': {
    params: [service: string];
    response: boolean;
  };

  'service.update': {
    params: [id_or_name: number | string, service_update: ServiceUpdate];
    response: number;
  };

  'sharing.nfs.create': {
    params: [data: NfsShareCreate];
    response: SharingNFSEntry;
  };

  'sharing.nfs.delete': {
    params: [id: number];
    response: true;
  };

  'sharing.nfs.get_instance': {
    params: [id: number, options?: QueryOptions<SharingNFSEntry>];
    response: SharingNFSEntry;
  };

  'sharing.nfs.query': {
    params: [filters?: QueryFilters<SharingNFSEntry>, options?: QueryOptions<SharingNFSEntry>];
    response: SharingNFSEntry[] | SharingNFSEntry | SharingNFSQueryResultItem[] | SharingNFSQueryResultItem | number;
    entity: SharingNFSEntry;
  };

  'sharing.nfs.update': {
    params: [id: number, data: NfsShareUpdate];
    response: SharingNFSEntry;
  };

  'sharing.smb.create': {
    params: [data: SmbShareCreate];
    response: SharingSMBEntry;
  };

  'sharing.smb.delete': {
    params: [id: number];
    response: true;
  };

  'sharing.smb.get_instance': {
    params: [id: number, options?: QueryOptions<SharingSMBEntry>];
    response: SharingSMBEntry;
  };

  'sharing.smb.getacl': {
    params: [smb_getacl: SharingSMBGetaclArgs];
    response: SMBShareAcl;
  };

  'sharing.smb.presets': {
    params: [];
    response: Record<string, Record<string, unknown>>;
  };

  'sharing.smb.query': {
    params: [filters?: QueryFilters<SharingSMBEntry>, options?: QueryOptions<SharingSMBEntry>];
    response: SharingSMBEntry[] | SharingSMBEntry | SharingSMBQueryResultItem[] | SharingSMBQueryResultItem | number;
    entity: SharingSMBEntry;
  };

  'sharing.smb.setacl': {
    params: [smb_setacl: SharingSMBSetaclArgs];
    response: SMBShareAcl;
  };

  'sharing.smb.share_precheck': {
    params: [smb_share_precheck?: SharingSMBSharePrecheckArgs];
    response: null;
  };

  'sharing.smb.update': {
    params: [id: number, data: SmbShareUpdate];
    response: SharingSMBEntry;
  };

  'smb.bindip_choices': {
    params: [];
    response: Record<string, string>;
  };

  'smb.config': {
    params: [];
    response: SMBEntry;
  };

  'smb.unixcharset_choices': {
    params: [];
    response: Record<string, 'UTF-8' | 'GB2312' | 'HZ-GB-2312' | 'CP1361' | 'BIG5' | 'BIG5HKSCS' | 'CP037' | 'CP273' | 'CP424' | 'CP437' | 'CP500' | 'CP775' | 'CP850' | 'CP852' | 'CP855' | 'CP857' | 'CP858' | 'CP860' | 'CP861' | 'CP862' | 'CP863' | 'CP864' | 'CP865' | 'CP866' | 'CP869' | 'CP932' | 'CP949' | 'CP950' | 'CP1026' | 'CP1125' | 'CP1140' | 'CP1250' | 'CP1251' | 'CP1252' | 'CP1253' | 'CP1254' | 'CP1255' | 'CP1256' | 'CP1257' | 'CP1258' | 'EUC_JIS_2004' | 'EUC_JISX0213' | 'EUC_JP' | 'EUC_KR' | 'GB18030' | 'GBK' | 'HZ' | 'ISO2022_JP' | 'ISO2022_JP_1' | 'ISO2022_JP_2' | 'ISO2022_JP_2004' | 'ISO2022_JP_3' | 'ISO2022_JP_EXT' | 'ISO2022_KR' | 'ISO8859_1' | 'ISO8859_2' | 'ISO8859_3' | 'ISO8859_4' | 'ISO8859_5' | 'ISO8859_6' | 'ISO8859_7' | 'ISO8859_8' | 'ISO8859_9' | 'ISO8859_10' | 'ISO8859_11' | 'ISO8859_13' | 'ISO8859_14' | 'ISO8859_15' | 'ISO8859_16' | 'JOHAB' | 'KOI8_R' | 'KZ1048' | 'LATIN_1' | 'MAC_CYRILLIC' | 'MAC_GREEK' | 'MAC_ICELAND' | 'MAC_LATIN2' | 'MAC_ROMAN' | 'MAC_TURKISH' | 'PTCP154' | 'SHIFT_JIS' | 'SHIFT_JIS_2004' | 'SHIFT_JISX0213' | 'TIS_620' | 'UTF_16' | 'UTF_16_BE' | 'UTF_16_LE'>;
  };

  'smb.update': {
    params: [smb_update?: SMBUpdateArgs];
    response: SMBEntry;
  };

  'snmp.config': {
    params: [];
    response: SNMPEntry;
  };

  'snmp.update': {
    params: [snmp_update?: SNMPUpdateArgs];
    response: SNMPEntry;
  };

  'ssh.bindiface_choices': {
    params: [];
    response: Record<string, string>;
  };

  'ssh.config': {
    params: [];
    response: SSHEntry;
  };

  'ssh.update': {
    params: [data: SSHUpdate];
    response: SSHEntry;
  };

  'staticroute.create': {
    params: [data: StaticRouteCreate];
    response: StaticRouteEntry;
  };

  'staticroute.delete': {
    params: [id: number];
    response: boolean;
  };

  'staticroute.get_instance': {
    params: [id: number, options?: QueryOptions<StaticRouteEntry>];
    response: StaticRouteEntry;
  };

  'staticroute.query': {
    params: [filters?: QueryFilters<StaticRouteEntry>, options?: QueryOptions<StaticRouteEntry>];
    response: StaticRouteEntry[] | StaticRouteEntry | StaticRouteQueryResultItem[] | StaticRouteQueryResultItem | number;
    entity: StaticRouteEntry;
  };

  'staticroute.update': {
    params: [id: number, data: StaticRouteUpdate];
    response: StaticRouteEntry;
  };

  'support.attach_ticket_max_size': {
    params: [];
    response: number;
  };

  'support.config': {
    params: [];
    response: SupportEntry;
  };

  'support.fields': {
    params: [];
    response: string[][];
  };

  'support.is_available': {
    params: [];
    response: boolean;
  };

  'support.is_available_and_enabled': {
    params: [];
    response: boolean;
  };

  'support.similar_issues': {
    params: [query: string];
    response: SupportSimilarIssue[];
  };

  'support.update': {
    params: [data: SupportUpdate];
    response: SupportEntry;
  };

  'system.advanced.config': {
    params: [];
    response: SystemAdvancedEntry;
  };

  'system.advanced.get_gpu_pci_choices': {
    params: [];
    response: Record<string, unknown>;
  };

  'system.advanced.login_banner': {
    params: [];
    response: string;
  };

  'system.advanced.sed_global_password': {
    params: [];
    response: string;
  };

  'system.advanced.sed_global_password_is_set': {
    params: [];
    response: boolean;
  };

  'system.advanced.serial_port_choices': {
    params: [];
    response: Record<string, string>;
  };

  'system.advanced.syslog_certificate_authority_choices': {
    params: [];
    response: EmptyDict;
  };

  'system.advanced.syslog_certificate_choices': {
    params: [];
    response: Record<string, string>;
  };

  'system.advanced.update': {
    params: [data: SystemAdvancedUpdate];
    response: SystemAdvancedEntry;
  };

  'system.advanced.update_gpu_pci_ids': {
    params: [data: string[]];
    response: null;
  };

  'system.boot_id': {
    params: [];
    response: string;
  };

  'system.feature_enabled': {
    params: [feature: Feature];
    response: boolean;
  };

  'system.general.checkin': {
    params: [];
    response: null;
  };

  'system.general.checkin_waiting': {
    params: [];
    response: number | null;
  };

  'system.general.config': {
    params: [];
    response: SystemGeneralEntry;
  };

  'system.general.country_choices': {
    params: [];
    response: Record<string, string>;
  };

  'system.general.kbdmap_choices': {
    params: [];
    response: Record<string, string>;
  };

  'system.general.local_url': {
    params: [];
    response: string;
  };

  'system.general.timezone_choices': {
    params: [];
    response: Record<string, string>;
  };

  'system.general.ui_address_choices': {
    params: [];
    response: Record<string, string>;
  };

  'system.general.ui_certificate_choices': {
    params: [];
    response: Record<string, string>;
  };

  'system.general.ui_httpsprotocols_choices': {
    params: [];
    response: Record<string, string>;
  };

  'system.general.ui_restart': {
    params: [delay?: number];
    response: null;
  };

  'system.general.ui_v6address_choices': {
    params: [];
    response: Record<string, string>;
  };

  'system.general.update': {
    params: [general_settings?: SystemGeneralUpdateArgs];
    response: SystemGeneralEntry;
  };

  'system.global.id': {
    params: [];
    response: string;
  };

  'system.host_id': {
    params: [];
    response: string;
  };

  'system.info': {
    params: [];
    response: SystemInfoResult;
  };

  'system.license_update': {
    params: [license: string];
    response: null;
  };

  'system.ntpserver.create': {
    params: [ntp_server_create: NTPServerCreate];
    response: NTPServerEntry;
  };

  'system.ntpserver.delete': {
    params: [id: number];
    response: true;
  };

  'system.ntpserver.get_instance': {
    params: [id: number, options?: QueryOptions<NTPServerEntry>];
    response: NTPServerEntry;
  };

  'system.ntpserver.query': {
    params: [filters?: QueryFilters<NTPServerEntry>, options?: QueryOptions<NTPServerEntry>];
    response: NTPServerEntry[] | NTPServerEntry | NTPServerQueryResultItem[] | NTPServerQueryResultItem | number;
    entity: NTPServerEntry;
  };

  'system.ntpserver.update': {
    params: [id: number, ntp_server_update: NTPServerUpdate];
    response: NTPServerEntry;
  };

  'system.product_type': {
    params: [];
    response: SystemProductTypeResult;
  };

  'system.ready': {
    params: [];
    response: boolean;
  };

  'system.reboot.info': {
    params: [];
    response: RebootInfo;
  };

  'system.release_notes_url': {
    params: [version_str?: string | null];
    response: string;
  };

  'system.security.config': {
    params: [];
    response: SystemSecurityEntry;
  };

  'system.security.info.fips_available': {
    params: [];
    response: boolean;
  };

  'system.security.info.fips_enabled': {
    params: [];
    response: boolean;
  };

  'system.state': {
    params: [];
    response: SystemStateResult;
  };

  'system.version': {
    params: [];
    response: string;
  };

  'system.version_short': {
    params: [];
    response: string;
  };

  'systemdataset.config': {
    params: [];
    response: SystemDatasetEntry;
  };

  'systemdataset.pool_choices': {
    params: [include_current_pool?: boolean];
    response: Record<string, string>;
  };

  'tn_connect.config': {
    params: [];
    response: TrueNASConnectEntry;
  };

  'tn_connect.generate_claim_token': {
    params: [];
    response: string;
  };

  'tn_connect.get_registration_uri': {
    params: [];
    response: string;
  };

  'tn_connect.update': {
    params: [tn_connect_update?: TrueNASConnectUpdateArgs];
    response: TrueNASConnectEntry;
  };

  'truecommand.config': {
    params: [];
    response: TruecommandEntry;
  };

  'truecommand.update': {
    params: [truecommand_update?: TruecommandUpdateArgs];
    response: TruecommandEntry;
  };

  'truenas.accept_eula': {
    params: [];
    response: null;
  };

  'truenas.get_chassis_hardware': {
    params: [];
    response: string;
  };

  'truenas.get_eula': {
    params: [];
    response: string | null;
  };

  'truenas.is_eula_accepted': {
    params: [];
    response: boolean;
  };

  'truenas.is_ix_hardware': {
    params: [];
    response: boolean;
  };

  'truenas.is_production': {
    params: [];
    response: boolean;
  };

  'truenas.managed_by_truecommand': {
    params: [];
    response: boolean;
  };

  'tunable.get_instance': {
    params: [id: number, options?: QueryOptions<TunableEntry>];
    response: TunableEntry;
  };

  'tunable.query': {
    params: [filters?: QueryFilters<TunableEntry>, options?: QueryOptions<TunableEntry>];
    response: TunableEntry[] | TunableEntry | TunableQueryResultItem[] | TunableQueryResultItem | number;
    entity: TunableEntry;
  };

  'tunable.tunable_type_choices': {
    params: [];
    response: TunableTunableTypeChoices;
  };

  'update.available_versions': {
    params: [];
    response: UpdateAvailableVersion[];
  };

  'update.config': {
    params: [];
    response: UpdateEntry;
  };

  'update.profile_choices': {
    params: [];
    response: Record<string, UpdateProfileChoice>;
  };

  'update.status': {
    params: [];
    response: UpdateStatus;
  };

  'update.update': {
    params: [data: UpdateUpdate];
    response: UpdateEntry;
  };

  'ups.config': {
    params: [];
    response: UPSEntry;
  };

  'ups.driver_choices': {
    params: [];
    response: Record<string, string>;
  };

  'ups.port_choices': {
    params: [];
    response: string[];
  };

  'ups.update': {
    params: [ups_update?: UPSUpdateArgs];
    response: UPSEntry;
  };

  'user.create': {
    params: [user_create: UserCreate];
    response: UserCreateUpdateResult;
  };

  'user.delete': {
    params: [id: number, options?: UserDeleteOptions];
    response: number;
  };

  'user.get_instance': {
    params: [id: number, options?: QueryOptions<UserEntry>];
    response: UserEntry;
  };

  'user.get_next_uid': {
    params: [];
    response: number;
  };

  'user.get_user_obj': {
    params: [get_user_obj?: UserGetUserObjArgs];
    response: UserGetUserObj;
  };

  'user.has_local_administrator_set_up': {
    params: [];
    response: boolean;
  };

  'user.query': {
    params: [filters?: QueryFilters<UserEntry>, options?: QueryOptions<UserEntry>];
    response: UserEntry[] | UserEntry | UserQueryResultItem[] | UserQueryResultItem | number;
    entity: UserEntry;
  };

  'user.renew_2fa_secret': {
    params: [username: string, twofactor_options: TwofactorOptions];
    response: UserRenew2FaSecretResult;
  };

  'user.set_password': {
    params: [set_password_data: UserSetPasswordArgs];
    response: null;
  };

  'user.setup_local_administrator': {
    params: [username: Username, password: string, options?: UserSetupLocalAdministratorOptions];
    response: null;
  };

  'user.shell_choices': {
    params: [group_ids?: number[]];
    response: Record<string, unknown>;
  };

  'user.unset_2fa_secret': {
    params: [username: string];
    response: null;
  };

  'user.update': {
    params: [id: number, user_update: UserUpdate];
    response: UserCreateUpdateResult;
  };

  'virt.device.disk_choices': {
    params: [];
    response: Record<string, string>;
  };

  'virt.device.gpu_choices': {
    params: [gpu_type: 'PHYSICAL' | 'MDEV' | 'MIG' | 'SRIOV'];
    response: Record<string, VirtDeviceGpuChoice>;
  };

  'virt.device.nic_choices': {
    params: [nic_type: 'BRIDGED' | 'MACVLAN'];
    response: Record<string, string>;
  };

  'virt.device.pci_choices': {
    params: [];
    response: Record<string, unknown>;
  };

  'virt.device.usb_choices': {
    params: [];
    response: Record<string, VirtDeviceUsbChoice>;
  };

  'virt.global.bridge_choices': {
    params: [];
    response: Record<string, unknown>;
  };

  'virt.global.config': {
    params: [];
    response: VirtGlobalEntry;
  };

  'virt.global.get_network': {
    params: [name: string];
    response: VirtGlobalNetwork;
  };

  'virt.global.pool_choices': {
    params: [];
    response: Record<string, unknown>;
  };

  'virt.instance.device_add': {
    params: [id: string, device: VirtDeviceType];
    response: true;
  };

  'virt.instance.device_delete': {
    params: [id: string, name: string];
    response: true;
  };

  'virt.instance.device_list': {
    params: [id: string];
    response: VirtDeviceType[];
  };

  'virt.instance.device_update': {
    params: [id: string, device: VirtDeviceType];
    response: true;
  };

  'virt.instance.get_instance': {
    params: [id: string, options?: QueryOptions<VirtInstanceEntry>];
    response: VirtInstanceEntry;
  };

  'virt.instance.image_choices': {
    params: [virt_instances_image_choices?: { remote?: 'LINUX_CONTAINERS' }];
    response: Record<string, VirtInstanceImageChoice>;
  };

  'virt.instance.query': {
    params: [filters?: QueryFilters<VirtInstanceEntry>, options?: QueryOptions<VirtInstanceEntry>];
    response: VirtInstanceEntry[] | VirtInstanceEntry | VirtInstanceQueryResultItem[] | VirtInstanceQueryResultItem | number;
    entity: VirtInstanceEntry;
  };

  'virt.instance.set_bootable_disk': {
    params: [id: string, disk: string];
    response: boolean;
  };

  'virt.volume.create': {
    params: [virt_volume_create: VirtVolumeCreate];
    response: VirtVolumeEntry;
  };

  'virt.volume.delete': {
    params: [id: string];
    response: true;
  };

  'virt.volume.get_instance': {
    params: [id: string, options?: QueryOptions<VirtVolumeEntry>];
    response: VirtVolumeEntry;
  };

  'virt.volume.query': {
    params: [filters?: QueryFilters<VirtVolumeEntry>, options?: QueryOptions<VirtVolumeEntry>];
    response: VirtVolumeEntry[] | VirtVolumeEntry | VirtVolumeQueryResultItem[] | VirtVolumeQueryResultItem | number;
    entity: VirtVolumeEntry;
  };

  'virt.volume.update': {
    params: [id: string, virt_volume_update: VirtVolumeUpdate];
    response: VirtVolumeEntry;
  };

  'vm.bootloader_options': {
    params: [];
    response: VMBootloaderOptionsResult;
  };

  'vm.bootloader_ovmf_choices': {
    params: [];
    response: VMBootloaderOvmfChoicesResult;
  };

  'vm.clone': {
    params: [id: number, name?: string | null];
    response: boolean;
  };

  'vm.cpu_model_choices': {
    params: [];
    response: VMCpuModelChoicesResult;
  };

  'vm.create': {
    params: [vm_create: VMCreateArgs];
    response: VMEntry;
  };

  'vm.delete': {
    params: [id: number, options?: VMDeleteOptions];
    response: boolean;
  };

  'vm.device.bind_choices': {
    params: [];
    response: VMDeviceBindChoicesResult;
  };

  'vm.device.create': {
    params: [vm_device_create: VMDeviceCreateArgs];
    response: VMDeviceEntry;
  };

  'vm.device.delete': {
    params: [id: number, options?: VMDeviceDeleteOptions];
    response: boolean;
  };

  'vm.device.disk_choices': {
    params: [];
    response: VMDeviceDiskChoices;
  };

  'vm.device.get_instance': {
    params: [id: number, options?: QueryOptions<VMDeviceEntry>];
    response: VMDeviceEntry;
  };

  'vm.device.iommu_enabled': {
    params: [];
    response: boolean;
  };

  'vm.device.iotype_choices': {
    params: [];
    response: VMDeviceIotypeChoicesResult;
  };

  'vm.device.nic_attach_choices': {
    params: [];
    response: VMDeviceNicAttachChoicesResult;
  };

  'vm.device.passthrough_device': {
    params: [device: string];
    response: VMDevicePassthroughDevice;
  };

  'vm.device.passthrough_device_choices': {
    params: [];
    response: VMDevicePassthroughInfo;
  };

  'vm.device.query': {
    params: [filters?: QueryFilters<VMDeviceEntry>, options?: QueryOptions<VMDeviceEntry>];
    response: VMDeviceEntry[] | VMDeviceEntry | VMDeviceQueryResultItem[] | VMDeviceQueryResultItem | number;
    entity: VMDeviceEntry;
  };

  'vm.device.update': {
    params: [id: number, vm_device_update: VMDeviceUpdate];
    response: VMDeviceEntry;
  };

  'vm.device.usb_controller_choices': {
    params: [];
    response: VMDeviceUsbControllerChoicesResult;
  };

  'vm.device.usb_passthrough_choices': {
    params: [];
    response: USBPassthroughInfo;
  };

  'vm.device.usb_passthrough_device': {
    params: [device: string];
    response: USBPassthroughDevice;
  };

  'vm.flags': {
    params: [];
    response: VMFlagsResult;
  };

  'vm.get_available_memory': {
    params: [overcommit?: boolean];
    response: number;
  };

  'vm.get_console': {
    params: [id: number];
    response: string;
  };

  'vm.get_display_devices': {
    params: [id: number];
    response: DisplayDevice[];
  };

  'vm.get_display_web_uri': {
    params: [id: number, host?: string, options?: DisplayWebURIOptions];
    response: VMGetDisplayWebUriResult;
  };

  'vm.get_instance': {
    params: [id: number, options?: QueryOptions<VMEntry>];
    response: VMEntry;
  };

  'vm.get_memory_usage': {
    params: [id: number];
    response: number;
  };

  'vm.get_vm_memory_info': {
    params: [id: number];
    response: VMGetVmMemoryInfoResult;
  };

  'vm.get_vmemory_in_use': {
    params: [];
    response: VMGetVmemoryInUseResult;
  };

  'vm.guest_architecture_and_machine_choices': {
    params: [];
    response: VMGuestArchitectureAndMachineChoicesResult;
  };

  'vm.log_file_path': {
    params: [id: number];
    response: string | null;
  };

  'vm.maximum_supported_vcpus': {
    params: [];
    response: number;
  };

  'vm.port_wizard': {
    params: [];
    response: VMPortWizardResult;
  };

  'vm.poweroff': {
    params: [id: number];
    response: null;
  };

  'vm.query': {
    params: [filters?: QueryFilters<VMEntry>, options?: QueryOptions<VMEntry>];
    response: VMEntry[] | VMEntry | VMQueryResultItem[] | VMQueryResultItem | number;
    entity: VMEntry;
  };

  'vm.random_mac': {
    params: [];
    response: string;
  };

  'vm.resolution_choices': {
    params: [];
    response: Record<string, string>;
  };

  'vm.resume': {
    params: [id: number];
    response: null;
  };

  'vm.start': {
    params: [id: number, options?: VMStartOptions];
    response: null;
  };

  'vm.status': {
    params: [id: number];
    response: VMStatus;
  };

  'vm.supports_virtualization': {
    params: [];
    response: boolean;
  };

  'vm.suspend': {
    params: [id: number];
    response: null;
  };

  'vm.update': {
    params: [id: number, vm_update: VMUpdate];
    response: VMEntry;
  };

  'vm.virtualization_details': {
    params: [];
    response: VMVirtualizationDetailsResult;
  };

  'vmware.create': {
    params: [vmware_create: VMWareCreate];
    response: VMWareEntry;
  };

  'vmware.dataset_has_vms': {
    params: [dataset: string, recursive: boolean];
    response: boolean;
  };

  'vmware.delete': {
    params: [id: number];
    response: true;
  };

  'vmware.get_datastores': {
    params: [vmware_creds: VMWareGetDatastoresArgs];
    response: string[];
  };

  'vmware.get_instance': {
    params: [id: number, options?: QueryOptions<VMWareEntry>];
    response: VMWareEntry;
  };

  'vmware.match_datastores_with_datasets': {
    params: [vmware_creds: VMWareMatchDatastoresWithDatasetsArgs];
    response: VMWareMatchDatastoresWithDatasetsResult;
  };

  'vmware.query': {
    params: [filters?: QueryFilters<VMWareEntry>, options?: QueryOptions<VMWareEntry>];
    response: VMWareEntry[] | VMWareEntry | VMWareQueryResultItem[] | VMWareQueryResultItem | number;
    entity: VMWareEntry;
  };

  'vmware.update': {
    params: [id: number, vmware_update: VMWareUpdate];
    response: VMWareEntry;
  };

  'webui.crypto.csr_profiles': {
    params: [];
    response: CSRProfilesModel;
  };

  'webui.crypto.get_certificate_domain_names': {
    params: [cert_id: number];
    response: unknown[];
  };

  'webui.enclosure.dashboard': {
    params: [];
    response: (Record<string, unknown>)[];
  };

  'webui.main.dashboard.sys_info': {
    params: [];
    response: SysInfo;
  };

  'zfs.resource.query': {
    params: [data?: ZFSResourceQuery];
    response: ZFSResourceEntry[];
  };
}
