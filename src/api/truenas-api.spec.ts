import { BehaviorSubject, Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrueNasConnection } from '@/connection/truenas-connection';
import { Job, JobState } from '@/types/job.type';
import { TrueNasMessage } from '@/types/truenas-message.type';
import alerts from 'test-data/alerts.json';
import jobEvent from 'test-data/job-event.json';
import { TrueNasApi } from './truenas-api';

// Mock createJsonRpcMessage so message ids are deterministic.
vi.mock('@/utils/jsonrpc.utils', () => ({
  createJsonRpcMessage: vi.fn((method: string, params?: unknown) => ({
    jsonrpc: '2.0',
    id: `mock-id-${method}`,
    method,
    params: params ?? [],
  })),
}));

describe('TrueNasApi', () => {
  let api: TrueNasApi;
  let mockConnection: TrueNasConnection;
  let authenticated$: BehaviorSubject<boolean>;
  let messagesSubject: Subject<TrueNasMessage>;

  beforeEach(() => {
    messagesSubject = new Subject<TrueNasMessage>();
    const wsNext = vi.fn();
    mockConnection = {
      ws: {
        next: wsNext,
        messages: vi.fn(),
        complete: vi.fn(),
      },
      messages: vi.fn().mockReturnValue(messagesSubject),
      // The real `send` queues on `ws$` until a socket exists and then calls
      // `ws.next`; here it forwards straight through, so the assertions below
      // still read the frames off `ws.next`.
      send: vi.fn((message: TrueNasMessage) => wsNext(message)),
    } as unknown as TrueNasConnection;

    authenticated$ = new BehaviorSubject<boolean>(false);
    api = new TrueNasApi(authenticated$, mockConnection);
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

      // `ws.next` is called synchronously inside `call()` — assert before emitting.
      try {
        expect(mockConnection.ws.next).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          id: mockId,
          method: mockMethod,
          params: [],
        });
      } catch (err) {
        reject(err);
      }

      messagesSubject.next(mockResponse);
    }));

  it('should throw error when JSON-RPC 2.0 response contains error', () =>
    new Promise<void>((resolve, reject) => {
      const mockMethod = 'system.info';
      const mockId = `mock-id-system.info`;
      const mockErrorResponse = {
        jsonrpc: '2.0',
        id: mockId,
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
      } as unknown as TrueNasMessage;

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

      messagesSubject.next(mockErrorResponse);
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
        expect(mockConnection.ws.next).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          id: 'mock-id-core.subscribe',
          method: 'core.subscribe',
          params: ['app.query'],
        });
      } catch (err) {
        reject(err);
      }

      messagesSubject.next(
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

      messagesSubject.next(
        collectionUpdate({ collection: 'app.query', msg: 'removed', id: 'app-1' })
      );
      // A different collection on the same socket must not leak through.
      messagesSubject.next(
        collectionUpdate({ collection: 'disk.query', msg: 'added', id: 'd1' })
      );
      // Neither must a msg that is not a collection change.
      messagesSubject.next(
        collectionUpdate({ collection: 'app.query', msg: 'unsubscribed' })
      );
      messagesSubject.next(
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
      vi.spyOn(mockConnection, 'messages').mockReturnValue(jobMessagesSubject);

      const newApi = new TrueNasApi(authenticated$, mockConnection);

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
        expect(mockConnection.ws.next).toHaveBeenCalledWith(
          expect.objectContaining({ id: requestId, method })
        );
      } catch (err) {
        reject(err);
      }

      // A job event whose message_ids do NOT include our request id — must be ignored.
      messagesSubject.next({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 999, message_ids: ['someone-elses-request'] },
        },
      } as unknown as TrueNasMessage);

      // The matching job event — its message_ids include our request id.
      messagesSubject.next({
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
      messagesSubject.next({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 77, message_ids: [requestId], state: JobState.Running },
        },
      } as unknown as TrueNasMessage);

      // trackJob's opening core.get_jobs read.
      messagesSubject.next({
        jsonrpc: '2.0',
        id: 'mock-id-core.get_jobs',
        result: [{ id: 77, state: JobState.Running }],
      } as unknown as TrueNasMessage);

      // A different job finishing must not complete our stream. Deliberately
      // not an id adjacent to 77: an off-by-one in the seam would then be
      // indistinguishable from correct tracking, which is how the first
      // version of this test passed against a `trackJob(jobId + 1)` mutation.
      messagesSubject.next({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 999, state: JobState.Success },
        },
      } as unknown as TrueNasMessage);

      messagesSubject.next({
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
      messagesSubject.next(
        collectionUpdate({
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 77, message_ids: [requestId], state: JobState.Running },
        })
      );

      // The job finishes immediately — before the core.get_jobs read replies.
      messagesSubject.next(
        collectionUpdate({
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 77, state: JobState.Success },
        })
      );

      // The reply lands afterwards and is stale. It must not resurrect the
      // stream, and its absence must not have been required to complete.
      messagesSubject.next({
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

      messagesSubject.next({
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

      messagesSubject.next(
        collectionUpdate({
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: { id: 77, state: JobState.Running },
        })
      );
      // Stale: the job is plainly alive, whatever this says.
      messagesSubject.next({
        jsonrpc: '2.0',
        id: 'mock-id-core.get_jobs',
        result: [],
      } as unknown as TrueNasMessage);
      messagesSubject.next(
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
        expect(mockConnection.ws.next).not.toHaveBeenCalled();
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

      expect(mockConnection.ws.next).toHaveBeenCalledTimes(1);
      messagesSubject.next({
        jsonrpc: '2.0',
        id: 'mock-id-system.info',
        result: { hostname: 'later.local' },
      } as unknown as TrueNasMessage);
    }));

  /**
   * The server subscription is per socket, not per caller, so two subscribers
   * to the same event must not each register one — nothing sends
   * `core.unsubscribe`, so a duplicate would leak for the life of the socket.
   */
  /** `core.subscribe` frames for one collection, in send order. */
  const subscribeFrames = (collection: string) =>
    vi
      .mocked(mockConnection.ws.next)
      .mock.calls.map(([m]) => m as { method: string; params: unknown })
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

  /**
   * The case the concurrent test above cannot see. `share()` resets when the
   * last subscriber leaves, so a component subscribing on mount and
   * unsubscribing on unmount re-registered the collection every time it came
   * back — and nothing sends `core.unsubscribe`, so each one persisted for the
   * life of the socket.
   */
  it('does not re-register when a subscriber leaves and another arrives', () => {
    authenticated$.next(true);
    const stream = api.events('app.query');

    stream.subscribe().unsubscribe();
    stream.subscribe().unsubscribe();
    stream.subscribe();

    expect(subscribeFrames('app.query')).toHaveLength(1);
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

    const reads = vi
      .mocked(mockConnection.ws.next)
      .mock.calls.map(([m]) => m as { method: string })
      .filter(m => m.method === 'core.get_jobs');

    expect(reads).toHaveLength(1);
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

      messagesSubject.next(
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
      messagesSubject.next({
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
      messagesSubject.next(
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
        expect(mockConnection.ws.next).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'auth.generate_token',
            params: [300, {}, true, false],
          })
        );
      } catch (err) {
        reject(err);
      }

      messagesSubject.next({
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
      vi.spyOn(mockConnection, 'messages').mockReturnValue(
        completedJobMessagesSubject
      );

      const newApi = new TrueNasApi(authenticated$, mockConnection);

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
      (vi.mocked(mockConnection.ws.next).mock.calls[0][0] as TrueNasMessage)
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

        messagesSubject.next({
          jsonrpc: '2.0',
          id: 'mock-id-user.query',
          result: 42,
        } as unknown as TrueNasMessage);
      }));
  });
});
