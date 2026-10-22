import { BehaviorSubject, firstValueFrom, merge, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrueNasApiError } from '@/errors/api.errors';
import { fakeApiError } from '@/testing/fake-api-error';
import { FakeConnection } from '@/testing/fake-connection';
import { Job, JobState } from '@/types/job.type';
import { TrueNasMessage } from '@/types/truenas-message.type';
import alerts from 'test-data/alerts.json';
import jobEvent from 'test-data/job-event.json';
import { TrueNasApi } from './truenas-api';

// Mock createJsonRpcMessage so message ids are deterministic. Subscriptions
// are keyed by their argument too: the job stream subscribes alongside every
// `events()` call, and one id for all of them would cross their answers.
vi.mock('@/utils/jsonrpc.utils', () => ({
  createJsonRpcMessage: vi.fn((method: string, params?: unknown) => ({
    jsonrpc: '2.0',
    id: /^core\.(un)?subscribe$/.test(method) && Array.isArray(params)
      ? `mock-id-${method}-${String(params[0])}`
      : `mock-id-${method}`,
    method,
    params: params ?? [],
  })),
}));

describe('TrueNasApi', () => {
  let api: TrueNasApi;
  let connection: FakeConnection;
  let authenticated$: BehaviorSubject<boolean>;

  beforeEach(() => {
    // A real `TrueNasConnection` subclass rather than an object cast into
    // shape. The cast this replaced came with a comment conceding that its
    // `send` "forwards straight through" where the real one queues on `ws$` —
    // a documented divergence, which is the shape of the drift this exists to
    // remove.
    //
    // Assertions read `connection.sent`, the frames that actually reached the
    // wire, rather than a spy on `send`. The old double asserted on `ws.next`,
    // which could only fire if `send` forwarded; a spy on `send` says the
    // method was called and nothing about what came out, so it stays green
    // even if the frame is dropped on the floor.
    connection = new FakeConnection();

    authenticated$ = new BehaviorSubject<boolean>(false);
    api = new TrueNasApi(authenticated$, connection);
  });

  // Ordinary teardown: nothing pends on an unclosed fake, but closing is what
  // a consumer would do, and the spec should not look like an exception.
  afterEach(() => {
    connection.close();
  });

  it('should execute call method with JSON-RPC 2.0 format and return the result', () =>
    new Promise<void>((resolve, reject) => {
      const mockMethod = 'system.info';
      const mockId = `mock-id-system.info`;
      const mockResponse = {
        jsonrpc: '2.0',
        id: mockId,
        result: { hostname: 'truenas.local' },
      } as unknown as TrueNasMessage;

      api
        .call(mockMethod)
        .subscribe(response => {
          try {
            expect(response).toEqual(mockResponse.result);
            resolve();
          } catch (err) {
            reject(err);
          }
        });

      // The frame is written synchronously inside `call()` — assert before emitting.
      try {
        expect(connection.sent).toContainEqual({
          jsonrpc: '2.0',
          id: mockId,
          method: mockMethod,
          params: [],
        });
      } catch (err) {
        reject(err);
      }

      connection.receive(mockResponse);
    }));

  it('should throw error when JSON-RPC 2.0 response contains error', () =>
    new Promise<void>((resolve, reject) => {
      const mockMethod = 'system.info';
      const mockId = `mock-id-system.info`;
      // No cast: `-32600 / "Invalid request"` is one of the codes middleware
      // sends without a `data` payload, and the frame type now says so.
      const mockErrorResponse: TrueNasMessage = {
        jsonrpc: '2.0',
        id: mockId,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      };

      api.call(mockMethod).subscribe({
        next: () => reject(new Error('Should have thrown an error')),
        error: (error: Error) => {
          try {
            expect(error.message).toBe('Invalid Request');
            resolve();
          } catch (err) {
            reject(err);
          }
        },
      });

      connection.receive(mockErrorResponse);
    }));

  /** A `collection_update` notification as it arrives on the socket. */
  const collectionUpdate = (params: Record<string, unknown>) =>
    ({
      jsonrpc: '2.0',
      method: 'collection_update',
      params,
    }) as unknown as TrueNasMessage;

  it('subscribes to the collection and emits the change, not the frame', () =>
    new Promise<void>((resolve, reject) => {
      authenticated$.next(true);

      api.events('app.query').subscribe(event => {
        try {
          // The transport frame and the `collection` are stripped: what is
          // left is the payload the event directory declares, plus its tag.
          expect(event).toEqual({ msg: 'added', id: 'app-1', fields: alerts });
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      try {
        expect(connection.sent).toContainEqual({
          jsonrpc: '2.0',
          id: 'mock-id-core.subscribe-app.query',
          method: 'core.subscribe',
          params: ['app.query'],
        });
      } catch (err) {
        reject(err);
      }

      connection.receive(
        collectionUpdate({
          collection: 'app.query',
          msg: 'added',
          id: 'app-1',
          fields: alerts,
        })
      );
    }));

  /**
   * Removed events were dropped outright. The filter required
   * `fields !== undefined`, and a removal carries an id and no fields in 55 of
   * the 56 collections that declare one — so the branch existed, matched the
   * `msg`, and then discarded every event it matched.
   */
  it('emits removals, which carry an id and no fields', () =>
    new Promise<void>((resolve, reject) => {
      authenticated$.next(true);
      const seen: unknown[] = [];

      api.events('app.query').subscribe(event => {
        seen.push(event);
        if (seen.length < 2) return;
        try {
          expect(seen).toEqual([
            { msg: 'removed', id: 'app-1' },
            { msg: 'changed', id: 'app-2', fields: alerts },
          ]);
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      connection.receive(
        collectionUpdate({ collection: 'app.query', msg: 'removed', id: 'app-1' })
      );
      // A different collection on the same socket must not leak through.
      connection.receive(
        collectionUpdate({ collection: 'disk.query', msg: 'added', id: 'd1' })
      );
      // Neither must a msg that is not a collection change.
      connection.receive(
        collectionUpdate({ collection: 'app.query', msg: 'unsubscribed' })
      );
      connection.receive(
        collectionUpdate({
          collection: 'app.query',
          msg: 'changed',
          id: 'app-2',
          fields: alerts,
        })
      );
    }));

  it('should track job progress and complete when job finishes', () =>
    new Promise<void>((resolve, reject) => {
      const jobId = jobEvent.id;
      const runningJob: Job = {
        ...jobEvent.fields,
        state: JobState.Running,
      } as Job;

      const completedJob: Job = {
        ...runningJob,
        state: JobState.Success,
        progress: {
          percent: 100,
          description: 'Completed',
        },
      } as Job;

      // Create a subject for call responses
      const jobMessagesSubject = new Subject<TrueNasMessage>();
      vi.spyOn(connection, 'messages').mockReturnValue(jobMessagesSubject);

      const newApi = new TrueNasApi(authenticated$, connection);

      const results: Job[] = [];
      newApi.trackJob(jobId).subscribe({
        next: job => {
          results.push(job);
        },
        complete: () => {
          try {
            // We expect 3 results:
            // 1. Initial state from the API call (Running)
            // 2. Job event update (Running)
            // 3. Job completion event (Success)
            expect(results).toHaveLength(3);
            expect(results[0].state).toBe(JobState.Running);
            expect(results[1].state).toBe(JobState.Running);
            expect(results[2].state).toBe(JobState.Success);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
      });

      // First emit the response for the initial call to get current job state
      jobMessagesSubject.next({
        jsonrpc: '2.0',
        id: 'mock-id-core.get_jobs',
        result: [runningJob],
      } as unknown as TrueNasMessage);

      // Then emit job update events (JSON-RPC 2.0 collection_update format)
      jobMessagesSubject.next({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'changed',
          id: runningJob.id,
          fields: runningJob,
        },
      } as unknown as TrueNasMessage);
      jobMessagesSubject.next({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'changed',
          id: completedJob.id,
          fields: completedJob,
        },
      } as unknown as TrueNasMessage);
    }));

  it('callAndGetJobId returns the id of the job whose message_ids includes the request id', () =>
    new Promise<void>((resolve, reject) => {
      const method = 'app.start';
      const requestId = `mock-id-${method}`; // from the createJsonRpcMessage mock

      api
        .callAndGetJobId(method, ['my-app'])
        .subscribe({
          next: jobId => {
            try {
              // Must pick the matching job (4180), NOT the earlier non-matching one (999).
              expect(jobId).toBe(4180);
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          error: reject,
        });

      // request was sent with the mocked id
      try {
        expect(connection.sent).toContainEqual(
          expect.objectContaining({ id: requestId, method })
        );
      } catch (err) {
        reject(err);
      }

      // A job event whose message_ids do NOT include our request id — must be ignored.
      connection.receive({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 999, message_ids: ['someone-elses-request'] },
        },
      } as unknown as TrueNasMessage);

      // The matching job event — its message_ids include our request id.
      connection.receive({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 4180, message_ids: [requestId] },
        },
      } as unknown as TrueNasMessage);
    }));

  /**
   * `job` is `callAndGetJobId` followed by `trackJob`, and the seam between
   * them is where it can go wrong: the id has to come from the event
   * correlation and be handed to the tracker, which then has to reach a
   * terminal state for the stream to complete. Driven end to end rather than
   * by spying on the two halves, which would pass even if the seam were wired
   * backwards.
   */
  it('job starts the method, then follows the job it started to completion', () =>
    new Promise<void>((resolve, reject) => {
      const requestId = 'mock-id-app.start';
      const seen: { id: number; state: JobState }[] = [];

      api.job('app.start', ['my-app']).subscribe({
        next: job => seen.push({ id: job.id, state: job.state }),
        complete: () => {
          try {
            // The running state fetched by id, then the terminal event — and
            // both for job 77, the one the request actually started.
            expect(seen).toEqual([
              { id: 77, state: JobState.Running },
              { id: 77, state: JobState.Success },
            ]);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        error: reject,
      });

      // The job event that identifies which job the request started.
      connection.receive({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 77, message_ids: [requestId], state: JobState.Running },
        },
      } as unknown as TrueNasMessage);

      // trackJob's opening core.get_jobs read.
      connection.receive({
        jsonrpc: '2.0',
        id: 'mock-id-core.get_jobs',
        result: [{ id: 77, state: JobState.Running }],
      } as unknown as TrueNasMessage);

      // A different job finishing must not complete our stream. Deliberately
      // not an id adjacent to 77: an off-by-one in the seam would then be
      // indistinguishable from correct tracking, which is how the first
      // version of this test passed against a `trackJob(jobId + 1)` mutation.
      connection.receive({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 999, state: JobState.Success },
        },
      } as unknown as TrueNasMessage);

      connection.receive({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 77, state: JobState.Success },
        },
      } as unknown as TrueNasMessage);
    }));

  /**
   * The race that used to hang. `trackJob` opened with a `core.get_jobs` read
   * and only subscribed to job events once it came back; `jobEvents` is
   * `share()`d without replay, so a terminal event arriving during that round
   * trip was dropped and nothing ever ended the stream. Ordering here is the
   * whole test: the terminal event is emitted BEFORE the read's reply.
   */
  it('completes when the job finishes before the opening read replies', () =>
    new Promise<void>((resolve, reject) => {
      const requestId = 'mock-id-app.start';
      const states: JobState[] = [];
      let completed = false;

      api.job('app.start', ['my-app']).subscribe({
        next: job => states.push(job.state),
        complete: () => {
          completed = true;
          try {
            expect(states).toContain(JobState.Success);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        error: reject,
      });

      // Correlation event: tells callAndGetJobId which job this is.
      connection.receive(
        collectionUpdate({
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 77, message_ids: [requestId], state: JobState.Running },
        })
      );

      // The job finishes immediately — before the core.get_jobs read replies.
      connection.receive(
        collectionUpdate({
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 77, state: JobState.Success },
        })
      );

      // The reply lands afterwards and is stale. It must not resurrect the
      // stream, and its absence must not have been required to complete.
      connection.receive({
        jsonrpc: '2.0',
        id: 'mock-id-core.get_jobs',
        result: [{ id: 77, state: JobState.Running }],
      } as unknown as TrueNasMessage);

      if (!completed) {
        reject(new Error(`stream did not complete; states=${JSON.stringify(states)}`));
      }
    }));

  /**
   * A job id with no row behind it — reaped, or never real. Merging the read
   * with the event stream made this hang: the read completed without emitting
   * and the events never complete, so nothing ended the stream. Completing
   * empty is what it did before the two were merged.
   */
  it('completes when the opening read finds no such job', () =>
    new Promise<void>((resolve, reject) => {
      const seen: Job[] = [];
      let completed = false;

      api.trackJob(999).subscribe({
        next: job => seen.push(job),
        complete: () => {
          completed = true;
          try {
            expect(seen).toEqual([]);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        error: reject,
      });

      connection.receive({
        jsonrpc: '2.0',
        id: 'mock-id-core.get_jobs',
        result: [],
      } as unknown as TrueNasMessage);

      if (!completed) reject(new Error('stream did not complete on an absent job'));
    }));

  /**
   * An empty read arriving *after* live updates is stale, not authoritative:
   * the events are evidence the job exists. Completing on it would turn the
   * hang this replaced into a silent wrong answer — a job reported as finished
   * while still running.
   */
  it('ignores an empty read once updates have proved the job exists', () =>
    new Promise<void>((resolve, reject) => {
      const states: JobState[] = [];

      api.trackJob(77).subscribe({
        next: job => states.push(job.state),
        complete: () => {
          try {
            expect(states).toEqual([JobState.Running, JobState.Success]);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        error: reject,
      });

      connection.receive(
        collectionUpdate({
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 77, state: JobState.Running },
        })
      );
      // Stale: the job is plainly alive, whatever this says.
      connection.receive({
        jsonrpc: '2.0',
        id: 'mock-id-core.get_jobs',
        result: [],
      } as unknown as TrueNasMessage);
      connection.receive(
        collectionUpdate({
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 77, state: JobState.Success },
        })
      );
    }));

  /**
   * Nothing goes on the wire until something subscribes. Building a request
   * and subscribing later used to lose the reply outright, because the filter
   * that matches it by id had no subscriber when it arrived.
   */
  it('sends nothing until subscribed, and still gets the reply', () =>
    new Promise<void>((resolve, reject) => {
      const pending = api.call('system.info');
      try {
        expect(connection.sent).toEqual([]);
      } catch (err) {
        reject(err);
        return;
      }

      pending.subscribe({
        next: res => {
          try {
            expect(res).toEqual({ hostname: 'later.local' });
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        error: reject,
      });

      expect(connection.sent).toHaveLength(1);
      connection.receive({
        jsonrpc: '2.0',
        id: 'mock-id-system.info',
        result: { hostname: 'later.local' },
      } as unknown as TrueNasMessage);
    }));

  /**
   * A request made while disconnected sits queued on `ws$`. If the caller
   * gives up before a socket appears, the queued send must go with them —
   * otherwise every abandoned call leaves a subscription behind, and the frame
   * still goes out whenever the connection eventually opens.
   */
  it('drops a queued send when the caller unsubscribes', () => {
    const offline = new FakeConnection({ opened: false });
    const api = new TrueNasApi(authenticated$, offline);

    const sub = api.call('system.info').subscribe();
    expect(offline.sent).toHaveLength(0);
    sub.unsubscribe();

    // The socket arrives after the caller gave up: nothing should be sent.
    offline.simulateOpen();
    expect(offline.sent).toHaveLength(0);
    offline.close();
  });

  /**
   * The server subscription is per socket, not per caller, so two subscribers
   * to the same event must not each register one — nothing sends
   * `core.unsubscribe`, so a duplicate would leak for the life of the socket.
   */
  /** `core.subscribe` frames for one collection, in send order. */
  const subscribeFrames = (collection: string) =>
    connection.sent
      .map(m => m as { method?: string; params?: unknown })
      .filter(
        m =>
          m.method === 'core.subscribe' &&
          JSON.stringify(m.params) === JSON.stringify([collection])
      );

  it('registers one core.subscribe per event however many subscribers', () => {
    authenticated$.next(true);
    const stream = api.events('app.query');
    stream.subscribe();
    stream.subscribe();
    api.events('app.query').subscribe();

    expect(subscribeFrames('app.query')).toHaveLength(1);
  });

  /** `core.unsubscribe` frames, in send order, by the id each releases. */
  const unsubscribed = () =>
    connection.sent
      .filter(m => m.method === 'core.unsubscribe')
      .map(m => (m.params as string[])[0]);

  /**
   * Lets the fake's microtask answer to `core.subscribe` land. It numbers its
   * answers, and the job stream's subscribe on authentication is the first, so
   * the first `events()` subscription is answered `subscription-2`.
   */
  const settle = () => new Promise<void>(resolve => queueMicrotask(resolve));

  /**
   * Middleware keeps a subscription per `core.subscribe` until it is told to
   * drop it, so the last subscriber leaving has to tell it, by the id the
   * subscribe was answered with. Until this, nothing ever did: a timer-driven
   * source kept streaming to a page that had closed.
   */
  it('releases the subscription by its id when the last subscriber leaves', async () => {
    authenticated$.next(true);
    const stream = api.events('app.query');
    const first = stream.subscribe();
    const second = stream.subscribe();
    await settle();

    first.unsubscribe();
    expect(unsubscribed()).toEqual([]);

    second.unsubscribe();
    expect(unsubscribed()).toEqual(['subscription-2']);
  });

  it('registers again for a subscriber arriving after the release', async () => {
    authenticated$.next(true);
    api.events('app.query').subscribe().unsubscribe();
    api.events('app.query').subscribe();
    await settle();

    expect(subscribeFrames('app.query')).toHaveLength(2);
  });

  it('releases a subscription its subscribers left before the id came back', async () => {
    authenticated$.next(true);
    api.events('app.query').subscribe().unsubscribe();
    expect(unsubscribed()).toEqual([]);

    await settle();

    expect(unsubscribed()).toEqual(['subscription-2']);
  });

  /** A lost socket takes its subscriptions with it; there is nothing to release. */
  it('does not release a subscription the lost socket already took', async () => {
    authenticated$.next(true);
    const subscription = api.events('app.query').subscribe();
    await settle();

    authenticated$.next(false);
    subscription.unsubscribe();

    expect(unsubscribed()).toEqual([]);
  });

  /**
   * Closing the connection for good ends every event stream, so a consumer
   * waiting on completion hears it and the resubscription is torn down.
   */
  it('completes an event stream when the connection is closed for good', async () => {
    authenticated$.next(true);
    let completed = false;
    api.events('app.query').subscribe({ complete: () => (completed = true) });
    await settle();

    connection.close();

    expect(completed).toBe(true);
  });

  /**
   * Re-registering IS right after a reconnect: the server forgot. That is a
   * different trigger from a subscriber cycling, and the two must not be
   * conflated.
   */
  it('re-registers after a reconnect', () => {
    authenticated$.next(true);
    api.events('app.query').subscribe();
    expect(subscribeFrames('app.query')).toHaveLength(1);

    authenticated$.next(false);
    authenticated$.next(true);

    expect(subscribeFrames('app.query')).toHaveLength(2);
  });

  /**
   * The opening read has two consumers — the snapshot and the not-found
   * signal — so it is `share()`d. If that sharing were lost, tracking a job
   * would quietly ask the server twice for the same thing.
   */
  it('issues exactly one core.get_jobs read per tracked job', () => {
    api.trackJob(77).subscribe();

    const reads = connection.sent.filter(m => m.method === 'core.get_jobs');

    expect(reads).toHaveLength(1);
  });

  /**
   * The server forgets a socket's subscriptions with it, so a job's events
   * sent while the socket was down went to nobody. Jobs that restart services
   * over this socket finish in exactly that gap, and the stream used to stay
   * open forever waiting for an end it had already missed.
   */
  describe('trackJob across a reconnect', () => {
    const reads = () =>
      connection.sent.filter(m => m.method === 'core.get_jobs');
    const reply = (frame: { result: unknown[] } | { error: unknown }) =>
      connection.receive({
        jsonrpc: '2.0',
        id: 'mock-id-core.get_jobs',
        ...frame,
      } as unknown as TrueNasMessage);
    const update = (fields: Record<string, unknown>) =>
      connection.receive(
        collectionUpdate({ collection: 'core.get_jobs', msg: 'changed', fields })
      );
    const reconnect = () => {
      authenticated$.next(false);
      authenticated$.next(true);
    };

    function track(): { states: JobState[]; percents: number[]; done: () => boolean } {
      const states: JobState[] = [];
      const percents: number[] = [];
      let completed = false;
      api.trackJob(77).subscribe({
        next: job => {
          states.push(job.state);
          percents.push(job.progress?.percent ?? -1);
        },
        complete: () => (completed = true),
      });
      return { states, percents, done: () => completed };
    }

    it('reads the job again, and ends on a finish it missed', () => {
      authenticated$.next(true);
      const job = track();
      reply({ result: [{ id: 77, state: JobState.Running }] });

      reconnect();
      expect(reads()).toHaveLength(2);
      reply({ result: [{ id: 77, state: JobState.Success }] });

      expect(job.states).toEqual([JobState.Running, JobState.Success]);
      expect(job.done()).toBe(true);
    });

    it('completes when the job was reaped while the socket was down', () => {
      authenticated$.next(true);
      const job = track();
      reply({ result: [{ id: 77, state: JobState.Running }] });

      reconnect();
      reply({ result: [] });

      expect(job.states).toEqual([JobState.Running]);
      expect(job.done()).toBe(true);
    });

    /** The opening read is queued for the first socket, so nothing was missed. */
    it('does not read again on the first connection', () => {
      track();
      authenticated$.next(true);

      expect(reads()).toHaveLength(1);
    });

    /** As with the opening read: once events flow again, the reply is behind them. */
    it('drops a reply that a live update has overtaken', () => {
      authenticated$.next(true);
      const job = track();
      reply({ result: [{ id: 77, state: JobState.Running, progress: { percent: 10 } }] });

      reconnect();
      update({ id: 77, state: JobState.Running, progress: { percent: 60 } });
      reply({ result: [{ id: 77, state: JobState.Running, progress: { percent: 50 } }] });

      expect(job.percents).toEqual([10, 60]);
      expect(job.done()).toBe(false);
    });

    it('keeps listening for events when the read fails', () => {
      authenticated$.next(true);
      const job = track();
      reply({ result: [{ id: 77, state: JobState.Running }] });

      reconnect();
      reply({ error: fakeApiError() });
      update({ id: 77, state: JobState.Success });

      expect(job.states).toEqual([JobState.Running, JobState.Success]);
      expect(job.done()).toBe(true);
    });
  });

  /**
   * An event can beat the point-in-time read. The snapshot arm is dropped once
   * an update lands, so a stale reply cannot walk the state backwards — but
   * dropping it must not cost the terminal transition when the update that
   * dropped it was only progress.
   */
  it('prefers a live update over a slower snapshot, and still completes', () =>
    new Promise<void>((resolve, reject) => {
      const seen: number[] = [];

      api.trackJob(77).subscribe({
        next: job => seen.push(job.progress.percent ?? -1),
        complete: () => {
          try {
            // 60 from the event; the stale 10 from the reply never arrives.
            expect(seen).toEqual([60, 100]);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        error: reject,
      });

      connection.receive(
        collectionUpdate({
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: {
            id: 77,
            state: JobState.Running,
            progress: { percent: 60, description: '' },
          },
        })
      );
      connection.receive({
        jsonrpc: '2.0',
        id: 'mock-id-core.get_jobs',
        result: [
          {
            id: 77,
            state: JobState.Running,
            progress: { percent: 10, description: '' },
          },
        ],
      } as unknown as TrueNasMessage);
      connection.receive(
        collectionUpdate({
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: {
            id: 77,
            state: JobState.Success,
            progress: { percent: 100, description: '' },
          },
        })
      );
    }));

  it('generateToken calls auth.generate_token with the expected params', () =>
    new Promise<void>((resolve, reject) => {
      api.generateToken(300, true, false).subscribe({
        next: token => {
          try {
            expect(token).toBe('tok-abc');
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        error: reject,
      });

      try {
        expect(connection.sent).toContainEqual(
          expect.objectContaining({
            method: 'auth.generate_token',
            params: [300, {}, true, false],
          })
        );
      } catch (err) {
        reject(err);
      }

      connection.receive({
        jsonrpc: '2.0',
        id: `mock-id-auth.generate_token`,
        result: 'tok-abc',
      } as unknown as TrueNasMessage);
    }));

  it('should handle job that is already completed', () =>
    new Promise<void>((resolve, reject) => {
      const jobId = 123;
      const completedJob = {
        id: jobId,
        method: 'test.method',
        state: JobState.Success,
        progress: {
          percent: 100,
          description: 'Completed',
        },
      } as Job;

      // Create a subject for call responses
      const completedJobMessagesSubject = new Subject<TrueNasMessage>();
      vi.spyOn(connection, 'messages').mockReturnValue(
        completedJobMessagesSubject
      );

      const newApi = new TrueNasApi(authenticated$, connection);

      const results: Job[] = [];
      newApi.trackJob(jobId).subscribe({
        next: job => {
          results.push(job);
        },
        complete: () => {
          try {
            // We expect only 1 result since job is already complete
            expect(results).toHaveLength(1);
            expect(results[0].state).toBe(JobState.Success);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
      });

      // Emit the response for a job that's already completed
      completedJobMessagesSubject.next({
        jsonrpc: '2.0',
        id: 'mock-id-core.get_jobs',
        result: [completedJob],
      } as unknown as TrueNasMessage);
    }));

  /**
   * The verbs are typed against the generated directory, but on the wire they
   * are ordinary `.query` calls — the verb only decides which options are sent.
   * These pin that translation; `src/query-projection.spec.ts` pins the types.
   */
  describe('query verbs', () => {
    /**
     * `params` of the single JSON-RPC message the verb put on the wire.
     *
     * The verbs are deferred, so nothing is sent until something subscribes —
     * hence the `.subscribe()` on each call below rather than a bare
     * invocation. That is the point of the deferral: an observable nobody
     * subscribed to has not asked the server for anything.
     */
    const sentParams = (): unknown =>
      (connection.sent[0] as TrueNasMessage)
        .params;

    const queryApi = () =>
      api as unknown as TrueNasApi<{
        call: {
          'user.query': {
            entity: { id: number; username: string; uid: number };
          };
        };
        job: Record<never, never>;
        event: Record<never, never>;
      }>;

    it('sends filters and options unchanged for query', () => {
      queryApi()
        .query('user.query', [['uid', '>', 1000]], {
          select: ['id'],
          limit: 10,
        })
        .subscribe();

      expect(sentParams()).toEqual([
        [['uid', '>', 1000]],
        { select: ['id'], limit: 10 },
      ]);
    });

    it('defaults to no filters and no options', () => {
      queryApi().query('user.query').subscribe();

      expect(sentParams()).toEqual([[], {}]);
    });

    it('adds get:true for queryOne, preserving the caller options', () => {
      queryApi()
        .queryOne('user.query', [['id', '=', 1]], { select: ['id'] })
        .subscribe();

      expect(sentParams()).toEqual([
        [['id', '=', 1]],
        { select: ['id'], get: true },
      ]);
    });

    it('sends only count:true for queryCount', () => {
      queryApi().queryCount('user.query', [['uid', '>', 1000]]).subscribe();

      expect(sentParams()).toEqual([[['uid', '>', 1000]], { count: true }]);
    });

    it('emits the result like any other call', () =>
      new Promise<void>((resolve, reject) => {
        queryApi()
          .queryCount('user.query')
          .subscribe(count => {
            try {
              expect(count).toBe(42);
              resolve();
            } catch (err) {
              reject(err);
            }
          });

        connection.receive({
          jsonrpc: '2.0',
          id: 'mock-id-user.query',
          result: 42,
        } as unknown as TrueNasMessage);
      }));
  });

  /**
   * Event sources take arguments, encoded the way middleware decodes them:
   * `core.subscribe('<name>:<json>')`, split on the first `:` and parsed as
   * JSON. The same string comes back as each update's `collection`.
   */
  describe('event sources', () => {
    const tail = { path: '/var/log/messages', tail_lines: 500 };
    const tailName = `filesystem.file_tail_follow:${JSON.stringify(tail)}`;

    const sourceApi = () =>
      api as unknown as TrueNasApi<{
        call: Record<never, never>;
        job: Record<never, never>;
        event: {
          'filesystem.file_tail_follow': {
            subscriptionParams: { path: string; tail_lines?: number };
            added: { fields: { data: string } };
          };
          'reporting.realtime': {
            subscriptionParams: { interval?: number };
            added: { fields: unknown };
          };
        };
      }>;

    beforeEach(() => {
      authenticated$.next(true);
    });

    it('subscribes with the arguments encoded into the name, and emits what comes back under it', async () => {
      const lines: unknown[] = [];
      sourceApi()
        .events('filesystem.file_tail_follow', tail)
        .subscribe(event => lines.push(event));

      expect(subscribeFrames(tailName)).toHaveLength(1);

      connection.receive(
        collectionUpdate({ collection: tailName, msg: 'added', fields: { data: 'boot' } })
      );
      // Another file's tail on the same socket is someone else's.
      connection.receive(
        collectionUpdate({
          collection: 'filesystem.file_tail_follow:{"path":"/var/log/other"}',
          msg: 'added',
          fields: { data: 'not ours' },
        })
      );

      expect(lines).toEqual([{ msg: 'added', fields: { data: 'boot' } }]);
    });

    it('keeps one subscription per set of arguments', () => {
      sourceApi().events('filesystem.file_tail_follow', tail).subscribe();
      sourceApi().events('filesystem.file_tail_follow', tail).subscribe();
      sourceApi()
        .events('filesystem.file_tail_follow', { path: '/var/log/other' })
        .subscribe();

      expect(
        connection.sent.filter(
          m => m.method === 'core.subscribe' && m.params?.toString() !== 'core.get_jobs'
        )
      ).toHaveLength(2);
    });

    it('shares one subscription for the same arguments in another key order', () => {
      sourceApi().events('filesystem.file_tail_follow', tail).subscribe();
      sourceApi()
        .events('filesystem.file_tail_follow', { tail_lines: 500, path: '/var/log/messages' })
        .subscribe();

      const tailSubscriptions = connection.sent.filter(
        m =>
          m.method === 'core.subscribe' &&
          String((m.params as string[])[0]).startsWith('filesystem.file_tail_follow:')
      );
      expect(tailSubscriptions).toHaveLength(1);
    });

    it('subscribes by the bare name when the arguments are left out', () => {
      sourceApi().events('reporting.realtime').subscribe();

      expect(subscribeFrames('reporting.realtime')).toHaveLength(1);
    });

    it('releases the source when the last subscriber leaves', async () => {
      const subscription = sourceApi()
        .events('filesystem.file_tail_follow', tail)
        .subscribe();
      await settle();

      subscription.unsubscribe();

      expect(unsubscribed()).toEqual(['subscription-2']);
    });

    it('completes when middleware ends the subscription, and releases nothing', async () => {
      const ended = firstValueFrom(
        sourceApi().events('filesystem.file_tail_follow', tail),
        { defaultValue: 'completed' }
      );
      await settle();

      connection.receive({
        jsonrpc: '2.0',
        method: 'notify_unsubscribed',
        params: { collection: tailName, error: null },
      });

      await expect(ended).resolves.toBe('completed');
      expect(unsubscribed()).toEqual([]);
    });

    it('errors with the reason when middleware rejects the arguments', async () => {
      const rejected = firstValueFrom(
        sourceApi().events('filesystem.file_tail_follow', { path: '/nope' })
      );

      connection.receive({
        jsonrpc: '2.0',
        method: 'notify_unsubscribed',
        params: {
          collection: 'filesystem.file_tail_follow:{"path":"/nope"}',
          error: fakeApiError({
            errname: 'ENOENT',
            error: 2,
            reason: '[ENOENT] /nope: does not exist',
          }).data,
        },
      });

      await expect(rejected).rejects.toMatchObject({
        message: '[ENOENT] /nope: does not exist',
        errname: 'ENOENT',
      });
    });

    /**
     * Middleware validates a source's arguments before it answers
     * `core.subscribe`, so a rejection's `notify_unsubscribed` can beat the id.
     * The server has already dropped that id; releasing it is a stray frame.
     */
    it('releases nothing when the server ended the subscription before its id came back', async () => {
      const rejected = firstValueFrom(
        sourceApi().events('filesystem.file_tail_follow', { path: '/nope' })
      ).catch(() => 'rejected');

      // Before the fake's microtask answer to `core.subscribe` lands.
      connection.receive({
        jsonrpc: '2.0',
        method: 'notify_unsubscribed',
        params: {
          collection: 'filesystem.file_tail_follow:{"path":"/nope"}',
          error: fakeApiError({ reason: '[ENOENT] /nope: does not exist' }).data,
        },
      });
      await expect(rejected).resolves.toBe('rejected');
      await settle();

      expect(unsubscribed()).toEqual([]);
    });

    const endNotice = (error: unknown = null) =>
      connection.receive({
        jsonrpc: '2.0',
        method: 'notify_unsubscribed',
        params: { collection: tailName, error },
      });

    /**
     * Middleware's answer to releasing a source: the error-free notice from
     * `terminate`, then the call's own `null` reply, in that order.
     */
    const answerReleasesAsMiddlewareDoes = () =>
      connection.autoReply('core.unsubscribe', frame => {
        endNotice();
        connection.receive({ jsonrpc: '2.0', id: frame.id, result: null });
      });

    /** Notices name only the collection; the released one's must not end the next. */
    it('is not ended by the release notice of the subscription before it', async () => {
      answerReleasesAsMiddlewareDoes();
      sourceApi().events('filesystem.file_tail_follow', tail).subscribe().unsubscribe();
      await settle();

      const lines: unknown[] = [];
      let completed = false;
      sourceApi()
        .events('filesystem.file_tail_follow', tail)
        .subscribe({ next: line => lines.push(line), complete: () => (completed = true) });
      await settle();
      await settle();

      connection.receive(
        collectionUpdate({ collection: tailName, msg: 'added', fields: { data: 'still here' } })
      );

      expect(completed).toBe(false);
      expect(lines).toEqual([{ msg: 'added', fields: { data: 'still here' } }]);
    });

    /**
     * A source ending on its own as its last subscriber leaves: its notice
     * lands inside the release's window, and the release (of an id middleware
     * already dropped) is answered with no notice. Nothing may be left over to
     * swallow the next subscription's own end.
     */
    it('leaves nothing owed when a source ends as it is released', async () => {
      const first = sourceApi().events('filesystem.file_tail_follow', tail).subscribe();
      await settle();
      first.unsubscribe();
      endNotice();
      await settle();

      let completed = false;
      sourceApi()
        .events('filesystem.file_tail_follow', tail)
        .subscribe({ complete: () => (completed = true) });
      await settle();

      endNotice();
      expect(completed).toBe(true);
    });

    /** The window closes on the reply even when no notice came inside it. */
    it('leaves nothing owed by a release answered without a notice', async () => {
      // The fake's own answer: `null`, no notice — as for an id already dropped.
      sourceApi().events('filesystem.file_tail_follow', tail).subscribe().unsubscribe();
      await settle();
      await settle();

      let completed = false;
      sourceApi()
        .events('filesystem.file_tail_follow', tail)
        .subscribe({ complete: () => (completed = true) });
      await settle();
      endNotice();

      expect(completed).toBe(true);
    });

    it('still ends on an error notice inside a release window', async () => {
      // Unanswered, so the window stays open.
      connection.autoReply('core.unsubscribe', () => undefined);
      sourceApi().events('filesystem.file_tail_follow', tail).subscribe().unsubscribe();
      await settle();

      const rejected = firstValueFrom(sourceApi().events('filesystem.file_tail_follow', tail));
      endNotice(fakeApiError({ reason: 'gone' }).data);

      await expect(rejected).rejects.toMatchObject({ message: 'gone' });
    });

    it('subscribes afresh after a source ended', async () => {
      const ended = firstValueFrom(
        sourceApi().events('filesystem.file_tail_follow', tail),
        { defaultValue: null }
      );
      connection.receive({
        jsonrpc: '2.0',
        method: 'notify_unsubscribed',
        params: { collection: tailName, error: null },
      });
      await ended;

      sourceApi().events('filesystem.file_tail_follow', tail).subscribe();

      expect(subscribeFrames(tailName)).toHaveLength(2);
    });
  });

  /**
   * What a caller gets when middleware refuses a request: the reason as the
   * message, as before, and the frame it came in for everything else.
   */
  describe('refusals', () => {
    const validationError = fakeApiError({
      error: 22,
      errname: 'EINVAL',
      reason: '[EINVAL] user.create.username: Already in use',
      extra: [['user.create.username', 'Already in use', 22]],
    });

    const refuse = (method: string) =>
      connection.receive({
        jsonrpc: '2.0',
        id: `mock-id-${method}`,
        error: validationError,
      });

    it('rejects a call with the whole error frame, keeping the reason as the message', async () => {
      const result = firstValueFrom(api.call('system.info'));
      refuse('system.info');

      const error = await result.catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(TrueNasApiError);
      expect(error).toMatchObject({
        message: '[EINVAL] user.create.username: Already in use',
        method: 'system.info',
        code: -32001,
        errname: 'EINVAL',
        data: { extra: [['user.create.username', 'Already in use', 22]] },
      });
    });

    it('rejects a query the same way', async () => {
      const queryApi = api as unknown as TrueNasApi<{
        call: { 'user.query': { entity: { id: number } } };
        job: Record<never, never>;
        event: Record<never, never>;
      }>;
      const result = firstValueFrom(queryApi.query('user.query'));
      refuse('user.query');

      await expect(result).rejects.toMatchObject({ errname: 'EINVAL' });
    });

    it('keeps a code middleware sends without a payload, and has no errname for it', async () => {
      const result = firstValueFrom(api.call('system.info'));
      connection.receive({
        jsonrpc: '2.0',
        id: 'mock-id-system.info',
        error: { code: -32601, message: 'Method does not exist' },
      });

      await expect(result).rejects.toMatchObject({
        message: 'Method does not exist',
        code: -32601,
        errname: undefined,
      });
    });

    /**
     * A job method refused before it starts a job answers with an error and
     * sends no job event at all. Correlating by event alone, this waited for
     * one forever.
     */
    it('rejects callAndGetJobId when the method is refused before a job starts', async () => {
      const result = firstValueFrom(api.callAndGetJobId('app.start', ['my-app']));
      refuse('app.start');

      await expect(result).rejects.toBeInstanceOf(TrueNasApiError);
    });

    it('rejects job when the method is refused before a job starts', async () => {
      const result = firstValueFrom(api.job('app.start', ['my-app']));
      refuse('app.start');

      await expect(result).rejects.toMatchObject({ method: 'app.start', errname: 'EINVAL' });
    });

    it('still takes the id from the job event when the response succeeds', async () => {
      const result = firstValueFrom(api.callAndGetJobId('app.start', ['my-app']));
      // v27 answers a job method with `null`; the id is never read from here.
      connection.receive({ jsonrpc: '2.0', id: 'mock-id-app.start', result: null });
      connection.receive({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'added',
          fields: { id: 4180, message_ids: ['mock-id-app.start'] },
        },
      } as unknown as TrueNasMessage);

      await expect(result).resolves.toBe(4180);
    });
  });

  /**
   * The verbs read `messages()` when they run, so a consumer can wrap it after
   * the client exists — webui's debug panel mixes mocked answers in that way.
   * Job tracking read it once, at construction, and so never heard them.
   */
  it('tracks jobs over a messages() wrapped after construction', async () => {
    const injected = new Subject<TrueNasMessage>();
    const original = connection.messages.bind(connection);
    connection.messages = () => merge(original(), injected);

    const jobId = firstValueFrom(api.callAndGetJobId('app.start', ['my-app']));
    injected.next({
      jsonrpc: '2.0',
      method: 'collection_update',
      params: {
        collection: 'core.get_jobs',
        msg: 'added',
        fields: { id: 4180, message_ids: ['mock-id-app.start'] },
      },
    });

    await expect(jobId).resolves.toBe(4180);
  });
});
