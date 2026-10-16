import {
  BehaviorSubject,
  Observable,
  defer,
  distinctUntilChanged,
  filter,
  finalize,
  ignoreElements,
  map,
  merge,
  share,
  Subject,
  Subscription,
  takeUntil,
  switchMap,
  take,
  takeWhile,
  tap,
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
  EventSourceName,
  EventUnion,
  JobMethod,
  JobParams,
  JobResult,
  SubscribableEvent,
  SubscriptionArgs,
} from '@/types/api-directory.type';
import type { TrueNasErrorData } from '@/types/api-error.type';
import type {
  QueryEntity,
  QueryListOptions,
  QueryMethod,
  QuerySingleOptions,
} from '@/types/query.type';
import { TrueNasApiError } from '@/errors/api.errors';
import { isJobFinished, Job } from '@/types/job.type';
import { createJsonRpcMessage } from '@/utils/jsonrpc.utils';
import { subscriptionName } from '@/utils/subscription.utils';
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
 * The `params` of a `notify_unsubscribed` notification: the server ended a
 * subscription, with the reason when it was an error (`rpc.py`).
 */
interface NotifyUnsubscribed {
  collection: string;
  error: TrueNasErrorData | null;
}

/**
 * TrueNAS API handler using the JSON-RPC 2.0 protocol.
 *
 * Each verb only accepts method names from its facet of `D` (call, job, query
 * or event directory), so reaching a method the declared version lacks is a
 * build error rather than a runtime one.
 *
 * @typeParam D - the generated API surface (`call`, `job` and `event`) this
 * instance is typed against. Defaults to the entries identical in every
 * generated version.
 */
