import { describe, expect, it } from 'vitest';
import { SUPPORTED_API_VERSIONS } from '@/generated';
import { parseApiVersion } from '@/utils/api-version.utils';
import { fakeApiVersion } from './fake-api-version';

describe('fakeApiVersion', () => {
  /**
   * Compared against the parser rather than against a written-out object: the
   * point of the builder is that there is one statement of how a version
   * string splits, and a fixture asserting its own copy of the split would be
   * a second.
   */
  it('returns exactly what the parser the client uses returns', () => {
    expect(fakeApiVersion('v27.0.0')).toEqual(parseApiVersion('v27.0.0'));
  });

  it('defaults to the oldest supported version', () => {
    expect(fakeApiVersion().version).toBe(SUPPORTED_API_VERSIONS[0]);
  });

  /**
   * The reason this exists rather than `parseApiVersion(...)!`: a typo becomes
   * a failure at the fixture, naming the string, instead of a `null` that
   * fails wherever it is first dereferenced.
   */
  it('throws on a string the parser rejects, naming it', () => {
    expect(() => fakeApiVersion('v27.0')).toThrow(/'v27\.0'/);
    expect(parseApiVersion('v27.0')).toBeNull();
  });

  /** Deliberate deviation, visible at the call site. */
  it('applies overrides over the parsed version', () => {
    const version = fakeApiVersion('v27.0.0', { websocketPath: '/api/current' });

    expect(version.websocketPath).toBe('/api/current');
    expect(version.version).toBe('v27.0.0');
  });
});
