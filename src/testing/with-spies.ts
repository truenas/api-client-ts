/**
 * What this needs of a client, which is less than a client.
 *
 * Written structurally rather than as `FakeTrueNasClient<D>` so the directory
 * type does not have to be named at the call site, and so a spec holding a
 * client narrowed to its own version still passes one.
 */
export interface SpyableClient {
  readonly api: object;
  readonly connection: object;
  readonly authenticator: object;
}

/**
 * A test runner's spy factory: `vi.fn` or `jest.fn`.
 *
 * Taken as an argument rather than imported, because this package does not
 * depend on a runner and must not start.
 *
 * **One requirement the type cannot express: the returned function must invoke
 * the implementation with its own `this`.** `vi.fn` and `jest.fn` do; an arrow
 * does not, so `(impl) => vi.fn((...args) => impl(...args))` type-checks and
 * hands every verb `undefined`. `withSpies` detects that and says so.
 */
export type SpyFactory = <A extends unknown[], R>(
  implementation: (...args: A) => R
) => (...args: A) => R;

/**
 * The verbs of `TrueNasApi` a spec asserts on.
 *
 * Enumerated rather than discovered, and pinned by `with-spies.spec.ts`: a
 * verb added to `TrueNasApi` fails that test until someone classifies it.
 * `generateToken` is on the list because it is a public verb, not because it
 * is special.
 *
 * Exported for that test alone, not from the entry. The test used to restate
 * these strings, which pinned a copy: removing one from here left the suite
 * green while the verb silently stopped being spied.
 */
export const API_VERBS = [
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
 * `send` is the whole of the connection's outbound surface — every verb above
 * reaches the wire through it — so a spec that wants to assert on frames
 * rather than on verbs has one place to look. The rest of the connection is
 * driven by the fake and already recorded: `connection.sent` holds the frames
 * whether or not a spy is installed.
 */
export const CONNECTION_METHODS = ['send'] as const;

/** Every way in, and the way out. */
export const AUTHENTICATOR_METHODS = [
  'loginWithApiKey',
  'loginWithOtp',
  'loginWithToken',
  'loginWithUserPass',
  'logout',
  'newApiKey',
] as const;

function spyOnMethods<T extends object>(
  target: T,
  names: readonly string[],
  spy: SpyFactory
): void {
  for (const name of names) {
    const original = (target as Record<string, unknown>)[name];
    if (typeof original !== 'function') {
      // Not defensive padding: the lists above are pinned against the real
      // classes by a test, so reaching this means the class changed shape
      // under a name that still exists — worth saying out loud rather than
      // silently installing nothing.
      throw new Error(
        `withSpies: '${name}' is not a method on ${target.constructor.name}.`
      );
    }

    // Not bound to `target`: both runners invoke the implementation with the
    // `this` of the call, and binding would make a *detached* verb work under
    // spies when it throws without them — a spied client more permissive than
    // an unspied one is the divergence this helper exists to observe.
    //
    // The wrapper turns the two ways of losing `this` into a sentence, instead
    // of `Cannot read properties of undefined (reading 'dispatch')` out of a
    // bundled chunk. It calls the method either way: refusing made the spied
    // client *stricter* for `callAndGetJobId`, whose body sits inside a
    // `defer` and tolerates a detached call.
    const method = original as (this: unknown, ...args: unknown[]) => unknown;
    const forwarded = function (this: unknown, ...args: unknown[]): unknown {
      if (this !== undefined) return method.apply(this, args);

      try {
        return method.apply(this, args);
      } catch (cause) {
        throw new Error(
          `withSpies: ${name} was called without its object. Either the verb ` +
            'was detached from the client, or the spy factory does not forward ' +
            '`this` to the implementation it was given. An arrow function does ' +
            'not; `vi.fn` and `jest.fn` do.',
          { cause }
        );
      }
    };

    // Both runners copy the implementation's `name` and `length` onto the
    // mock, so without these every spied method would report `forwarded` — and
    // the moment `expect(client.api.call).toHaveBeenCalledWith(…)` matters is
    // the moment it fails and prints that name.
    Object.defineProperty(forwarded, 'name', { value: name, configurable: true });
    Object.defineProperty(forwarded, 'length', {
      value: method.length,
      configurable: true,
    });

    (target as Record<string, unknown>)[name] = spy(forwarded);
  }
}

/**
 * Wrap a fake client's verbs in the caller's spies, in place.
 *
 * ```typescript
 * const client = withSpies(createFakeClient({ version: 'v27.0.0' }), vi.fn);
 * expect(client.api.call).toHaveBeenCalledWith('system.info');
 * ```
 *
 * Behaviour is preserved: each spy wraps the real method, which the runner
 * invokes with the `this` of the call, so a spied call still dispatches and
 * still answers from whatever `mock` scripted. Nothing is bound — see
 * `spyOnMethods`. The client is mutated and returned rather than proxied,
 * because a proxy would not be the object its own collaborators hold.
 */
export function withSpies<C extends SpyableClient>(client: C, spy: SpyFactory): C {
  spyOnMethods(client.api, API_VERBS, spy);
  spyOnMethods(client.connection, CONNECTION_METHODS, spy);
  spyOnMethods(client.authenticator, AUTHENTICATOR_METHODS, spy);

  return client;
}
