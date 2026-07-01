import { TrueNasDate } from '@/types/truenas-date.type';

export interface SystemInfo {
  version: string;
  buildtime: TrueNasDate;
  hostname: string;
  physmem: number;
  model: string;
  cores: number;
  physical_cores: number;
  loadavg: number[];
  uptime: string;
  uptime_seconds: number;
  system_serial: string;
  system_product: string;
  system_product_version: string;
  license: string;
  boottime: TrueNasDate;
  datetime: TrueNasDate;
  birthday: TrueNasDate;
  timezone: string;
  system_manufacturer: string;
  ecc_memory: boolean;
  remote_info?: SystemInfo;
}
