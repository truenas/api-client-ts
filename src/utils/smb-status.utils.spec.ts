import { describe, expect, it } from 'vitest';
import type { SmbStatusRequest } from '@/types/smb-status.type';
import { toSmbStatusParams } from './smb-status.utils';

describe('toSmbStatusParams', () => {
  it('fills every position with middleware defaults when given nothing', () => {
    expect(toSmbStatusParams()).toEqual(['ALL', [], {}, {}]);
  });

  it('treats an empty request the same as no request', () => {
    expect(toSmbStatusParams({})).toEqual(toSmbStatusParams());
  });

  it('passes each argument through in its wire position', () => {
    const request: SmbStatusRequest = {
      infoLevel: 'LOCKS',
      filters: [['uid', '=', 1000]],
      options: { limit: 10 },
      statusOptions: { verbose: false, restrict_user: 'bob' },
    };

    expect(toSmbStatusParams(request)).toEqual([
      'LOCKS',
      [['uid', '=', 1000]],
      { limit: 10 },
      { verbose: false, restrict_user: 'bob' },
    ]);
  });

  /**
   * The reason the builder fills defaults rather than omitting absent
   * arguments. `smb.status` takes four independent positional arguments, so a
   * caller who supplies only the last one leaves holes in the middle — and a
   * hole serializes to `null`, which middleware rejects rather than reading as
   * "use the default": all four are declared with model defaults and none is
   * `| None`.
   *
   * Asserted through `JSON.stringify` on purpose. That is the step that turns a
   * missing element into `null`, so checking the array alone would pass while
   * the bytes on the wire were still wrong.
   */
  it('sends no null in any position when only a later argument is given', () => {
    const params = toSmbStatusParams({ statusOptions: { fast: true } });

    expect(JSON.stringify(params)).toBe('["ALL",[],{},{"fast":true}]');
    expect(JSON.stringify(params)).not.toContain('null');
  });

  it('always sends four arguments, never a short array', () => {
    expect(toSmbStatusParams()).toHaveLength(4);
    expect(toSmbStatusParams({ infoLevel: 'SHARES' })).toHaveLength(4);
    expect(
      toSmbStatusParams({ statusOptions: { resolve_uids: false } })
    ).toHaveLength(4);
  });

  /**
   * The client-count recipe, which is this operation composed rather than a
   * second one. `SESSIONS` + `{ count: true }` + `{ fast: true }` is what
   * middleware's own `smb.client_count` does internally on both versions.
   */
  it('builds the client-count payload middleware uses internally', () => {
    expect(
      toSmbStatusParams({
        infoLevel: 'SESSIONS',
        options: { count: true },
        statusOptions: { fast: true },
      })
    ).toEqual(['SESSIONS', [], { count: true }, { fast: true }]);
  });

  it('does not share mutable state between calls', () => {
    const first = toSmbStatusParams();
    (first[1] as unknown[]).push(['x', '=', 1]);

    expect(toSmbStatusParams()[1]).toEqual([]);
  });
});
