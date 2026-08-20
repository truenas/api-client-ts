/**
 * The gap this PR knowingly ships, pinned so it cannot be forgotten.
 *
 * The cause: a type is declared once, in the version where its shape first
 * appeared, and `generate.mts` skips writing any file carrying the frozen
 * marker. A type homed in a frozen directory therefore cannot be changed by any
 * dump, however many times the tree is regenerated — the corrected declaration
 * is emitted and then discarded.
 *
 * These assertions describe what is wrong today, so **they fail when the gap is
 * fixed**. That is the point: the fix is hand work in `v25_10_0/`, and nothing
 * else in the repo would notice it happening. `ci.yml` neither regenerates nor
 * diffs the tree, and the drift check in `generate.mts` compares dump to dump,
 * so it stays quiet when only the generator has moved.
 *
 * This file carried a second block, for model fields named `description`. That
 * gap closed: `stripDocs` was fixed and the tree regenerated against the pinned
 * dump, so `ContainerEntry` declares the field and the widening that read it
 * through a cast is gone. The block was deleted rather than kept passing, which
 * is what these are for — they are removed by being satisfied.
 *
 * When one fails: delete that block, and remove the matching note from the
 * "Known gap" section of the PR/release notes. The failure message says so too.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type { v27_0_0 } from '@/generated';

describe('known gap: v27 app events disagree with app calls', () => {
  /**
   * This dump moved the v27 call shape — `AppEntry` gained `ERROR`,
   * `error_reason` and nullable `version`/`human_version` — while `app.query`'s
   * event payload still resolves to `AppEntryInput`, homed in the frozen
   * `v25_10_0/`. So one version describes the same object two ways:
   * `e.fields.version` is typed non-null and arrives `null`, and
   * `e.fields.state === 'ERROR'` does not compile for a state the appliance
   * reports.
   *
   * Reconciling means writing the input render into the frozen directory, which
   * needs the pinned dump to read rather than infer.
   */
  it('still types the event payload version as non-nullable', () => {
    type EventFields = v27_0_0.ApiEventDirectory['app.query']['added']['fields'];
    expectTypeOf<EventFields['version']>().toEqualTypeOf<string>();
    // The call side, for contrast: same object, nullable here.
    expectTypeOf<v27_0_0.AppEntry['version']>().toEqualTypeOf<string | null>();
  });

  it('still omits ERROR from the event payload state', () => {
    type EventFields = v27_0_0.ApiEventDirectory['app.query']['added']['fields'];
    type EventHasError = 'ERROR' extends EventFields['state'] ? true : false;
    expectTypeOf<EventHasError>().toEqualTypeOf<false>();
    // The call side declares it, which is the disagreement.
    type CallHasError = 'ERROR' extends v27_0_0.AppEntry['state'] ? true : false;
    expectTypeOf<CallHasError>().toEqualTypeOf<true>();
  });
});
