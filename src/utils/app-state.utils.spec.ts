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
    // (`'RUNNING' | 'STOPPED'`). The lower-case state enums in the generated
    // tree — `AppContainerDetailsState`, `State` — belong to app container
    // details and never reach this function.
    //
    // So `toUpperCase()` guards against a widening nobody has made yet. It
    // costs nothing and keeps a lower-case value from silently becoming
    // `Stopped`, which is the failure that would be hardest to spot.
    expect(toAppState('running')).toBe(AppState.Running);
    expect(toAppState('Starting')).toBe(AppState.Deploying);
  });

  it('fold every state AppState has no word for into Stopped', () => {
    // The first six are exactly the `VirtInstanceEntry.status` members with no
    // `AppState` counterpart; `''` is not one v25.10 reports, and is here for
    // the empty-string edge rather than as a claim about the wire. Claiming a
    // frozen or erroring container is running is the failure worth avoiding;
    // losing the distinction between them is the accepted cost, documented on
    // the mapping.
    const unmapped = ['UNKNOWN', 'ERROR', 'FROZEN', 'FREEZING', 'THAWED', 'ABORTING'];
    for (const state of [...unmapped, '']) {
      expect(toAppState(state), state).toBe(AppState.Stopped);
    }
  });
});
