/**
 * The state `Container.status` is narrowed to, mapped from every version's
 * vocabulary by `toAppState` in `@/utils/app-state.utils`.
 *
 * `Stopped` is a positive claim that a container is at rest (a UI offers Start
 * on it), so paused, in-progress, failed and unrecognised states each get their
 * own member rather than being rounded to it.
 */
export enum AppState {
  Running = 'RUNNING',
  Stopped = 'STOPPED',
  Stopping = 'STOPPING',
  Deploying = 'DEPLOYING',
  /** Paused with its state retained — not stopped, and resumable. */
  Suspended = 'SUSPENDED',
  /**
   * On its way to {@link Suspended}, not there yet. Separate because a caller
   * polling for "the memory is quiesced" must not be told so while the freeze
   * is still running.
   */
  Suspending = 'SUSPENDING',
  /** Middleware reports the instance as failed. */
  Error = 'ERROR',
  /** Middleware reports no usable state, or a state this mapping has no word for. */
  Unknown = 'UNKNOWN',
}
