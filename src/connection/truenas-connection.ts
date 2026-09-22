import {
  EMPTY,
  BehaviorSubject,
  Observable,
  Subject,
  timeout,
  takeUntil,
  retry,
  race,
  take,
  timer,
  interval,
  tap,
  filter,
  switchMap,
  catchError,
  of,
  startWith,
  map,
  concat,
  throwError,
  shareReplay,
  distinctUntilChanged,
  skip,
} from 'rxjs';
import { Logger, noopLogger } from '@/logger';
import { TrueNasMessage } from '@/types/truenas-message.type';
import { createJsonRpcMessage } from '@/utils/jsonrpc.utils';
import { getCloseMessage, policyViolationCloseCode } from '@/utils/truenas-connection.utils';
import { TrueNasSocket } from '@/connection/truenas-socket';
import {
  socketScheme,
  type ApplianceProtocol,
  type ConnectionClose,
  type ConnectionEndpoint,
} from '@/types/transport.type';

// helper types
interface ActiveConnection {
  ws: TrueNasSocket;
  hostname: string;
}

interface ConnectionError extends Error {
  hostname?: string;
  /** The WebSocket close code, when the failure came from a close rather than a timeout. */
  closeCode?: number;
  /**
   * The server's own reason text, verbatim. `message` is this client's rendering
   * of the code and loses what the appliance actually said — for a policy close
   * that is the difference between "policy violation" and which policy.
   */
  closeReason?: string;
  /** Whether the socket had opened; a lost live socket reconnects without waiting. */
  wasOpen?: boolean;
}

/** Frozen, with its own copy of the hostnames: see `resolveEndpoint`. */
type ResolvedEndpoint = Readonly<Required<ConnectionEndpoint>>;

type Connection =
  | ActiveConnection & { state: 'active' }
  | ConnectionError & { state: 'error' }
  | { state: 'closed' };

const tenSeconds = 10 * 1000;
const twentySeconds = 20 * 1000;

export class TrueNasConnection {
  // compatibility properties
  opened = new BehaviorSubject(false);
  closed = new Subject<void>();
  hostname = new BehaviorSubject<string>('');
  ws!: TrueNasSocket;
  connectionAttempts = new BehaviorSubject<number>(0);
  lastErrorMessage = new BehaviorSubject<string | null>(null);

  /**
   * emits when the connection is manually closed.
   */
  closeConnection = new Subject<void>();

  /**
   * the connection only establishes a socket while this gate is `true`. consumers
   * flip it via `setEnabled()` (the app maps `SystemState.Active -> true`).
   */
  private enabled$ = new BehaviorSubject<boolean>(false);

  /** Replaced in the constructor, before anything subscribes. See `setEndpoint()`. */
  private endpoint$ = new BehaviorSubject<ResolvedEndpoint>(resolveEndpoint([], 'https:'));

  /** The endpoint the last attempt raced; a different one starts with `closed`. */
  private lastAttempted: ResolvedEndpoint | null = null;

  /** Protected so the testing entry's `FakeConnection` can script closes. */
  protected readonly closesSubject = new Subject<ConnectionClose>();

  /**
   * Every socket close this client did not cause itself: failed attempts, lost
   * connections and refusals, each with its code. Tearing a socket down through
   * `setEnabled(false)`, `setEndpoint()` or `close()` does not report one.
   */
  closes$: Observable<ConnectionClose> = this.closesSubject.asObservable();

  /**
   * observable which emits the current gate value and only emits again when it changes.
   */
  enabledChange$ = this.enabled$.pipe(distinctUntilChanged());

