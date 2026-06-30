export enum UpdateStatusCode {
  Normal = 'NORMAL',
  Error = 'ERROR',
}

export interface UpdateManifest {
  filename: string;
  version: string;
  date: string;
  changelog: string;
  checksum: string;
  filesize: number;
  profile: string;
  train: string;
}

export interface CurrentVersion {
  train: string;
  profile: string;
  matches_profile: boolean;
}

export interface NewVersion {
  version: string;
  manifest: UpdateManifest;
  release_notes: string | null;
  release_notes_url: string;
}

export interface UpdateStatusResult {
  current_version?: CurrentVersion;
  new_version?: NewVersion;
}

export interface UpdateStatusResponse {
  code: UpdateStatusCode;
  status: UpdateStatusResult | null;
  error: string | null;
  update_download_progress: unknown;
}
