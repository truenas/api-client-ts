import { Subject, Subscription, distinctUntilChanged, filter, map, takeUntil } from 'rxjs';
import { TrueNasConnection } from '@/connection/truenas-connection';
import { noopLogger } from '@/logger';
import type { TrueNasErrorFrame } from '@/types/api-error.type';
import type { TrueNasMessage } from '@/types/truenas-message.type';
import { UnmockedCallError } from './unmocked-call-error';

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
  /**
   * Whether a frame nothing is scripted to answer fails instead of hanging.
   * Defaults to `false`.
   *
   * Off by default because the two ways to answer cannot be told apart at
   * `send` time. A spec that scripts everything with `mock` has registered its
   * answers before the frame goes out; a spec that drives frames by hand calls
   * `reply` *after* it — so refusing an unregistered method would break every
   * hand-driven spec, 24 of them in this repo's own suite. Strictness is the
   * spec's claim that it scripted everything, which only the spec can make.
   */
  strict?: boolean;
}

/**
 * Frames the client sends for itself, which no spec should have to script.
 *
 * `core.subscribe` is the only one reachable: the client sends it for the job
 * stream once authenticated and again for every `events()` name. If another
 * method starts arriving through `send`, a strict spec fails naming it, which
 * is the right way to find out.
 *
 * The other two housekeeping methods are absent for different reasons, and
 * only one of them is covered by that sentence. `core.unsubscribe` is never
 * sent at all, so it would fail loudly if it ever were. The 20-second
 * `core.ping` would not: it goes out through `ws.next(…)` rather than `send`
 * (`truenas-connection.ts`), so it bypasses this check entirely — and a fake
 * connection never yields a socket for it to fire on in the first place.
 */
const CLIENT_HOUSEKEEPING = new Set(['core.subscribe']);

/**
 * A `TrueNasConnection` that never opens a socket, and that a test drives by
 * hand.
 *
 * A real subclass, so the real `TrueNasApi` and clients run on it without an
 * `as unknown as` cast. `send` matches the real one: it queues while closed,
 * writes on open, and drops frames whose caller unsubscribed. The rest is
 * inherited and inert, except the base 20-second ping timer, which never sends
 * but lives until `close()`.
 */
export class FakeConnection extends TrueNasConnection {
  private readonly incoming = new Subject<TrueNasMessage>();

  private readonly frames: TrueNasMessage[] = [];

  /** Frames handed to `send` while closed, waiting for the socket. */
  private readonly queued: TrueNasMessage[] = [];

  private readonly autoReplies = new Map<string, (frame: TrueNasMessage) => void>();

  /** Set by `close()`. Latched, because the real connection cannot come back. */
  private terminated = false;

  /** See {@link FakeConnectionOptions.strict}. Assigned in the constructor. */
  private readonly strict: boolean;

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

    this.strict = options.strict ?? false;

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
    // Before the terminated and queued paths, so a strict spec is told what it
    // failed to script whatever state the connection is in. A frame that is
    // going to hang forever hangs the same way closed as it does open.
    if (
      this.strict &&
      message.method !== undefined &&
      !this.autoReplies.has(message.method) &&
      !CLIENT_HOUSEKEEPING.has(message.method)
    ) {
      throw new UnmockedCallError(message.method, message.params);
    }

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
   * As {@link reply}, with a JSON-RPC error instead of a result.
   *
   * Typed as the frame `/api/<version>` sends and nothing else: `code` and
   * `message` outside, the TrueNAS payload under `data`. The legacy
   * `/websocket` shape — those payload fields at the top level — is not
   * accepted, so a spec cannot script an error this client can never receive.
   * It was accepted until now only because the parameter was the loose
   * `ApiError` union, which admits both.
   *
   * The cast is gone with it: the frame's own type says this is what an error
   * looks like.
   */
  replyError(method: string, error: TrueNasErrorFrame): void {
    this.receive({ jsonrpc: '2.0', id: this.idOf(method), error });
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
