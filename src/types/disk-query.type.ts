export interface DiskQuery {
  identifier: string;
  name: string;
  subsystem: string;
  number: number;
  serial: string;
  lunid: string | null;
  size: number;
  description: string;
  transfermode: string;
  hddstandby: string;
  advpowermgmt: string;
  togglesmart: boolean;
  model: string;
  rotationrate: number | null;
  type: 'SSD' | 'HDD';
  devname: string;
  pool: string | null;
  enclosure: string | null;
}
