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
 * depend on a runner and must not start. Both runners' `fn` accept an
 * implementation and return something callable with the same signature; what
 * they return beyond that — `mock.calls`, `toHaveBeenCalledWith` — is the
 * runner's business and this type says nothing about it.
 */
export type SpyFactory = <A extends unknown[], R>(
  implementation: (...args: A) => R
) => (...args: A) => R;

/**
 * The verbs of `TrueNasApi` a spec asserts on.
 *
 * Enumerated rather than discovered, and pinned by `with-spies.spec.ts`: a
 * verb added to `TrueNasApi` fails that test until someone decides whether it
 * belongs here. `generateToken` is the one public method left out — it is a
 * call like any other and is reachable through `call` if a spec needs it.
 */
const API_VERBS = [
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
const CONNECTION_METHODS = ['send'] as const;

/** Every way in, and the way out. */
const AUTHENTICATOR_METHODS = [
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

    // Not bound to `target`. Both runners invoke the implementation with the
    // `this` of the call, so a verb reached as `client.api.call(…)` gets its
    // own object either way — and binding would make a *detached* verb work
    // under spies when it throws without them. A spied client that is more
    // permissive than an unspied one is the divergence this package exists to
    // prevent, in the helper meant to observe it.
    (target as Record<string, unknown>)[name] = spy(
      original as (...args: unknown[]) => unknown
    );
  }
}

/**
 * Wrap a fake client's verbs in the caller's spies, in place.
 *
 * ```typescript
 * const client = withSpies(createFakeClient({ version: 'v27.0.0' }), vi.fn);
 *
 * client.mock.call('system.info', { hostname: 'truenas.local' });
 * await firstValueFrom(client.api.call('system.info'));
 *
 * expect(client.api.call).toHaveBeenCalledWith('system.info');
 * ```
 *
 * Behaviour is preserved: each spy wraps the real method bound to its own
 * object, so the call still runs the real dispatch and still answers from
 * whatever `mock` scripted. This only makes the calls visible to the runner's
 * matchers — `connection.sent` and `authenticator.logins` record the same
 * calls without a runner, and remain the way to assert without one.
 *
 * The client is mutated and returned, rather than wrapped in a proxy: a proxy
 * would be a different object from the one the client's own collaborators
 * hold, and the point of this package's fakes is that there is one object.
 */
export function withSpies<C extends SpyableClient>(client: C, spy: SpyFactory): C {
  spyOnMethods(client.api, API_VERBS, spy);
  spyOnMethods(client.connection, CONNECTION_METHODS, spy);
  spyOnMethods(client.authenticator, AUTHENTICATOR_METHODS, spy);

  return client;
}
