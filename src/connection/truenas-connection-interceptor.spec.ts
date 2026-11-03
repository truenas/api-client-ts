import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionInterceptor } from '@/types/transport.type';
import { TrueNasMessage } from '@/types/truenas-message.type';
import { randomUUID } from '@/utils/utils';
import { TrueNasConnection } from './truenas-connection';
import {
  mockSocketInstances,
  TrueNasSocket as MockSocket,
} from './__mocks__/truenas-socket';

vi.mock('@/connection/truenas-socket');

vi.mock('@/utils/utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/utils')>()),
  randomUUID: vi.fn(),
}));

const handshakeResponse: TrueNasMessage = { id: 'handshake', result: {} };
const pingDelay = 20_000;

const call = (id: string): TrueNasMessage => ({ jsonrpc: '2.0', id, method: 'test.method', params: [] });

function createConnection(interceptor?: ConnectionInterceptor): TrueNasConnection {
  return new TrueNasConnection(
    true,
    ['truenas.test'],
    'test-uuid-1234',
    '/api/v28.0.0',
    undefined,
    10_000,
    3,
    undefined,
    undefined,
    interceptor,
  );
}

function openSocket(): MockSocket {
  const socket = mockSocketInstances[mockSocketInstances.length - 1];
  socket.simulateOpen();
  socket.next(handshakeResponse);
  return socket;
}

describe('TrueNasConnection with an interceptor', () => {
  let connection: TrueNasConnection;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(randomUUID).mockReturnValue('handshake');
    mockSocketInstances.length = 0;
  });

  afterEach(() => {
    connection.close();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('sees every frame written, the handshake and the ping included', () => {
    const outgoing = vi.fn<(message: TrueNasMessage) => void>();
    connection = createConnection({ outgoing });
    openSocket();
    connection.send(call('a'));
    vi.advanceTimersByTime(pingDelay);

    expect(outgoing.mock.calls.map(([message]) => message.method)).toEqual([
      'core.set_options',
      'test.method',
      'core.ping',
    ]);
  });

  it('keeps a frame off the socket when outgoing returns false', () => {
    connection = createConnection({ outgoing: message => message.id !== 'mocked' });
    const socket = openSocket();
    const next = vi.spyOn(socket, 'next');

    const handle = connection.send(call('mocked'));
    connection.send(call('real'));

    expect(next.mock.calls.map(([message]) => message.id)).toEqual(['real']);
    expect(handle.closed).toBe(true);
  });

  it('still writes the connection\'s own frames when outgoing returns false', () => {
    vi.mocked(randomUUID).mockReturnValueOnce('handshake').mockReturnValue('ping');
    connection = createConnection({ outgoing: () => false });
    const socket = openSocket();
    const next = vi.spyOn(socket, 'next');

    vi.advanceTimersByTime(pingDelay);

    expect(next.mock.calls.map(([message]) => message.method)).toEqual(['core.ping']);
    expect(connection.opened.getValue()).toBe(true);
  });

  it('reads injected frames as if the appliance sent them, on a later tick', async () => {
    const injected$ = new Subject<TrueNasMessage>();
    connection = createConnection({ injected$ });
    openSocket();
    const received: TrueNasMessage[] = [];
    connection.messages().subscribe(message => received.push(message));

    injected$.next({ jsonrpc: '2.0', id: 'mocked', result: 42 });
    expect(received).toEqual([]);

    await vi.advanceTimersByTimeAsync(0);
    expect(received).toEqual([{ jsonrpc: '2.0', id: 'mocked', result: 42 }]);
  });

  it('sees every frame read once, injected ones included', async () => {
    const injected$ = new Subject<TrueNasMessage>();
    const incoming = vi.fn<(message: TrueNasMessage) => void>();
    connection = createConnection({ incoming, injected$ });
    const socket = openSocket();
    // Two listeners, as a client has: the hook still runs once per frame.
    connection.messages().subscribe();
    connection.messages().subscribe();

    socket.next({ jsonrpc: '2.0', id: 'real', result: 1 });
    injected$.next({ jsonrpc: '2.0', id: 'mocked', result: 2 });
    await vi.advanceTimersByTimeAsync(0);

    expect(incoming.mock.calls.map(([message]) => message.id)).toEqual(['real', 'mocked']);
  });

  it('changes nothing without an interceptor', () => {
    connection = createConnection();
    const socket = openSocket();
    const next = vi.spyOn(socket, 'next');

    connection.send(call('a'));

    expect(next.mock.calls.map(([message]) => message.id)).toEqual(['a']);
  });
});
