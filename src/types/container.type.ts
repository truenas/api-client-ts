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
 * Options for deleting a container (unified interface)
 *
 * Both are optional and both default to off, matching middleware. Neither has a
 * counterpart on v25.10 — `virt.instance.delete` takes an id and nothing else —
 * so the v25.10 client cannot honour them; it says so rather than dropping them
 * quietly, because `recursive` in particular destroys data.
 */
export interface ContainerDeleteOptions {
  /**
   * Stop the container first if it is not already stopped. Without it, v26+
   * refuses to delete a running or suspended container rather than tearing it
   * down underneath itself.
   */
  force?: boolean;
  /**
   * Destroy the container's dataset together with its child datasets and
   * snapshots, any clones of those snapshots wherever they live in the pool,
   * and any holds on them.
   *
   * Releasing a hold can break a replication task that depends on it, and none
   * of what this destroys is recoverable. Without it, v26+ refuses to delete a
   * container whose dataset has children or snapshots — which is the refusal
   * this option exists to override, deliberately.
   */
  recursive?: boolean;
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
