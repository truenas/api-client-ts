import {
  BehaviorSubject,
  Observable,
  filter,
  map,
  merge,
  of,
  share,
  switchMap,
  take,
  takeWhile,
} from 'rxjs';
import { TrueNasEndpoint } from '@/enums/truenas-endpoint.enum';
import {
  ApiCallMethod,
  ApiCallParams,
  ApiCallResponse,
} from '@/types/api-call-directory.type';
import { getApiErrorMessage } from '@/types/api-error.type';
import { Job, JobState } from '@/types/job.type';
import { createJsonRpcMessage } from '@/utils/jsonrpc.utils';
import { withId } from '@/utils/utils';
import { TrueNasConnection } from '@/connection/truenas-connection';

/**
 * Type for JSON-RPC 2.0 collection_update event params
 */
interface CollectionUpdateParams {
  msg: string;
  collection: string;
  id: number;
  fields: Job;
}

/**
 * TrueNAS API handler using the JSON-RPC 2.0 protocol.
 *
 * It handles:
 * - JSON-RPC 2.0 request formatting
 * - JSON-RPC 2.0 response parsing (result/error)
 * - Event subscriptions
 * - Job tracking
 */
export class TrueNasApi {
  /**
   * Stream of job events from websocket.
   * JSON-RPC 2.0 events have structure: { method: 'collection_update', params: { collection, fields, ... } }
   */
  private jobEvents = this.connection.messages().pipe(
    filter(
      res =>
        res.method === 'collection_update' &&
        (res.params as CollectionUpdateParams)?.collection === 'core.get_jobs'
    ),
    map(event => (event.params as CollectionUpdateParams).fields),
    filter(job => !!job?.id),
    share()
  );

  constructor(
    public authenticated: BehaviorSubject<boolean>,
    public connection: TrueNasConnection
  ) {
    this.initializeJobEventsSubscription();
  }

  call<M extends ApiCallMethod>(
    method: M,
    params?: ApiCallParams<M>
  ): Observable<ApiCallResponse<M>> {
    const message = createJsonRpcMessage(method, params);

    this.connection.ws.next(message);

    // createJsonRpcMessage always returns a message with an id
    const messageId = message.id ?? '';

    return this.connection.messages().pipe(
      withId(messageId),
      map(msg => {
        // JSON-RPC 2.0 response format
        if (msg.error) {
          // Handle both JSON-RPC 2.0 standard error (message) and TrueNAS error (reason)
          const errorMessage = getApiErrorMessage(msg.error, 'API call failed');
          throw new Error(errorMessage);
        }
        return msg.result as ApiCallResponse<M>;
      }),
      take(1)
    );
  }

  /**
   * Makes an API call and returns the job ID from the websocket event.
   * Used for v26 where API calls return null but job events contain the job ID.
   *
   * The job ID is extracted from the first job event where message_ids contains
   * the original request ID.
   *
   * @param method The API method to call
   * @param params The parameters for the API call
   * @returns Observable that emits the job ID when received from websocket events
   */
  callAndGetJobId<M extends ApiCallMethod>(
    method: M,
    params?: ApiCallParams<M>
  ): Observable<number> {
    const message = createJsonRpcMessage(method, params);

    this.connection.ws.next(message);

    // createJsonRpcMessage always returns a message with an id
    const requestId = message.id ?? '';

    // Listen for job events that contain our request ID in message_ids
    return this.jobEvents.pipe(
      filter(job => job.message_ids?.includes(requestId) ?? false),
      map(job => job.id),
      take(1)
    );
  }

  events(eventName: string) {
    this.authenticated.pipe(filter(Boolean), take(1)).subscribe(() => {
      const message = createJsonRpcMessage('core.subscribe', [eventName]);
      this.connection.ws.next(message);
    });

    return this.connection.messages().pipe(
      filter(res => {
        // JSON-RPC 2.0 collection_update format
        const params = res.params as CollectionUpdateParams | undefined;
        return (
          res.method === 'collection_update' &&
          params?.collection === eventName &&
          ['added', 'changed', 'removed'].includes(params?.msg || '') &&
          params.fields !== undefined
        );
      })
    );
  }

  /**
   * Convenience wrapper for auth.generate_token API call.
   */
  generateToken(
    ttl = 600,
    matchOrigin = false,
    singleUse = true
  ): Observable<string> {
    return this.call(TrueNasEndpoint.GenerateToken, [
      ttl,
      {},
      matchOrigin,
      singleUse,
    ]);
  }

  trackJob(jobId: number): Observable<Job> {
    const completedStates = [
      JobState.Success,
      JobState.Failed,
      JobState.Aborted,
      JobState.Error,
      JobState.Finished,
    ];

    // First, get the current job state
    const currentJobState$ = this.call('core.get_jobs' as ApiCallMethod, [
      [['id', '=', jobId]],
    ]).pipe(
      map(jobs => (jobs as Job[])[0]),
      filter(job => job !== undefined)
    );

    // Then track ongoing updates
    const jobUpdates$ = this.jobEvents.pipe(
      filter(job => job.id === jobId),
      takeWhile(job => !completedStates.includes(job.state), true) // Include the final state
    );

    // Start with current state, then merge with updates
    // This ensures we don't miss already-completed jobs
    return currentJobState$.pipe(
      switchMap(currentJob => {
        // If job is already complete, just return it
        if (completedStates.includes(currentJob.state)) {
          return of(currentJob);
        }
        // Otherwise, return current state and continue tracking
        return merge(of(currentJob), jobUpdates$);
      })
    );
  }

  private initializeJobEventsSubscription() {
    this.authenticated.pipe(filter(Boolean), take(1)).subscribe(() => {
      const message = createJsonRpcMessage('core.subscribe', ['core.get_jobs']);
      this.connection.ws.next(message);
    });
  }
}
