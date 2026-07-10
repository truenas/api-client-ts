import { Subject } from 'rxjs';
import { WebSocketSubjectConfig } from 'rxjs/webSocket';
import { TrueNasMessage } from '@/types/truenas-message.type';

/**
 * Manual mock of `TrueNasSocket` used by the connection spec (via `vi.mock`).
 * Captures every instance as it is created and lets tests drive open/close/message
 * events synchronously.
 */
export const mockSocketInstances: TrueNasSocket[] = [];

export class TrueNasSocket {
  socket = new Subject();

  constructor(public config: WebSocketSubjectConfig<TrueNasMessage>) {
    mockSocketInstances.push(this);
  }

  messages() {
    return this.socket;
  }

  next(msg: TrueNasMessage) {
    this.socket.next(msg);
  }

  complete() {
    this.socket.complete();
  }

  /** Simulate the websocket opening by firing the `openObserver` callback. */
  simulateOpen() {
    this.config.openObserver?.next(new Event('open'));
  }

  /**
   * Simulate the websocket closing by firing the `closeObserver` callback with the
   * given code and reason. Default code is 1006 (abnormal closure).
   */
  simulateClose(code = 1006, reason = '') {
    this.config.closeObserver?.next(new CloseEvent('close', { code, reason }));
  }
}
