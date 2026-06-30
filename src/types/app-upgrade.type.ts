export interface AppUpgradeParams {
  app_version: string;
}

export interface AppUpgradeSummary {
  latest_version: string;
  latest_human_version: string;
  upgrade_version: string;
  upgrade_human_version: string;
  available_versions_for_upgrade: AppVersion[];
}

export interface AppVersion {
  version: string;
  human_version: string;
  healthy: boolean;
  supported: boolean;
  last_update: string;
}
