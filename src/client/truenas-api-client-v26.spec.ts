import { firstValueFrom, of, toArray } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { v26_0_0 } from '@/generated';
import { AppState } from '@/types/app-query.type';
import { ApiVersion } from '@/types/api-version.type';
import { Job, JobState } from '@/types/job.type';
import { TrueNasApiClientV26 } from './truenas-api-client-v26';

const version: ApiVersion = {
  version: 'v26.0.0',
  year: 26,
  minor: 0,
  patch: 0,
  websocketPath: '/api/v26.0.0',
};

describe('TrueNasApiClientV26', () => {
  let client: TrueNasApiClientV26;

  beforeEach(() => {
    client = new TrueNasApiClientV26('uuid', ['h.local'], version, false);
  });

  afterEach(() => client.close());

  it('is the v26 client for the given version', () => {
    expect(client).toBeInstanceOf(TrueNasApiClientV26);
    expect(client.version).toBe(version);
  });

  it('containerQuery queries container.query and maps to Container (status state -> AppState)', async () => {
    const container = {
      id: 5,
      name: 'c1',
      description: 'my container',
      autostart: true,
      status: { state: 'RUNNING' },
    } as unknown as v26_0_0.ContainerEntry;
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
