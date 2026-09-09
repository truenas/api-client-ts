import { Subject, Subscription, distinctUntilChanged, filter, map, takeUntil } from 'rxjs';
import { TrueNasConnection } from '@/connection/truenas-connection';
import { noopLogger } from '@/logger';
import type { ApiError } from '@/types/api-error.type';
import type { TrueNasMessage } from '@/types/truenas-message.type';

/** How a fake connection is set up. Every field has a usable default. */
export interface FakeConnectionOptions {
  /** Reported as the appliance's uuid; only ever used for log correlation. */
  uuid?: string;
  /** The path the real connection would have opened a socket on. */
  websocketPath?: string;
  /**
   * Whether the connection starts in the opened state. Defaults to `true`, as
   * it does through `createFakeClient`: a closed connection queues sends
   * instead of writing them, which is rarely what a spec building one directly
   * is after.
   */
  opened?: boolean;
}

/**
 * A `TrueNasConnection` that never opens a socket, and that a test drives by
 * hand.
 *
 * It is a real subclass rather than an object cast into shape. That is not
 * ceremony: `TrueNasConnection` has private members, so an object literal is
 * assignable to it only through `as unknown as`, and every fake in this repo
 * and in webui pays that cast today. A subclass is assignable because it *is*
 * one, which is what lets the real `TrueNasApi` and the real clients run on it
 * unmodified — the point of the exercise, since a fake that only satisfies a
 * hand-written interface tests the interface.
 *
 * What it reimplements, it reimplements to match: `send` queues while closed
 * and writes on open, dropping a frame whose caller unsubscribed, because that
 * is what the real one does on `ws$`, and a double that records regardless of
 * `opened` is the divergence this exists to remove. Everything else is
 * inherited and inert — the connection is constructed disabled, so it never
 * reaches its socket factory.
 *
 * One inherited thing is not inert: the base constructor's 20-second ping
 * interval is subscribed. It never sends, because it fires only when `ws$`
 * yields a socket and none ever arrives, but the timer exists until `close()`.
 */
export class FakeConnection extends TrueNasConnection {
  private readonly incoming = new Subject<TrueNasMessage>();

  private readonly frames: TrueNasMessage[] = [];

  /** Frames handed to `send` while closed, waiting for the socket. */
  private readonly queued: TrueNasMessage[] = [];

  private readonly autoReplies = new Map<string, (frame: TrueNasMessage) => void>();

  /** Set by `close()`. Latched, because the real connection cannot come back. */
  private terminated = false;

  /**
   * The canonical streams, re-pointed at what this class actually drives.
   *
   * The base derives all three from `connection$`, which on a disabled
   * connection reports one state and then nothing: `{ state: 'closed' }`. So
   * they describe the connection that never connects, not the one the test is
   * driving — `messages$` stayed silent while `receive` delivered, `opened$`
   * stayed `[false]` through every simulated open, and `closed$` reported a
   * connection that had never been up. `messages()` is a shim over `messages$`;
   * leaving them disagreeing puts the divergence in the members a consumer is
   * most likely to reach for.
   */
  override messages$ = this.incoming.asObservable();

  override opened$ = this.opened.pipe(
    distinctUntilChanged(),
    takeUntil(this.closeConnection)
  );

  override closed$ = this.opened.pipe(
    distinctUntilChanged(),
    filter(isOpen => !isOpen),
    map(() => undefined),
    takeUntil(this.closeConnection)
  );

  constructor(options: FakeConnectionOptions = {}) {
    super(
      // Disabled: `connection$` derives from this, so no socket is ever built
      // and none of the retry machinery runs.
      false,
      [],
      options.uuid ?? 'fake-uuid',
      options.websocketPath ?? '/api/current',
      undefined,
      0,
      0,
      noopLogger
    );

    if (options.opened ?? true) this.simulateOpen();
  }

  /** Every frame handed to `send`, in order. */
  get sent(): readonly TrueNasMessage[] {
    return this.frames;
  }

  /**
   * Records the frame, or queues it until the connection opens.
   *
   * The real `send` queues on `ws$` until a socket exists and returns the
   * subscription holding that queue open; a caller who gives up unsubscribes
   * it and the frame never goes out. Both halves are reproduced, because
   * "records everything regardless of `opened`" is precisely the divergence
   * the hand-rolled double had — it forwarded straight through — and moving it
   * in here would have been the same bug in a better-looking place.
   */
  override send(message: TrueNasMessage): Subscription {
    if (this.terminated) {
      const dropped = new Subscription();
      dropped.unsubscribe();
      return dropped;
    }

    if (!this.opened.getValue()) {
      this.queued.push(message);
      return new Subscription(() => {
        const at = this.queued.indexOf(message);
        if (at >= 0) this.queued.splice(at, 1);
      });
    }

    this.write(message);

    // The frame has gone out, so there is nothing left for a caller to
    // abandon; an already-closed subscription says exactly that.
    const done = new Subscription();
    done.unsubscribe();
    return done;
  }

