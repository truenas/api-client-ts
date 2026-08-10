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
