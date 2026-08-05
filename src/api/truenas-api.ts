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
import type {
  QueryFilters,
  QueryProjection,
} from '@/generated/shared/query-types';
import {
  ApiCallMethod,
  ApiCallParams,
  ApiCallResponse,
} from '@/types/api-call-directory.type';
import type {
  ApiDirectoryShape,
  BaseApiDirectory,
} from '@/types/api-directory.type';
import type {
  QueryEntity,
  QueryListOptions,
  QueryMethod,
  QuerySingleOptions,
} from '@/types/query.type';
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
 *
 * Note that two directories are in play, and they are not the same one.
 * {@link call} is keyed off the hand-maintained `ApiCallDirectory`, while the
 * query verbs resolve against `D['call']`, the generated directory this
 * instance was parameterised with. So on one instance, `call('pool.query')` and
 * `query('pool.query')` take their types from different sources. That is
 * deliberate — the verbs need the generator's `entity` marker, which the
 * hand-maintained directory does not carry — and it is how the generated types
 * are being adopted incrementally rather than in one breaking change.
 *
 * @typeParam D - the generated API surface this instance is typed against, as
 * a whole: `call`, `job` and `event` together. Only the query verbs read it so
 * far; {@link call}, {@link callAndGetJobId} and {@link events} still resolve
 * against the hand-maintained directory and a bare `string` respectively.
 * Defaults to the entries identical in every generated version.
 */
export class TrueNasApi<D extends ApiDirectoryShape = BaseApiDirectory> {
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
    return this.dispatch<ApiCallResponse<M>>(method, params);
  }

  /**
   * Send a JSON-RPC request and emit its result.
   *
   * Shared by {@link call} and the query verbs, which type the same wire call
   * against different directories — `call` against the hand-maintained one,
   * the verbs against the generated one.
   */
  private dispatch<T>(method: string, params?: unknown): Observable<T> {
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
        return msg.result as T;
      }),
      take(1)
    );
  }

  /**
   * Query a collection and emit the matching entries.
   *
   * ```typescript
   * api.query('user.query')                              // UserEntry[]
   * api.query('user.query', [['uid', '>', 1000]])        // UserEntry[]
   * api.query('user.query', [], { select: ['id', 'username'] })
   *                                       // Pick<UserEntry, 'id' | 'username'>[]
   * ```
   *
   * The precise result type comes from reading the options *literal*. Options
   * annotated as `QueryListOptions<E>` lose that, and the result degrades to
   * `Partial<E>[]` — not only when a `select` is present, but whenever the
   * annotation merely permits one:
   *
   * ```typescript
   * const opts: QueryListOptions<UserEntry> = { limit: 10 };
   * api.query('user.query', [], opts);          // Partial<UserEntry>[]
   *
   * const opts = { limit: 10 } satisfies QueryListOptions<UserEntry>;
   * api.query('user.query', [], opts);          // UserEntry[]
   * ```
   *
   * That is imprecise, never unsound: `Partial<E>` is a supertype of `E`, so a
   * field is only ever reported as *possibly* missing, never as present when it
   * is not. Reach for `satisfies` over an annotation to keep the precision —
   * the checking is the same, the inferred type is narrower.
   *
   * `count` and `get` are rejected: they would change the shape of the
   * response, which is {@link queryCount} and {@link queryOne}'s job.
   */
  query<
    M extends QueryMethod<D['call']> & string,
    const O extends QueryListOptions<QueryEntity<D['call'], M>> = Record<
      never,
      never
    >,
  >(
    method: M,
    filters?: QueryFilters<QueryEntity<D['call'], M>>,
    options?: O
  ): Observable<QueryProjection<QueryEntity<D['call'], M>, O>[]> {
    return this.dispatch(method, [filters ?? [], options ?? {}]);
  }

  /**
   * Query a collection and emit the single matching entry.
   *
   * Middleware errors unless exactly one entry matches, so this rejects
   * `limit` and `offset` as well as the shape switches.
   */
  queryOne<
    M extends QueryMethod<D['call']> & string,
    const O extends QuerySingleOptions<QueryEntity<D['call'], M>> = Record<
      never,
      never
    >,
  >(
    method: M,
    filters?: QueryFilters<QueryEntity<D['call'], M>>,
    options?: O
  ): Observable<QueryProjection<QueryEntity<D['call'], M>, O>> {
    return this.dispatch(method, [filters ?? [], { ...options, get: true }]);
  }

  /**
   * Emit the number of entries matching the filters.
   *
   * Takes no options: `select` and `order_by` cannot affect a count, and
   * `limit` / `offset` would silently cap it.
   */
  queryCount<M extends QueryMethod<D['call']> & string>(
    method: M,
    filters?: QueryFilters<QueryEntity<D['call'], M>>
  ): Observable<number> {
    return this.dispatch(method, [filters ?? [], { count: true }]);
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