  /**
   * Answer any frame for `method` as soon as it is written.
   *
   * The narrow ancestor of `mockCall`: enough to let a collaborator that talks
   * to the appliance — the authenticator, for one — run its real code against
   * a scripted answer rather than be replaced by a fake of itself.
   *
   * One answer per method, last registration wins. The one it replaced is
   * returned so a caller that needs to share the method can chain to it rather
   * than take it over silently.
   */
  autoReply(
    method: string,
    answer: (frame: TrueNasMessage) => void
  ): ((frame: TrueNasMessage) => void) | undefined {
    const replaced = this.autoReplies.get(method);
    this.autoReplies.set(method, answer);
    return replaced;
  }

  private write(message: TrueNasMessage): void {
    this.frames.push(message);

    const answer = this.autoReplies.get(String(message.method));
    if (!answer) return;

    // On a microtask, not inline. A real reply crosses a socket, so it cannot
    // land before the caller has subscribed — and some senders rely on that:
    // `TrueNasAuthenticator` sends its frame when the login method is *called*
    // and returns the observable for the caller to subscribe afterwards, so an
    // inline answer arrives with nobody listening and the login never settles.
    queueMicrotask(() => answer(message));
  }

  /** Deliver a message as if middleware had sent it. */
  receive(message: TrueNasMessage): void {
    this.incoming.next(message);
  }

  /**
   * Answer the most recent frame carrying `method`, by its id.
   *
   * Ids are what correlate a reply to a request, and a test that had to read
   * them itself would be asserting on the id generator. Most recent rather
   * than first: a spec that calls the same method twice is asking about the
   * second one.
   */
  reply(method: string, result: unknown): void {
    this.receive({ jsonrpc: '2.0', id: this.idOf(method), result });
  }

  /**
   * As {@link reply}, with a JSON-RPC error payload instead of a result.
   *
   * Typed as what middleware actually sends rather than as
   * `TrueNasMessage['error']`, whose legacy shape made every call site cast
   * past this signature to write an ordinary error.
   */
  replyError(method: string, error: ApiError): void {
    this.receive({
      jsonrpc: '2.0',
      id: this.idOf(method),
      error,
    } as unknown as TrueNasMessage);
  }

  /**
   * Raise `opened` and flush whatever was queued, as the socket opening would.
   *
   * The queue drains after `opened` goes true, which is the order the real
   * connection produces: `send` is waiting on `ws$`, and `ws$` emits because a
   * socket arrived.
   */
  simulateOpen(): void {
    // The real `opened` reaches subscribers through `distinctUntilChanged`, so
    // it never emits `true` twice running. Emitting it here anyway made the
    // client re-run everything keyed on the transition — a second
    // `auth.login_ex` the real one never sends.
    if (this.terminated || this.opened.getValue()) return;

    this.opened.next(true);
    const pending = this.queued.splice(0, this.queued.length);
    for (const message of pending) this.write(message);
  }

  /**
   * Lower `opened` and fire `closed`, as a socket closing would.
   *
   * Named for what it simulates rather than overriding `close()`, which on the
   * real connection means "stop, and do not retry" — a different verb that
   * callers already use for teardown.
   */
  simulateClose(): void {
    if (this.terminated || !this.opened.getValue()) return;

    this.opened.next(false);
    this.closed.next();
  }

  /**
   * Terminal, as on the real connection: the streams end and nothing more is
   * written.
   *
   * `simulateClose` is the socket dropping — recoverable, and the client will
   * try again. This is the caller giving up on the connection for good, so the
   * message stream completes and `send` has nowhere to put a frame.
   */
  override close(): void {
    if (this.terminated) return;

    // Not `simulateClose()`. The real `close()` ends `connection$` through
    // `takeUntil`, which completes its subscribers without emitting: `opened`
    // keeps its last value and `closed` never fires. Routing through the
    // socket-drop path instead made `close()` log the client out, because
    // `TrueNasAuthenticator` lowers `authenticated$` on `closed` — a
    // difference from the real connection introduced by the fix for the
    // previous round's finding that `close()` did nothing at all.
    this.terminated = true;
    this.incoming.complete();
    super.close();
  }

  private idOf(method: string): string {
    const frame = [...this.frames].reverse().find(m => m.method === method);
    if (!frame) {
      throw new Error(
        `No frame for '${method}' has been sent; sent so far: ` +
          `${this.frames.map(m => String(m.method)).join(', ') || '(none)'}`
      );
    }
    return frame.id ?? '';
  }
}
