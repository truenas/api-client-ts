import { firstValueFrom, lastValueFrom, take, toArray } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { JobState } from '@/types/job.type';
import alerts from 'test-data/alerts.json';
import { createFakeClient, type FakeTrueNasClient } from './create-fake-client';
import { fakeJob } from './fake-job';
import type { ApiDirectoryV27_0_0, v27_0_0 } from '@/generated';

describe('mock answers', () => {
  const built: FakeTrueNasClient<ApiDirectoryV27_0_0>[] = [];

  const client = (): FakeTrueNasClient<ApiDirectoryV27_0_0> => {
    const made = createFakeClient({ version: 'v27.0.0' });
    built.push(made);
    return made;
  };

  afterEach(() => {
    for (const made of built.splice(0, built.length)) made.connection.close();
  });

  it('answers a call, and can read the params it was given', async () => {
    const c = client();
    c.mock.call('core.ping', 'pong');

    await expect(firstValueFrom(c.api.call('core.ping'))).resolves.toBe('pong');
  });

  it('lets the answer depend on the params', async () => {
    const c = client();
    c.mock.call('pool.dataset.get_instance', params => ({ id: params[0] }));

    await expect(
      firstValueFrom(c.api.call('pool.dataset.get_instance', ['tank/one']))
    ).resolves.toMatchObject({ id: 'tank/one' });
  });

  /**
   * One fixture, three verbs. On the wire they are the same method separated
   * by their options, so scripting them apart would let a spec disagree with
   * itself about what the collection holds.
   */
  it('feeds query, queryOne and queryCount from one set of rows', async () => {
    const c = client();
    const rows = [{ id: 'tank' }, { id: 'tank/child' }];
    c.mock.query('pool.dataset.query', rows);

    await expect(firstValueFrom(c.api.query('pool.dataset.query'))).resolves.toHaveLength(2);
    await expect(firstValueFrom(c.api.queryOne('pool.dataset.query'))).resolves.toMatchObject({
      id: 'tank',
    });
    await expect(firstValueFrom(c.api.queryCount('pool.dataset.query'))).resolves.toBe(2);
  });

  /**
   * The job path is the one that is not request/response: the id arrives as an
   * event naming the frame, and `trackJob` opens with a snapshot read. All
   * three registrations have to line up or the observable never completes.
   */
  it('runs a job through the real correlation and completes it', async () => {
    const c = client();
    c.mock.job('app.delete', [
      { state: JobState.Running, progress: { percent: 10 } },
      { state: JobState.Success, progress: { percent: 100 }, result: true },
    ]);

    const states = await lastValueFrom(c.api.job('app.delete', ['plex']).pipe(toArray()));

    // The whole walk, not just the end. Asserting only the terminal state let
    // a version through that dropped every intermediate update — the
    // scripted answers were going out before `trackJob` had subscribed.
    expect(states.map(({ state, progress }) => ({ state, percent: progress.percent }))).toEqual([
      { state: JobState.Running, percent: 10 },
      { state: JobState.Success, percent: 100 },
    ]);
  });

  /**
   * `queryOne` is typed non-nullable, and the appliance raises rather than
   * sending nothing, so an empty collection has to error rather than resolve
   * with a value the caller's own types say cannot exist.
   */
  it('raises on queryOne when nothing matches', async () => {
    const c = client();
    c.mock.query('pool.dataset.query', []);

    await expect(firstValueFrom(c.api.queryOne('pool.dataset.query'))).rejects.toThrow(
      /MatchNotFound/
    );
    await expect(firstValueFrom(c.api.query('pool.dataset.query'))).resolves.toEqual([]);
    await expect(firstValueFrom(c.api.queryCount('pool.dataset.query'))).resolves.toBe(0);
  });

  /** A whole `Job`, not the three fields the fixture happened to name. */
  it('completes a scripted update into the shape a caller reads', async () => {
    const c = client();
    c.mock.job('app.delete', { state: JobState.Running });

    const running = await firstValueFrom(c.api.job('app.delete', ['plex']));

    expect(running.progress).toEqual({ percent: 0, description: '', extra: null });
    expect(running.result).toBeNull();
  });

  /**
   * Replayed, not simulated. Each update is exactly what the spec gave,
   * completed from the builder's defaults for the fields it did not name —
   * nothing folds forward, and a successful job is not forced to 100. Those
   * are middleware's rules; modelling them here means getting them right, and
   * four review rounds on this function found four places where that had gone
   * wrong. A spec that wants a percent to carry names it again.
   */
  it('replays each update as given rather than folding them', async () => {
    const c = client();
    c.mock.job('app.delete', [
      { state: JobState.Running, progress: { percent: 50, description: 'halfway' } },
      { state: JobState.Success },
    ]);

    const walk = await lastValueFrom(c.api.job('app.delete', ['plex']).pipe(toArray()));

    expect(walk.map(job => job.progress)).toEqual([
      { percent: 50, description: 'halfway', extra: null },
      { percent: 0, description: '', extra: null },
    ]);
  });

  /**
   * `Partial<Job>` makes every field optional, so a fixture built with a
   * conditional puts `undefined` where a `JobState` is declared. Applied, the
   * job never finishes: `isJobFinished` is false for a state that is not
   * there. Dropped, the builder's default stands.
   */
  it('falls back to the default rather than applying an undefined', async () => {
    const c = client();
    c.mock.job('app.delete', [
      { state: undefined, progress: { percent: 10 } },
      { state: JobState.Success },
    ]);

    const walk = await lastValueFrom(c.api.job('app.delete', ['plex']).pipe(toArray()));

    expect(walk[0].state).toBe(JobState.Running);
    expect(walk.at(-1)?.state).toBe(JobState.Success);
  });

  /** The id is a handle, so two scripted jobs cannot share one. */
  it('refuses an id another scripted job holds', () => {
    const c = client();
    c.mock.job('app.delete', { id: 7, state: JobState.Success });

    expect(() =>
      c.mock.job('app.start', { id: 7, state: JobState.Success })
    ).toThrow(/already holds/);
  });

  /**
   * Written against the id auto-allocation is about to hand out, rather than
   * against a fixed number: the counter is module-global, so asserting
   * `not.toBe(7)` passes whether or not the skip exists, depending only on how
   * many jobs earlier tests registered.
   */
  it('steps auto-allocation over an id a spec has claimed', () => {
    const c = client();
    const next = c.mock.job('app.start', { state: JobState.Success });
    const claimed = next + 1;

    const other = client();
    other.mock.job('app.delete', { id: claimed, state: JobState.Success });

    expect(other.mock.job('app.start', { state: JobState.Success })).not.toBe(
      claimed
    );
  });

  /** A scripted job reached through `trackJob` gets the whole walk. */
  it('walks a job tracked by id rather than started', async () => {
    const c = client();
    const id = c.mock.job('app.delete', [
      { state: JobState.Running, progress: { percent: 10 } },
      { state: JobState.Success },
    ]);

    const states = await lastValueFrom(c.api.trackJob(id).pipe(toArray()));

    expect(states.map(job => job.state)).toEqual([JobState.Running, JobState.Success]);
  });

  /**
   * One order composes and the other cannot, so the one that cannot is refused
   * rather than silently answering a job's read with someone else's row.
   */
  it('chains to a core.get_jobs scripted before it', async () => {
    const c = client();
    c.mock.query('core.get_jobs', [fakeJob({ id: 999, state: JobState.Failed }) as unknown as v27_0_0.CoreGetJobsItem]);
    c.mock.job('app.delete', { state: JobState.Success });

    // The job's own reads are answered by the job.
    await expect(lastValueFrom(c.api.job('app.delete', ['plex']))).resolves.toMatchObject({
      state: JobState.Success,
    });

    // Everything else falls through to what was scripted first.
    await expect(
      firstValueFrom(c.api.query('core.get_jobs', [['id', '=', 999]]))
    ).resolves.toMatchObject([{ id: 999 }]);
  });

  it('refuses to let a later core.get_jobs take the method from a job', () => {
    const c = client();
    c.mock.job('app.delete', { state: JobState.Success });

    expect(() => c.mock.query('core.get_jobs', [])).toThrow(/cannot be registered after/);
  });

  /**
   * A snapshot reports where the job has got to. `trackJob`'s own comment says
   * the read exists "so an already-finished job is still reported", so a
   * second reader after the walk has run must get the finished job rather than
   * be told it is running and left waiting for events already sent.
   */
  it('reports a finished job to a later reader', async () => {
    const c = client();
    const id = c.mock.job('app.delete', [
      { state: JobState.Running, progress: { percent: 10 } },
      { state: JobState.Success },
    ]);

    await lastValueFrom(c.api.job('app.delete', ['plex']));
    const again = await lastValueFrom(c.api.trackJob(id).pipe(toArray()));

    // One emission, the finished one. Answering from the start of the walk
    // instead would replay the whole thing and still end on `SUCCESS`, so the
    // final state alone certifies nothing.
    expect(again.map(job => job.state)).toEqual([JobState.Success]);
  });

  /** The dispatcher answers a scripted job's read in the shape it asked for. */
  it('honours get and count on a read for a scripted job', async () => {
    const c = client();
    const id = c.mock.job('app.delete', { state: JobState.Running });

    await expect(
      firstValueFrom(c.api.queryOne('core.get_jobs', [['id', '=', id]]))
    ).resolves.toMatchObject({ id });
    await expect(
      firstValueFrom(c.api.queryCount('core.get_jobs', [['id', '=', id]]))
    ).resolves.toBe(1);
  });

  /**
   * Two readers in the same tick. The cursor has to advance with the events
   * rather than ahead of them: set to the end before the microtask runs, the
   * second reader is told the job finished while the first has not yet seen it
   * run.
   */
  it('gives concurrent readers the same walk', async () => {
    const c = client();
    const id = c.mock.job('app.delete', [
      { state: JobState.Running, progress: { percent: 10 } },
      { state: JobState.Success },
    ]);

    const first = lastValueFrom(c.api.trackJob(id).pipe(toArray()));
    const second = lastValueFrom(c.api.trackJob(id).pipe(toArray()));

    expect((await first).map(job => job.state)).toEqual(
      (await second).map(job => job.state)
    );
  });

  /** The miss path answers in the shape it was asked for, like every other. */
  it('shapes an answer for an unknown job by the read options', async () => {
    const c = client();
    c.mock.job('app.delete', { state: JobState.Running });

    await expect(
      firstValueFrom(c.api.queryCount('core.get_jobs', [['id', '=', 999]]))
    ).resolves.toBe(0);
  });

  /** Restored from an earlier round: the refusal of an empty update list. */
  it('refuses an empty update list', () => {
    const c = client();

    expect(() => c.mock.job('app.delete', [])).toThrow(/nothing to answer with/);
  });

  /** A `get` that matched nothing raises, as `do_get` does — it never returns null. */
  it('raises on a get read for a job it does not know', async () => {
    const c = client();
    c.mock.job('app.delete', { state: JobState.Running });

    await expect(
      firstValueFrom(c.api.queryOne('core.get_jobs', [['id', '=', 999]]))
    ).rejects.toThrow(/MatchNotFound/);

    // The plain read still answers `[]`, which is what lets `trackJob` on an
    // unknown id complete rather than hang.
    await expect(
      firstValueFrom(c.api.query('core.get_jobs', [['id', '=', 999]]))
    ).resolves.toEqual([]);
  });

  /**
   * Two jobs on one method would correlate onto a single id when the method is
   * started, an id reuse the appliance cannot produce — so it is refused, like
   * the other two collision shapes.
   */
  it('refuses a second job on a method already scripted', () => {
    const c = client();
    c.mock.job('app.delete', { state: JobState.Success });

    expect(() => c.mock.job('app.delete', { state: JobState.Failed })).toThrow(
      /already scripted/
    );
  });

  /**
   * The `walking` guard, asserted on the wire rather than through `trackJob`.
   *
   * Two readers in one tick both find the cursor at the start, so without the
   * guard the walk is queued twice and every update goes out twice. Neither
   * tracker notices — each completes on the first terminal state and ignores
   * the rest — so the duplication is only visible in the messages themselves.
   */
  it('sends the walk once however many readers arrive together', async () => {
    const c = client();
    const id = c.mock.job('app.delete', [
      { state: JobState.Running, progress: { percent: 10 } },
      { state: JobState.Running, progress: { percent: 60 } },
      { state: JobState.Success },
    ]);

    let updates = 0;
    c.connection.messages$.subscribe(message => {
      if (message.method === 'collection_update') updates += 1;
    });

    await Promise.all([
      lastValueFrom(c.api.trackJob(id).pipe(toArray())),
      lastValueFrom(c.api.trackJob(id).pipe(toArray())),
    ]);

    // Two updates after the snapshot, once.
    expect(updates).toBe(2);
  });

  /**
   * A query method cannot be scripted through `mock.call` at all.
   *
   * They live in the call directory, so it would type-check — a query method's
   * response is the five-way union the server may return, and any arm of it is
   * a well-typed answer — and then feed all three query verbs from one value,
   * with `queryCount` resolving an array typed `number`. Refusing it at the
   * type level is what makes that unrepresentable rather than merely
   * discouraged.
   */
  it('does not offer mock.call for a query method', () => {
    const c = client();

    // @ts-expect-error a query method is excluded from mock.call
    c.mock.call('pool.dataset.query', []);
  });

  /** Updates to one job, so a second id in the list is a mistake, not a job. */
  it('refuses updates that name two different job ids', () => {
    const c = client();

    expect(() =>
      c.mock.job('app.delete', [{ id: 5 }, { id: 6 }])
    ).toThrow(/different ids: 5 and 6/);
  });

  /** A scripted job reports the method it was scripted for. */
  it('reports the method the job was scripted for', async () => {
    const c = client();
    c.mock.job('app.delete', { state: JobState.Success });

    const done = await lastValueFrom(c.api.job('app.delete', ['plex']));

    expect(done.method).toBe('app.delete');
  });

  /**
   * The error a `get` with no match produces is middleware's own, not a
   * friendlier one invented here: `MatchNotFound` is a bare `IndexError`, so
   * it lands in `rpc.py`'s generic arm as `EINVAL` with `repr(e)` for a reason.
   */
  it('raises what the appliance raises when a get matches nothing', async () => {
    const c = client();
    c.mock.query('pool.dataset.query', []);

    await expect(
      firstValueFrom(c.api.queryOne('pool.dataset.query'))
    ).rejects.toThrow('MatchNotFound()');

  });

  /** The error frame's own fields, as `rpc.py`'s generic arm builds them. */
  it('sends the frame the appliance builds for MatchNotFound', async () => {
    const c = client();
    c.mock.query('pool.dataset.query', []);

    const errors: unknown[] = [];
    c.connection.messages$.subscribe(message => {
      if (message.error) errors.push(message.error);
    });

    await expect(firstValueFrom(c.api.queryOne('pool.dataset.query'))).rejects.toThrow();

    expect(errors).toEqual([
      { error: 22, errname: 'EINVAL', extra: null, reason: 'MatchNotFound()' },
    ]);
  });

  /**
   * A rejected registration must not consume an id: `nextJobId` is how a spec
   * predicts what the next auto-allocated job will be called.
   */
  it('does not burn an id on a registration it refuses', () => {
    const before = client().mock.job('app.start', { state: JobState.Success });

    // The refusal has to sit *between* the two measured allocations: before
    // both, a burned id shifts them equally and the gap says nothing.
    const refused = client();
    refused.mock.job('app.delete', { state: JobState.Success });
    expect(() => refused.mock.job('app.delete', { state: JobState.Failed })).toThrow();

    const after = client().mock.job('app.start', { state: JobState.Success });

    // Two successful registrations between them — the `app.delete` pair's
    // first — so two ids, not three.
    expect(after - before).toBe(2);
  });

  /**
   * An update naming an id the first did not is a conflict, not a second job.
   * Accepted, it would have depended on what the auto-allocator was about to
   * hand out.
   */
  it('refuses a later update that names an id of its own', () => {
    const c = client();

    expect(() =>
      c.mock.job('app.delete', [{ state: JobState.Running }, { id: 6 }])
    ).toThrow(/different ids: none and 6/);
  });

  /** Errors go to the frame that asked, like every other answer. */
  it('addresses a not-found error to the read that asked for it', async () => {
    const c = client();
    c.mock.query('pool.dataset.query', []);

    // `queryOne` first, so "most recent frame for this method" would land the
    // error on the `query` that follows it.
    const one = firstValueFrom(c.api.queryOne('pool.dataset.query'));
    const rows = firstValueFrom(c.api.query('pool.dataset.query'));

    await expect(one).rejects.toThrow('MatchNotFound()');
    await expect(rows).resolves.toEqual([]);
  });

  /** An `undefined` inside `progress` falls back like one at the top level. */
  it('falls back inside progress too', async () => {
    const c = client();
    c.mock.job('app.delete', {
      state: JobState.Success,
      progress: { percent: undefined, description: 'done' },
    });

    const done = await lastValueFrom(c.api.job('app.delete', ['plex']));

    expect(done.progress).toEqual({ percent: 0, description: 'done', extra: null });
  });

  /**
   * Rows are checked against the entity. Held as "not a `UserEntry`" rather
   * than as a claim about `uid` in particular: `{ uid: 3 }` is refused too, for
   * the fields it is missing rather than for the one it names.
   */
  it('does not accept a row that is not the entity', () => {
    const c = client();

    // @ts-expect-error not a UserEntry
    c.mock.query('user.query', [{ uid: 'not-a-number' }]);
  });

  it('emits an event to every subscriber of that collection', async () => {
    const c = client();

    const first = firstValueFrom(c.api.events('alert.list').pipe(take(1)));
    const second = firstValueFrom(c.api.events('alert.list').pipe(take(1)));

    c.mock.emit('alert.list', { msg: 'added', id: 1, fields: alerts[0] as unknown as v27_0_0.Alert });

    await expect(first).resolves.toMatchObject({ msg: 'added' });
    await expect(second).resolves.toMatchObject({ msg: 'added' });
  });

  /**
   * The frames are still the real ones. A scripted answer changes what comes
   * back, not what went out, which is what makes `sent` worth asserting on.
   */
  it('leaves the request on the wire for a spec to assert on', async () => {
    const c = client();
    c.mock.query('pool.dataset.query', []);

    await firstValueFrom(c.api.queryCount('pool.dataset.query', [['id', '=', 'tank']]));

    expect(c.connection.sent.at(-1)).toMatchObject({
      method: 'pool.dataset.query',
      params: [[['id', '=', 'tank']], { count: true }],
    });
  });
});
