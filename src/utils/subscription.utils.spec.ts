import { describe, expect, it } from 'vitest';
import { subscriptionName } from './subscription.utils';

describe('subscriptionName', () => {
  it('is the bare name without arguments', () => {
    expect(subscriptionName('reporting.realtime')).toBe('reporting.realtime');
  });

  it('appends the arguments as JSON after the first colon', () => {
    expect(subscriptionName('filesystem.file_tail_follow', { path: '/var/log/messages' })).toBe(
      'filesystem.file_tail_follow:{"path":"/var/log/messages"}'
    );
  });

  it('names equal arguments the same whatever order their keys were written in', () => {
    expect(
      subscriptionName('filesystem.file_tail_follow', { tail_lines: 500, path: '/var/log/messages' })
    ).toBe(
      subscriptionName('filesystem.file_tail_follow', { path: '/var/log/messages', tail_lines: 500 })
    );
  });

  it('sorts nested objects too, and leaves array order alone', () => {
    expect(subscriptionName('x.y', { b: { d: 1, c: 2 }, a: [3, 1] })).toBe(
      'x.y:{"a":[3,1],"b":{"c":2,"d":1}}'
    );
  });

  it('round-trips through JSON.parse to the arguments given', () => {
    const params = { tier_job_id: 'job-1', options: { z: true, a: null } };
    const name = subscriptionName('zfs.tier.rewrite_job_status', params);

    expect(JSON.parse(name.slice(name.indexOf(':') + 1))).toEqual(params);
  });
});
