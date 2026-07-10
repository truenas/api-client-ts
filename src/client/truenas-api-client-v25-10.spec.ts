import { firstValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrueNasEndpoint } from '@/enums/truenas-endpoint.enum';
import { AppState } from '@/types/app-query.type';
import { ApiVersion } from '@/types/api-version.type';
import { Job, JobState } from '@/types/job.type';
import {
  VirtualInstanceQuery,
  VirtualInstanceType,
} from '@/types/virtual-instance-query.type';
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

  it('containerQuery queries virt.instance.query (containers only) and maps to Container', async () => {
    const instance: VirtualInstanceQuery = {
      id: 'inst-1',
      name: 'ct1',
      type: VirtualInstanceType.Container,
      status: AppState.Running,
      autostart: true,
      cpu: '2',
      memory: 1024,
      image: { description: 'debian' },
    };
    const callSpy = vi
      .spyOn(client.api, 'call')
      .mockReturnValue(of([instance]) as never);

    const result = await firstValueFrom(client.ops.containerQuery());

    expect(callSpy).toHaveBeenCalledWith(TrueNasEndpoint.VirtualInstanceQuery, [
      [['type', '=', VirtualInstanceType.Container]],
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
      TrueNasEndpoint.VirtualInstanceStart,
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

    expect(callJobSpy).toHaveBeenCalledWith(TrueNasEndpoint.VirtualInstanceStop, [
      'inst-1',
      options,
    ]);
    expect(result).toBe(job);
  });
});
