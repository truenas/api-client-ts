import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrueNasApi } from '@/api/truenas-api';
import { TrueNasAuthenticator } from '@/auth/truenas-authenticator';
import { createFakeClient, type FakeTrueNasClient } from './create-fake-client';
import { withSpies } from './with-spies';
import type { ApiDirectoryV27_0_0 } from '@/generated';

/**
 * The verbs `withSpies` installs on `api`, and the public methods it
 * deliberately leaves alone.
 *
 * Same instrument as `fake-connection.spec.ts`'s inventory, for the same
 * reason: a verb added to `TrueNasApi` would otherwise be unspied and silent,
 * and a spec asserting `expect(api.newVerb).toHaveBeenCalled()` would fail
 * with "not a spy" rather than with anything about the call. A member added to
 * the class fails this test until someone decides which list it belongs on.
 */
const SPIED = [
  'call',
  'callAndGetJobId',
  'events',
  'generateToken',
  'job',
  'query',
  'queryCount',
  'queryOne',
  'trackJob',
] as const;

/**
 * Not verbs.
 *
 * `authenticated` and `connection` are the two collaborators the constructor
 * takes — the first is the `BehaviorSubject` the event subscription gates on,
 * which a spec drives rather than calls — and `eventStreams` / `jobEvents` are
 * the class's own bookkeeping. Spying on any of them would replace a field
 * with a function and record nothing a spec asserts on.
 *
 * `dispatch` and `initializeJobEventsSubscription` are `private`, which is
 * compile-time only: they are on the prototype and the runtime walk below sees
 * them. Listed rather than filtered, because the point of the list is that
 * nothing on the class is unaccounted for — and a spy on `dispatch` would be
 * a spec reaching past the verbs into the transport, which `connection.send`
 * already shows it.
 */
const UNSPIED = [
  'authenticated',
  'connection',
  'dispatch',
  'eventStreams',
  'initializeJobEventsSubscription',
  'jobEvents',
] as const;

function members(instance: object): string[] {
  const seen = new Set<string>();
  for (
    let level: object | null = instance;
    level && level !== Object.prototype;
    level = Object.getPrototypeOf(level) as object | null
  ) {
    for (const name of Object.getOwnPropertyNames(level)) {
      if (name !== 'constructor') seen.add(name);
    }
  }
  return [...seen].sort();
}

type Unclassified = Exclude<
  keyof TrueNasApi<ApiDirectoryV27_0_0>,
  (typeof SPIED)[number] | (typeof UNSPIED)[number]
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unclassified: Unclassified extends never ? true : Unclassified = true;

describe('withSpies', () => {
  const built: FakeTrueNasClient<ApiDirectoryV27_0_0>[] = [];

  const client = (): FakeTrueNasClient<ApiDirectoryV27_0_0> => {
    const made = createFakeClient({ version: 'v27.0.0' });
    built.push(made);
    return made;
  };

  afterEach(() => {
    for (const made of built.splice(0, built.length)) made.connection.close();
  });

  it('classifies every member of the real api', () => {
    const classified = new Set<string>([...SPIED, ...UNSPIED]);
    const unclassified = members(client().api).filter(
      name => !classified.has(name)
    );

    expect(unclassified).toEqual([]);
  });

  it('leaves behaviour intact', async () => {
    const c = withSpies(client(), vi.fn);
    c.mock.call('core.ping', 'pong');

    await expect(firstValueFrom(c.api.call('core.ping'))).resolves.toBe('pong');
  });

  it('records the call the spec asserts on', async () => {
    const c = withSpies(client(), vi.fn);
    c.mock.call('pool.dataset.get_instance', () => ({ id: 'tank' }));

    await firstValueFrom(c.api.call('pool.dataset.get_instance', ['tank']));

    expect(c.api.call).toHaveBeenCalledWith('pool.dataset.get_instance', ['tank']);
  });

  /**
   * The frame still reaches the wire through the real `send`, which is what
   * makes a spy on it an assertion about the protocol rather than about the
   * verb that was called.
   */
  it('spies the connection without swallowing the frame', async () => {
    const c = withSpies(client(), vi.fn);
    c.mock.call('core.ping', 'pong');

    await firstValueFrom(c.api.call('core.ping'));

    expect(c.connection.send).toHaveBeenCalled();
    expect(c.connection.sent.map(frame => frame.method)).toContain('core.ping');
  });

  it('spies every login the authenticator offers', () => {
    const c = withSpies(client(), vi.fn);

    for (const name of [
      'loginWithApiKey',
      'loginWithOtp',
      'loginWithToken',
      'loginWithUserPass',
      'logout',
      'newApiKey',
    ] as const) {
      expect(vi.isMockFunction(c.authenticator[name])).toBe(true);
    }
  });

  /**
   * The spy is installed unbound, so a verb still needs its object. Binding it
   * would let `const { call } = client.api; call(…)` work under spies and
   * throw without them — a spied client behaving differently from the client
   * it observes, which is the one thing this package cannot do.
   */
  it('does not make a detached verb work where the real one would not', async () => {
    const plain = client();
    const spied = withSpies(client(), vi.fn);

    const { call: detachedFromPlain } = plain.api;
    const { call: detachedFromSpied } = spied.api;

    expect(() => detachedFromPlain('core.ping')).toThrow();
    expect(() => detachedFromSpied('core.ping')).toThrow();
  });

  /**
   * Every name in the lists has to be a method on the class it names. A
   * renamed verb would otherwise install a spy on `undefined` and the failure
   * would surface as "not a function" at the call site.
   */
  it('refuses a name that is not a method', () => {
    const c = client();
    const broken = {
      api: c.api,
      connection: c.connection,
      authenticator: { notAMethod: 3 } as unknown as TrueNasAuthenticator,
    };

    expect(() => withSpies(broken, vi.fn)).toThrow(/not a method/);
  });
});
