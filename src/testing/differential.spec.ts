import { firstValueFrom, lastValueFrom, toArray } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { JobState, type Job } from '@/types/job.type';
import { fakeJob } from './fake-job';
import type { JobUpdate } from './mock-answers';
import type { TrueNasMessage } from '@/types/truenas-message.type';
import alerts from 'test-data/alerts.json';
import { createFakeClient, type FakeTrueNasClient } from './create-fake-client';
import type { ApiDirectoryV27_0_0, v27_0_0 } from '@/generated';

/**
 * The convenience layer against the primitive it wraps.
 *
 * `mock.call` and its siblings exist to save a spec from writing frames by
 * hand. That is only worth having if the two produce the same thing, and
 * "produces the same thing" is a claim that rots quietly: the shorthand grows
 * a default, or answers at a different moment, and specs written against it
 * start passing for reasons the hand-written version would not.
 *
 * So each verb is run twice — once scripted, once driven frame by frame — and
 * the emissions are compared. A difference is a bug in whichever side moved.
 *
 * What it compares is *what* is emitted and in what order, not when. A
 * scripted answer delayed by a macrotask passes here as long as the sequence
 * is unchanged, which is the right line: the client's own contract is about
 * ordering, and a fake that answered on a timer would still be honest. It is
 * only worth stating because "answers at a different moment" is exactly what
 * this caught once, and it caught it through the sequence rather than the
 * clock.
 */
describe('scripted answers match hand-driven frames', () => {
  const built: FakeTrueNasClient<ApiDirectoryV27_0_0>[] = [];

  const client = (): FakeTrueNasClient<ApiDirectoryV27_0_0> => {
    const made = createFakeClient({ version: 'v27.0.0' });
    built.push(made);
    return made;
  };

  afterEach(() => {
    for (const made of built.splice(0, built.length)) made.connection.close();
  });

  it('call', async () => {
        const scripted = client();
    scripted.mock.call('core.ping', 'pong');
    const fromMock = await firstValueFrom(scripted.api.call('core.ping'));

    const driven = client();
    const pending = firstValueFrom(driven.api.call('core.ping'));
    driven.connection.reply('core.ping', 'pong');
    const fromFrames = await pending;

    expect(fromMock).toEqual(fromFrames);
  });

  it('query, queryOne and queryCount', async () => {
    const rows = [{ id: 'tank' }, { id: 'tank/child' }];

    const scripted = client();
    scripted.mock.query('pool.dataset.query', rows);
    const scriptedResults = [
      await firstValueFrom(scripted.api.query('pool.dataset.query')),
      await firstValueFrom(scripted.api.queryOne('pool.dataset.query')),
      await firstValueFrom(scripted.api.queryCount('pool.dataset.query')),
    ];

    // By hand, each verb answered with what the wire would have carried for it.
    const driven = client();
    const answers: unknown[] = [rows, (rows as unknown[])[0], (rows as unknown[]).length];
    const drivenResults: unknown[] = [];
    const verbs: (() => Promise<unknown>)[] = [
      () => firstValueFrom(driven.api.query('pool.dataset.query')),
      () => firstValueFrom(driven.api.queryOne('pool.dataset.query')),
      () => firstValueFrom(driven.api.queryCount('pool.dataset.query')),
    ];
    for (const [index, verb] of verbs.entries()) {
      const pending = verb();
      driven.connection.reply('pool.dataset.query', answers[index]);
      drivenResults.push(await pending);
    }

    expect(scriptedResults).toEqual(drivenResults);
  });

  it('job', async () => {
    const updates: JobUpdate<true>[] = [
      { state: JobState.Running, progress: { percent: 10 } },
      { state: JobState.Success, progress: { percent: 100 }, result: true },
    ];

    const scripted = client();
    scripted.mock.job('app.delete', updates);
    const fromMock = await lastValueFrom(
      scripted.api.job('app.delete', ['plex']).pipe(toArray())
    );

    const driven = client();
    const pending = lastValueFrom(driven.api.job('app.delete', ['plex']).pipe(toArray()));
    const sent = driven.connection.sent.find(m => m.method === 'app.delete');

    // The same fixtures on both sides, so what is being compared is delivery —
    // ordering, and which updates reach a subscriber — rather than which side
    // filled in more fields.
    const jobs = updates.map(update => fakeJob({ ...update, id: 1 }));
    const event = (job: Job, messageId?: string): TrueNasMessage =>
      ({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'changed',
          id: job.id,
          fields: messageId ? { ...job, message_ids: [messageId] } : job,
        },
      }) as unknown as TrueNasMessage;

    driven.connection.receive(event(jobs[0], sent?.id));
    driven.connection.reply('core.get_jobs', [jobs[0]]);
    driven.connection.receive(event(jobs[1]));
    const fromFrames = await pending;

    // Ids are allocated per scripted job, so compare the walk rather than the
    // identity: what a caller reads off `job()` is the state, the progress and
    // the result.
    const walk = (states: Job[]) =>
      states.map(({ state, progress, result }) => ({ state, progress, result }));

    expect(walk(fromMock)).toEqual(walk(fromFrames));
  });

  it('emit', async () => {
    const change = { msg: 'added', id: 1, fields: alerts[0] as unknown as v27_0_0.Alert } as const;

    const scripted = client();
    const scriptedSeen = firstValueFrom(scripted.api.events('alert.list'));
    scripted.mock.emit('alert.list', change);

    const driven = client();
    const drivenSeen = firstValueFrom(driven.api.events('alert.list'));
    driven.connection.receive({
      jsonrpc: '2.0',
      method: 'collection_update',
      params: { collection: 'alert.list', ...(change as object) },
    } as unknown as TrueNasMessage);

    expect(await scriptedSeen).toEqual(await drivenSeen);
  });
});
