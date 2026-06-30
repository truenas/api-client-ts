import { AppState } from '@/types/app-query.type';

/**
 * Unified Container type
 *
 * This interface provides a version-agnostic representation of a container.
 * It normalizes the response from different API versions:
 * - v25.10: virt.instance.query (filtered by type=CONTAINER)
 * - v26+: container.query
 *
 * Components should use this type instead of version-specific response types.
 */
export interface Container {
  id: string;
  name: string;
  status: AppState;
  autostart: boolean;
  description?: string;
  cpu?: string;
  memory?: number;
  image?: {
    description: string;
  };
}

/**
 * Options for stopping a container (unified interface)
 */
export interface ContainerStopOptions {
  timeout?: number;
  force: boolean;
}

/**
 * Options for restarting a container (unified interface)
 */
export interface ContainerRestartOptions {
  timeout?: number;
  force: boolean;
}

/**
 * v26+ container.stop options format
 */
export interface ContainerStopOptionsV26 {
  force: boolean;
  force_after_timeout: boolean;
}

/**
 * v26+ container.query response structure
 * Used internally for transformation to unified Container type
 */
export interface ContainerQueryV26 {
  id: number;
  uuid: string;
  name: string;
  description: string;
  autostart: boolean;
  status: {
    state: string;
    pid: number | null;
    domain_state: string | null;
  };
  cpuset: string | null;
  dataset: string;
  devices: ContainerDeviceV26[];
  time: string;
  shutdown_timeout: number;
  init: string;
  initdir: string | null;
  initenv: Record<string, string>;
  inituser: string | null;
  initgroup: string | null;
  idmap: {
    type: string;
  };
  capabilities_policy: string;
  capabilities_state: Record<string, unknown>;
}

export interface ContainerDeviceV26 {
  id: number;
  attributes: {
    dtype: string;
    usb?: {
      vendor_id: string;
      product_id: string;
    };
    device: string | null;
  };
  container: number;
}
