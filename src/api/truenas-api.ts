import {
  BehaviorSubject,
  Observable,
  defer,
  distinctUntilChanged,
  filter,
  finalize,
  map,
  merge,
  share,
  takeUntil,
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
  EventKind,
  EventName,
  EventUnion,
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
 * The `params` of a JSON-RPC 2.0 `collection_update` notification.
 *
 * Deliberately loose: one socket carries every subscription, so this is what
 * is true of all of them before the `collection` says which is which. What a
 * given collection puts in `id` and `fields` — and whether it sends `fields`
 * at all — is the event directory's business, and {@link TrueNasApi.events}
 * hands that back to the caller as a discriminated union.
 */
interface CollectionUpdate {
  msg: string;
  collection: string;
  id?: unknown;
  fields?: unknown;
}

/** The `msg` values {@link TrueNasApi.events} forwards. */
const EVENT_KINDS: readonly EventKind[] = ['added', 'changed', 'removed'];

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
 * {@link events} reads the event directory the same way, with one gap named
 * in {@link EventName}.
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
        (res.params as CollectionUpdate | undefined)?.collection ===
          'core.get_jobs'
    ),
    map(event => (event.params as CollectionUpdate).fields as Job),
    filter(job => !!job?.id),
    share()
  );

  /**
   * One shared stream per subscribed event name — see {@link events}.
   * Keyed by name rather than by caller, because the subscription it stands
   * for lives on the server and is per socket, not per caller.
   */
  private readonly eventStreams = new Map<string, Observable<unknown>>();

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
    // Deferred, so the request goes out when the caller subscribes rather than
    // when they build the observable. Sending from the body meant an
    // observable built in one turn and subscribed in the next lost its reply
    // outright — the `withId` filter had no subscriber when it arrived — and
    // left the caller with a promise that never settles.
    //
    // The send and the subscription to `reply` happen in the same synchronous
    // tick, so no reply can interleave between them. That is the invariant,
    // not "the listener is attached first": `.pipe()` builds an observable, it
    // does not subscribe one, and `defer` subscribes only after this factory
    // returns.
    //
    // Sent through `connection.send()` rather than `connection.ws` so a
    // request made before the socket opens is queued until it does, which is
    // what the authenticator already does for every frame it sends. Reaching
    // for `ws` directly meant a client used straight after
    // `createTrueNasClient` failed with a bare
    // `Cannot read properties of undefined` naming nothing about the
    // connection.
    return defer(() => {
      const message = createJsonRpcMessage(method, params);

      // createJsonRpcMessage always returns a message with an id
      const messageId = message.id ?? '';

      const reply = this.connection.messages().pipe(
        withId(messageId),
        map(msg => {
          // JSON-RPC 2.0 response format
          if (msg.error) {
            // Handle both JSON-RPC 2.0 standard error (message) and TrueNAS error (reason)
            const errorMessage = getApiErrorMessage(
              msg.error,
              'API call failed'
            );
            throw new Error(errorMessage);
          }
          return msg.result as T;
        }),
        take(1)
      );

      // `send` queues on `ws$` and holds a subscription until a socket
      // appears. Tying it to the caller's lifetime means a request made while
      // disconnected is dropped when they give up on it, rather than sitting
      // queued and leaking a subscription per abandoned call. Once the frame
      // has gone out the inner subscription has already completed and this is
      // a no-op.
      const sending = this.connection.send(message);
      return reply.pipe(finalize(() => sending.unsubscribe()));
    });
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
    // Deferred so the request goes out when the caller subscribes, not when
    // they build the observable. Sending on call opens a window in which the
    // job's event can arrive before anything is listening for it, and the id
    // is then never seen — the correlation is by event, so there is no reply
    // waiting to be matched later.
    return defer(() => {
      const message = createJsonRpcMessage(method, params[0]);

      // Built before the send and subscribed in the same synchronous tick;
      // see `dispatch` for why that is the invariant that matters.
      const seen = this.jobEvents.pipe(
        filter(job => job.message_ids?.includes(message.id ?? '') ?? false),
        map(job => job.id),
        take(1)
      );

      const sending = this.connection.send(message);
      return seen.pipe(finalize(() => sending.unsubscribe()));
    });
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
   *    .subscribe(job => bar.set(job.progress.percent ?? 0));
   * ```
   *
   * The result is typed from the job directory, which is the whole reason to
   * prefer this over {@link callAndGetJobId} plus {@link trackJob}: those two
   * lose the connection between the method and its result, and the job comes
   * back with `result: unknown`. It is `R | null` either way — a job that has
   * not finished has no result, and neither does one that failed.
   */
  job<M extends JobMethod<D>>(
    method: M,
    ...params: ArgsOf<JobParams<D, M>>
  ): Observable<Job<JobResult<D, M>>> {
    return this.callAndGetJobId(method, ...params).pipe(
      switchMap(jobId => this.trackJob<JobResult<D, M>>(jobId))
    );
  }

  /**
   * Subscribe to a collection and emit its changes.
   *
   * Emits the change itself rather than the transport frame, as a union
   * discriminated on `msg`:
   *
   * ```typescript
   * api.events('app.query').subscribe(event => {
   *   if (event.msg === 'removed') return drop(event.id);
   *   render(event.fields);          // only reachable once narrowed
   * });
   * ```
   *
   * The narrowing is load-bearing, not decoration: a `removed` event carries
   * an `id` and no `fields` in 55 of the 56 collections that declare one, so
   * reaching `fields` unconditionally is wrong for almost all of them.
   *
   * Event *sources* — the entries taking subscribe-time arguments — are not
   * reachable here; see {@link EventName}.
   */
  events<E extends EventName<D>>(event: E): Observable<EventUnion<D, E>> {
    // One stream per event name, shared. Without this each subscriber ran the
    // `defer` and put its own `core.subscribe` frame on the wire, and since
    // `core.unsubscribe` is never sent, every duplicate leaked a server-side
    // subscription for the life of the socket.
    const existing = this.eventStreams.get(event);
    if (existing) return existing as Observable<EventUnion<D, E>>;

    const stream = defer(() => {
      // Every authentication, not just the first. `authenticated$` cycles
      // false -> true on each reconnect, and a `take(1)` here meant the
      // subscription was re-established on the server exactly once: after a
      // socket drop the stream stayed alive and silently never emitted again.
      // Deferred so this happens when the caller subscribes, and torn down
      // with them so an unsubscribed caller stops holding it open.
      const resubscribe = this.authenticated
        .pipe(distinctUntilChanged(), filter(Boolean))
        .subscribe(() => {
          this.connection.send(createJsonRpcMessage('core.subscribe', [event]));
        });

      return this.connection.messages().pipe(
        filter(res => res.method === 'collection_update'),
        map(res => res.params as CollectionUpdate | undefined),
        filter(
          (params): params is CollectionUpdate =>
            params?.collection === event &&
            EVENT_KINDS.includes(params.msg as EventKind)
        ),
        // `collection` is the subscription the caller already named; what is
        // left is exactly the payload the directory declares, plus its tag.
        map(({ collection, ...change }) => change as EventUnion<D, E>),
        finalize(() => resubscribe.unsubscribe())
      );
      // `resetOnRefCountZero: false` is what makes the comment above true.
      // With the default, the share resets when the last subscriber leaves and
      // the next one re-runs the `defer`, so a component subscribing in
      // `ngOnInit` and unsubscribing in `ngOnDestroy` registers the collection
      // again on every mount — the same leak, on a different axis, since
      // nothing sends `core.unsubscribe`. `resetOnComplete: false` covers the
      // closed-connection case: once the socket is gone the stream stays
      // completed instead of re-registering onto a dead connection.
    }).pipe(share({ resetOnRefCountZero: false, resetOnComplete: false }));

    this.eventStreams.set(event, stream as Observable<unknown>);
    return stream;
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
    // The event stream carries jobs of every kind, so it is `Job<unknown>`;
    // narrowing to this job's result type is the caller's `R` claim, made once
    // here rather than at every emission.
    const updates$ = this.jobEvents.pipe(
      filter(job => job.id === jobId),
      map(job => job as Job<R>)
    );

    // Opening read, so an already-finished job is still reported. `share`d
    // because two consumers read it — the snapshot and the not-found signal —
    // and it must stay one request.
    const read$ = this.dispatch<Job<R>[]>('core.get_jobs', [
      [['id', '=', jobId]],
    ]).pipe(
      map(jobs => jobs[0]),
      share()
    );

    // No such job: middleware has reaped it, or the id was never real. The
    // stream has to end — completing empty is what this did before the read
    // and the events were merged, and leaving it open is a silent hang.
    // Guarded by `updates$` for the same reason the snapshot is: live events
    // are evidence the job exists, and an empty reply arriving after them is
    // stale. Without the guard an empty read would complete the stream while
    // updates were still flowing, turning a hang into a silent wrong answer.
    const missing$ = read$.pipe(
      filter(job => job === undefined),
      takeUntil(updates$)
    );

    // The snapshot is a point in time and the events are live, so an event can
    // beat the reply. Dropping the snapshot once an update has landed keeps a
    // progress bar from jumping backwards to a state already superseded.
    const snapshot$ = read$.pipe(
      filter((job): job is Job<R> => job !== undefined),
      takeUntil(updates$)
    );

    // Both are subscribed immediately, which is the point: waiting for the
    // read to come back before watching for updates leaves a window one round
    // trip wide with no subscriber on the event stream. `jobEvents` is
    // `share()`d without replay, so anything arriving in that window is
    // dropped — and a short job whose terminal event lands there would leave
    // this observable hanging forever, since `takeWhile` never sees the state
    // that ends it.
    return merge(snapshot$, updates$).pipe(
      takeWhile(job => !isJobFinished(job), true), // Include the final state
      takeUntil(missing$)
    );
  }

  /**
   * Ask the server for job events, and keep asking after every reconnect —
   * `authenticated$` returns to `false` when the socket drops, and a `take(1)`
   * here left job tracking permanently deaf once that happened.
   */
  private initializeJobEventsSubscription() {
    this.authenticated
      .pipe(distinctUntilChanged(), filter(Boolean))
      .subscribe(() => {
        this.connection.send(
          createJsonRpcMessage('core.subscribe', ['core.get_jobs'])
        );
      });
  }
}
