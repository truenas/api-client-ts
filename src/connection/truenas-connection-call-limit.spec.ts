import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const answer = (id: string): TrueNasMessage => ({ jsonrpc: '2.0', id, result: null });

function createConnection(maxConcurrentCalls?: number): TrueNasConnection {
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
    maxConcurrentCalls,
  );
}

function openSocket(): MockSocket {
  const socket = mockSocketInstances[mockSocketInstances.length - 1];
  socket.simulateOpen();
  socket.next(handshakeResponse);
  return socket;
}

/** Ids of the `test.method` frames written to `socket`, in order. */
function written(socket: MockSocket): (string | undefined)[] {
  return vi.mocked(socket.next).mock.calls
    .map(([message]) => message)
    .filter(message => message.method === 'test.method')
    .map(message => message.id);
}

describe('TrueNasConnection with maxConcurrentCalls', () => {
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

  it('rejects a limit that is not a positive integer', () => {
    connection = createConnection();
    expect(() => createConnection(0)).toThrow('maxConcurrentCalls must be a positive integer');
    expect(() => createConnection(1.5)).toThrow('maxConcurrentCalls must be a positive integer');
  });

  it('writes up to the limit and holds the rest until an answer makes room, in order', () => {
    connection = createConnection(2);
    const socket = openSocket();
    vi.spyOn(socket, 'next');

    ['a', 'b', 'c', 'd'].forEach(id => connection.send(call(id)));
    expect(written(socket)).toEqual(['a', 'b']);

    socket.next(answer('a'));
    expect(written(socket)).toEqual(['a', 'b', 'c']);

    socket.next(answer('c'));
    expect(written(socket)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not count frames that are not requests', () => {
    connection = createConnection(1);
    const socket = openSocket();
    vi.spyOn(socket, 'next');

    connection.send(call('a'));
    connection.send({ jsonrpc: '2.0', method: 'test.method' });

    expect(vi.mocked(socket.next).mock.calls.map(([message]) => message.id)).toEqual(['a', undefined]);
  });

  it('gives back the place of a waiting call its caller gave up on', () => {
    connection = createConnection(1);
    const socket = openSocket();
    vi.spyOn(socket, 'next');

    connection.send(call('a'));
    connection.send(call('b')).unsubscribe();
    connection.send(call('c'));

    socket.next(answer('a'));
    expect(written(socket)).toEqual(['a', 'c']);
  });

  it('frees the place of a call given up on before any socket took it', () => {
    connection = createConnection(1);
    const abandoned = connection.send(call('a'));
    connection.send(call('b'));
    abandoned.unsubscribe();

    const socket = openSocket();
    vi.spyOn(socket, 'next');
    vi.advanceTimersByTime(0);

    expect(written(socket)).toEqual([]);
    // `b` started when `a` was given up, so it was queued on the socket.
    socket.next(answer('b'));
    connection.send(call('c'));
    expect(written(socket)).toEqual(['c']);
  });

  describe('the keepalive ping', () => {
    it('counts the ping, so a call waits for its answer', () => {
      vi.mocked(randomUUID).mockReturnValueOnce('handshake').mockReturnValue('ping');
      connection = createConnection(1);
      const socket = openSocket();
      vi.spyOn(socket, 'next');

      vi.advanceTimersByTime(pingDelay);
      connection.send(call('a'));
      expect(written(socket)).toEqual([]);

      socket.next(answer('ping'));
      expect(written(socket)).toEqual(['a']);
    });

    it('skips the ping while every place is taken', () => {
      connection = createConnection(1);
      const socket = openSocket();
      vi.spyOn(socket, 'next');

      connection.send(call('a'));
      vi.advanceTimersByTime(pingDelay);

      const methods = vi.mocked(socket.next).mock.calls.map(([message]) => message.method);
      expect(methods).toEqual(['test.method']);
    });
  });

  describe('a lost socket', () => {
    function loseSocket(socket: MockSocket): MockSocket {
      socket.simulateClose(1006, '');
      vi.advanceTimersByTime(0);
      const next = openSocket();
      vi.spyOn(next, 'next');
      return next;
    }

    it('frees the places of calls written on it, and holds the waiting ones until released', () => {
      connection = createConnection(1);
      const first = openSocket();
      connection.send(call('a'));
      connection.send(call('b'));

      const second = loseSocket(first);
      // `a` was lost with the socket, which freed its place, but `b` is held.
      connection.send(call('sign-in'));
      expect(written(second)).toEqual(['sign-in']);

      second.next(answer('sign-in'));
      expect(written(second)).toEqual(['sign-in']);

      connection.releaseHeldCalls();
      expect(written(second)).toEqual(['sign-in', 'b']);
    });

    it('does not queue a call sent at the limit behind the held ones', () => {
      connection = createConnection(1);
      const first = openSocket();
      connection.send(call('a'));
      connection.send(call('b'));

      first.simulateClose(1006, '');
      vi.advanceTimersByTime(0);
      // Sent while there is no socket: it takes the place `a` freed and stays
      // counted until the next socket writes it.
      connection.send(call('c'));
      const second = openSocket();
      vi.spyOn(second, 'next');

      // Every place is taken, so the sign-in waits for one, but not behind `b`.
      connection.send(call('sign-in'));
      second.next(answer('c'));
      expect(written(second)).toEqual(['sign-in']);

      second.next(answer('sign-in'));
      connection.releaseHeldCalls();
      expect(written(second)).toEqual(['sign-in', 'b']);
    });

    it('answers held calls with ENOTAUTHENTICATED when refused, and sends none of them', () => {
      connection = createConnection(1);
      const first = openSocket();
      connection.send(call('a'));
      connection.send(call('b'));
      connection.send(call('c'));
      const answers: TrueNasMessage[] = [];
      connection.messages().subscribe(message => answers.push(message));

      const second = loseSocket(first);

      expect(connection.refuseHeldCalls()).toBe(2);
      expect(answers.map(message => [message.id, message.error?.data?.errname])).toEqual([
        ['b', 'ENOTAUTHENTICATED'],
        ['c', 'ENOTAUTHENTICATED'],
      ]);

      connection.releaseHeldCalls();
      expect(written(second)).toEqual([]);
    });

    it('refuses nothing while nothing is held', () => {
      connection = createConnection(1);
      const socket = openSocket();
      vi.spyOn(socket, 'next');
      connection.send(call('a'));
      connection.send(call('b'));

      expect(connection.refuseHeldCalls()).toBe(0);

      socket.next(answer('a'));
      expect(written(socket)).toEqual(['a', 'b']);
    });
  });

  it('holds nothing back without a limit', () => {
    connection = createConnection();
    const socket = openSocket();
    vi.spyOn(socket, 'next');

    ['a', 'b', 'c'].forEach(id => connection.send(call(id)));

    expect(written(socket)).toEqual(['a', 'b', 'c']);
    expect(connection.refuseHeldCalls()).toBe(0);
  });
});
