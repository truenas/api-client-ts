import { describe, expect, it } from 'vitest';
import * as testing from './index';

/**
 * Pinned for the same reason as `src/index.spec.ts`: this entry is under the
 * same semver rules. `AuthResponseType` is here because it went missing once —
 * the specs imported it from `@/types`, so only a consumer found out.
 */
const RUNTIME_EXPORTS = [
  'AuthResponseType',
  'FakeAuthenticator',
  'FakeConnection',
  'UnmockedCallError',
  'createFakeClient',
  'fakeApiError',
  'fakeApiVersion',
  'fakeAuthResponse',
  'fakeJob',
  'withSpies',
] as const;

describe('testing entry', () => {
  it('exports exactly what it claims to', () => {
    expect(Object.keys(testing).sort()).toEqual([...RUNTIME_EXPORTS]);
  });
});