  /**
   * observable that handles the entire connection lifecycle.
   */
  connection$ = this.enabledChange$.pipe(
    switchMap(enabled => {
      if (!enabled) {
        return of(closedConnection);
      }
      // Each endpoint change tears down the current attempt and starts one on the
      // new endpoint. `closed` goes first, so the old socket is not reported open
      // and the old endpoint's error is cleared; compared against the last
      // attempt rather than the last emission, as `retry` resubscribes here.
      return this.endpoint$.pipe(
        distinctUntilChanged(sameEndpoint),
        switchMap(endpoint => {
          const changed = this.lastAttempted !== null && !sameEndpoint(this.lastAttempted, endpoint);
          this.lastAttempted = endpoint;
          const attempt = this.attempt(endpoint);
          return changed ? attempt.pipe(startWith(closedConnection)) : attempt;
        }),
      );
    }),
    switchMap((connection): Observable<Connection> => {
      // if the connection we received is a closed connection from upstream,
      // we just need to pass that along.
      if (connection.state !== 'active') {
        return of(connection);
      }

      // initialize the websocket if it's active and, upon
      // receiving confirmation that it's active, return it.
      const initMessage = createJsonRpcMessage('core.set_options', [
        { legacy_jobs: false },
      ]);

      connection.ws.next(initMessage);
      return connection.ws.messages().pipe(
        filter(msg => msg.id === initMessage.id),
        take(1),
        map(() => connection),
      )
    }),
    // in the event of an error, do two things:
    //   1. emit an errored connection downstream to inform consumers that
    //      the connection is dead.
    //   2. re-throw an error so the downstream `retry` will re-subscribe.
    catchError((err: ConnectionError): Observable<Connection> => {
      this.logger.error('All connections failed - retrying', { message: err?.message, hostname: err?.hostname });
      return concat(
        of<Connection>(
          makeConnectionError(
            err.message,
            err.hostname,
            err.closeCode,
            err.closeReason
          )
        ),
        throwError(() => err)
      );
    }),
    // A lost live socket reconnects at once. A cycle that never opened waits
    // `retryDelay` like any other attempt; without it the next cycle's first
    // attempt followed the last one back to back. Nothing upstream is
    // subscribed during the wait, so a gate or endpoint change ends it early.
    retry({
      delay: (err: ConnectionError | null) =>
        err?.wasOpen
          ? of(null)
          : race(
              timer(this.retryDelay),
              this.enabledChange$.pipe(skip(1)),
              this.endpoint$.pipe(skip(1)),
            ),
    }),
    // start with a closed connection.
    startWith<Connection>(closedConnection),
    // Above `shareReplay`, whose `refCount: false` subscription would otherwise
    // outlive `close()` and let a pending retry wait open another socket.
    takeUntil(this.closeConnection),
    // prevent multiple subscriptions from re-evaluating the entire pipeline.
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  /**
   * observable which is either an instance of the current `TrueNasSocket` used for the connection
   * or `null` if the connection is closed or errored for any reason.
   */
  ws$: Observable<TrueNasSocket | null> = this.connection$.pipe(
    map(conn => conn.state === 'active' ? conn.ws : null),
  );

  /**
   * current hostname we used to build the URL for this connection.
   */
  hostname$: Observable<string | null> = this.connection$.pipe(
    map(conn => conn.state === 'active' ? conn.hostname : null),
  );

  /**
   * emits error messages from the connection pipeline. this is used to derive the
   * corresponding compatibility property.
   */
  lastErrorMessage$: Observable<string | null> = this.connection$.pipe(
    map(conn => conn.state === 'error' ? conn.message : null),
  );

  /**
   * emits when the connection state *changes*, so it'll never emit `true` twice
   * in a row nor `false` twice in a row.
   */
  opened$: Observable<boolean> = this.connection$.pipe(
    map(conn => conn.state),
    distinctUntilChanged(),
    map(state => state === 'active'),
  );

  /**
   * emits when the connection state goes from open to closed.
   */
  closed$: Observable<void> = this.connection$.pipe(
    map(conn => conn.state),
    distinctUntilChanged(),
    filter(state => state === 'closed' || state === 'error'),
    map(() => { }),
  );

  /**
   * whether to display a connection error to the user — the **live** signal.
   *
   * `true` only while `connection$` is currently a `ConnectionError`, meaning the entire race +
   * retry cycle has been exhausted for all hostnames right now; it flips back to `false` once a
   * connection is re-established. individual socket losses during a race are expected and not surfaced.
   *
   * NOTE: this is NOT the same as the `hasExhaustedRetries()` method, which is a **cumulative**
   * snapshot (see there). The two can disagree — prefer this observable for "is the connection
   * errored right now?".
   */
  hasConnectionError$: Observable<boolean> = this.connection$.pipe(
    map(conn => conn.state === 'error'),
    takeUntil(this.closeConnection),
  );

  /**
   * observable which always emits messages from the current socket.
   */
  messages$ = this.ws$.pipe(
    filter(ws => ws !== null),
    switchMap(ws => ws.messages().pipe(
      catchError(() => EMPTY),
    )),
  );

  constructor(
    initialEnabled: boolean,
    hostnames: string[],
    readonly systemUuid: string,
    readonly websocketPath: string,
    readonly systemName?: string,
    readonly retryDelay: number = tenSeconds,
    readonly maxRetry: number = 3,
    readonly logger: Logger = noopLogger,
    protocol: ApplianceProtocol = 'https:',
  ) {
    this.endpoint$.next(resolveEndpoint(hostnames, protocol));

    // Ping while a socket exists, and only then: a socket arriving starts a
    // fresh 20-second interval, a socket going away (or the gate closing) ends
    // it, and `closeConnection` ends everything. The timer is derived from
    // `ws$` rather than run alongside it because the old always-on interval,
    // filtered at each tick, pinged identically but pended for the
    // connection's whole life, socket or not — invisible against an appliance,
    // and inside a test harness's zone the reason a fixture never settled: the
    // testing entry's `FakeConnection` never yields a socket, so every one held
    // a live timer.
    this.ws$.pipe(
      switchMap(ws => ws ? interval(twentySeconds).pipe(map(() => ws)) : EMPTY),
      takeUntil(this.closeConnection),
    ).subscribe(ws => {
      ws.next(createJsonRpcMessage('core.ping'));
    });

    // compatibility property subscriptions
    this.opened$.subscribe(val => this.opened.next(val));
    this.closed$.subscribe(() => this.closed.next());
    this.hostname$.pipe(filter(Boolean)).subscribe(name => this.hostname.next(name));
    // we assign `ws` here for compatibility with downstream consumers, since they expect
    // a plain property. ideally, this would be reactive, but this is a compat property.
    //
    // `ws` and `hostname` hold their last good value: both are taken through
    // `filter(Boolean)`, so nothing clears them when a connection ends. That used
    // to be temporary because a reconnect replaced them; after a refusal there is
    // no reconnect, so `ws` names a completed socket until the caller connects
    // again. Read `opened` for whether either still means anything.
    this.ws$.pipe(filter(Boolean)).subscribe(ws => this.ws = ws);
    this.lastErrorMessage$.subscribe(msg => this.lastErrorMessage.next(msg));

    this.enabled$.next(initialEnabled);
  }

  /** The hostnames and protocol the connection currently points at. */
  get endpoint(): ResolvedEndpoint {
    return this.endpoint$.value;
  }

  /** The appliance's scheme; changed through `setEndpoint()`. */
  get protocol(): ApplianceProtocol {
    return this.endpoint$.value.protocol;
  }

  /**
   * Re-points the connection, e.g. after the appliance's GUI address or
   * protocol changes. Any open socket is closed and, while enabled, the new
   * hostnames are raced at once; an unchanged endpoint does nothing. The
   * websocket path stays, so a different API version needs a new client.
   */
  setEndpoint(endpoint: ConnectionEndpoint): void {
    if (endpoint.hostnames.length === 0) {
      throw new Error('Cannot point the connection at an empty hostnames array');
    }
    const next = resolveEndpoint(endpoint.hostnames, endpoint.protocol ?? this.protocol);
    if (sameEndpoint(next, this.endpoint$.value)) return;

    // The retry budget belongs to the old endpoint.
    this.connectionAttempts.next(0);
    this.endpoint$.next(next);
  }

  /**
   * whether the connection has exhausted its retries — the **cumulative** snapshot, read
   * synchronously. (Formerly `hasConnectionError()`; renamed to disambiguate it from the
   * live `hasConnectionError$` observable, with which it can disagree.)
   *
   * `true` when the lifetime `connectionAttempts` count exceeds `hostnames.length * maxRetry`,
   * OR when an error message is currently set. Ported from the source (tncui) behavior.
   */
  hasExhaustedRetries(): boolean {
    const attemptsExhausted =
      this.connectionAttempts.value > this.endpoint.hostnames.length * this.maxRetry;

    const hasErrorMessage = this.lastErrorMessage.value !== null;

    return attemptsExhausted || hasErrorMessage;
  }

  /**
   * enables or disables the connection gate. the app calls this when its `SystemState`
   * changes (mapping `SystemState.Active -> true`, everything else -> `false`).
   *
   * This is also how a caller asks for another attempt after the appliance has
   * refused the client — nothing reconnects on its own from there. The gate is
   * `distinctUntilChanged`, so re-asserting `true` while it is already `true`
   * does nothing: the round trip through `false` is what asks again.
   */
  setEnabled(enabled: boolean): void {
    this.enabled$.next(enabled);
  }

  /**
   * compatibility method which just returns the public `messages$` observable.
   * this is used in a few places in the codebase that relied upon the old implementation.
   */
  messages() {
    return this.messages$;
  }

  /**
   * sends a message over the current websocket OR queues it to send once
   * the next websocket is opened. messages sent via `send` will not be lost until after
   * the next `closed$` emission.
   */
  send(message: TrueNasMessage) {
    return this.ws$.pipe(
      filter(ws => ws !== null),
      take(1),
    ).subscribe(ws => ws.next(message))
  }

  /**
   * manually closes this connection and prevents it from retrying/opening any more.
   */
  close() {
    this.closeConnection.next();
    this.closeConnection.complete();
    this.closesSubject.complete();
  }

  /**
   * helper method which creates an `Observable` which emits an `ActiveConnection`
   * after it establishes a connection to the given hostname. the observable will emit an
   * error if the connection is never established and will not complete until unsubscribed from or closed.
   */
  private createSocket(hostname: string, protocol: ApplianceProtocol): Observable<ActiveConnection> {
    const url = `${socketScheme(protocol)}//${hostname}${this.websocketPath}`;

    // track whether a socket has actually been opened and emitted by the observable.
    // this controls the `retry` operator at the end of this pipeline.
    let hasOpened = false;

    return new Observable<ActiveConnection>(subscriber => {
      const ws = new TrueNasSocket({
        url,
        openObserver: {
          next: () => {
            hasOpened = true;
            // a successful open means we're no longer in an error state, so reset the
            // running attempt count. otherwise it climbs across reboots and
            // eventually fixes `hasExhaustedRetries` to `true` permanently.
            this.connectionAttempts.next(0);
            subscriber.next({ ws, hostname, });
          },
        },
        closeObserver: {
          next: (event: CloseEvent) => {
            const reason = event.reason || '';
            const errorMessage = getCloseMessage(event.code, reason);

            // A closed subscriber means this client tore the socket down itself
            // (lost race, gate, endpoint, `close()`): neither an attempt to count
            // nor news to report. Sockets count individually, in parallel, because
            // `hasExhaustedRetries` wants the *total* number.
            if (!subscriber.closed) {
              this.connectionAttempts.next(this.connectionAttempts.value + 1);
              this.closesSubject.next({
                code: event.code,
                reason,
                message: errorMessage,
                hostname,
                wasOpen: hasOpened,
                refused: event.code === policyViolationCloseCode,
              });
            }

            subscriber.error({
              ...makeConnectionError(errorMessage, hostname, event.code, reason),
              wasOpen: hasOpened,
            });
          }
        }
      });

      // create a subscription to get the websocket to open, since it's lazy,
      // but ignore all errors since this is just to kick `openObserver` off.
      // when the socket dies, this will complete.
      const startupSub = ws.socket.subscribe({
        error: () => { }
      });

      return () => {
        // make sure we clean up the startup subscription here
        startupSub.unsubscribe();
        ws.complete();
      }
    }).pipe(
      // retry logic:
      //   * if a connection is not established in 10 seconds, consider that an error
      timeout({ first: tenSeconds }),
      retry({
        //   * while still *establishing*: wait `retryDelay` before trying again, giving up
        //     after `maxRetry` retries.
        count: this.maxRetry,
        //   * we use a custom `delay` function here to ensure no retries are performed
        //     once a socket is *opened*.
        //     basically: a later death must propagate out rather than being retried
        //     so it can be handled by the `connection$` observable.
        delay: (error: unknown) => {
          if (hasOpened) {
            return throwError(() => error);
          }
          return timer(this.retryDelay);
        }
      }),
    );
  }

  /** One attempt at `endpoint`: the race, with a refusal turned into a value. */
  private attempt(endpoint: ResolvedEndpoint): Observable<Connection> {
    return this.connect(endpoint).pipe(
      map((conn) => makeActiveConnection(conn.ws, conn.hostname)),
      // A refusal becomes a value here rather than an error, so it never
      // reaches the `retry` in `connection$` and nothing reconnects on its own.
      //
      // Handled at this depth on purpose: letting it out completes the
      // pipeline and unsubscribes `enabledChange$`, and `setEnabled` (or
      // `setEndpoint`) is how an app asks for another attempt once the network
      // changes. Not retrying is a statement about what this client does on
      // its own; it is not a reason to refuse the caller asking again.
      catchError((err: ConnectionError) =>
        isTerminalClose(err)
          ? of<Connection>(
              makeConnectionError(
                err.message,
                err.hostname,
                err.closeCode,
                err.closeReason
              )
            )
          : throwError(() => err)
      )
    );
  }

  /**
   * helper function which actually performs the parallel connection `race`.
   */
  private connect(endpoint: ResolvedEndpoint): Observable<ActiveConnection> {
    return race(
      endpoint.hostnames.map(hostname => this.createSocket(hostname, endpoint.protocol))
    ).pipe(
      tap(conn => this.logger.debug(`TrueNas socket opened to ${conn.hostname}.`)),
      takeUntil(this.closeConnection),
    );
  }
}

/**
 * helper function which wraps a socket and hostname into an active `Connection`.
 */
const makeActiveConnection = (ws: TrueNasSocket, hostname: string): Connection => ({
  ws,
  hostname,
  state: 'active',
});

/**
 * helper function which wraps a message and hostname into an errored `Connection`.
 */
const makeConnectionError = (
  message: string,
  hostname?: string,
  closeCode?: number,
  closeReason?: string
): Connection => ({
  name: 'ConnectionError',
  message,
  hostname,
  closeCode,
  closeReason,
  state: 'error',
});

/**
 * Whether this failure is the appliance refusing the client outright, rather
 * than something a later attempt could succeed at.
 */
const isTerminalClose = (err: ConnectionError | null | undefined): boolean =>
  err?.closeCode === policyViolationCloseCode;

/** A frozen copy, so neither the caller's array nor `endpoint`'s can move it. */
const resolveEndpoint = (hostnames: readonly string[], protocol: ApplianceProtocol): ResolvedEndpoint =>
  Object.freeze({ hostnames: Object.freeze([...hostnames]), protocol });

const sameEndpoint = (a: ResolvedEndpoint, b: ResolvedEndpoint): boolean =>
  a.protocol === b.protocol
  && a.hostnames.length === b.hostnames.length
  && a.hostnames.every((hostname, i) => hostname === b.hostnames[i]);

/**
 * the canonical closed connection.
 */
const closedConnection: Connection = { state: 'closed' };
