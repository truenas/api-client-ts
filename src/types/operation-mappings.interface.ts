import { Observable } from 'rxjs';
import {
  Container,
  ContainerDeleteOptions,
  ContainerRestartOptions,
  ContainerStopOptions,
} from '@/types/container.type';
import { Job } from '@/types/job.type';

/**
 * OperationMappings Interface
 *
 * Defines version-agnostic operations that abstract away API differences
 * between TrueNAS versions. Each API client version implements this interface
 * with its specific endpoint calls and response transformations.
 *
 * Operations return Observable<Job | null> that:
 * - For async operations: emits Job updates until complete, then completes
 * - For sync operations: emits null once, then completes
 *
 * Usage in components:
 * ```typescript
 * const truenas = this.truenasService.get(systemId);
 * truenas.ops.containerQuery().subscribe(containers => ...);
 *
 * // With progress dialog (recommended)
 * this.truenasService.trackWithDialog(
 *   truenas.ops.containerStart(id),
 *   'Starting container'
 * ).subscribe(() => console.log('Started'));
 *
 * // Without progress dialog
 * truenas.ops.containerStart(id).subscribe({
 *   next: (job) => job && console.log(job.progress),
 *   complete: () => console.log('Started')
 * });
 * ```
 *
 * Version mappings:
 * - v25.10: Uses virt.instance.* APIs (emits Job updates)
 * - v26+: Uses container.* APIs (some emit Job, some emit null)
 *
 * To add new operations:
 * 1. Add the method signature here
 * 2. Implement it in every client's `createOperations()` —
 *    `TrueNasApiClientV2510`, `TrueNasApiClientV26`, `TrueNasApiClientV27`
 *
 * This list used to name only v25.10 and v26, which is how a new operation
 * would have quietly missed v27. It is not the real safety net either: adding a
 * member here fails to compile in every client that has not implemented it, and
 * that is what actually enumerates them. Keep the list current, but trust the
 * compiler.
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
   * - v25.10: `virt.instance.delete`, already a job — emits Job updates
   * - v26+: `container.delete`, made a job in v26.0.0 — emits Job updates
   *
   * A job on every supported version, so unlike `containerStart` this one does
   * not change shape across them. It is exposed here because the alternative is
   * a caller reaching for `api.call('container.delete', …)`, which is the wrong
   * verb: the method moved out of the call directory when middleware made it a
   * job, so that does not compile on v26+ and would not track the job if it did.
   *
   * `options` are honoured on v26+ only. v25.10's `virt.instance.delete` takes
   * an id and nothing else; passing them there is logged rather than silently
   * ignored, because `recursive` destroys data that cannot be recovered.
   */
  containerDelete: (
    id: string,
    options?: ContainerDeleteOptions
  ) => Observable<Job | null>;

  // ═══════════════════════════════════════════════════════════════════════════
  // Future Operations (add here as needed)
  // ═══════════════════════════════════════════════════════════════════════════

  // Example: VM operations (when needed)
  // vmQuery: () => Observable<Vm[]>;
  // vmStart: (id: number, options?: VmStartOptions) => Observable<Job | null>;
  // vmStop: (id: number, options?: VmStopOptions) => Observable<Job | null>;
}
