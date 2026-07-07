import { webSocket, WebSocketSubjectConfig } from 'rxjs/webSocket';
import { TrueNasMessage } from '@/types/truenas-message.type';

export class TrueNasSocket {
  socket = webSocket(this.config);

  constructor(public config: WebSocketSubjectConfig<TrueNasMessage>) {}

  messages() {
    return this.socket;
  }

  next(msg: TrueNasMessage) {
    this.socket.next(msg);
  }

  complete() {
    this.socket.complete();
  }
}
