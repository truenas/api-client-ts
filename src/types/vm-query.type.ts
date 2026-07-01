export enum VmState {
  Running = 'RUNNING',
  Stopped = 'STOPPED',
  Suspended = 'SUSPENDED',
  Error = 'ERROR',
}

export enum VmDomainState {
  NoState = 'NOSTATE',
  Running = 'RUNNING',
  Blocked = 'BLOCKED',
  Paused = 'PAUSED',
  Shutdown = 'SHUTDOWN',
  Shutoff = 'SHUTOFF',
  Crashed = 'CRASHED',
  PmSuspended = 'PMSUSPENDED',
}

export interface VMStatus {
  state: VmState;
  pid: number | null;
  domain_state: VmDomainState;
}

export interface VMQuery {
  id: number;
  name: string;
  description: string;
  vcpus: number;
  cores: number;
  threads: number;
  /** memory usage in mebibytes (MiB) */
  memory: number;
  min_memory: number | null;
  autostart: boolean;
  cpu_mode: 'CUSTOM' | 'HOST-MODEL' | 'HOST-PASSTHROUGH';
  cpu_model: string | null;
  cpuset: string | null;
  nodeset: string | null;
  enable_cpu_topology_extension: boolean;
  pin_vcpus: boolean;
  suspend_on_snapshot: boolean;
  trusted_platform_module: boolean;
  hyperv_enlightenments: boolean;
  bootloader: 'UEFI_CSM' | 'UEFI';
  bootloader_ovmf: string;
  hide_from_msr: boolean;
  ensure_display_device: boolean;
  time: 'LOCAL' | 'UTC';
  shutdown_timeout: number;
  arch_type: string | null;
  machine_type: string | null;
  uuid: string | null;
  command_line_args: string;
  enable_secure_boot: boolean;
  devices: unknown[]; // Will be typed more specifically later if needed
  display_available: boolean;
  status: VMStatus;
}
