import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrueNasMessage } from '@/types/truenas-message.type';
import { randomUUID } from '@/utils/utils';
import { TrueNasConnection } from './truenas-connection';
// Import the mock's exports from the `__mocks__` file directly: `tsc` can't see the
// runtime `vi.mock` redirect, and only the mock exports `mockSocketInstances`. At
// runtime this is the same module instance vitest substitutes for the socket.
import {
  mockSocketInstances,
  TrueNasSocket as MockSocket,
} from './__mocks__/truenas-socket';

// Use the manual mock in __mocks__/truenas-socket.ts for the socket transport.
vi.mock('@/connection/truenas-socket');

// Make message ids deterministic ('test-uuid') so the handshake filter matches.
vi.mock('@/utils/utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/utils')>()),
  randomUUID: vi.fn(),
}));

type ConnectionOptions = Partial<{
  enabled: boolean;
  hostnames: string[];
  retryDelay: number;
  maxRetry: number;
  closeCode: number;
  closeReason: string;
}>;

type Established = {
  connection: TrueNasConnection;
  socket: MockSocket;
};

const websocketPath = '/api/v25.10.0';
const retryDelay = 10_000;
const pingDelay = 20_000;
const handshakeResponse: TrueNasMessage = { id: 'test-uuid', result: {} };

function createConnection(opts: ConnectionOptions = {}): TrueNasConnection {
  return new TrueNasConnection(
    opts.enabled ?? true,
    opts.hostnames ?? ['truenas.test'],
    'test-uuid-1234',
    websocketPath,
    'Test System',
    opts.retryDelay ?? retryDelay,
    opts.maxRetry ?? 3
  );
}

/** Creates a connection, opens the first socket, completes the handshake. */
function establishConnection(opts: ConnectionOptions = {}): Established {
  const connection = createConnection(opts);
  const socket = mockSocketInstances[mockSocketInstances.length - 1];
  socket.simulateOpen();
  socket.next(handshakeResponse);
  return { connection, socket };
}

/** Creates a connection whose sockets all fail until per-socket retries are exhausted. */
function exhaustRetries(opts: ConnectionOptions = {}): TrueNasConnection {
  const hostnames = opts.hostnames ?? ['truenas.test'];
  const maxRetry = opts.maxRetry ?? 3;
  const code = opts.closeCode ?? 1006;
  const reason = opts.closeReason ?? '';
  const totalAttempts = hostnames.length * (1 + maxRetry);

  const startIdx = mockSocketInstances.length;
  const connection = createConnection({ hostnames, maxRetry });

  for (let i = 0; i < totalAttempts; i++) {
    mockSocketInstances[startIdx + i].simulateClose(code, reason);
    if (i < totalAttempts - 1) {
      vi.advanceTimersByTime(retryDelay);
    }
  }

  return connection;
}

