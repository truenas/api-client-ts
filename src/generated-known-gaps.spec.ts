/**
 * Two gaps this PR knowingly ships, pinned so they cannot be forgotten.
 *
 * Both have the same cause: a type is declared once, in the version where its
 * shape first appeared, and `generate.mts` skips writing any file carrying the
 * frozen marker. A type homed in a frozen directory therefore cannot be changed
 * by any dump, however many times the tree is regenerated — the corrected
 * declaration is emitted and then discarded.
 *
 * These assertions describe what is wrong today, so **each one fails when its
 * gap is fixed**. That is the point: the fix is a regeneration plus hand work in
 * `v25_10_0/`, done by someone with the pinned dump, and nothing else in the
 * repo would notice it happening. `ci.yml` neither regenerates nor diffs the
 * tree, and the drift check in `generate.mts` compares dump to dump, so it stays
 * quiet when only the generator has moved.
 *
 * When one fails: delete that block, and remove the matching note from the
 * "Known gap" section of the PR/release notes. The failure message says so too.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type { v26_0_0, v27_0_0 } from '@/generated';

describe('known gap: model fields named `description`', () => {
  /**
   * `stripDocs` deleted model fields named `description` along with the prose.
   * The generator is fixed; the committed tree is not, because it has not been
   * regenerated since. Middleware really does declare the field —
   * `api/v26_0_0/container.py:61` on stable/26 is
   * `description: str = Field(default="", description="Container description.")`
   * — so this is our omission, not an under-declaration upstream.
   *
   * While it holds, `toContainer` in `truenas-api-client-v26.ts` has to read
   * `description` through a widening. When this fails, the field has arrived:
   * drop the widening there as its comment says.
   */
  it('is still missing from ContainerEntry, so the client widening is still needed', () => {
    type HasDescription = 'description' extends keyof v26_0_0.ContainerEntry ? true : false;
    expectTypeOf<HasDescription>().toEqualTypeOf<false>();
  });
});

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
