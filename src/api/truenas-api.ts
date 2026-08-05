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
import type {
  QueryFilters,
  QueryProjection,
} from '@/generated/shared/query-types';
import type {
  ApiDirectoryShape,
  ArgsOf,
  BaseApiDirectory,
  CallMethod,
  CallParams,
  CallResponse,
  JobMethod,
  JobParams,
  JobResult,
} from '@/types/api-directory.type';
import type {
  QueryEntity,
  QueryListOptions,
  QueryMethod,
  QuerySingleOptions,
} from '@/types/query.type';
import { getApiErrorMessage } from '@/types/api-error.type';
import { isJobFinished, Job } from '@/types/job.type';
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
 * Every method name it accepts comes from `D`, the generated surface it was
 * parameterised with, and each verb reads the facet that describes it:
 * {@link call} the call directory, {@link job} and {@link callAndGetJobId} the
 * job directory, the query verbs the `entity`-marked subset of the call
 * directory. A name that is not in the relevant facet does not compile, so
 * reaching a method the declared version does not have is a build error rather
 * than a runtime one.
 *
 * {@link events} is the exception and is still a bare `string`.
 *
 * @typeParam D - the generated API surface this instance is typed against, as
 * a whole: `call`, `job` and `event` together. Defaults to the entries
 * identical in every generated version.
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

  /**
   * Send a request to a method of the surface this instance is typed against,
   * and emit its result.
   *
   * ```typescript
   * api.call('system.info')                      // SystemInfo
   * api.call('pool.dataset.delete', ['tank/ds', { recursive: true }])
   * ```
   *
   * `params` is required exactly when the method takes them — the directory
   * says which — so a method that needs an id cannot be called without one.
   *
   * The polymorphic `.query` methods are reachable here too, but their
   * `response` is the five-way union the server may return, which is
   * {@link query} / {@link queryOne} / {@link queryCount}'s job to resolve.
   * Reach for a verb instead.
   */
  call<M extends CallMethod<D>>(
    method: M,
    ...params: ArgsOf<CallParams<D, M>>
  ): Observable<CallResponse<D, M>> {
    return this.dispatch<CallResponse<D, M>>(method, params[0]);
  }

  /**
   * Send a JSON-RPC request and emit its result.
   *
   * Shared by {@link call} and the query verbs, which read the same directory
   * but resolve different things from it: `call` takes the entry's `response`
   * verbatim, the verbs narrow its polymorphic union by the verb chosen.
   *
   * Also the way the class reaches methods on its own behalf — `core.get_jobs`,
   * `auth.generate_token`. Inside the class body `D` is a type parameter, so
   * the checker cannot know those are among its methods; they are, since both
   * are in the shared base every surface extends.
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
   * Start a job and emit its id.
   *
   * Keyed off the surface's *job* directory rather than its call directory —
   * a disjoint key space, so `callAndGetJobId('app.query')` is rejected and
   * `call('app.start')` is too. Which one a method belongs to is a fact about
   * the method, and the generated directories are where that fact lives.
   *
   * The id comes from the first job event whose `message_ids` carries this
   * request's id, not from the response: what a job method returns on the wire
   * differs by version (v25.10 answers with the id, v26 with `null`), while
   * the event correlation holds for both.
   *
   * @returns Observable that emits the job ID when received from websocket events
   */
  callAndGetJobId<M extends JobMethod<D>>(
    method: M,
    ...params: ArgsOf<JobParams<D, M>>
  ): Observable<number> {
    const message = createJsonRpcMessage(method, params[0]);

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

  /**
   * Start a job and follow it to completion.
   *
   * Emits the job's state as it progresses and completes when the job reaches
   * a terminal state, so `last()` gives the finished job and the intermediate
   * emissions drive a progress indicator.
   *
   * ```typescript
   * api.job('pool.dataset.unlock', ['tank/enc', { … }])
   *    .subscribe(job => bar.set(job.progress.percent));
   * ```
   *
   * The result is typed from the job directory, which is the whole reason to
   * prefer this over {@link callAndGetJobId} plus {@link trackJob}: those two
   * lose the connection between the method and its result, and the job comes
   * back with `result: unknown`.
   */
  job<M extends JobMethod<D>>(
    method: M,
    ...params: ArgsOf<JobParams<D, M>>
  ): Observable<Job<JobResult<D, M>>> {
    return this.callAndGetJobId(method, ...params).pipe(
      switchMap(jobId => this.trackJob<JobResult<D, M>>(jobId))
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
   *
   * Goes through {@link dispatch} rather than {@link call}: inside the class
   * body `D` is still a type parameter, so TypeScript cannot know that
   * `auth.generate_token` is one of its methods. It is — the method is in the
   * shared base, so every surface has it — but proving that to the checker
   * would mean constraining `D` on the class, which would push the constraint
   * onto every caller. The signature below is the guarantee instead.
   */
  generateToken(
    ttl = 600,
    matchOrigin = false,
    singleUse = true
  ): Observable<string> {
    return this.dispatch<string>('auth.generate_token', [
      ttl,
      {},
      matchOrigin,
      singleUse,
    ]);
  }

  /**
   * Follow an already-started job to completion.
   *
   * @typeParam R - what the job resolves to. An id carries no evidence of
   * which method produced it, so nothing here can infer this and the default
   * is `unknown`; naming it is the caller's assertion. {@link job} knows the
   * method and fills it in from the directory, which is the reason to prefer
   * it whenever you are the one starting the job.
   */
  trackJob<R = unknown>(jobId: number): Observable<Job<R>> {
    // First, get the current job state. Dispatched directly for the same
    // reason as generateToken.
    const currentJobState$ = this.dispatch<Job<R>[]>('core.get_jobs', [
      [['id', '=', jobId]],
    ]).pipe(
      map(jobs => jobs[0]),
      filter(job => job !== undefined)
    );

    // Then track ongoing updates. The event stream carries jobs of every kind,
    // so it is `Job<unknown>`; narrowing to this job's result type is the
    // caller's `R` claim, made once here rather than at every emission.
    const jobUpdates$ = this.jobEvents.pipe(
      filter(job => job.id === jobId),
      takeWhile(job => !isJobFinished(job), true), // Include the final state
      map(job => job as Job<R>)
    );

    // Start with current state, then merge with updates
    // This ensures we don't miss already-completed jobs
    return currentJobState$.pipe(
      switchMap(currentJob => {
        // If job is already complete, just return it
        if (isJobFinished(currentJob)) {
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
