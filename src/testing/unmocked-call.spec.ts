import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { createFakeClient, type FakeTrueNasClient } from './create-fake-client';
import { FakeConnection } from './fake-connection';
import { UnmockedCallError } from './unmocked-call-error';
import type { ApiDirectoryV27_0_0 } from '@/generated';

describe('strict mode', () => {
  const built: FakeTrueNasClient<ApiDirectoryV27_0_0>[] = [];

  const client = (
    options: { strict?: boolean } = {}
  ): FakeTrueNasClient<ApiDirectoryV27_0_0> => {
    const made = createFakeClient({ version: 'v27.0.0', ...options });
    built.push(made);
    return made;
  };

  /** Settles, or says it did not, without depending on microtask ordering. */
  const outcomeOf = (promise: Promise<unknown>): Promise<string> =>
    Promise.race([
      promise.then(
        () => 'settled',
        () => 'settled'
      ),
      new Promise<string>(resolve => setTimeout(() => resolve('pending'), 0)),
    ]);

  afterEach(() => {
    for (const made of built.splice(0, built.length)) made.connection.close();
  });

  it('fails an unscripted call, naming the method', async () => {
    const c = client({ strict: true });

    await expect(firstValueFrom(c.api.call('core.ping'))).rejects.toThrow(
      /core\.ping/
    );
  });

  it('fails it with the named class, not a bare Error', async () => {
    const c = client({ strict: true });

    await expect(firstValueFrom(c.api.call('core.ping'))).rejects.toBeInstanceOf(
      UnmockedCallError
    );
  });

  /**
   * The throw is inside `dispatch`'s `defer`, so it reaches the caller as a
   * failed observable rather than as an exception where the call was written —
   * which is what keeps a lazily composed call working.
   */
  it('does not throw at call time', () => {
    const c = client({ strict: true });

    expect(() => c.api.call('core.ping')).not.toThrow();
  });

  it('carries the method and params for a guard to read', async () => {
    const c = client({ strict: true });

    const error = await firstValueFrom(
      c.api.call('pool.dataset.get_instance', ['tank'])
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(UnmockedCallError);
    expect((error as UnmockedCallError).method).toBe('pool.dataset.get_instance');
    // The frame's params, which for a call are the argument list itself.
    expect((error as UnmockedCallError).params).toEqual(['tank']);
  });

  it('answers a scripted call as usual', async () => {
    const c = client({ strict: true });
    c.mock.call('core.ping', 'pong');

    await expect(firstValueFrom(c.api.call('core.ping'))).resolves.toBe('pong');
  });

  /**
   * The client subscribes for itself — the job stream on authentication, and
   * one more per `events()` name. A spec cannot script those without knowing
   * the client's internals, so strictness does not ask it to.
   */
  it('does not refuse the frames the client sends for itself', () => {
    const c = client({ strict: true });

    expect(c.connection.sent.map(frame => frame.method)).toContain('core.subscribe');
    expect(() => c.api.events('app.query').subscribe()).not.toThrow();
  });

  /**
   * The authenticator sends from its method bodies rather than through a
   * `defer`, so its unscripted frames throw where the call is written. Both
   * still fail and both still name the method — but a spec cannot catch this
   * one off the observable, and the class's own docblock says so rather than
   * promising one behaviour for the whole client.
   */
  it.each(['logout', 'newApiKey'] as const)(
    'throws at the call site for authenticator.%s',
    name => {
      const c = client({ strict: true });

      expect(() =>
        name === 'logout' ? c.authenticator.logout() : c.authenticator.newApiKey('k')
      ).toThrow(UnmockedCallError);
    }
  );

  /**
   * The default, and the reason strictness is opt-in: a spec answering by hand
   * registers its answer *after* the frame goes out, so refusing an
   * unregistered method at `send` time would refuse every hand-driven spec.
   */
  it('hangs rather than failing when not strict', async () => {
    const c = client();

    await expect(outcomeOf(firstValueFrom(c.api.call('core.ping')))).resolves.toBe(
      'pending'
    );
  });

  /**
   * `createFakeClient` passes a value either way, so this is the only place
   * the connection's own default is reachable — and it has to be the lenient
   * one, because a `FakeConnection` built by hand is exactly the case that
   * drives frames by hand.
   */
  it('is off by default on a connection built directly', () => {
    const connection = new FakeConnection();

    expect(() =>
      connection.send({ jsonrpc: '2.0', id: '1', method: 'core.ping' })
    ).not.toThrow();

    connection.close();
  });

  it('still lets a hand-driven spec answer after the fact', async () => {
    const c = client();

    const result = firstValueFrom(c.api.call('core.ping'));
    c.connection.reply('core.ping', 'pong');

    await expect(result).resolves.toBe('pong');
  });
});
