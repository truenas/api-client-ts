/**
 * Type-level tests for the API surface a client is parameterised with.
 *
 * The parameter used to be a single *call* directory. It is now the whole
 * surface — `call`, `job`, `event` — because the three are facets of one
 * version, and the verbs added in later phases each read a different facet.
 * These pin the two things that change silently if the parameter drifts back:
 * what the constraint rejects, and what a client that names no version reaches.
 *
 * The assertions are compile-time; the `it` blocks exist so the file is picked
 * up by `tsconfig.spec.json` and the runtime suite.
 */
import { describe, expectTypeOf, it } from 'vitest';
import { TrueNasApi } from '@/api/truenas-api';
import { TrueNasApiClient } from '@/client/truenas-api-client';
import type {
  ApiCallDirectoryV26_0_0,
  ApiDirectoryV26_0_0,
} from '@/generated';
import type { BaseApiDirectory } from '@/types/api-directory.type';

describe('the surface a client is typed against', () => {
  /**
   * The migration hazard, and the reason the parameter is constrained rather
   * than left open: a call directory is the thing every caller passed before,
   * and it is structurally close enough that an unconstrained parameter would
   * accept it. It would then resolve `D['call']` to nothing, and every query
   * verb would silently accept no method at all.
   */
  it('rejects a bare call directory', () => {
    // @ts-expect-error a call directory is one facet, not a whole surface.
    expectTypeOf<TrueNasApi<ApiCallDirectoryV26_0_0>>().not.toBeNever();
    // @ts-expect-error same, through the client.
    expectTypeOf<TrueNasApiClient<ApiCallDirectoryV26_0_0>>().not.toBeNever();

    expectTypeOf<TrueNasApi<ApiDirectoryV26_0_0>>().not.toBeNever();
  });

  /**
   * The default is the intersection of every generated version, so it is sound
   * against any server and genuinely small. Both halves are asserted: a test
   * that only checked what the default *reaches* would pass just as happily
   * against a default that reaches everything, which is the unsound direction.
   */
  it('defaults to the entries every version shares, and no more', () => {
    const api = {
      query: () => undefined,
    } as unknown as TrueNasApi;

    expectTypeOf<TrueNasApi>().toEqualTypeOf<TrueNasApi<BaseApiDirectory>>();

    // In the shared base.
    api.query('cronjob.query');
    api.query('core.get_jobs');

    // @ts-expect-error not in the shared base — naming a version is the fix.
    api.query('pool.query');
    // @ts-expect-error likewise.
    api.query('user.query');
  });

  /**
   * `call`, `job` and `event` have to travel together. Pairing one version's
   * calls with another's events describes no server that exists, and the
   * failure would be invisible — every individual method would type-check.
   */
  it('carries all three facets of one version', () => {
    expectTypeOf<
      ApiDirectoryV26_0_0['call']
    >().toEqualTypeOf<ApiCallDirectoryV26_0_0>();
    expectTypeOf<keyof ApiDirectoryV26_0_0>().toEqualTypeOf<
      'call' | 'job' | 'event'
    >();
  });
});
