import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { getApiErrorMessage } from '@/types/api-error.type';
import { createFakeClient, type FakeTrueNasClient } from './create-fake-client';
import { fakeApiError } from './fake-api-error';
import type { ApiDirectoryV27_0_0 } from '@/generated';

describe('fakeApiError', () => {
  const built: FakeTrueNasClient<ApiDirectoryV27_0_0>[] = [];

  const client = (): FakeTrueNasClient<ApiDirectoryV27_0_0> => {
    const made = createFakeClient({ version: 'v27.0.0' });
    built.push(made);
    return made;
  };

  afterEach(() => {
    for (const made of built.splice(0, built.length)) made.connection.close();
  });

  /**
   * The nesting is the point. `/websocket` sends the payload flat and
   * `/api/<version>` wraps it, and this client only ever talks to the second —
   * so a fixture that produced the flat shape would be a frame no appliance
   * this client connects to can send.
   */
  it('wraps the TrueNAS payload in a JSON-RPC envelope', () => {
    const error = fakeApiError({ reason: 'Not authorized' });

    expect(error.code).toBe(-32001);
    expect(error.message).toBe('Method call error');
    expect(error.data).toMatchObject({
      error: 22,
      errname: 'EINVAL',
      reason: 'Not authorized',
      extra: null,
      trace: null,
    });
  });

  it('takes the errno and its name together', () => {
    const error = fakeApiError({ error: 13, errname: 'EACCES', reason: 'Not authorized' });

    expect(error.data).toMatchObject({ error: 13, errname: 'EACCES' });
  });

  /**
   * What a consumer reads, and the one assertion that tells the two shapes
   * apart. `getApiErrorMessage` answers with `data.reason` here and with
   * `reason` for the flat shape — the same string either way, so the message
   * alone certifies nothing. The envelope's own `message` is what a flat
   * fixture does not have.
   */
  it('reduces to the reason while keeping the envelope message', () => {
    const error = fakeApiError({ reason: 'Dataset is locked' });

    expect(getApiErrorMessage(error)).toBe('Dataset is locked');
    expect(error.message).toBe('Method call error');
    expect(error.message).not.toBe(getApiErrorMessage(error));
  });

  it('fails a call through the real client', async () => {
    const c = client();

    const result = firstValueFrom(c.api.call('system.info'));
    c.connection.replyError('system.info', fakeApiError({ reason: 'Not authorized' }));

    await expect(result).rejects.toThrow('Not authorized');
  });
});
