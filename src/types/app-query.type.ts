/**
 * The state `Container.status` is narrowed to.
 *
 * Both versions report richer vocabularies than this — v25.10
 * `virt.instance` has ten states, v26 `container` has two — and
 * `@/utils/app-state.utils` is the single place that maps them, so the two
 * clients cannot disagree.
 *
 * Exported from the barrel as a value: without the enum a consumer can read
 * `Container.status` but has nothing to compare it against.
 */
export enum AppState {
  Running = 'RUNNING',
  Stopped = 'STOPPED',
  Stopping = 'STOPPING',
  Deploying = 'DEPLOYING',
}
