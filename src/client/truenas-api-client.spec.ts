import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrueNasApi } from '@/api/truenas-api';
import { TrueNasAuthenticator } from '@/auth/truenas-authenticator';
import { TrueNasConnection } from '@/connection/truenas-connection';
import { ApiVersion } from '@/types/api-version.type';
import { OperationMappings } from '@/types/operation-mappings.interface';
import { TrueNasApiClient } from './truenas-api-client';

const version: ApiVersion = {
  version: 'v26.0.0',
  year: 26,
  minor: 0,
  patch: 0,
  websocketPath: '/api/v26.0.0',
};

/** Concrete test subclass with stub operations. */
class TestClient extends TrueNasApiClient {
  protected createOperations(): OperationMappings {
    return {
      containerQuery: vi.fn(),
      containerStart: vi.fn(),
      containerStop: vi.fn(),
      containerRestart: vi.fn(),
    };
  }
}

describe('TrueNasApiClient', () => {
  const clients: TrueNasApiClient[] = [];

  // `enabled: false` keeps the connection gate shut — no real socket is opened.
  function make(systemName?: string): TestClient {
    const client = new TestClient(
      'uuid-1',
      ['h1.local', 'h2.local'],
      version,
      false,
      systemName
    );
    // No real socket is opened (enabled: false), so `connection.ws` is undefined.
    // Stub it so any background send (e.g. the api's `core.subscribe` when auth
    // flips) is absorbed instead of throwing.
    (client.connection as unknown as { ws: { next: () => void } }).ws = {
      next: vi.fn(),
    } as never;
    clients.push(client);
    return client;
  }

  afterEach(() => {
    clients.forEach(c => c.close());
    clients.length = 0;
  });

  it('wires up the real components in order', () => {
    const client = make();
    expect(client.version).toBe(version);
    expect(client.connection).toBeInstanceOf(TrueNasConnection);
    expect(client.authenticator).toBeInstanceOf(TrueNasAuthenticator);
    expect(client.api).toBeInstanceOf(TrueNasApi);
    expect(client.ops.containerQuery).toBeDefined();
  });

  it('does not expose a data cache', () => {
    const client = make();
    expect((client as unknown as { data?: unknown }).data).toBeUndefined();
  });

  it('reflects connection.opened via the `connected` getter', () => {
    const client = make();
    expect(client.connected).toBe(false);
    client.connection.opened.next(true);
    expect(client.connected).toBe(true);
  });

  it('reflects authenticator.authenticated$ via the `authenticated` getter', () => {
    const client = make();
    expect(client.authenticated).toBe(false);
    client.authenticator.authenticated$.next(true);
    expect(client.authenticated).toBe(true);
  });

  it('close() closes the connection', () => {
    const client = make();
    const closeSpy = vi.spyOn(client.connection, 'close');
    client.close();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('lets subclasses provide their own operations', () => {
    const client = make();
    expect(vi.isMockFunction(client.ops.containerQuery)).toBe(true);
  });
});
