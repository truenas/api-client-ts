import { Observable } from 'rxjs';
import {
  Container,
  ContainerRestartOptions,
  ContainerStopOptions,
} from './container.type';
import { Job } from './job.type';

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
 * 2. Implement in TrueNasApiClientV2510.createOperations()
 * 3. Implement in TrueNasApiClientV26.createOperations()
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Future Operations (add here as needed)
  // ═══════════════════════════════════════════════════════════════════════════

  // Example: VM operations (when needed)
  // vmQuery: () => Observable<Vm[]>;
  // vmStart: (id: number, options?: VmStartOptions) => Observable<Job | null>;
  // vmStop: (id: number, options?: VmStopOptions) => Observable<Job | null>;
}
