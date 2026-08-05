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
    mockConnection = {
      ws: {
        next: vi.fn(),
        messages: vi.fn(),
        complete: vi.fn(),
      },
      messages: vi.fn().mockReturnValue(messagesSubject),
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

  it('should execute events method and return the event', () =>
    new Promise<void>((resolve, reject) => {
      const mockEventName = 'alert.list';
      const mockId = `mock-id-core.subscribe`;
      // JSON-RPC 2.0 collection_update event format
      const mockEventMessage = {
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: mockEventName,
          msg: 'added',
          fields: alerts,
        },
      } as unknown as TrueNasMessage;

      authenticated$.next(true);

      api.events(mockEventName).subscribe(event => {
        try {
          expect(event).toEqual(mockEventMessage);
          resolve();
        } catch (err) {
          reject(err);
        }
      });

      try {
        expect(mockConnection.ws.next).toHaveBeenCalledWith({
          jsonrpc: '2.0',
          id: mockId,
          method: 'core.subscribe',
          params: [mockEventName],
        });
      } catch (err) {
        reject(err);
      }

      messagesSubject.next(mockEventMessage);
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
    /** `params` of the single JSON-RPC message the verb put on the wire. */
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
      queryApi().query('user.query', [['uid', '>', 1000]], {
        select: ['id'],
        limit: 10,
      });

      expect(sentParams()).toEqual([
        [['uid', '>', 1000]],
        { select: ['id'], limit: 10 },
      ]);
    });

    it('defaults to no filters and no options', () => {
      queryApi().query('user.query');

      expect(sentParams()).toEqual([[], {}]);
    });

    it('adds get:true for queryOne, preserving the caller options', () => {
      queryApi().queryOne('user.query', [['id', '=', 1]], { select: ['id'] });

      expect(sentParams()).toEqual([
        [['id', '=', 1]],
        { select: ['id'], get: true },
      ]);
    });

    it('sends only count:true for queryCount', () => {
      queryApi().queryCount('user.query', [['uid', '>', 1000]]);

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
