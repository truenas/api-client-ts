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
  // SMB Operations
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Read SMB server status — sessions, shares, locks, notifications.
   *
   * - v25.10: `smb.status`, which is declared `private=True` there
   * - v26+: `smb.status`, public and gated on the `SHARING_SMB_READ` role
   *
   * The same method under the same name on both, taking the same four
   * positional arguments and returning the same `list | dict | int` union. That
   * is why this reads as one operation rather than a v26 feature with a v25.10
   * excuse, and why v25.10 returns real data instead of throwing.
   *
   * **The two versions are not equally reachable, though.** Being private on
   * v25.10 is not only a statement about documentation — it decides
   * authorization too, and this is the one respect in which the operation
   * cannot present a single face:
   *
   * - **v26+** declares `roles=['SHARING_SMB_READ']`, so any session holding
   *   that role may call it.
   * - **v25.10** declares no roles at all. Middleware registers a method with
   *   the role manager only `if roles:`, so `smb.status` is in no role's
   *   allowlist, and `authorize('CALL', 'smb.status')` fails for a role-scoped
   *   session with `Not authorized` (`EACCES`). A session holding exactly
   *   `SHARING_SMB_READ` — the role that works on v26+ — is refused on v25.10.
   * - What does reach it is a **non-STIG full-admin** session, whose allowlist
   *   is the wildcard `{ method: '*', resource: '*' }`. Under STIG, full admin
   *   is expanded to the union of its roles' allowlists instead of the
   *   wildcard, and `smb.status` is in none of them — so STIG full admin is
   *   refused on v25.10 as well.
   *
   * Nothing here pre-empts that. The operation does not inspect the session or
   * refuse ahead of the server; a caller lacking the authority gets
   * middleware's own error, on the version where it applies.
   *
   * It is the first operation whose v25.10 leg is invisible to `--dump-api`: no
   * generated v25.10 type describes `smb.status`, because the dump omits
   * private methods. The v25.10 client therefore asserts the method's existence
   * rather than reading it from the directory, and that assertion is checked
   * against middleware source, not against the dump. See
   * `TrueNasApiClientV2510.createOperations`.
   *
   * Calling a private method logs a warning server-side on every invocation.
   * That is accepted for v25.10, which is in maintenance; it is not a pattern
   * to extend to versions still taking features.
   *
   * A client count is this composed rather than given its own operation, since
   * it is the same endpoint with different options:
   *
   * ```typescript
   * truenas.ops
   *   .smbStatus({
   *     infoLevel: 'SESSIONS',
   *     options: { count: true },
   *     statusOptions: { fast: true },
   *   })
   *   .subscribe((count) => console.log(count as number));
   * ```
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
