import { describe, expect, it } from 'vitest';
import { compareVersionStrings, selectVersions } from './select-versions.mts';

// Real dump order, which is deliberately not sorted: middleware currently
// emits v27.0.0 first, and includes a two-component v24.10.
const AVAILABLE = [
  'v27.0.0', 'v24.10', 'v25.04.0', 'v25.04.1', 'v25.04.2',
  'v25.10.0', 'v25.10.1', 'v25.10.2', 'v25.10.3', 'v25.10.4', 'v25.10.5', 'v26.0.0',
];

describe('selectVersions', () => {
  it('takes everything from the floor upward, ascending', () => {
    expect(selectVersions({ available: AVAILABLE, minVersion: 'v25.10.0' })).toEqual([
      'v25.10.0', 'v25.10.1', 'v25.10.2', 'v25.10.3', 'v25.10.4', 'v25.10.5',
      'v26.0.0', 'v27.0.0',
    ]);
  });

  // The whole point of a floor over a list: a newly released version is picked
  // up by regenerating, instead of being silently absent until someone edits
  // package.json.
  it('picks up a newly released version with no config change', () => {
    const withNewPatch = [...AVAILABLE, 'v25.10.6'];
    expect(selectVersions({ available: withNewPatch, minVersion: 'v25.10.0' }))
      .toContain('v25.10.6');
  });

  it('excludes everything below the floor, including v24.10', () => {
    const got = selectVersions({ available: AVAILABLE, minVersion: 'v25.10.0' }) ?? [];
    expect(got).not.toContain('v24.10');
    expect(got.filter((v) => v.startsWith('v25.04'))).toEqual([]);
  });

  it('rejects a floor the dump does not contain', () => {
    // Covers both a typo and a version middleware has since dropped.
    expect(() => selectVersions({ available: AVAILABLE, minVersion: 'v25.9.0' }))
      .toThrow(/not a version in the dump/);
  });

  it('rejects both selectors at once', () => {
    expect(() => selectVersions({
      available: AVAILABLE, minVersion: 'v25.10.0', apiVersions: ['v26.0.0'],
    })).toThrow(/not both/);
  });

  it('passes an explicit selection through untouched', () => {
    expect(selectVersions({ available: AVAILABLE, apiVersions: ['v26.0.0'] }))
      .toEqual(['v26.0.0']);
    expect(selectVersions({ available: AVAILABLE, apiVersions: ['all'] }))
      .toEqual(['all']);
    expect(selectVersions({ available: AVAILABLE })).toBeUndefined();
  });
});

describe('compareVersionStrings', () => {
  it('orders by number, not lexically', () => {
    // '04' vs '10' lexically puts 10 first; numerically 4 comes first.
    expect(compareVersionStrings('v25.04.0', 'v25.10.0')).toBeLessThan(0);
    expect(compareVersionStrings('v25.10.5', 'v26.0.0')).toBeLessThan(0);
    expect(compareVersionStrings('v26.0.0', 'v27.0.0')).toBeLessThan(0);
    // Two-component versions sort before their would-be patches.
    expect(compareVersionStrings('v24.10', 'v25.04.0')).toBeLessThan(0);
  });
});
