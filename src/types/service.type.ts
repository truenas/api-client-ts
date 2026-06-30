/**
 * Service management types for TrueNAS service control API
 */

/**
 * Service state enumeration
 */
export enum ServiceState {
  Running = 'RUNNING',
  Stopped = 'STOPPED',
  Unknown = 'UNKNOWN',
}

/**
 * Service control action enumeration
 */
export enum ServiceControlAction {
  Start = 'START',
  Stop = 'STOP',
  Restart = 'RESTART',
  Reload = 'RELOAD',
}

/**
 * Service entry returned by service.query
 */
export interface ServiceEntry {
  /** Unique identifier for the service */
  id: number;
  /** Name of the system service */
  service: string;
  /** Whether the service is enabled to start on boot */
  enable: boolean;
  /** Current state of the service */
  state: ServiceState;
  /** Array of process IDs associated with this service */
  pids: number[];
}

/**
 * Options for service control operations
 */
export interface ServiceOptions {
  /** Whether to propagate the service operation to the HA peer in a high-availability setup */
  ha_propagate?: boolean;
  /** Return false instead of an error if the operation fails */
  silent?: boolean;
  /** Maximum time in seconds to wait for the service operation to complete. null for no timeout */
  timeout?: number | null;
}

/**
 * Service update configuration
 */
export interface ServiceUpdate {
  /** Whether the service should start on boot */
  enable: boolean;
}
