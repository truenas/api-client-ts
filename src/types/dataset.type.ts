import { DatasetType } from '@/enums/dataset-type.enum';

export interface DatasetProperty {
  parsed: string | number | boolean;
  rawvalue: string;
  source: string;
  source_info: string;
  value: string;
}

export interface Dataset {
  aclmode: DatasetProperty;
  acltype: DatasetProperty;
  atime: DatasetProperty;
  available: DatasetProperty;
  casesensitivity: DatasetProperty;
  children: Dataset[];
  compression: DatasetProperty;
  compressratio: DatasetProperty;
  copies: DatasetProperty;
  creation: DatasetProperty;
  deduplication: DatasetProperty;
  encryption_algorithm: DatasetProperty;
  exec: DatasetProperty;
  key_format: DatasetProperty;
  origin: DatasetProperty;
  pbkdf2iters: DatasetProperty;
  quota: DatasetProperty;
  readonly: DatasetProperty;
  checksum: DatasetProperty;
  recordsize: DatasetProperty;
  refquota: DatasetProperty;
  refreservation: DatasetProperty;
  reservation: DatasetProperty;
  snapdev: DatasetProperty;
  snapdir: DatasetProperty;
  special_small_block_size: DatasetProperty;
  sync: DatasetProperty;
  used: DatasetProperty;
  usedbychildren: DatasetProperty;
  usedbydataset: DatasetProperty;
  usedbyrefreservation: DatasetProperty;
  usedbysnapshots: DatasetProperty;
  xattr: DatasetProperty;
  encrypted: boolean;
  key_loaded: boolean;
  locked: boolean;
  mountpoint: string;
  name: string;
  pool: string;
  type: DatasetType;
  id: string;
}

/**
 * Minimal interface for root dataset statistics.
 * Contains only the fields fetched and used by pool statistics calculations.
 * This prevents accidental usage of properties that aren't being fetched.
 */
export interface RootDataset {
  name: string;
  available: DatasetProperty;
  used: DatasetProperty;
}
