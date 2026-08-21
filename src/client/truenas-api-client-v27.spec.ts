import { firstValueFrom, of, toArray } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiDirectoryV26_0_0, ApiDirectoryV27_0_0, v27_0_0 } from '@/generated';
import { AppState } from '@/types/app-query.type';
import { ApiVersion } from '@/types/api-version.type';
import { Job, JobState } from '@/types/job.type';
import { TrueNasApiClientV27 } from './truenas-api-client-v27';

const version: ApiVersion = {
  version: 'v27.0.0',
  year: 27,
  minor: 0,
  patch: 0,
  websocketPath: '/api/v27.0.0',
};

/**
 * The duplication between this client and v26's is deliberate — see the class
 * docblock — but it is only *safe* while the entries the facade touches are
 * genuinely the same at both versions. This pins that, so the day v27 diverges
 * is a failure here rather than two implementations drifting quietly.
 *
 * When it fails, that is the signal to let the two clients differ, not to
 * loosen the assertion.
 */
type Identical<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _SameQuery = Assert<Identical<
  ApiDirectoryV26_0_0['call']['container.query'],
  ApiDirectoryV27_0_0['call']['container.query']>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _SameStart = Assert<Identical<
  ApiDirectoryV26_0_0['call']['container.start'],
  ApiDirectoryV27_0_0['call']['container.start']>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _SameStop = Assert<Identical<
  ApiDirectoryV26_0_0['job']['container.stop'],
  ApiDirectoryV27_0_0['job']['container.stop']>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _SameDelete = Assert<Identical<
  ApiDirectoryV26_0_0['job']['container.delete'],
  ApiDirectoryV27_0_0['job']['container.delete']>>;

describe('TrueNasApiClientV27', () => {
  let client: TrueNasApiClientV27;

  beforeEach(() => {
    client = new TrueNasApiClientV27('uuid', ['h.local'], version, false);
  });

  afterEach(() => client.close());

  it('is the v27 client for the given version', () => {
    expect(client).toBeInstanceOf(TrueNasApiClientV27);
    expect(client.version).toBe(version);
  });

  it('opens its connection on the v27 websocket path', () => {
    // Genuinely v27-shaped rather than inherited: a v26 path against a v27
    // appliance is a connection to the wrong API. Read off the connection the
    // client actually built, not off the version handed in, which would only
    // restate the fixture.
    expect(client.connection.websocketPath).toBe('/api/v27.0.0');
  });

  it('containerQuery queries container.query and maps to Container (status state -> AppState)', async () => {
    const container = {
      id: 5,
      name: 'c1',
      description: 'my container',
      autostart: true,
      status: { state: 'RUNNING' },
    } as unknown as v27_0_0.ContainerEntry;
    const querySpy = vi
      .spyOn(client.api, 'query')
      .mockReturnValue(of([container]) as never);

    const result = await firstValueFrom(client.ops.containerQuery());

    expect(querySpy).toHaveBeenCalledWith('container.query');
    expect(result).toEqual([
      {
        id: '5',
        name: 'c1',
        status: AppState.Running,
        autostart: true,
        description: 'my container',
      },
    ]);
  });

  it('maps a suspended container to Suspended rather than Stopped', async () => {
    // v26 added SUSPENDED and v27 inherits it. Pinned here because the mapping
    // is shared, so a regression would show up in whichever client is asked
    // first and this one must not be the gap.
    const container = {
      id: 6,
      name: 'paused',
      description: '',
      autostart: false,
      status: { state: 'SUSPENDED' },
    } as unknown as v27_0_0.ContainerEntry;
    vi.spyOn(client.api, 'query').mockReturnValue(of([container]) as never);

    const [result] = await firstValueFrom(client.ops.containerQuery());

    expect(result.status).toBe(AppState.Suspended);
  });

  it('containerStart calls container.start (numeric id) synchronously and emits null', async () => {
    const callSpy = vi
      .spyOn(client.api, 'call')
      .mockReturnValue(of(null) as never);

    const result = await firstValueFrom(client.ops.containerStart('5'));

    expect(callSpy).toHaveBeenCalledWith('container.start', [5]);
    expect(result).toBeNull();
  });

  it('containerStop calls container.stop (numeric id) and tracks the job', async () => {
    const job = { id: 9, state: JobState.Success } as Job;
    const callJobSpy = vi
      .spyOn(client.api, 'callAndGetJobId')
      .mockReturnValue(of(9) as never);
    vi.spyOn(client.api, 'trackJob').mockReturnValue(of(job) as never);

    const result = await firstValueFrom(
      client.ops.containerStop('5', { force: true })
    );

    expect(callJobSpy).toHaveBeenCalledWith('container.stop', [
      5,
      { force: true, force_after_timeout: true },
    ]);
    expect(result).toBe(job);
  });

  it('containerRestart synthesizes stop -> start, emitting job updates then null', async () => {
    // v27 still has no container.restart; this pins the workaround, so the day
    // middleware adds one this test is what says the synthesis can go.
    const job = { id: 11, state: JobState.Success } as Job;
    const callJobSpy = vi
      .spyOn(client.api, 'callAndGetJobId')
      .mockReturnValue(of(11) as never);
    vi.spyOn(client.api, 'trackJob').mockReturnValue(of(job) as never);
    const callSpy = vi
      .spyOn(client.api, 'call')
      .mockReturnValue(of(null) as never);

    const emissions = await firstValueFrom(
      client.ops.containerRestart('5', { force: false }).pipe(toArray())
    );

    // stop first (with the job update), then start (null)
    expect(callJobSpy).toHaveBeenCalledWith('container.stop', [
      5,
      { force: false, force_after_timeout: false },
    ]);
    expect(callSpy).toHaveBeenCalledWith('container.start', [5]);
    expect(emissions).toEqual([job, null]);
  });

  it('containerDelete runs container.delete as a job with the options given', async () => {
    const job = { id: 13, state: JobState.Success } as Job;
    const callJobSpy = vi
      .spyOn(client.api, 'callAndGetJobId')
      .mockReturnValue(of(13) as never);
    vi.spyOn(client.api, 'trackJob').mockReturnValue(of(job) as never);

    const result = await firstValueFrom(
      client.ops.containerDelete('5', { force: true, recursive: true })
    );

    // `job`, not `call`: middleware made deletion long-running at v26.0.0 and
    // the directory moved it accordingly.
    expect(callJobSpy).toHaveBeenCalledWith('container.delete', [
      5,
      { force: true, recursive: true },
    ]);
    expect(result).toBe(job);
  });

  it('containerDelete omits options entirely when none are given', async () => {
    // Load-bearing, not cosmetic. A trailing `undefined` in the params array is
    // `null` after `JSON.stringify`, and middleware declares
    // `options: ContainerDeleteOptions` with a model default and no `| None` —
    // so `[id, null]` is a validation error, not "use the defaults". The
    // argument has to be absent.
    const callJobSpy = vi
      .spyOn(client.api, 'callAndGetJobId')
      .mockReturnValue(of(14) as never);
    vi.spyOn(client.api, 'trackJob').mockReturnValue(
      of({ id: 14, state: JobState.Success } as Job) as never
    );

    await firstValueFrom(client.ops.containerDelete('7'));

    expect(callJobSpy).toHaveBeenCalledWith('container.delete', [7]);
  });
});