export class TrueNasApi<D extends ApiDirectoryShape = BaseApiDirectory> {
  /**
   * Stream of job events from websocket.
   * JSON-RPC 2.0 events have structure: { method: 'collection_update', params: { collection, fields, ... } }
   *
   * Reads `messages()` when first subscribed, not when this is built, as every
   * other verb does. A consumer that wraps the connection's `messages()` after
   * the client is created — a debug panel mixing in mocked answers — is
   * otherwise heard by `call` and `events` but not by job tracking.
   */
  private jobEvents = defer(() => this.connection.messages()).pipe(
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
   * One shared stream per subscription — see {@link events}. Keyed by the
   * name *with* its arguments: a tail of one file is not a tail of another.
   */
  private readonly eventStreams = new Map<string, Observable<unknown>>();

  /**
   * Releases awaiting their `core.unsubscribe` reply, per name. Middleware
   * sends a source's release notice (`terminate`) before that reply, and a
   * notice names only the collection; so an error-free one arriving inside
   * that window belongs to the release, not to a later subscription. One per
   * window, which closes on the reply whether or not a notice came.
   */
  private readonly releasing = new Map<string, { noticed: boolean }[]>();

  /** The live subscription per name, told when the server ends it. */
  private readonly serverEnds = new Map<string, Subject<NotifyUnsubscribed>>();

  private endNotices?: Subscription;

  constructor(
    public authenticated: BehaviorSubject<boolean>,
    public connection: TrueNasConnection
  ) {
    this.initializeJobEventsSubscription();
  }

  /**
   * Call a method of the typed surface and emit its result.
   *
   * ```typescript
   * api.call('system.info')                      // SystemInfo
   * api.call('pool.dataset.delete', ['tank/ds', { recursive: true }])
   * ```
   *
   * `params` is required exactly when the method takes them. For `.query`
   * methods prefer {@link query} / {@link queryOne} / {@link queryCount},
   * which narrow the polymorphic response this returns as-is.
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
    // Deferred so the request is sent on subscribe, not on build; otherwise a
    // reply can arrive before anything listens and the caller hangs. The send
    // and the `reply` subscription happen in the same synchronous tick, so no
    // reply can slip between them. `connection.send()` rather than `ws`, so a
    // request made before the socket opens is queued.
    return defer(() => {
      const message = createJsonRpcMessage(method, params);

      // createJsonRpcMessage always returns a message with an id
      const messageId = message.id ?? '';

      const reply = this.connection.messages().pipe(
        withId(messageId),
        map(msg => {
          // The whole error, not just its reason: `errname` and `extra` are
          // what a caller acts on. `message` is the reason, as before.
          if (msg.error) {
            throw new TrueNasApiError(msg.error, method);
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
   * api.query('user.query', [['uid', '>', 1000]])    // UserEntry[]
   * api.query('user.query', [], { select: ['id'] })  // Pick<UserEntry, 'id'>[]
   * ```
   *
   * The result type is inferred from the options literal; annotating them as
   * `QueryListOptions<E>` degrades it to `Partial<E>[]`, so prefer `satisfies`.
   * `count`/`get` are rejected in favour of {@link queryCount} / {@link queryOne}.
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
   * differs by version (v25.10 answers with the id, v27 with `null`), while
   * the event correlation holds for both.
   *
   * @returns the job's id; errors with a {@link TrueNasApiError} if the method is refused before a job starts
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
      const started = this.jobEvents.pipe(
        filter(job => job.message_ids?.includes(message.id ?? '') ?? false),
        map(job => job.id)
      );
      // The response is read for one thing: a refusal. A method refused before
      // it starts a job (validation, a missing role) answers with an error and
      // starts nothing, so no event will ever carry this request's id. Without
      // this the caller waited for one forever. A success is ignored: it is not
      // the id on every version (see above), so the event stays its one source.
      const refused = this.connection.messages().pipe(
        withId(message.id ?? ''),
        map(reply => {
          if (reply.error) {
            throw new TrueNasApiError(reply.error, method);
          }
        }),
        ignoreElements()
      );

      const sending = this.connection.send(message);
      return merge(started, refused).pipe(
        take(1),
        finalize(() => sending.unsubscribe())
      );
    });
  }

  /**
   * Start a job, emit its state as it progresses, and complete when it finishes.
   *
   * ```typescript
   * api.job('pool.dataset.unlock', ['tank/enc', { … }])
   *    .subscribe(job => bar.set(job.progress.percent ?? 0));
   * ```
   *
   * Unlike {@link callAndGetJobId} plus {@link trackJob}, the result is typed
   * from the job directory. It stays `null` until the job succeeds.
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
   * Subscribe to a collection or an event source and emit its changes,
   * discriminated on `msg`.
   *
   * ```typescript
   * api.events('app.query').subscribe(event => {
   *   if (event.msg === 'removed') return drop(event.id);
   *   render(event.fields);          // only reachable once narrowed
   * });
   * api.events('filesystem.file_tail_follow', { path: '/var/log/messages' });
   * ```
   *
   * Narrow before reading `fields`: `removed` events almost never carry it.
   */
  events<E extends EventName<D>>(event: E): Observable<EventUnion<D, E>>;
  // A separate overload rather than one signature taking `...params` for both:
  // a wrapper generic over `E extends EventName<D>` could not call that one,
  // since the rest tuple stays unresolved for a generic `E`.
  events<E extends EventSourceName<D>>(
    event: E,
    ...params: SubscriptionArgs<D, E>
  ): Observable<EventUnion<D, E>>;
  events<E extends SubscribableEvent<D>>(
    event: E,
    params?: unknown
  ): Observable<EventUnion<D, E>> {
    const name = subscriptionName(event, params);
    this.listenForEndNotices();

    // One stream per subscription, shared: middleware keeps one per
    // `core.subscribe`, so each duplicate would be another one streaming.
    const existing = this.eventStreams.get(name);
    if (existing) return existing as Observable<EventUnion<D, E>>;

    const forget = () => {
      if (this.eventStreams.get(name) === stream) this.eventStreams.delete(name);
    };
    const stream = defer(() => {
      // The server's id for this subscription on the current socket. A socket
      // takes its subscriptions with it, so a drop voids the id.
      let subscriptionId: string | undefined;
      let released = false;
      // Set by `notify_unsubscribed`. Middleware validates a source's arguments
      // before answering `core.subscribe`, so a rejection can arrive before the
      // id: by then the server has dropped it, and there is nothing to release.
      let serverEnded = false;
      const ended = new Subject<NotifyUnsubscribed>();
      this.serverEnds.set(name, ended);

      // Every authentication, not just the first: `authenticated$` cycles
      // false -> true on each reconnect, and the new socket has to be told again.
      const subscribing = this.authenticated
        .pipe(distinctUntilChanged())
        .subscribe(isAuthenticated => {
          subscriptionId = undefined;
          if (!isAuthenticated) return;

          const request = createJsonRpcMessage('core.subscribe', [name]);
          this.connection
            .messages()
            .pipe(
              withId(request.id ?? ''),
              take(1),
              takeUntil(this.authenticated.pipe(filter(isUp => !isUp)))
            )
            .subscribe(reply => {
              // A refusal (a role the session lacks) leaves the stream silent,
              // as it always has. There is nothing to release.
              if (typeof reply.result !== 'string') return;
              // Everyone left before the id came back: release it now, unless
              // the server ended the subscription first.
              if (!released) subscriptionId = reply.result;
              else if (!serverEnded) this.unsubscribe(name, reply.result);
            });
          this.connection.send(request);
        });

      const updates = this.connection.messages().pipe(
        filter(
          res =>
            res.method === 'collection_update' &&
            (res.params as CollectionUpdate | undefined)?.collection === name
        ),
        map(res => res.params as CollectionUpdate),
        filter(params => EVENT_KINDS.includes(params.msg as EventKind)),
        // `merge` below ends only when both inputs do. The connection closing
        // for good ends this one; `ended` has to follow, or the stream never
        // completes and nothing tears down the resubscription.
        finalize(() => ended.complete())
      );
      // The server ended the subscription — an event source finished, or
      // rejected its arguments. Nothing is left to release.
      const end = ended.pipe(
        map(notice => {
          subscriptionId = undefined;
          serverEnded = true;
          if (notice.error) {
            throw new TrueNasApiError(
              { code: -32001, message: notice.error.reason, data: notice.error },
              name
            );
          }
        })
      );

      return merge(updates, end).pipe(
        takeWhile((change): change is CollectionUpdate => change !== undefined),
        // `collection` is the subscription the caller already named; what is
        // left is exactly the payload the directory declares, plus its tag.
        map(({ collection, ...change }) => change as EventUnion<D, E>),
        // An ended stream stays ended (below), so the next `events()` call for
        // this name needs a new one.
        tap({ complete: forget, error: forget }),
        finalize(() => {
          released = true;
          subscribing.unsubscribe();
          if (this.serverEnds.get(name) === ended) this.serverEnds.delete(name);
          if (subscriptionId) this.unsubscribe(name, subscriptionId);
        })
      );
      // Released when the last subscriber leaves: the next one subscribes
      // afresh. Not reset on completion, so a stream that ended — the source
      // finished, or the connection closed for good — stays ended for anyone
      // still holding it, rather than registering again on its own.
    }).pipe(
      share({
        resetOnRefCountZero: true,
        resetOnComplete: false,
        resetOnError: false,
      })
    );

    this.eventStreams.set(name, stream as Observable<unknown>);
    return stream;
  }

  /**
   * Release a subscription by the id `core.subscribe` answered with, holding
   * its notice window (see {@link releasing}) open until the reply.
   */
  private unsubscribe(name: string, subscriptionId: string): void {
    const release = { noticed: false };
    this.releasing.set(name, [...(this.releasing.get(name) ?? []), release]);

    const request = createJsonRpcMessage('core.unsubscribe', [subscriptionId]);
    this.connection
      .messages()
      .pipe(
        withId(request.id ?? ''),
        take(1),
        takeUntil(this.authenticated.pipe(filter(isUp => !isUp))),
        finalize(() => {
          const open = (this.releasing.get(name) ?? []).filter(r => r !== release);
          if (open.length) this.releasing.set(name, open);
          else this.releasing.delete(name);
        })
      )
      .subscribe();
    this.connection.send(request);
  }

  /**
   * Route each `notify_unsubscribed` once: an error-free one inside an open
   * release window is that release's, anything else ends the name's live
   * subscription. Installed on the first `events()` call, before any stream
   * listens.
   */
  private listenForEndNotices(): void {
    if (this.endNotices) return;

    this.endNotices = this.connection
      .messages()
      .pipe(filter(res => res.method === 'notify_unsubscribed'))
      .subscribe(res => {
        const notice = res.params as NotifyUnsubscribed;
        const release = notice.error
          ? undefined
          : this.releasing.get(notice.collection)?.find(r => !r.noticed);
        if (release) release.noticed = true;
        else this.serverEnds.get(notice.collection)?.next(notice);
      });
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
