export enum FailoverStatus {
  Master = 'MASTER',
  Backup = 'BACKUP',
  Electing = 'ELECTING',
  Importing = 'IMPORTING',
  Error = 'ERROR',
  Single = 'SINGLE',
}

export enum FailoverDisabledReason {
  NoCriticalInterfaces = 'NO_CRITICAL_INTERFACES',
  MismatchDisks = 'MISMATCH_DISKS',
  MismatchVersions = 'MISMATCH_VERSIONS',
  MismatchNics = 'MISMATCH_NICS',
  DisagreeVip = 'DISAGREE_VIP',
  NoLicense = 'NO_LICENSE',
  NoFailover = 'NO_FAILOVER',
  NoPong = 'NO_PONG',
  NoVolume = 'NO_VOLUME',
  NoVip = 'NO_VIP',
  NoSystemReady = 'NO_SYSTEM_READY',
  NoFenced = 'NO_FENCED',
  RemFailoverOngoing = 'REM_FAILOVER_ONGOING',
  LocFailoverOngoing = 'LOC_FAILOVER_ONGOING',
  NoHeartbeatIface = 'NO_HEARTBEAT_IFACE',
  NoCarrierOnHeartbeat = 'NO_CARRIER_ON_HEARTBEAT',
  LocFipsRebootReq = 'LOC_FIPS_REBOOT_REQ',
  RemFipsRebootReq = 'REM_FIPS_REBOOT_REQ',
  LocGposstigRebootReq = 'LOC_GPOSSTIG_REBOOT_REQ',
  RemGposstigRebootReq = 'REM_GPOSSTIG_REBOOT_REQ',
  LocUpgradeRebootReq = 'LOC_UPGRADE_REBOOT_REQ',
  RemUpgradeRebootReq = 'REM_UPGRADE_REBOOT_REQ',
  LocSystemDatasetMigrationInProgress = 'LOC_SYSTEM_DATASET_MIGRATION_IN_PROGRESS',
  RemSystemDatasetMigrationInProgress = 'REM_SYSTEM_DATASET_MIGRATION_IN_PROGRESS',
}

export type FailoverNode = 'A' | 'B' | 'MANUAL';

export interface FailoverData {
  status: FailoverStatus;
  node: FailoverNode;
  disabledReasons: FailoverDisabledReason[];
}
