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
import type { Observable } from 'rxjs';
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

describe('call and callAndGetJobId', () => {
  const api = {
    call: () => undefined,
    callAndGetJobId: () => undefined,
  } as unknown as TrueNasApi;

  const v26 = {
    call: () => undefined,
  } as unknown as TrueNasApi<ApiDirectoryV26_0_0>;

  /**
   * The property that replaces the endpoint constants this package used to
   * export. A misspelled or non-existent method was previously a runtime
   * error — the constant list was hand-maintained and covered 65 of 641
   * methods, so anything outside it went as a bare string.
   */
  it('rejects a method the surface does not have', () => {
    // @ts-expect-error no such method anywhere.
    api.call('unknown.endpoint');
    // @ts-expect-error a real method, but not in the shared base.
    api.call('container.start', [5]);

    // The same name against a surface that does have it.
    v26.call('container.start', [5]);
  });

  it('takes params and response from the directory entry', () => {
    expectTypeOf(api.call('alert.list_policies')).toEqualTypeOf<
      Observable<string[]>
    >();
    expectTypeOf(api.call('alert.dismiss', ['uuid-1'])).toEqualTypeOf<
      Observable<null>
    >();

    // @ts-expect-error `uuid` is a string, not a number.
    api.call('alert.dismiss', [7]);
  });

  /**
   * The reason `call` takes a rest parameter rather than an optional one. A
   * single `params?` let a method that needs an argument be called without
   * one, because whether the directory said params were required was never
   * consulted.
   */
  it('requires params exactly when the method takes them', () => {
    api.call('alert.list_policies');
    api.call('system.info');

    // @ts-expect-error `alert.dismiss` needs a uuid.
    api.call('alert.dismiss');
  });

  /**
   * Two disjoint key spaces, not one with a flag. Which directory a method
   * lives in is a fact about the method — `app.start` runs as a job and
   * `app.query` does not — so neither verb accepts the other's names.
   */
  it('keeps the call and job key spaces apart', () => {
    expectTypeOf(api.callAndGetJobId('app.start', ['my-app'])).toEqualTypeOf<
      Observable<number>
    >();

    // @ts-expect-error `app.start` is a job, not a call.
    api.call('app.start', ['my-app']);
    // @ts-expect-error `system.info` is a call, not a job.
    api.callAndGetJobId('system.info');
    // @ts-expect-error a job's params are checked the same way.
    api.callAndGetJobId('app.start', [7]);
  });
});