describe('TrueNasConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(randomUUID).mockReturnValue('test-uuid');
    mockSocketInstances.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has opened set to false before connection is established', () => {
      const connection = createConnection({ enabled: false });
      expect(connection.opened.getValue()).toBe(false);
      connection.close();
    });

    it('emits a closed connection while disabled', async () => {
      const connection = createConnection({ enabled: false });
      const initialState = await firstValueFrom(connection.opened$);
      const initialConnection = await firstValueFrom(connection.connection$);
      const initialWebsocket = await firstValueFrom(connection.ws$);

      expect(initialState).toBe(false);
      expect(initialWebsocket).toBeNull();
      expect(initialConnection.state).toBe('closed');
      expect(mockSocketInstances.length).toBe(0);
      connection.close();
    });
  });

  describe('connection lifecycle', () => {
    it('sends JSON-RPC 2.0 handshake on connection open', () => {
      const connection = createConnection();
      const socket = mockSocketInstances[0];
      const nextSpy = vi.spyOn(socket, 'next');

      socket.simulateOpen();

      expect(nextSpy).toHaveBeenCalledWith({
        jsonrpc: '2.0',
        method: 'core.set_options',
        params: [{ legacy_jobs: false }],
        id: 'test-uuid',
      });
      connection.close();
    });

    it('updates opened state after handshake response', () => {
      const { connection } = establishConnection();

      expect(connection.opened.getValue()).toBe(true);
      connection.close();
    });

    it('sets hostname after connection is established', () => {
      const { connection } = establishConnection();

      expect(connection.hostname.value).toBe('truenas.test');
      connection.close();
    });

    it('uses correct WebSocket URL with versioned path', () => {
      const connection = createConnection();
      const socket = mockSocketInstances[0];

      expect(socket.config.url).toBe(`wss://truenas.test${websocketPath}`);
      connection.close();
    });

    it('clears error on successful reconnection', () => {
      // first, exhaust all retries so an error message is set
      const connection = exhaustRetries({ closeCode: 1006 });
      vi.advanceTimersByTime(0);

      expect(connection.lastErrorMessage.value).not.toBeNull();

      // the race is now attempting a new socket — open it and handshake to clear the error
      const recoverySocket = mockSocketInstances[mockSocketInstances.length - 1];
      recoverySocket.simulateOpen();
      recoverySocket.next(handshakeResponse);

      expect(connection.lastErrorMessage.value).toBeNull();
      connection.close();
    });
  });

  describe('enable gate transitions', () => {
    it('disabled -> enabled triggers a connection attempt', () => {
      const connection = createConnection({ enabled: false });

      expect(mockSocketInstances.length).toBe(0);
      connection.setEnabled(true);
      expect(mockSocketInstances.length).toBeGreaterThan(0);
      connection.close();
    });

    it('enabled -> disabled tears down the connection', () => {
      const { connection } = establishConnection();
      expect(connection.opened.getValue()).toBe(true);

      connection.setEnabled(false);

      expect(connection.opened.getValue()).toBe(false);
      connection.close();
    });
  });

  describe('race parallelism', () => {
    it('first socket to open wins among multiple hostnames', () => {
      const connection = createConnection({ hostnames: ['host-a', 'host-b'] });

      expect(mockSocketInstances.length).toBe(2);
      expect(mockSocketInstances[0].config.url).toBe(
        `wss://host-a${websocketPath}`
      );
      expect(mockSocketInstances[1].config.url).toBe(
        `wss://host-b${websocketPath}`
      );

      // Open host-b first (index 1)
      mockSocketInstances[1].simulateOpen();
      mockSocketInstances[1].next(handshakeResponse);
      vi.advanceTimersByTime(0);

      expect(connection.hostname.value).toBe('host-b');
      connection.close();
    });

    it('all sockets failing triggers a retry cycle', () => {
      const connection = createConnection({
        hostnames: ['host-a', 'host-b'],
        maxRetry: 1,
      });

      const initialCount = mockSocketInstances.length;
      expect(initialCount).toBe(2);

      mockSocketInstances[0].simulateClose();
      mockSocketInstances[1].simulateClose();
      vi.advanceTimersByTime(retryDelay);

      expect(mockSocketInstances.length).toBeGreaterThan(initialCount);
      connection.close();
    });
  });

  describe('ping behavior', () => {
    it('starts pinging when connection is opened', () => {
      const { connection, socket } = establishConnection();
      const nextSpy = vi.spyOn(socket, 'next');
      nextSpy.mockClear();

      vi.advanceTimersByTime(pingDelay);

      expect(nextSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: '2.0',
          method: 'core.ping',
        })
      );
      connection.close();
    });

    it('sends ping every 20 seconds while connected', () => {
      const { connection, socket } = establishConnection();
      const nextSpy = vi.spyOn(socket, 'next');
      nextSpy.mockClear();

      vi.advanceTimersByTime(pingDelay);
      expect(nextSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(pingDelay);
      expect(nextSpy).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(pingDelay);
      expect(nextSpy).toHaveBeenCalledTimes(3);
      connection.close();
    });

    it('stops pinging when connection is manually closed', () => {
      const { connection, socket } = establishConnection();
      const nextSpy = vi.spyOn(socket, 'next');
      nextSpy.mockClear();

      vi.advanceTimersByTime(pingDelay);
      expect(nextSpy).toHaveBeenCalledTimes(1);

      connection.close();

      vi.advanceTimersByTime(pingDelay * 2);
      expect(nextSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    let connection: TrueNasConnection | null;
    afterEach(() => {
      connection?.close();
      connection = null;
    });

    it('produces correct error message for 404 errors', () => {
      connection = exhaustRetries({ closeCode: 1002, closeReason: '404 Not Found' });
      expect(connection.lastErrorMessage.value).toBe(
        'API endpoint not found - System may not support versioned API'
      );
    });

    it('produces correct error message for abnormal closure (1006)', () => {
      connection = exhaustRetries({ closeCode: 1006 });
      expect(connection.lastErrorMessage.value).toBe(
        'Connection lost unexpectedly - Check network connectivity'
      );
    });

    it('produces correct error message for TLS errors (1015)', () => {
      connection = exhaustRetries({ closeCode: 1015 });
      expect(connection.lastErrorMessage.value).toBe(
        'TLS/Certificate error - Certificate may be expired'
      );
    });

    it('produces correct error message for 502 errors', () => {
      connection = exhaustRetries({ closeCode: 1006, closeReason: '502 Bad Gateway' });
      expect(connection.lastErrorMessage.value).toBe(
        'Bad Gateway - System may be starting up'
      );
    });

    it('produces correct error message for 503 errors', () => {
      connection = exhaustRetries({
        closeCode: 1006,
        closeReason: '503 Service Unavailable',
      });
      expect(connection.lastErrorMessage.value).toBe(
        'Service Unavailable - System may be overloaded'
      );
    });

    it('produces correct error message for protocol error (1002)', () => {
      connection = exhaustRetries({ closeCode: 1002 });
      expect(connection.lastErrorMessage.value).toBe(
        'Protocol error - Invalid WebSocket communication'
      );
    });

    it('produces correct error message for normal closure (1000)', () => {
      connection = exhaustRetries({ closeCode: 1000 });
      expect(connection.lastErrorMessage.value).toBe('Connection closed normally');
    });
  });

  describe('connection error detection', () => {
    let connection: TrueNasConnection | null;
    afterEach(() => {
      connection?.close();
      connection = null;
    });

    it('hasExhaustedRetries() is true after failed connection attempts', () => {
      connection = exhaustRetries();
      expect(connection.hasExhaustedRetries()).toBe(true);
    });

    it('connectionAttempts increments on each socket failure', () => {
      connection = exhaustRetries({ maxRetry: 1 });

      // 1 hostname * (1 initial + 1 retry) = 2 attempts
      expect(connection.connectionAttempts.value).toBe(2);
    });

    it('hasConnectionError$ emits true once retries are exhausted', () => {
      const maxRetry = 3;
      const hostnames = ['truenas.test'];
      const totalAttempts = hostnames.length * (1 + maxRetry);
      const startIdx = mockSocketInstances.length;

      connection = createConnection({ maxRetry });

      // Subscribe early to capture the error emission.
      const errors: boolean[] = [];
      connection.hasConnectionError$.subscribe(val => errors.push(val));

      for (let i = 0; i < totalAttempts; i++) {
        mockSocketInstances[startIdx + i].simulateClose();
        if (i < totalAttempts - 1) vi.advanceTimersByTime(retryDelay);
      }

      expect(errors).toContain(true);
    });

    it('resets connectionAttempts to 0 on successful open', () => {
      // exhaust retries on one socket first to increment `connectionAttempts`.
      connection = createConnection({ maxRetry: 1 });
      mockSocketInstances[0].simulateClose();
      vi.advanceTimersByTime(retryDelay);
      mockSocketInstances[1].simulateClose();

      expect(connection.connectionAttempts.value).toBeGreaterThan(0);

      // since we've exhausted all retries, the `connection$` should retry immediately and succeed.
      vi.advanceTimersByTime(0);
      const recoverySocket = mockSocketInstances[mockSocketInstances.length - 1];
      recoverySocket.simulateOpen();

      // so, we expect the connection attempts to have been reset.
      expect(connection.connectionAttempts.value).toBe(0);
    });

    it('does not permanently fix hasExhaustedRetries() after a successful reconnect', () => {
      connection = exhaustRetries({ maxRetry: 1 });
      expect(connection.hasExhaustedRetries()).toBe(true);

      const recoverySocket = mockSocketInstances[mockSocketInstances.length - 1];
      recoverySocket.simulateOpen();
      recoverySocket.next(handshakeResponse);

      expect(connection.hasExhaustedRetries()).toBe(false);
    });
  });

  describe('post-open connection death', () => {
    let connection: TrueNasConnection | null;
    afterEach(() => {
      connection?.close();
      connection = null;
    });

    it('propagates an error immediately (without per-socket retry delay) when an already-open socket dies', () => {
      const { connection: conn, socket } = establishConnection({ maxRetry: 3 });
      connection = conn;

      const errors: boolean[] = [];
      connection.hasConnectionError$.subscribe(val => errors.push(val));

      socket.simulateClose(1006, '');
      // no `vi.advanceTimersByTime(retryDelay)` - the fix ensures this propagates
      // immediately rather than waiting out the per-socket retry delay.

      expect(errors).toContain(true);
    });

    it('reconnects (does not re-run the per-socket retry loop) after an already-open socket dies', () => {
      const { connection: conn, socket } = establishConnection();
      connection = conn;
      const priorInstanceCount = mockSocketInstances.length;

      socket.simulateClose(1006, '');
      vi.advanceTimersByTime(0);

      // connection$'s own `retry()` re-subscribes to `connect()`, creating a fresh socket
      expect(mockSocketInstances.length).toBeGreaterThan(priorInstanceCount);

      const newSocket = mockSocketInstances[mockSocketInstances.length - 1];
      newSocket.simulateOpen();
      newSocket.next(handshakeResponse);

      expect(connection.opened.getValue()).toBe(true);
      expect(connection.hostname.value).toBe('truenas.test');
    });
  });

  describe('send()', () => {
    it('delivers message to active socket', () => {
      const { connection, socket } = establishConnection();
      const nextSpy = vi.spyOn(socket, 'next');

      const message: TrueNasMessage = {
        method: 'test.method',
        id: 'msg-1',
        params: [],
      };
      connection.send(message);

      expect(nextSpy).toHaveBeenCalledWith(message);
      connection.close();
    });
  });

  describe('messages$', () => {
    it('emits messages from the active socket', () => {
      const { connection, socket } = establishConnection();

      const received: TrueNasMessage[] = [];
      connection.messages$.subscribe(msg => received.push(msg));

      const testMessage: TrueNasMessage = { id: 'resp-1', result: { data: 'test' } };
      socket.next(testMessage);

      expect(received).toContainEqual(testMessage);
      connection.close();
    });

    it('keeps emitting after the underlying socket stream errors and a new socket opens', () => {
      const { connection, socket } = establishConnection();

      const received: TrueNasMessage[] = [];
      const completions: number[] = [];
      connection.messages$.subscribe({
        next: msg => received.push(msg),
        complete: () => completions.push(1),
      });

      // an error on the raw socket stream must not complete/kill the `messages$` subscription
      socket.socket.error(new Error('mock socket error'));
      vi.advanceTimersByTime(0);

      expect(completions).toHaveLength(0);

      // now drive an actual reconnect (post-open death -> new socket) and confirm
      // `messages$` is still alive to deliver messages from the replacement socket.
      socket.simulateClose(1006, '');
      vi.advanceTimersByTime(0);

      const newSocket = mockSocketInstances[mockSocketInstances.length - 1];
      newSocket.simulateOpen();
      newSocket.next(handshakeResponse);

      const testMessage: TrueNasMessage = { id: 'resp-2', result: { data: 'after-error' } };
      newSocket.next(testMessage);

      expect(completions).toHaveLength(0);
      expect(received).toContainEqual(testMessage);
      connection.close();
    });
  });

  describe('close()', () => {
    it('tears down the entire pipeline', () => {
      const { connection, socket } = establishConnection();
      const completeSpy = vi.spyOn(socket, 'complete');

      connection.close();
      vi.advanceTimersByTime(0);

      expect(completeSpy).toHaveBeenCalled();
    });

    it('stops ping interval on close', () => {
      const { connection, socket } = establishConnection();
      const nextSpy = vi.spyOn(socket, 'next');
      nextSpy.mockClear();

      connection.close();
      vi.advanceTimersByTime(40_000);

      expect(nextSpy).not.toHaveBeenCalled();
    });
  });
});
