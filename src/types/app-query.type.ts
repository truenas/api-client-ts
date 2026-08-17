/**
 * The state `Container.status` is narrowed to.
 *
 * The two versions report different vocabularies — v25.10 `virt.instance` has
 * ten states, more than this enum names, while v26 `container` has three
 * (`RUNNING`, `STOPPED`, `SUSPENDED`) that this enum now covers exactly — and
 * `@/utils/app-state.utils` is the single place that maps them, so the two
 * clients cannot disagree.
 *
 * `Suspended`, `Error` and `Unknown` exist because the narrower set could only
 * express them as `Stopped`, which is a claim rather than a loss of detail: a
 * paused container still holds its memory, an erroring one needs attention,
 * and an unknown one has not been established to be at rest. Middleware
 * distinguishes all three — v26 `container` gained `SUSPENDED` and v25.10
 * `virt.instance` reports `ERROR` and `UNKNOWN` — so a consumer offering a
 * Start button on the strength of `Stopped` was being told the wrong thing.
 *
 * Exported from the barrel as a value: without the enum a consumer can read
 * `Container.status` but has nothing to compare it against.
 */
export enum AppState {
  Running = 'RUNNING',
  Stopped = 'STOPPED',
  Stopping = 'STOPPING',
  Deploying = 'DEPLOYING',
  /** Paused with its state retained — not stopped, and resumable. */
  Suspended = 'SUSPENDED',
  /** Middleware reports the instance as failed. */
  Error = 'ERROR',
  /** Middleware reports no usable state, or a state this mapping has no word for. */
  Unknown = 'UNKNOWN',
}
