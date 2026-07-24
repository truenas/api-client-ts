import { firstValueFrom, of, toArray } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrueNasEndpoint } from '@/enums/truenas-endpoint.enum';
import { AppState } from '@/types/app-query.type';
import { ApiVersion } from '@/types/api-version.type';
import type { ContainerEntry } from '@/generated/v26_0_0';
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
      autostart: true,
      status: { state: 'RUNNING' },
    } as unknown as ContainerEntry;
    const callSpy = vi
      .spyOn(client.api, 'call')
      .mockReturnValue(of([container]) as never);

    const result = await firstValueFrom(client.ops.containerQuery());

    expect(callSpy).toHaveBeenCalledWith(TrueNasEndpoint.ContainerQuery, [[]]);
    expect(result).toEqual([
      {
        id: '5',
        name: 'c1',
        status: AppState.Running,
        autostart: true,
      },
    ]);
  });

  // `autostart` is optional in the generated entry; the unified Container
  // declares it required, so an absent value must default rather than pass
  // `undefined` through under a `boolean` type.
  it('containerQuery defaults autostart when the entry omits it', async () => {
    const container = {
      id: 6,
      name: 'c2',
      status: { state: 'STOPPED' },
    } as unknown as ContainerEntry;
    vi.spyOn(client.api, 'call').mockReturnValue(of([container]) as never);

    const [mapped] = await firstValueFrom(client.ops.containerQuery());

    expect(mapped.autostart).toBe(false);
  });

  // container.query can also return a count or projected rows depending on
  // query options; an unexpected shape must fail loudly at the boundary
  // rather than as `containers.map is not a function`.
  it('containerQuery rejects a non-list container.query response', async () => {
    vi.spyOn(client.api, 'call').mockReturnValue(of(3) as never);

    await expect(
      firstValueFrom(client.ops.containerQuery())
    ).rejects.toThrow(/expected a list of entries/);
  });

  it('containerStart calls container.start (numeric id) synchronously and emits null', async () => {
    const callSpy = vi
      .spyOn(client.api, 'call')
      .mockReturnValue(of(null) as never);

    const result = await firstValueFrom(client.ops.containerStart('5'));

    expect(callSpy).toHaveBeenCalledWith(TrueNasEndpoint.ContainerStart, [5]);
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

    expect(callJobSpy).toHaveBeenCalledWith(TrueNasEndpoint.ContainerStop, [
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
    expect(callJobSpy).toHaveBeenCalledWith(TrueNasEndpoint.ContainerStop, [
      5,
      { force: false, force_after_timeout: false },
    ]);
    expect(callSpy).toHaveBeenCalledWith(TrueNasEndpoint.ContainerStart, [5]);
    expect(emissions).toEqual([job, null]);
  });
});
