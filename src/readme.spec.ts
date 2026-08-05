/**
 * Assertions mirroring the README's usage examples.
 *
 * These are hand-maintained copies, not extracted from `README.md` — so they
 * catch the client drifting out from under the documented usage, which is the
 * common direction, and they do NOT catch someone editing a README snippet
 * into something that would not compile. Extracting the fenced blocks and
 * typechecking them would close that gap and is the honest next step; until
 * then this guarantees the shape of the API the README describes still exists,
 * not that the README says it correctly.
 *
 * Type-level only. The `it` bodies exist so the file is picked up by
 * `tsconfig.spec.json`; nothing here opens a socket.
 */
import type { Observable } from 'rxjs';
import { describe, expectTypeOf, it } from 'vitest';
import type { TrueNasApi } from '@/api/truenas-api';
import type { DefaultApiDirectory } from '@/factory';
import type { ApiDirectoryV26_0_0, v25_10_0, v26_0_0 } from '@/generated';
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
    expectTypeOf(api.queryOne('user.query', [['id', '=', 1]])).toEqualTypeOf<
      Observable<v25_10_0.UserEntry>
    >();
    expectTypeOf(api.queryCount('user.query')).toEqualTypeOf<
      Observable<number>
    >();
  });

  it('projects to exactly the selected fields', () => {
    expectTypeOf(
      api.query('user.query', [], { select: ['id', 'username'] })
    ).toEqualTypeOf<
      Observable<Pick<v25_10_0.UserEntry, 'id' | 'username'>[]>
    >();
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
      api.job('pool.dataset.export_key', ['tank/enc'])
    ).toEqualTypeOf<Observable<Job<string | null>>>();

    // A job method is not a call method.
    // @ts-expect-error `app.start` is a job.
    api.call('app.start', ['my-app']);
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

describe('README: naming a version', () => {
  it('reaches methods the default cannot', () => {
    expectTypeOf(v26.query('container.query')).toEqualTypeOf<
      Observable<v26_0_0.ContainerEntry[]>
    >();

    // @ts-expect-error the default is v25.10, which has never heard of containers.
    api.query('container.query');
  });
});
