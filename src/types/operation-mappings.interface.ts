import { Observable } from 'rxjs';
import {
  Container,
  ContainerDeleteOptions,
  ContainerRestartOptions,
  ContainerStopOptions,
} from '@/types/container.type';
import { Job } from '@/types/job.type';
import {
  SmbStatusRequest,
  SmbStatusResponse,
} from '@/types/smb-status.type';

/**
 * Version-agnostic operations; each client's `createOperations()` maps them
 * onto its version's endpoints.
 *
 * `Observable<Job | null>` operations emit Job updates while a server job runs,
 * or a single `null` when the call is synchronous, then complete. Adding a
 * member fails compilation in every client until it is implemented.
 */
export interface OperationMappings {
  // ═══════════════════════════════════════════════════════════════════════════
  // Container Operations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Query all containers
   * - v25.10: virt.instance.query with type=CONTAINER filter
   * - v26+: container.query
   */
  containerQuery: () => Observable<Container[]>;

  /**
   * Start a container
   * - v25.10: Emits Job updates until started
   * - v26+: Emits null (synchronous operation)
   */
  containerStart: (id: string) => Observable<Job | null>;

  /**
   * Stop a container
   * - v25.10: Emits Job updates until stopped
   * - v26+: Emits Job updates until stopped
   */
  containerStop: (
    id: string,
    options: ContainerStopOptions
  ) => Observable<Job | null>;

  /**
   * Restart a container
   * - v25.10: Emits Job updates until restarted
   * - v26+: Emits Job updates (stop phase), then null (sync start)
   */
  containerRestart: (
    id: string,
    options: ContainerRestartOptions
  ) => Observable<Job | null>;

  /**
   * Delete a container
   * - v25.10: `virt.instance.delete` — emits Job updates
   * - v26+: `container.delete` — emits Job updates
   *
   * `options` are honoured on v26+ only; on v25.10 they are ignored with a
   * logged warning.
   */
  containerDelete: (
    id: string,
    options?: ContainerDeleteOptions
  ) => Observable<Job | null>;

  // ═══════════════════════════════════════════════════════════════════════════
  // SMB Operations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Read SMB server status — sessions, shares, locks, notifications.
   *
   * - v26+: `smb.status`, public and gated on the `SHARING_SMB_READ` role
   * - v25.10: the same method, but `private=True`: it declares no roles, so
   *   `SHARING_SMB_READ` is refused with `EACCES` and only a non-STIG full-admin
   *   session may call it. Each call also logs a warning server-side.
   *
   * Pass `options: { count: true }` for a client count.
   */
  smbStatus: (request?: SmbStatusRequest) => Observable<SmbStatusResponse>;

  // ═══════════════════════════════════════════════════════════════════════════
  // Future Operations (add here as needed)
  // ═══════════════════════════════════════════════════════════════════════════

  // Example: VM operations (when needed)
  // vmQuery: () => Observable<Vm[]>;
  // vmStart: (id: number, options?: VmStartOptions) => Observable<Job | null>;
  // vmStop: (id: number, options?: VmStopOptions) => Observable<Job | null>;
}
