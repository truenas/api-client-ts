import { describe, expect, it } from 'vitest';

import * as generated from '@/generated';
import { AppState } from '@/types/app-query.type';
import { toAppState } from '@/utils/app-state.utils';

/** `v25_10_0`, `v26_0_0`, … — the per-version namespaces the barrel re-exports. */
const VERSION_NAMESPACE = /^v\d+_\d+_\d+$/;

/** `ContainerStatusState` and `ContainerStatusStateInput`, and any later render. */
const CONTAINER_STATE_CONST = /^ContainerStatusState/;

/**
 * Every generated version that declares a container-state const, by name.
 *
 * Scanned rather than named, so a version added later is picked up without
 * this file being touched — which is the whole point, since the const moves to
 * whichever version widens it. Matched by the same prefix `containerStates`
 * uses, so the guard cannot end up checking a narrower thing than the function
 * it guards.
 */
function versionsDeclaringContainerStates(): string[] {
  return Object.entries(generated)
    .filter(([name, ns]) => VERSION_NAMESPACE.test(name)
      && Object.keys(ns as Record<string, unknown>).some((e) => CONTAINER_STATE_CONST.test(e)))
    .map(([name]) => name);
}

/**
 * The union of the container state vocabulary across every generated version,
 * across *both* renders.
 *
 * Reading `ContainerStatusState` alone missed half the surface. pydantic renders
 * a model differently for validation and serialization, and the generator
 * splits the two whenever they differ — so the vocabulary can widen in one and
 * not the other. The `Input` render is not the obscure half either: it is what
 * event payloads carry (`container.query` -> `ContainerAddedEvent.fields` ->
 * `ContainerEntryInput` -> `ContainerStatusInput`), and `toAppState` is fed from
 * events as well as calls. A state that appeared only there would fold to
 * `Unknown` with this test still green.
 *
 * Matched on prefix rather than the two names, so a third render — or a rename
 * of the suffix — is picked up rather than silently halving the check again.
 */
function containerStates(): string[] {
  const all = Object.entries(generated)
    .filter(([name]) => VERSION_NAMESPACE.test(name))
    .flatMap(([, ns]) => Object.entries(ns as Record<string, unknown>)
      .filter(([exported]) => CONTAINER_STATE_CONST.test(exported))
      .flatMap(([, states]) => (states && typeof states === 'object')
        ? Object.values(states as Record<string, string>)
        : []));
  return [...new Set(all)];
}

/**
 * The mapping is shared so the two versions cannot disagree about it, which
 * makes it the one place a behaviour change is invisible: both clients keep
 * compiling and their own specs keep passing.
 *
 * `STARTING` is the arm that matters. It is v25.10 `virt.instance` only, and it
 * is the one state whose destination changed in the extraction. Deleting the
 * case used to leave the suite green, because `default` caught it and returned
 * the pre-extraction answer. It no longer does: `default` answers `Unknown`
 * now, and "map every state either version declares without falling through"
 * below turns the deletion red.
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
    // v26's word, then v25.10's for the same completed condition.
    expect(toAppState('SUSPENDED')).toBe(AppState.Suspended);
    expect(toAppState('FROZEN')).toBe(AppState.Suspended);
    // Deleting either case above turns these red rather than falling through to
    // `default`, which now answers `Unknown`.
    expect(toAppState('SUSPENDED')).not.toBe(AppState.Unknown);
  });

  /**
   * The distinction `Suspended` alone could not draw. A caller polling for "the
   * memory is quiesced" reads `Suspended`, and answering it while the freeze is
   * still running is true one poll too early — the same false claim the
   * `Stopped` default made, one state along.
   */
  it('map a freeze in progress to Suspending, not to the state it is heading for', () => {
    expect(toAppState('FREEZING')).toBe(AppState.Suspending);
    expect(toAppState('FREEZING')).not.toBe(AppState.Suspended);
    // ...and it is still not the fallback, which is the other way to get this
    // wrong quietly.
    expect(toAppState('FREEZING')).not.toBe(AppState.Unknown);
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
   *
   * The container half is read off the generated consts rather than retyped, so
   * the regeneration that adds the next `SUSPENDED` turns this red instead of
   * leaving a stale list passing. A hand-written list is exactly what this test
   * exists to stop being relied on.
   *
   * Read from *every* generated version, not from v26. A type is declared in
   * the version where its shape changed — which is why this PR re-declares
   * `AppEntry` at v27 while v26 keeps the older one — so the next widening of
   * `ContainerStatusState` will declare a new const in the version that widens
   * it and leave `v26_0_0`'s at three members. Importing v26's alone would keep
   * returning `RUNNING | STOPPED | SUSPENDED` forever, and the new state would
   * fold to `Unknown` unnoticed: the exact failure this test exists to catch,
   * reintroduced one version later.
   *
   * The v25.10 half has to stay literal: `VirtInstanceEntry.status` is an
   * inline union with no runtime value to read. It is also in the frozen tree,
   * so unlike the container half it cannot move underneath this list.
   */
  it('map every state either version declares without falling through', () => {
    const declared = [
      // `VirtInstanceEntry.status`, v25_10_0/api-types.ts.
      'RUNNING', 'STOPPED', 'UNKNOWN', 'ERROR', 'FROZEN',
      'STARTING', 'STOPPING', 'FREEZING', 'THAWED', 'ABORTING',
      ...containerStates(),
    ];
    const unhandled = declared.filter((state) => state !== 'UNKNOWN' && toAppState(state) === AppState.Unknown);
    expect(unhandled).toEqual([]);
  });

  it('read the container vocabulary from the generated consts, not a copy of it', () => {
    // Guards the line above twice over: if the namespace scan ever found no
    // version declaring the const, the filter would have nothing to check and
    // the test would pass vacuously.
    expect(versionsDeclaringContainerStates().length).toBeGreaterThan(0);
    expect(containerStates()).toContain('SUSPENDED');
  });
});
