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
  v25_10_0,
} from '@/generated';
import type {
  BaseApiDirectory,
  EventName,
  EventUnion,
} from '@/types/api-directory.type';
import type { Job, JobProgress, JobState } from '@/types/job.type';
import type { TrueNasDate } from '@/types/truenas-date.type';

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

describe('job results', () => {
  const api = {
    job: () => undefined,
    trackJob: () => undefined,
  } as unknown as TrueNasApi;

  /**
   * The reason `job` exists rather than leaving callers to compose
   * `callAndGetJobId` with `trackJob`: composing them by hand throws away the
   * link between the method and its result.
   */
  /**
   * `result` is nullable on every arm, not just typed by method. `job()` emits
   * while the job is still running, and a running job has no result — measured
   * on a live appliance, a `RUNNING` emission carries `result: null`. A failed
   * job ends with `null` too, so a terminal state is not enough either.
   */
  it('keeps the result nullable, because progress emissions have none', () => {
    type ImportResult = Job<v25_10_0.PoolImportFind[]>['result'];

    expectTypeOf<Job<string>['result']>().toEqualTypeOf<string | null>();
    expectTypeOf<ImportResult>().toEqualTypeOf<
      v25_10_0.PoolImportFind[] | null
    >();
    // Still the method's own result once the caller has narrowed.
    expectTypeOf<NonNullable<ImportResult>>().toEqualTypeOf<
      v25_10_0.PoolImportFind[]
    >();
  });

  it('carries the result type from the job directory', () => {
    expectTypeOf(api.job('pool.import_find')).toEqualTypeOf<
      Observable<Job<v25_10_0.PoolImportFind[]>>
    >();
    expectTypeOf(api.job('pool.dataset.export_key', ['tank/enc'])).toEqualTypeOf<
      Observable<Job<string | null>>
    >();
    expectTypeOf(api.job('app.start', ['my-app'])).toEqualTypeOf<
      Observable<Job<null>>
    >();
  });

  /**
   * A job id says nothing about which method produced it, so `trackJob` cannot
   * infer the result and must not pretend to. `unknown` forces the caller to
   * narrow; naming `R` explicitly is their assertion, not an inference.
   */
  it('degrades to unknown when a job is reached by id alone', () => {
    expectTypeOf(api.trackJob(42)).toEqualTypeOf<Observable<Job<unknown>>>();
    expectTypeOf(api.trackJob<string>(42)).toEqualTypeOf<
      Observable<Job<string>>
    >();
  });

  /**
   * `Job` is the generated `core.get_jobs` entity with named overrides, so
   * fields nobody overrode must still arrive from the dump — otherwise the
   * refinement has quietly become a hand-written type again, and stops
   * tracking the generated surface.
   */
  it('refines the generated shape rather than replacing it', () => {
    // Overridden, because the dump is weaker than what the server sends.
    expectTypeOf<Job['state']>().toEqualTypeOf<JobState>();
    // NOT overridden: the dump says `percent` may be null and nothing observed
    // disproves it, so narrowing would invent a guarantee rather than correct
    // one. `extra` survives for the same reason.
    expectTypeOf<Job['progress']['percent']>().toEqualTypeOf<number | null>();
    expectTypeOf<Job['progress']['description']>().toEqualTypeOf<string>();
    expectTypeOf<Job['time_started']>().toEqualTypeOf<TrueNasDate>();
    expectTypeOf<Job['progress']>().toEqualTypeOf<JobProgress>();
    expectTypeOf<Job['description']>().toEqualTypeOf<string | null>();

    // Inherited from the generated entity, untouched.
    expectTypeOf<Job['id']>().toEqualTypeOf<number>();
    expectTypeOf<Job['transient']>().toEqualTypeOf<boolean>();
    expectTypeOf<Job['exception']>().toEqualTypeOf<string | null>();
  });
});

describe('events', () => {
  const api = { events: () => undefined } as unknown as TrueNasApi;

  it('rejects an event the surface does not have', () => {
    // @ts-expect-error no such collection.
    api.events('unknown.collection');
    // @ts-expect-error a real event, but not in the shared base.
    api.events('alert.list');
  });

  /**
   * The arms are not interchangeable, which is the reason for a union rather
   * than one shape with optional fields: a removal carries an id and no
   * fields. Typing `fields` as optional across all three would let a caller
   * reach it on a removal and get `undefined` at runtime with no warning.
   */
  it('emits a union discriminated on msg', () => {
    type AppEvent = EventUnion<BaseApiDirectory, 'app.query'>;

    expectTypeOf(api.events('app.query')).toEqualTypeOf<Observable<AppEvent>>();
    expectTypeOf<AppEvent>().toEqualTypeOf<
      | ({ msg: 'added' } & v25_10_0.AppAddedEvent)
      | ({ msg: 'changed' } & v25_10_0.AppChangedEvent)
      | ({ msg: 'removed' } & v25_10_0.AppRemovedEvent)
    >();

    // `fields` is reachable once narrowed, and absent on a removal.
    expectTypeOf<Extract<AppEvent, { msg: 'changed' }>['fields']>().toEqualTypeOf<
      v25_10_0.AppEntryInput
    >();
    expectTypeOf<Extract<AppEvent, { msg: 'removed' }>>().not.toHaveProperty(
      'fields'
    );
  });

  /**
   * Event sources take subscribe-time arguments, and `core.subscribe` is
   * declared as a single string with no documented encoding for them. They are
   * excluded rather than typed on a guess — see `EventName`. This is the test
   * to delete once the encoding is confirmed.
   */
  /**
   * The runtime filter forwards any of the three kinds; the directory lists
   * only some for 16 of v25.10's collections. Without an arm for the rest, a
   * `removed` frame on `core.get_jobs` — which declares only `added` and
   * `changed` — would arrive typed as carrying `fields`.
   */
  it('leaves an arm for kinds the directory does not declare', () => {
    type JobEvent = EventUnion<BaseApiDirectory, 'core.get_jobs'>;

    expectTypeOf<JobEvent['msg']>().toEqualTypeOf<
      'added' | 'changed' | 'removed'
    >();
    expectTypeOf<
      Extract<JobEvent, { msg: 'removed' }>
    >().not.toHaveProperty('fields');

    // Collections that declare all three gain nothing: no extra arm.
    type AppEvent = EventUnion<BaseApiDirectory, 'app.query'>;
    expectTypeOf<Extract<AppEvent, { msg: 'removed' }>>().toEqualTypeOf<
      { msg: 'removed' } & v25_10_0.AppRemovedEvent
    >();
  });

  it('excludes event sources, which take subscribe-time arguments', () => {
    // @ts-expect-error `app.stats` needs subscription params we cannot send.
    api.events('app.stats');
    // @ts-expect-error likewise.
    api.events('filesystem.file_tail_follow');

    expectTypeOf<'app.stats'>().toExtend<keyof BaseApiDirectory['event']>();
    expectTypeOf<'app.stats'>().not.toExtend<EventName<BaseApiDirectory>>();
  });
});
