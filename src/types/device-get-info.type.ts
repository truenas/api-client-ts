export enum DeviceType {
  Gpu = 'GPU',
  Disk = 'DISK',
  Serial = 'SERIAL',
}

export interface GpuDevice {
  addr: {
    pci_slot: string;
    domain: string;
    bus: string;
    slot: string;
  };
  description: string;
  devices: {
    pci_id: string;
    pci_slot: string;
    vm_pci_slot: string;
  }[];
  vendor: string | null;
  uses_system_critical_devices: boolean;
  critical_reason: string;
  available_to_host: boolean;
}
