/**
 * `pool.dataset.encryption_algorithm_choices` is the second entry no dump can
 * produce, alongside `virt.*` (see `generated-virt.spec.ts`). Middleware
 * deleted it in `22ce5eac51` and swept its models out of every version
 * directory in the same commit, so the generator's dump diff has nothing to
 * compare on either side and the removal comes from `hand-removed.json`.
 *
 * That file's entry is a quoted literal inside an `Omit`, and TypeScript's
 * `Omit` accepts keys a type does not have — so a typo there removes nothing,
 * compiles, generates, and leaves the method inherited at v26 with no error
 * anywhere. These assertions are what turns that into a failure.
 *
 * Type-level; the `it` bodies exist so `tsconfig.spec.json` picks the file up.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type {
  ApiCallDirectoryV26_0_0,
  ApiCallDirectoryV27_0_0,
} from '@/generated';
import type { ApiCallDirectory as ApiCallDirectoryV25_10_0 } from '@/generated/v25_10_0/api-call-directory';
import type { ApiCallDirectory as ApiCallDirectoryV25_10_5 } from '@/generated/v25_10_5/api-call-directory';

type Method = 'pool.dataset.encryption_algorithm_choices';

describe('pool.dataset.encryption_algorithm_choices', () => {
  it('stays on the v25.10 surface, which really serves it', () => {
    // Present at TS-25.10.5 in `plugins/pool_/dataset_info.py`, so a released
    // 25.10 appliance answers it. Declared in the frozen v25_10_0 directory and
    // inherited by the patch versions.
    expectTypeOf<Method>().toExtend<keyof ApiCallDirectoryV25_10_0>();
    expectTypeOf<Method>().toExtend<keyof ApiCallDirectoryV25_10_5>();
  });

  it('is gone from v26 onward, where the method does not exist', () => {
    // Removed from the plugin itself rather than only from the versioned
    // models, so a v25.10-pinned client on a 26 appliance does not get it
    // either — `stable/26` has no match for the name at all.
    expectTypeOf<Extract<keyof ApiCallDirectoryV26_0_0, Method>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof ApiCallDirectoryV27_0_0, Method>>().toEqualTypeOf<never>();
  });
});
