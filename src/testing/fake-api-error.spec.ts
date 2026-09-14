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
    });
  });

  /**
   * Both arms that send `-32001` pass `sys.exc_info()`, which inside an
   * `except` block is always truthy, so `format_truenas_error` always builds a
   * trace for this code. `trace: null` is a payload the versioned endpoint
   * does not produce here, and it is the field a consumer is most likely to
   * branch on to tell a clean `CallError` from a crash.
   */
  it('carries a trace, which a -32001 frame always does', () => {
    const trace = fakeApiError({ reason: 'Not authorized' }).data?.trace;

    expect(trace).not.toBeNull();
    // `str(e)` of an exception that has arguments, so the repr is that call
    // written out — not the reason, which is what `CallError` would have made
    // it, and `CallError`'s own `__str__` would have prefixed `[EINVAL] `.
    expect(trace).toMatchObject({
      class: 'ValueError',
      repr: "ValueError('Not authorized')",
    });
  });

  /**
   * A reason that reads as a bare repr is one: `str()` of an argument-free
   * exception is empty, so `str(error) or repr(error)` falls through to the
   * repr, and the class is its name. This is the shape `mock.query`'s missed
   * `get` produces, so the pair has to be the pair `MatchNotFound` sends.
   */
  it('reads an argument-free exception out of its own repr', () => {
    const trace = fakeApiError({ reason: 'MatchNotFound()' }).data?.trace;

    expect(trace).toMatchObject({
      class: 'MatchNotFound',
      repr: 'MatchNotFound()',
    });
  });

  /** The one payload that genuinely has none is not an error frame at all. */
  it('lets a spec ask for no trace explicitly', () => {
    expect(fakeApiError({ trace: null }).data?.trace).toBeNull();
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

  /**
   * The reprs `repr()` actually returns, for the shapes a middleware error
   * message actually has. Interpolating into single quotes produces none of
   * these: `f"…{value!r}"` messages carry single quotes, and
   * `adapt_exception` embeds a newline in every `CalledProcessError` message.
   *
   * Each expectation below was taken from CPython's `repr()` of the same
   * string rather than written by hand.
   */
  it.each([
    ["Dataset 'tank/foo' does not exist", `ValueError("Dataset 'tank/foo' does not exist")`],
    ['He said "no"', `ValueError('He said "no"')`],
    [`both ' and "`, `ValueError('both \\' and "')`],
    ['Command failed (code 1):\ncannot open', `ValueError('Command failed (code 1):\\ncannot open')`],
    ['back\\slash', `ValueError('back\\\\slash')`],
  ])('quotes %j the way repr() does', (reason, expected) => {
    expect(fakeApiError({ reason }).data?.trace?.repr).toBe(expected);
  });

  /** The shape the JSDoc describes, which nothing else asserts. */
  it('formats the trace around that repr', () => {
    const trace = fakeApiError({ reason: "It's locked" }).data?.trace;

    expect(trace?.formatted.startsWith('Traceback (most recent call last):\n')).toBe(true);
    expect(trace?.formatted.trimEnd().endsWith(trace.repr)).toBe(true);
  });

  /**
   * The payload's index signature is legitimate — middleware adds
   * `py_exception` — but inheriting it into the overrides turned off
   * excess-property checking, so a typo landed a new key and left the field it
   * meant at its default.
   */
  it('does not accept a key it does not have', () => {
    // @ts-expect-error 'resaon' is not a field of the payload
    fakeApiError({ resaon: 'Dataset is locked' });
  });

  it('fails a call through the real client', async () => {
    const c = client();

    const result = firstValueFrom(c.api.call('system.info'));
    c.connection.replyError('system.info', fakeApiError({ reason: 'Not authorized' }));

    await expect(result).rejects.toThrow('Not authorized');
  });
});
