import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrueNasApi } from '@/api/truenas-api';
import { TrueNasAuthenticator } from '@/auth/truenas-authenticator';
import { createFakeClient, type FakeTrueNasClient } from './create-fake-client';
import {
  API_VERBS,
  AUTHENTICATOR_METHODS,
  withSpies,
  type SpyFactory,
} from './with-spies';
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
 *
 * Taken from the implementation rather than restated. A second literal here
 * pinned a copy of the list: deleting a verb from `API_VERBS` left this test
 * green, because this test never looked at `API_VERBS`.
 */
const SPIED = API_VERBS;

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

/**
 * The authenticator's half of the same instrument, and the members it leaves
 * alone.
 *
 * Type-level only: what cannot be named cannot be spied, so the public surface
 * is the whole scope here, and `keyof` is exactly that. Without it, dropping a
 * method from `AUTHENTICATOR_METHODS` removed the check along with the entry —
 * the test iterates that list, so a shorter list is a shorter test.
 *
 * What is listed below is state a spec reads or drives, not calls.
 * `authenticated$` and `authenticating$` are the subjects the client and the
 * fake both gate on, `credentials` is what the auto-relogin replays, and
 * `sessionLifetime` is read from the login response. A spy on any of them
 * would replace a stream with a function.
 *
 * A type rather than a `const` because nothing walks the authenticator at
 * runtime: the classification is entirely the compiler's to check.
 */
type AuthenticatorUnspied =
  | 'authenticated$'
  | 'authenticating$'
  | 'credentials'
  | 'sessionLifetime';

type UnclassifiedAuthenticator = Exclude<
  keyof TrueNasAuthenticator,
  (typeof AUTHENTICATOR_METHODS)[number] | AuthenticatorUnspied
>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unclassifiedAuthenticator: UnclassifiedAuthenticator extends never
  ? true
  : UnclassifiedAuthenticator = true;

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

    // Also the implementation's list, for the same reason.
    for (const name of AUTHENTICATOR_METHODS) {
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
   * The type cannot say "forwards `this`", so the helper says it at runtime.
   * An arrow-returning factory type-checks and would otherwise hand every verb
   * a `this` of `undefined`, failing on the real method's first line with
   * `Cannot read properties of undefined (reading 'dispatch')` out of a
   * bundled chunk — naming neither spies nor `this`.
   */
  it.each([
    [
      'a plain non-forwarding factory',
      (<A extends unknown[], R>(implementation: (...args: A) => R) =>
        (...args: A): R =>
          implementation(...args)) as SpyFactory,
    ],
    [
      'vi.fn wrapped in an arrow',
      (<A extends unknown[], R>(implementation: (...args: A) => R) =>
        vi.fn((...args: A): R => implementation(...args))) as SpyFactory,
    ],
  ])('names the problem when %s loses this', (_label, factory) => {
    const c = withSpies(client(), factory);

    expect(() => c.api.call('core.ping')).toThrow(/does not forward `this`/);
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
