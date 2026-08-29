/**
 * The gap this PR knowingly ships, pinned so it cannot be forgotten.
 *
 * `app.query` is described two ways inside one version. The call side takes and
 * returns `AppEntry`; the event payload resolves to `AppEntryInput`. Those two
 * disagree about the same object — `AppEntryInput` carries the `ERROR` state,
 * `error_reason` and a nullable `version`, and `AppEntry` carries none of them —
 * so a caller reading `entry.version` is typed non-null for a field the same
 * object delivers as `null` over the event, and `e.fields.state === 'ERROR'`
 * compiles while `entry.state === 'ERROR'` does not, for a state the appliance
 * reports. The event payload is the side that describes the appliance
 * correctly; the call side is the one that is narrow.
 *
 * These assertions describe what is wrong today, so **they fail when the gap is
 * fixed**. That is the point: nothing else in the repo would notice it closing.
 * `ci.yml` neither regenerates nor diffs the tree, and the drift check in
 * `generate.mts` compares dump to dump, so it stays quiet when only the
 * generator has moved.
 *
 * This file was deleted once, in TNC-2283, on the reading that the gap had
 * closed. It had not — it moved. That regeneration unfroze v25.10, so the
 * corrected input render was written into `v25_10_0/` and the v27 assertions
 * started failing — which is what was read as the gap closing, since this file
 * is written to fail when it does. But the *disagreement* travelled with it,
 * because
 * `AppEntryInput` and `AppEntry` are both homed at the chain root now and still
 * describe the same object differently. Deleting the file recorded a fix that
 * had not happened. It is retargeted at `v25_10_0` rather than restored to its
 * old form, because that is where the two shapes now sit.
 *
 * When one fails: delete that block, and remove the matching note from the
 * "Known gap" section of the PR/release notes. The failure message says so too.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type { v25_10_0 } from '@/generated';

describe('known gap: v25.10 app events disagree with app calls', () => {
  /**
   * Both shapes are homed in `v25_10_0/` and the directory is frozen again, so
   * closing this means either hand-maintenance there or another unfreeze — and
   * an unfreeze deletes the entries no dump describes — seven commits of
   * TNC-2283, `dd715de`..`f08de91`, went on putting them back.
   */
  it('still types the call-side version as non-nullable', () => {
    type EventFields = v25_10_0.ApiEventDirectory['app.query']['added']['fields'];
    // The event payload admits null; the call side does not.
    expectTypeOf<EventFields['version']>().toEqualTypeOf<string | null>();
    expectTypeOf<v25_10_0.AppEntry['version']>().toEqualTypeOf<string>();
  });

  it('still omits ERROR from the call-side state', () => {
    type EventFields = v25_10_0.ApiEventDirectory['app.query']['added']['fields'];
    type EventHasError = 'ERROR' extends EventFields['state'] ? true : false;
    expectTypeOf<EventHasError>().toEqualTypeOf<true>();
    // The call side does not declare it, which is the disagreement.
    type CallHasError = 'ERROR' extends v25_10_0.AppEntry['state'] ? true : false;
    expectTypeOf<CallHasError>().toEqualTypeOf<false>();
  });
});
