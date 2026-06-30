export interface ZfsSnapshot {
  /** Full snapshot name including dataset (e.g., pool/dataset@snapshot) */
  name: string;
  /** Dataset name */
  dataset: string;
  /** Snapshot name without dataset prefix */
  snapshot_name: string;
}

export interface CreateZfsSnapshot {
  /** Dataset to snapshot */
  dataset: string;
  /** Optional: Pattern to generate snapshot name (e.g., auto-%Y%m%d.%H%M%S) */
  naming_schema?: string;
  /** Optional: Explicit snapshot name */
  name?: string;
  /** Optional: Snapshot children recursively */
  recursive?: boolean;
  /** Optional: Sync VMware VMs before snapshot */
  vmware_sync?: boolean;
  /** Optional: ZFS properties to set on snapshot */
  properties?: Record<string, unknown>;
}

export interface EligibleSnapshotsCount {
  /** Total number of snapshots */
  total: number;
  /** Number of snapshots matching the naming schema/regex */
  eligible: number;
}

export interface CountEligibleSnapshotsParams {
  /** Source datasets to check */
  datasets: string[];
  /** Transport method */
  transport: string;
  /** SSH credentials ID (for SSH transport) */
  ssh_credentials?: number;
  /** Naming schema pattern to match */
  naming_schema?: string[];
  /** Name regex pattern to match */
  name_regex?: string;
}
