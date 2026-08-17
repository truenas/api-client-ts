import { AppState } from '@/types/app-query.type';

/**
 * Narrow a middleware instance/container state to the {@link AppState} the
 * unified `Container` promises.
 *
 * The two versions report different vocabularies — v25.10's `virt.instance`
 * has ten states (`FROZEN`, `ABORTING`, `THAWED`, …), v26's `container` has
 * three (`RUNNING`, `STOPPED`, `SUSPENDED`) — so this is shared, and the
 * versions cannot disagree about the mapping.
 *
 * Every state either maps to something that means what it says or to
 * `Unknown`. It previously folded everything unrecognised into `Stopped`,
 * on the reasoning that claiming a frozen or erroring container is running is
 * the failure worth avoiding. That is true, but `Stopped` is not the neutral
 * answer it was taken for: it is a positive claim that the container is at
 * rest, which is what a UI reads before offering a Start button and what a
 * poll loop reads before giving up. `Unknown` avoids the false claim in both
 * directions.
 *
 * The three states this used to lose outright are the reason `AppState` was
 * widened. `SUSPENDED` is the one with teeth: v26 added it and middleware
 * means paused-with-state-retained by it
 * (`plugins/container/attachments.py` — "don't discard the paused state just
 * to restart the container"), so reporting it as `Stopped` describes a
 * container that is holding memory as one that is not running at all.
 */
export function toAppState(state: string): AppState {
  switch (state.toUpperCase()) {
    case 'RUNNING':
      return AppState.Running;
    case 'STOPPED':
      return AppState.Stopped;
    // `ABORTING` is v25.10 only: the instance is being forced down, which ends
    // at `STOPPED` and is what `Stopping` already means.
    case 'STOPPING':
    case 'ABORTING':
      return AppState.Stopping;
    // `STARTING` is v25.10 `virt.instance` only, and folding it into `Stopped`
    // told callers a container that is coming up is at rest — enough for a UI
    // to offer a Start button for it, or for a poll loop to give up. `Deploying`
    // is the only in-progress state `AppState` has.
    case 'STARTING':
    case 'DEPLOYING':
      return AppState.Deploying;
    // v25.10's freezer states are the same idea as v26's `SUSPENDED`: the
    // processes are paused, not exited. `FREEZING` reports the destination
    // rather than a state of its own, which is the same compromise `STARTING`
    // makes — there is no in-progress word for it, and `Suspended` is the only
    // answer that does not claim the container is running or stopped.
    case 'SUSPENDED':
    case 'FROZEN':
    case 'FREEZING':
      return AppState.Suspended;
    // `THAWED` is the freezer lifted: the processes are scheduled again, so
    // this is `RUNNING` reported through the transition rather than a state a
    // caller should act on differently.
    case 'THAWED':
      return AppState.Running;
    case 'ERROR':
      return AppState.Error;
    // `UNKNOWN` is middleware's own word for it, and anything unrecognised is
    // the same situation: a state this mapping has no word for. Neither is
    // evidence the container is stopped.
    case 'UNKNOWN':
      return AppState.Unknown;
    default:
      return AppState.Unknown;
  }
}
