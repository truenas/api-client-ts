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
  combineLatest,
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
} from 'rxjs';
import { Logger, noopLogger } from '@/logger';
import { TrueNasMessage } from '@/types/truenas-message.type';
import { createJsonRpcMessage } from '@/utils/jsonrpc.utils';
import { getHttpError, getWebSocketError, isHttpStatusError } from '@/utils/truenas-connection.utils';
import { TrueNasSocket } from '@/connection/truenas-socket';

// helper types
interface ActiveConnection {
  ws: TrueNasSocket;
  hostname: string;
}

interface ConnectionError extends Error {
  hostname?: string;
}

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

  /**
   * observable which emits the current gate value and only emits again when it changes.
   */
  enabledChange$ = this.enabled$.pipe(distinctUntilChanged());

  /**
   * observable that handles the entire connection lifecycle.
   */
  connection$ = this.enabledChange$.pipe(
    switchMap(enabled => {
      if (enabled) {
        // if enabled, establish a connection and push it down the pipeline.
        return this.connect().pipe(
          map((conn) => makeActiveConnection(conn.ws, conn.hostname)),
        );
      }

      // if not enabled, emit a closed connection.
      return of(closedConnection);
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
        of<Connection>(makeConnectionError(err.message, err.hostname)),
        // since this error will immediately get caught by `retry` there's no reason to build a real error.
        throwError(() => null)
      );
    }),
    retry(),
    // start with a closed connection.
    startWith<Connection>(closedConnection),
    // prevent multiple subscriptions from re-evaluating the entire pipeline.
    shareReplay({ bufferSize: 1, refCount: false }),
    takeUntil(this.closeConnection),
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
    private readonly hostnames: string[],
    readonly systemUuid: string,
    readonly websocketPath: string,
    readonly systemName?: string,
    readonly retryDelay: number = tenSeconds,
    readonly maxRetry: number = 3,
    readonly logger: Logger = noopLogger,
  ) {
    // create a ping observable which only stops when the connection is *manually* closed.
    // we can safely do this since we can assume that if `closeConnection` fires, then
    // this connection is probably dead and will be recreated.
    //
    // ping behavior across connection failures is resilient, because `ws$` is resilient
    combineLatest([
      interval(twentySeconds),
      this.ws$,
    ]).pipe(
      takeUntil(this.closeConnection),
    ).subscribe(([, ws]) => {
      if (ws) {
        const pingMessage = createJsonRpcMessage('core.ping');
        ws.next(pingMessage);
      }
    });

    // compatibility property subscriptions
    this.opened$.subscribe(val => this.opened.next(val));
    this.closed$.subscribe(() => this.closed.next());
    this.hostname$.pipe(filter(Boolean)).subscribe(name => this.hostname.next(name));
    // we assign `ws` here for compatibility with downstream consumers, since they expect
    // a plain property. ideally, this would be reactive, but this is a compat property.
    this.ws$.pipe(filter(Boolean)).subscribe(ws => this.ws = ws);
    this.lastErrorMessage$.subscribe(msg => this.lastErrorMessage.next(msg));

    this.enabled$.next(initialEnabled);
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
      this.connectionAttempts.value > this.hostnames.length * this.maxRetry;

    const hasErrorMessage = this.lastErrorMessage.value !== null;

    return attemptsExhausted || hasErrorMessage;
  }

  /**
   * enables or disables the connection gate. the app calls this when its `SystemState`
   * changes (mapping `SystemState.Active -> true`, everything else -> `false`).
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
  }

  /**
   * helper method which creates an `Observable` which emits an `ActiveConnection`
   * after it establishes a connection to the given hostname. the observable will emit an
   * error if the connection is never established and will not complete until unsubscribed from or closed.
   */
  private createSocket(hostname: string): Observable<ActiveConnection> {
    const url = `wss://${hostname}${this.websocketPath}`;

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
            let errorMessage: string;
            if (isHttpStatusError(reason)) {
              errorMessage = getHttpError(reason);
            } else {
              errorMessage = getWebSocketError(event.code);
            }

            // we let individual sockets update the total connection attempts, since
            // this can be safely done in parallel and also the compatibility property
            // `hasExhaustedRetries` wants to check the *total* number.
            this.connectionAttempts.next(this.connectionAttempts.value + 1);

            subscriber.error(makeConnectionError(errorMessage, hostname));
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

  /**
   * helper function which actually performs the parallel connection `race`.
   */
  private connect(): Observable<ActiveConnection> {
    return race(
      this.hostnames.map(this.createSocket.bind(this))
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
const makeConnectionError = (message: string, hostname?: string): Connection => ({
  name: 'ConnectionError',
  message,
  hostname,
  state: 'error',
});

/**
 * the canonical closed connection.
 */
const closedConnection: Connection = { state: 'closed' };
