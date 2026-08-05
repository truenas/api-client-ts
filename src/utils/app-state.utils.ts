import { AppState } from '@/types/app-query.type';

/**
 * Narrow a middleware instance/container state to the {@link AppState} the
 * unified `Container` promises.
 *
 * The two versions report different vocabularies — v25.10's `virt.instance`
 * has ten states (`FROZEN`, `ABORTING`, `THAWED`, …), v26's `container` has
 * two — and `Container.status` has always claimed to be one of four. Shared so
 * the versions cannot disagree about the mapping; they previously did, with
 * v25.10 passing the raw string straight through a field typed `AppState` and
 * v26 mapping it.
 *
 * Anything unrecognised becomes `Stopped`, which is what v26 already did: it
 * is the safe reading for a state the caller has no vocabulary for, since the
 * alternative is claiming a container is running when it is frozen or erroring.
 * That still loses information — `ERROR`, `FROZEN`, `ABORTING` and `THAWED`
 * all arrive as `Stopped` — and widening `AppState` is the fix if a caller
 * ever needs to tell them apart.
 */
export function toAppState(state: string): AppState {
  switch (state.toUpperCase()) {
    case 'RUNNING':
      return AppState.Running;
    case 'STOPPED':
      return AppState.Stopped;
    case 'STOPPING':
      return AppState.Stopping;
    // `STARTING` is v25.10 `virt.instance` only, and folding it into `Stopped`
    // told callers a container that is coming up is at rest — enough for a UI
    // to offer a Start button for it, or for a poll loop to give up. `Deploying`
    // is the only in-progress state `AppState` has.
    case 'STARTING':
    case 'DEPLOYING':
      return AppState.Deploying;
    default:
      return AppState.Stopped;
  }
}
