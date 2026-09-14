/**
 * Type-level copies of the README's usage examples. Hand-maintained, so they
 * catch the API drifting from the docs but not a README snippet that no longer
 * compiles. `ops.smbStatus` snippets live in `client/smb-status-ops.spec.ts`.
 */
import type { Observable } from 'rxjs';
import { describe, expectTypeOf, it } from 'vitest';
import type { TrueNasApi } from '@/api/truenas-api';
import type { DefaultApiDirectory } from '@/factory';
import type { ApiDirectoryV26_0_0, v25_10_0, v26_0_0 } from '@/generated';
import type { ApplianceProtocol } from '@/index';
import type { Job } from '@/types/job.type';
import type { QueryListOptions } from '@/types/query.type';

/**
 * Only the types are under test, but the `it` bodies still run, so the verbs
 * have to be callable — hence stubs rather than `declare const`. `events`
 * returns something subscribable because one example subscribes; the callback
 * never fires, which is all the assertions inside it need.
 */
const stub = {
  call: () => undefined,
  query: () => undefined,
  queryOne: () => undefined,
  queryCount: () => undefined,
  job: () => undefined,
  events: () => ({ subscribe: () => undefined }),
};

describe('README: connection', () => {
  it('exports the protocol values the README names', () => {
    expectTypeOf<ApplianceProtocol>().toEqualTypeOf<'http:' | 'https:'>();
  });
});

/** What `createTrueNasClient(opts)` hands back, with no version named. */
const api = stub as unknown as TrueNasApi<DefaultApiDirectory>;

/** ...and with one named. */
const v26 = stub as unknown as TrueNasApi<ApiDirectoryV26_0_0>;

describe('README: calls', () => {
  it('resolves params and responses from the directory', () => {
    expectTypeOf(api.call('system.info')).toEqualTypeOf<
      Observable<v25_10_0.SystemInfoResult>
    >();
    api.call('alert.dismiss', ['uuid-1']);

    // @ts-expect-error no such method.
    api.call('nope.nope');
  });
});

describe('README: queries', () => {
  it('fixes the shape by verb', () => {
    expectTypeOf(api.query('user.query', [['uid', '>', 1000]])).toEqualTypeOf<
      Observable<v25_10_0.UserEntry[]>
    >();
    expectTypeOf(api.queryOne('user.query', [['username', '=', 'root']])).toEqualTypeOf<
      Observable<v25_10_0.UserEntry>
    >();
    expectTypeOf(api.queryCount('user.query')).toEqualTypeOf<
      Observable<number>
    >();
  });

  // "Types as", not "returns": a literal select is an exact `Pick` at the type
  // level, while the payload carries *at least* those fields — see the note on
  // `QueryProjection`. The name said "exactly" for both, which the measured
  // padding behaviour makes untrue of the second.
  it('types a literal select as a Pick of those fields', () => {
    expectTypeOf(
      api.query('user.query', [], { select: ['id', 'username'] })
    ).toEqualTypeOf<
      Observable<Pick<v25_10_0.UserEntry, 'id' | 'username'>[]>
    >();
  });

  it('rejects a filter on a field the entity does not have', () => {
    // @ts-expect-error no such field.
    api.query('user.query', [['uidd', '>', 1000]]);
  });

  /** The `satisfies` advice in the README, and the cost of ignoring it. */
  it('keeps precision with satisfies, loses it with an annotation', () => {
    const annotated: QueryListOptions<v25_10_0.UserEntry> = { limit: 10 };
    expectTypeOf(api.query('user.query', [], annotated)).toEqualTypeOf<
      Observable<Partial<v25_10_0.UserEntry>[]>
    >();

    const satisfied = { limit: 10 } satisfies QueryListOptions<v25_10_0.UserEntry>;
    expectTypeOf(api.query('user.query', [], satisfied)).toEqualTypeOf<
      Observable<v25_10_0.UserEntry[]>
    >();
  });
});

describe('README: jobs', () => {
  it('types the result from the job directory', () => {
    expectTypeOf(
      api.job('pool.dataset.export_key', ['tank/encrypted'])
    ).toEqualTypeOf<Observable<Job<string | null>>>();
  });
});

describe('README: events', () => {
  it('narrows on msg before the payload is reachable', () => {
    api.events('app.query').subscribe(event => {
      if (event.msg === 'removed') {
        expectTypeOf(event.id).toEqualTypeOf<string>();
        // @ts-expect-error a removal carries no fields.
        void event.fields;
        return;
      }
      expectTypeOf(event.fields).toEqualTypeOf<v25_10_0.AppEntryInput>();
    });
  });
});

describe('README: working across versions', () => {
  it('reaches methods the default cannot', () => {
    expectTypeOf(v26.query('container.query')).toEqualTypeOf<
      Observable<v26_0_0.ContainerEntry[]>
    >();

    // @ts-expect-error the default is v25.10, which has never heard of containers.
    api.query('container.query');
  });
});
