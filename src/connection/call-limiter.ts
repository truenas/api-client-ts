import { Subscription } from 'rxjs';
import { TrueNasMessage } from '@/types/truenas-message.type';

interface WaitingCall {
  id: string;
  message: TrueNasMessage;
  handle: Subscription;
}

/**
 * Keeps no more than `limit` requests awaiting an answer on one connection.
 * The rest wait their turn, in the order they were sent.
 *
 * Middleware holds a fixed number of calls per connection and refuses the next
 * outright, so a burst a caller cannot see the end of (a page load, a store
 * starting up) loses calls at random. Only requests count: a frame with an `id`
 * and a `method`. One is finished when a frame with its id and no `method`
 * comes back, whether or not its caller is still listening, since the appliance
 * is busy with it either way.
 */
export class CallLimiter {
  /**
   * Each request awaiting an answer, with the handle `write` gave for it. That
   * handle closes once the frame is on a socket: until then the connection is
   * still holding it for one, and giving up on it takes it back.
   */
  private readonly inFlight = new Map<string, Subscription>();

  private readonly waiting: WaitingCall[] = [];

  /**
   * Calls that were waiting when a socket was lost, kept apart from `waiting`
   * until `release()`. A call sent after the loss, the sign-in among them, then
   * never waits behind one: nothing would write it, and `release()` waits on it.
   */
  private readonly heldCalls: WaitingCall[] = [];

  constructor(
    readonly limit: number,
    /** Writes `message` to the next socket; the subscription closes once it is written. */
    private readonly write: (message: TrueNasMessage) => Subscription,
  ) {}

  /** Requests written or being written, and not answered yet. */
  get inFlightCount(): number {
    return this.inFlight.size;
  }

  /** Requests waiting for a place, held ones included. */
  get waitingCount(): number {
    return this.waiting.length + this.heldCalls.length;
  }

  /** Whether calls are being kept from a lost socket until `release()`. */
  get held(): boolean {
    return this.heldCalls.length > 0;
  }

  /**
   * Sends `message` now if there is room, or queues it. Frames that are not
   * requests pass straight through. Unsubscribing the returned handle takes
   * the call back if it has not been written yet.
   *
   * New calls are not held back by a lost socket, only by the limit: the frames
   * that sign a new socket in come through here, and the held calls are
   * waiting on exactly those.
   */
  send(message: TrueNasMessage): Subscription {
    if (!isRequest(message)) {
      return this.write(message);
    }

    const call: WaitingCall = { id: message.id, message, handle: new Subscription() };
    if (this.inFlight.size < this.limit) {
      this.start(call);
      return call.handle;
    }

    this.waiting.push(call);
    call.handle.add(() => {
      remove(this.waiting, call);
      remove(this.heldCalls, call);
    });
    return call.handle;
  }

  /**
   * Counts a request the connection wrote to a socket itself, such as its
   * keepalive `core.ping`, or returns `false` without counting it when there is
   * no room. A request written that way is not the limiter's to queue: the
   * caller decides what not sending it means.
   */
  tryTrack(id: string): boolean {
    if (this.inFlight.size >= this.limit) {
      return false;
    }
    this.inFlight.set(id, Subscription.EMPTY);
    return true;
  }

  /** Frees the place of the request this frame answers, if it is one. */
  received(message: TrueNasMessage): void {
    if (message.id === undefined || message.id === null || message.method) {
      return;
    }
    this.finish(String(message.id));
  }

  /**
   * What was written on the lost socket is lost with it, answers included, so
   * those places are freed. A frame the connection has not written yet is still
   * its to send on the next socket, so it stays counted. Calls still waiting are
   * held until `release()`: the new socket starts signed out, and a call sent on
   * it before the session is back is refused.
   */
  socketLost(): void {
    this.inFlight.forEach((sending, id) => {
      if (sending.closed) {
        this.inFlight.delete(id);
      }
    });
    this.heldCalls.push(...this.waiting.splice(0));
  }

  /**
   * Lets held calls go out again, once the session they were made in is back.
   * They were sent before anything still waiting, so they go first.
   */
  release(): void {
    this.waiting.unshift(...this.heldCalls.splice(0));
    this.startWaiting();
  }

  /**
   * Takes back every call held from a lost socket, unsent, and returns their
   * ids so the caller can answer them. Does nothing while nothing is held.
   */
  takeHeld(): string[] {
    return this.heldCalls.splice(0).map(({ id }) => id);
  }

  // The three below call each other in a ring.
  private start({ id, message, handle }: WaitingCall): void {
    // Counted before it is written, in case the answer arrives as it is.
    this.inFlight.set(id, Subscription.EMPTY);
    let sending: Subscription;
    try {
      sending = this.write(message);
    } catch (error) {
      // A call that waited is started from whichever answer made room for it,
      // not by its caller, so nobody else is placed to give its place back.
      this.finish(id);
      throw error;
    }
    if (!this.inFlight.has(id)) {
      return;
    }
    this.inFlight.set(id, sending);

    handle.add(() => {
      const isWritten = sending.closed;
      sending.unsubscribe();
      // Given up on before a socket took it: never written, so no answer is
      // coming to free its place.
      if (!isWritten && this.inFlight.get(id) === sending) {
        this.finish(id);
      }
    });
  }

  private startWaiting(): void {
    while (this.inFlight.size < this.limit) {
      const next = this.waiting.shift();
      if (!next) {
        return;
      }
      this.start(next);
    }
  }

  private finish(id: string): void {
    if (this.inFlight.delete(id)) {
      this.startWaiting();
    }
  }
}

function remove(calls: WaitingCall[], call: WaitingCall): void {
  const index = calls.indexOf(call);
  if (index >= 0) {
    calls.splice(index, 1);
  }
}

function isRequest(message: TrueNasMessage): message is TrueNasMessage & { id: string } {
  return message.id !== undefined && message.id !== null && Boolean(message.method);
}
