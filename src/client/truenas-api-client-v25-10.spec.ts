import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { v25_10_0 } from '@/generated';
import { AppState } from '@/types/app-query.type';
import { ApiVersion } from '@/types/api-version.type';
import { Job, JobState } from '@/types/job.type';
import { TrueNasApiClientV2510 } from './truenas-api-client-v25-10';

const version: ApiVersion = {
  version: 'v25.10.0',
  year: 25,
  minor: 10,
  patch: 0,
  websocketPath: '/api/v25.10.0',
};

describe('TrueNasApiClientV2510', () => {
  let client: TrueNasApiClientV2510;

  beforeEach(() => {
    // `enabled: false` -> no real socket; ops call the (spied) api.
    client = new TrueNasApiClientV2510('uuid', ['h.local'], version, false);
  });

  afterEach(() => client.close());

  it('is the v25.10 client for the given version', () => {
    expect(client).toBeInstanceOf(TrueNasApiClientV2510);
    expect(client.version).toBe(version);
  });

  /**
   * Only the fields the mapping reads; `VirtInstanceEntry` declares twenty,
   * and spelling out the rest would say nothing about the transform.
   */
  const instance = (
    over: Partial<v25_10_0.VirtInstanceEntry> = {}
  ): v25_10_0.VirtInstanceEntry =>
    ({
      id: 'inst-1',
      name: 'ct1',
      type: 'CONTAINER',
      status: 'RUNNING',
      autostart: true,
      cpu: '2',
      memory: 1024,
      image: { description: 'debian' },
      ...over,
    }) as v25_10_0.VirtInstanceEntry;

  it('containerQuery queries virt.instance.query (containers only) and maps to Container', async () => {
    const querySpy = vi
      .spyOn(client.api, 'query')
      .mockReturnValue(of([instance()]) as never);

    const result = await firstValueFrom(client.ops.containerQuery());

    expect(querySpy).toHaveBeenCalledWith('virt.instance.query', [
      ['type', '=', 'CONTAINER'],
    ]);
    expect(result).toEqual([
      {
        id: 'inst-1',
        name: 'ct1',
        status: AppState.Running,
        autostart: true,
        cpu: '2',
        memory: 1024,
        image: { description: 'debian' },
      },
    ]);
  });

  /**
   * `virt.instance` reports ten states where `Container.status` promises seven,
   * and the nullable fields were previously passed through a type that said
   * they were always present. Both are normalised now, so both are pinned.
   *
   * `FROZEN` is the state under test because it is v25.10-only: v26 says
   * `SUSPENDED` for the same condition, and both have to arrive as the same
   * `AppState` or the two clients disagree about a paused container.
   */
  it('narrows a version-specific state and drops nulls rather than passing them on', async () => {
    vi.spyOn(client.api, 'query').mockReturnValue(
      of([
        instance({
          status: 'FROZEN',
          cpu: null,
          memory: null,
          image: { description: null } as v25_10_0.VirtInstanceImage,
        }),
      ]) as never
    );

    const [container] = await firstValueFrom(client.ops.containerQuery());

    expect(container.status).toBe(AppState.Suspended);
    expect(container.cpu).toBeUndefined();
    expect(container.memory).toBeUndefined();
    expect(container.image).toBeUndefined();
  });

  it('containerStart calls virt.instance.start and tracks the job', async () => {
    const job = { id: 42, state: JobState.Success } as Job;
    const callJobSpy = vi
      .spyOn(client.api, 'callAndGetJobId')
      .mockReturnValue(of(42) as never);
    const trackSpy = vi
      .spyOn(client.api, 'trackJob')
      .mockReturnValue(of(job) as never);

    const result = await firstValueFrom(client.ops.containerStart('inst-1'));

    expect(callJobSpy).toHaveBeenCalledWith(
      'virt.instance.start',
      ['inst-1']
    );
    expect(trackSpy).toHaveBeenCalledWith(42);
    expect(result).toBe(job);
  });

  it('containerStop calls virt.instance.stop and tracks the job', async () => {
    const job = { id: 7, state: JobState.Success } as Job;
    const options = { force: true };
    const callJobSpy = vi
      .spyOn(client.api, 'callAndGetJobId')
      .mockReturnValue(of(7) as never);
    vi.spyOn(client.api, 'trackJob').mockReturnValue(of(job) as never);

    const result = await firstValueFrom(
      client.ops.containerStop('inst-1', options)
    );

    expect(callJobSpy).toHaveBeenCalledWith('virt.instance.stop', [
      'inst-1',
      options,
    ]);
    expect(result).toBe(job);
  });

  it('containerRestart calls virt.instance.restart and tracks the job', async () => {
    const job = { id: 8, state: JobState.Success } as Job;
    const options = { force: false };
    const callJobSpy = vi
      .spyOn(client.api, 'callAndGetJobId')
      .mockReturnValue(of(8) as never);
    vi.spyOn(client.api, 'trackJob').mockReturnValue(of(job) as never);

    const result = await firstValueFrom(
      client.ops.containerRestart('inst-1', options)
    );

    expect(callJobSpy).toHaveBeenCalledWith(
      'virt.instance.restart',
      ['inst-1', options]
    );
    expect(result).toBe(job);
  });

  it('containerDelete runs virt.instance.delete, which is already a job here', async () => {
    const job = { id: 21, state: JobState.Success } as Job;
    const callJobSpy = vi
      .spyOn(client.api, 'callAndGetJobId')
      .mockReturnValue(of(21) as never);
    vi.spyOn(client.api, 'trackJob').mockReturnValue(of(job) as never);

    const result = await firstValueFrom(client.ops.containerDelete('c1'));

    // String id and no options: v25.10 takes neither `force` nor `recursive`.
    expect(callJobSpy).toHaveBeenCalledWith('virt.instance.delete', ['c1']);
    expect(result).toBe(job);
  });

  /**
   * The options have no counterpart on this version, and `recursive` destroys
   * child datasets, snapshots and clones irrecoverably. A caller who asked for
   * it and silently did not get it has been told something false about what
   * happened to their data, so the client says so.
   */
  it('reports options it cannot honour rather than dropping them', async () => {
    const warn = vi.fn();
    const loud = new TrueNasApiClientV2510('uuid', ['h.local'], version, false, undefined, {
      trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn, error: vi.fn(),
    });
    vi.spyOn(loud.api, 'callAndGetJobId').mockReturnValue(of(22) as never);
    vi.spyOn(loud.api, 'trackJob').mockReturnValue(
      of({ id: 22, state: JobState.Success } as Job) as never
    );

    await firstValueFrom(loud.ops.containerDelete('c1', { recursive: true }));

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][1]).toMatchObject({ ignored: ['recursive'] });
    await loud.close();
  });

  it('stays quiet when the options given are ones it can honour by doing nothing', async () => {
    // `{ force: false }` asks for the default. Nothing is lost, so nothing is
    // warned about — a warning on every call would be noise that gets muted.
    const warn = vi.fn();
    const quiet = new TrueNasApiClientV2510('uuid', ['h.local'], version, false, undefined, {
      trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn, error: vi.fn(),
    });
    vi.spyOn(quiet.api, 'callAndGetJobId').mockReturnValue(of(23) as never);
    vi.spyOn(quiet.api, 'trackJob').mockReturnValue(
      of({ id: 23, state: JobState.Success } as Job) as never
    );

    await firstValueFrom(quiet.ops.containerDelete('c1', { force: false }));

    expect(warn).not.toHaveBeenCalled();
    await quiet.close();
  });
});
