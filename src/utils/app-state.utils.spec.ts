import { describe, expect, it } from 'vitest';

import { AppState } from '@/types/app-query.type';
import { toAppState } from '@/utils/app-state.utils';

/**
 * The mapping is shared so the two versions cannot disagree about it, which
 * makes it the one place a behaviour change is invisible: both clients keep
 * compiling and their own specs keep passing.
 *
 * `STARTING` is the arm that matters. It is v25.10 `virt.instance` only, it is
 * the one state whose destination changed in the extraction, and deleting the
 * case left the suite green — `default` catches it and returns `Stopped`,
 * which is the pre-extraction answer.
 */
describe('toAppState', () => {
  it('map an in-progress state to Deploying, not Stopped', () => {
    // Deleting either case from the switch turns these red rather than
    // silently falling through to `default`.
    expect(toAppState('STARTING')).toBe(AppState.Deploying);
    expect(toAppState('DEPLOYING')).toBe(AppState.Deploying);
  });

  it('map the states both vocabularies share', () => {
    expect(toAppState('RUNNING')).toBe(AppState.Running);
    expect(toAppState('STOPPED')).toBe(AppState.Stopped);
    expect(toAppState('STOPPING')).toBe(AppState.Stopping);
  });

  it('accept any case', () => {
    // Defensive, not measured. Both statuses this maps declare upper case:
    // v25.10 `VirtInstanceEntry.status` and v26 `ContainerStatusState`
    // (`'RUNNING' | 'STOPPED' | 'SUSPENDED'`). The lower-case state enums in
    // the generated tree — `AppContainerDetailsState`, `State` — belong to app
    // container details and never reach this function.
    //
    // So `toUpperCase()` guards against a widening nobody has made yet. It
    // costs nothing and keeps a lower-case value from silently becoming
    // `Unknown`, which is the failure that would be hardest to spot.
    expect(toAppState('running')).toBe(AppState.Running);
    expect(toAppState('Starting')).toBe(AppState.Deploying);
  });

  /**
   * `SUSPENDED` is the arm with consequences. v26 added it to
   * `ContainerStatusState`, and middleware means paused-with-state-retained by
   * it, so the pre-widening answer — `Stopped` — described a container holding
   * memory as one that was not running.
   */
  it('map a paused container to Suspended, not Stopped', () => {
    // v26's word, then v25.10's two for the same condition.
    expect(toAppState('SUSPENDED')).toBe(AppState.Suspended);
    expect(toAppState('FROZEN')).toBe(AppState.Suspended);
    expect(toAppState('FREEZING')).toBe(AppState.Suspended);
    // Deleting any case above turns these red rather than falling through to
    // `default`, which now answers `Unknown`.
    expect(toAppState('SUSPENDED')).not.toBe(AppState.Unknown);
  });

  it('report a failed instance as Error rather than at rest', () => {
    expect(toAppState('ERROR')).toBe(AppState.Error);
  });

  it('map the remaining v25.10 transitions by what they end at', () => {
    // `ABORTING` is a forced stop; `THAWED` is the freezer lifted, so the
    // processes are scheduled again.
    expect(toAppState('ABORTING')).toBe(AppState.Stopping);
    expect(toAppState('THAWED')).toBe(AppState.Running);
  });

  it('answer Unknown for a state it has no word for, never Stopped', () => {
    // `UNKNOWN` is middleware's own; `''` and the rest are not states v25.10
    // reports, and stand for the unrecognised case rather than making a claim
    // about the wire. `Stopped` is the assertion worth refusing here: it is
    // what a UI reads before offering a Start button.
    for (const state of ['UNKNOWN', '', 'WEDGED', 'MIGRATING']) {
      expect(toAppState(state), state).toBe(AppState.Unknown);
      expect(toAppState(state), state).not.toBe(AppState.Stopped);
    }
  });

  /**
   * Every state either version declares has to land somewhere deliberate. The
   * check is that none of them reaches `default`, which is the arm that cannot
   * distinguish "middleware said UNKNOWN" from "this mapping was not updated".
   */
  it('map every state either version declares without falling through', () => {
    // `VirtInstanceEntry.status` (v25.10) and `ContainerStatusState` (v26).
    const declared = [
      'RUNNING', 'STOPPED', 'UNKNOWN', 'ERROR', 'FROZEN',
      'STARTING', 'STOPPING', 'FREEZING', 'THAWED', 'ABORTING',
      'SUSPENDED',
    ];
    const unhandled = declared.filter((state) => state !== 'UNKNOWN' && toAppState(state) === AppState.Unknown);
    expect(unhandled).toEqual([]);
  });
});
