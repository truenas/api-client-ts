import { firstValueFrom, take, toArray } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthError, AuthErrorCode } from '@/errors/auth.errors';
import { SUPPORTED_API_VERSIONS } from '@/generated';
import { AuthResponseType } from '@/types/auth.type';
import { JobState } from '@/types/job.type';
import type { TrueNasMessage } from '@/types/truenas-message.type';
import { createFakeClient } from './create-fake-client';

describe('createFakeClient', () => {
  const built: { connection: { close(): void } }[] = [];

  /**
   * Every fake connection inherits the base class's 20-second ping interval,
   * which lives until `close()`. Left open, a spec file's worth of them is a
   * spec file's worth of live timers.
   */
  afterEach(() => {
    for (const client of built.splice(0, built.length)) client.connection.close();
  });

  it('builds a real client whose collaborators are the fakes', () => {
    const client = createFakeClient({ version: 'v27.0.0' });
    built.push(client);

    // The operations come from the version's own class, not from a stub.
    expect(Object.keys(client.ops)).toContain('containerQuery');
    expect(client.version.version).toBe('v27.0.0');

    // The connection is told which appliance and which path it stands for;
    // without them a spec reading either off the fake gets the placeholder.
    expect(client.connection.systemUuid).toBe('fake-client-uuid');
    expect(client.connection.websocketPath).toBe(client.version.websocketPath);
  });

  /**
   * The reason `authenticated` defaults to true. The real client registers its
   * job subscription off the back of `authenticated$`, so a fake that starts
   * unauthenticated has an empty `sent` where a real one has already
   * subscribed — and a spec reading the wire sees a client that never did.
   */
  it('has registered the job subscription before the first call', () => {
    const authenticated = createFakeClient();
    const anonymous = createFakeClient({ authenticated: false });
    built.push(authenticated, anonymous);

    expect(authenticated.connection.sent.map(m => m.method)).toEqual(['core.subscribe']);
    expect(anonymous.connection.sent).toEqual([]);
  });

  it('answers a call through the real dispatch', async () => {
    const client = createFakeClient({ version: 'v27.0.0' });
    built.push(client);

    const result = firstValueFrom(client.api.call('system.info'));
    client.connection.reply('system.info', { hostname: 'truenas.local' });

    await expect(result).resolves.toEqual({ hostname: 'truenas.local' });
    expect(client.connection.sent.map(m => m.method)).toContain('system.info');
  });

  it('surfaces an error frame the way the real client does', async () => {
    const client = createFakeClient({ version: 'v27.0.0' });
    built.push(client);

    const result = firstValueFrom(client.api.call('system.info'));
    client.connection.replyError('system.info', {
      error: -32000,
      errname: 'EACCES',
      extra: [],
      reason: 'Not authorized',
    });

    await expect(result).rejects.toThrow('Not authorized');
  });

  it('subscribes to events once authenticated and delivers them', async () => {
    const client = createFakeClient({ version: 'v27.0.0' });
    built.push(client);

    const seen = firstValueFrom(client.api.events('alert.list').pipe(take(1)));

    expect(client.connection.sent.map(m => m.method)).toContain('core.subscribe');

    client.connection.receive({
      jsonrpc: '2.0',
      method: 'collection_update',
      params: { collection: 'alert.list', msg: 'added', id: '1', fields: { id: '1' } },
    } as unknown as TrueNasMessage);

    await expect(seen).resolves.toMatchObject({ msg: 'added' });
  });

  it('runs a job to completion through the real correlation', async () => {
    const client = createFakeClient({ version: 'v27.0.0' });
    built.push(client);

    const states = firstValueFrom(
      client.api.job('app.delete', ['plex']).pipe(toArray())
    );

    // `callAndGetJobId` correlates on a job event naming the frame it sent.
    const sent = client.connection.sent.find(m => m.method === 'app.delete');
    const jobEvent = (state: JobState, progress: number): TrueNasMessage =>
      ({
        jsonrpc: '2.0',
        method: 'collection_update',
        params: {
          collection: 'core.get_jobs',
          msg: 'changed',
          fields: {
            id: 42,
            state,
            progress: { percent: progress },
            message_ids: [sent?.id],
          },
        },
      }) as unknown as TrueNasMessage;

    client.connection.receive(jobEvent(JobState.Running, 10));
    // `trackJob` opens with a snapshot read before the live events land.
    client.connection.reply('core.get_jobs', [
      { id: 42, state: JobState.Running, progress: { percent: 10 } },
    ]);
    client.connection.receive(jobEvent(JobState.Success, 100));

    const emitted = await states;
    expect(emitted.at(-1)).toMatchObject({ state: JobState.Success });
  });

  it('records every mechanism it offers', async () => {
    const client = createFakeClient({ version: 'v27.0.0', authenticated: false });
    built.push(client);

    await firstValueFrom(client.authenticator.loginWithToken('tok'));
    await firstValueFrom(client.authenticator.loginWithApiKey({ username: 'u', key: 'k' }));
    await firstValueFrom(client.authenticator.loginWithOtp('123456'));

    expect(client.authenticator.logins).toEqual([
      { mechanism: 'TOKEN_PLAIN', credential: 'tok' },
      { mechanism: 'API_KEY_PLAIN', credential: 'u' },
      { mechanism: 'OTP_TOKEN', credential: '123456' },
    ]);
  });

  it('refuses a version the real factory would refuse', () => {
    // Unparseable, and parseable-but-unimplemented: two different refusals,
    // and the second is the one a caller hits by naming a version the
    // appliance has and this package does not.
    expect(() =>
      createFakeClient({ version: 'v1.0.0' as never })
    ).toThrow(/not a version this package parses/);
    expect(() =>
      createFakeClient({ version: 'v99.0.0' as never })
    ).toThrow(/No client implementation/);
  });

  it('defaults to the oldest supported version', () => {
    const client = createFakeClient();
    built.push(client);

    expect(client.version.version).toBe(SUPPORTED_API_VERSIONS[0]);
  });

  it('records logins and raises authenticated$', async () => {
    const client = createFakeClient({ version: 'v27.0.0', authenticated: false });
    built.push(client);

    await firstValueFrom(client.authenticator.loginWithUserPass('root', 'pw'));

    expect(client.authenticator.logins).toEqual([
      { mechanism: 'PASSWORD_PLAIN', credential: 'root' },
    ]);
    expect(client.authenticator.authenticated$.value).toBe(true);
    expect(client.connection.sent.map(m => m.method)).toContain('auth.login_ex');
  });

  /**
   * The reason the fake answers logins instead of deciding them. Scripting a
   * rejection has to produce what the real client produces — an `AuthError`
   * with a code, and `authenticated$` still false — which only the real
   * authenticator can decide from the response.
   */
  it('lets the real authenticator interpret a rejected login', async () => {
    const client = createFakeClient({ version: 'v27.0.0', authenticated: false });
    built.push(client);
    client.authenticator.failNextLogin();

    await expect(
      firstValueFrom(client.authenticator.loginWithUserPass('root', 'wrong'))
    ).rejects.toBeInstanceOf(AuthError);
    expect(client.authenticator.authenticated$.value).toBe(false);
  });

  /** A second protocol answer the fake must not flatten into "succeeded". */
  it('leaves authenticated$ false when the appliance asks for a second factor', async () => {
    const client = createFakeClient({ version: 'v27.0.0', authenticated: false });
    built.push(client);
    client.authenticator.succeedNextLogin({ response_type: AuthResponseType.OtpRequired });

    const response = await firstValueFrom(
      client.authenticator.loginWithUserPass('root', 'pw')
    );

    expect(response.response_type).toBe(AuthResponseType.OtpRequired);
    expect(client.authenticator.authenticated$.value).toBe(false);
  });

  /**
   * Answers are bound when the login is made, not when the reply goes out.
   * Two logins in flight is what testing supersession looks like, so scripting
   * both is ordinary — and reading the armed answer at reply time meant the
   * second one answered the first.
   */
  it('answers two logins in flight with the answers they were given', async () => {
    const client = createFakeClient({ version: 'v27.0.0', authenticated: false });
    built.push(client);

    client.authenticator.failNextLogin();
    const rejected = firstValueFrom(client.authenticator.loginWithUserPass('root', 'wrong'));

    client.authenticator.succeedNextLogin();
    const accepted = firstValueFrom(client.authenticator.loginWithToken('tok'));

    // The code, not just the class. Under the bug this pins, the first login
    // still rejects — with `LoginSuperseded`, because the second bumped the
    // epoch — so asserting `AuthError` alone passes either way.
    await expect(rejected).rejects.toMatchObject({
      code: AuthErrorCode.PasswordAuthFailed,
    });
    await expect(accepted).resolves.toMatchObject({
      response_type: AuthResponseType.Success,
    });
  });

  /**
   * `close()` is the caller giving up for good, not a socket drop, and the two
   * are observably different on the real connection: `close()` ends
   * `connection$` through `takeUntil`, which completes subscribers without
   * emitting, so `opened` keeps its last value and `closed` never fires.
   * Routing it through the drop path logs the client out, because the
   * authenticator lowers `authenticated$` on `closed`.
   */
  it('ends the streams on close without pushing a disconnect', () => {
    const client = createFakeClient({ version: 'v27.0.0' });
    built.push(client);
    const before = client.connection.sent.length;

    let completed = false;
    let closedFired = false;
    client.connection.messages().subscribe({ complete: () => (completed = true) });
    client.connection.closed.subscribe(() => (closedFired = true));

    client.connection.close();
    client.api.call('system.info').subscribe({ error: () => undefined });

    expect(completed).toBe(true);
    expect(client.connection.sent).toHaveLength(before);
    expect(closedFired).toBe(false);
    expect(client.connection.opened.getValue()).toBe(true);
    expect(client.authenticator.authenticated$.value).toBe(true);
  });

  /**
   * The canonical streams and the compatibility members have to agree.
   *
   * The base derives `messages$`, `opened$` and `closed$` from `connection$`,
   * which on a disabled connection reports `{ state: 'closed' }` and then
   * nothing — so before they were re-pointed they described the connection
   * that never connects rather than the one the test drives: `messages$` stayed
   * silent while `receive` delivered, and `opened$` stayed false through every
   * simulated open. A consumer reaching for the documented stream got silence.
   */
  it('drives the canonical streams, not just the compatibility ones', () => {
    const client = createFakeClient({ version: 'v27.0.0' });
    built.push(client);

    const opened: boolean[] = [];
    const messages: unknown[] = [];
    let drops = 0;
    client.connection.opened$.subscribe(v => opened.push(v));
    client.connection.messages$.subscribe(m => messages.push(m));
    client.connection.closed$.subscribe(() => (drops += 1));

    client.connection.receive({ jsonrpc: '2.0', id: 'x', result: 1 } as never);

    // Before the drop, not only after: on the unfixed class `closed$` fired at
    // subscribe time, so a count taken at the end alone reads 1 either way.
    expect(drops).toBe(0);

    client.connection.simulateClose();

    expect(messages).toHaveLength(1);
    // The whole walk. `[false]` — what the unfixed class emitted — has the same
    // last element as the right answer, so `.at(-1)` certified nothing.
    expect(opened).toEqual([true, false]);
    expect(drops).toBe(1);
  });

  /**
   * `close()` ends them, as the real `close()` does by ending `connection$`.
   * Fixing what these emit is only half of it: a consumer awaiting the last
   * value of `opened$` hangs against a fake whose subjects nothing completes.
   */
  it('completes the canonical streams on close', () => {
    const client = createFakeClient({ version: 'v27.0.0' });

    const completed = { opened: false, closed: false, messages: false };
    client.connection.opened$.subscribe({ complete: () => (completed.opened = true) });
    client.connection.closed$.subscribe({ complete: () => (completed.closed = true) });
    client.connection.messages$.subscribe({ complete: () => (completed.messages = true) });

    client.connection.close();

    expect(completed).toEqual({ opened: true, closed: true, messages: true });
  });

  /** Latched: a closed connection does not reopen, and its stream stays ended. */
  it('stays closed', () => {
    // Starting closed, so reopening would be a real transition and only the
    // latch can refuse it. From an already-open connection the
    // not-a-transition half of the guard catches the call whatever the latch
    // says, and the test certifies nothing.
    const client = createFakeClient({ version: 'v27.0.0', opened: false });
    built.push(client);
    client.connection.close();

    client.connection.simulateOpen();

    expect(client.connection.opened.getValue()).toBe(false);

    client.api.call('system.info').subscribe({ error: () => undefined });
    expect(client.connection.sent).toEqual([]);
  });

  /**
   * Level-triggered, as the real one is: a subscriber arriving while the
   * connection is already shut is told at once. The real `closed$` runs off a
   * `shareReplay` through a per-subscriber `distinctUntilChanged`, so pointing
   * this at the edge-only `closed` Subject left
   * `connection.closed$.subscribe(teardown)` after a drop never running.
   */
  it('tells a late closed$ subscriber the connection is already shut', () => {
    const client = createFakeClient({ version: 'v27.0.0' });
    built.push(client);
    client.connection.simulateClose();

    let told = false;
    client.connection.closed$.subscribe(() => (told = true));

    expect(told).toBe(true);
  });

  /**
   * Most recent, not first: a spec calling the same method twice is asking
   * about the second one, and answering the first leaves the second hanging.
   */
  it('answers the most recent frame for a method', async () => {
    const client = createFakeClient({ version: 'v27.0.0' });
    built.push(client);

    client.api.call('system.info').subscribe({ error: () => undefined });
    const second = firstValueFrom(client.api.call('system.info'));

    client.connection.reply('system.info', { hostname: 'second.local' });

    await expect(second).resolves.toEqual({ hostname: 'second.local' });
  });

  /** The JSON-RPC error shape, which is what widening `replyError` was for. */
  it('surfaces a JSON-RPC error without a TrueNAS reason', async () => {
    const client = createFakeClient({ version: 'v27.0.0' });
    built.push(client);

    const result = firstValueFrom(client.api.call('system.info'));
    client.connection.replyError('system.info', {
      code: -32601,
      message: 'Method not found',
    });

    await expect(result).rejects.toThrow('Method not found');
  });

  /**
   * A socket drop is the recoverable one, and it does fire `closed` — once.
   * The real `closed` reaches subscribers through the same
   * `distinctUntilChanged` chain as `opened`, so a second drop from an
   * already-closed socket is not a transition and nothing keyed on one re-runs.
   */
  it('fires closed once on a socket drop', () => {
    const client = createFakeClient({ version: 'v27.0.0' });
    built.push(client);

    let drops = 0;
    client.connection.closed.subscribe(() => (drops += 1));
    client.connection.simulateClose();
    client.connection.simulateClose();

    expect(drops).toBe(1);
    expect(client.connection.opened.getValue()).toBe(false);
  });

  /** `close()` still means what it means on the base: stop, and do not retry. */
  it('completes the base close signal', () => {
    const client = createFakeClient({ version: 'v27.0.0' });
    built.push(client);

    let stopped = false;
    client.connection.closeConnection.subscribe({ complete: () => (stopped = true) });
    client.connection.close();

    expect(stopped).toBe(true);
  });

  /** `succeedNextLogin` and `failNextLogin` are one-shot. */
  it('arms only the next login', async () => {
    const client = createFakeClient({ version: 'v27.0.0', authenticated: false });
    built.push(client);
    client.authenticator.failNextLogin();

    await expect(
      firstValueFrom(client.authenticator.loginWithUserPass('root', 'wrong'))
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      firstValueFrom(client.authenticator.loginWithUserPass('root', 'right'))
    ).resolves.toMatchObject({ response_type: AuthResponseType.Success });
  });

  /**
   * The real `opened` reaches subscribers through `distinctUntilChanged`, so a
   * redundant open is not a transition and nothing keyed on one re-runs.
   */
  it('ignores an open that is not a transition', async () => {
    const client = createFakeClient({ version: 'v27.0.0', authenticated: false });
    built.push(client);

    // Awaited, so the login is settled and its credentials are stored: the
    // auto-relogin watches `opened` and fires on the transition to true.
    await firstValueFrom(client.authenticator.loginWithUserPass('root', 'pw'));
    const after = client.connection.sent.length;

    client.connection.simulateOpen();

    expect(client.connection.sent).toHaveLength(after);
  });

  /**
   * `send` queues while closed, as the real one does on `ws$`, so a caller who
   * gives up before the socket arrives takes the frame with them.
   */
  it('queues sends until the connection opens, and drops abandoned ones', () => {
    const client = createFakeClient({ version: 'v27.0.0', opened: false });
    built.push(client);

    const abandoned = client.api.call('system.info').subscribe();
    expect(client.connection.sent).toEqual([]);
    abandoned.unsubscribe();

    client.api.call('system.info').subscribe();
    client.connection.simulateOpen();

    // `core.subscribe` was queued too — the client registers it the moment
    // `authenticated$` goes true, which here was before the socket existed.
    // Both go out in order when it opens; only the abandoned call is missing.
    expect(client.connection.sent.map(m => m.method)).toEqual([
      'core.subscribe',
      'system.info',
    ]);
  });
});
