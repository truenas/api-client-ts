import { describe, expect, it } from 'vitest';
import * as api from './index';

/**
 * The barrel is the package's contract under semver, so what it exports is
 * pinned rather than sampled. Adding an export is a feature and removing one
 * is a breaking change; both should be a decision someone made on purpose,
 * which means both should fail this test first.
 *
 * Runtime exports only — a type-only export leaves nothing to enumerate here.
 * Those are pinned where their behaviour is: `src/types/api-directory.spec.ts`
 * for the surface types, `src/query-projection.spec.ts` for the query grammar.
 */
const RUNTIME_EXPORTS = [
  'AppState',
  'AuthError',
  'AuthErrorCode',
  'InvalidVersionResponseError',
  'JobState',
  'NoCompatibleVersionsError',
  'SUPPORTED_API_VERSIONS',
  'TrueNasApiClient',
  'TrueNasApiClientV2510',
  'TrueNasApiClientV26',
  'TrueNasApiClientV27',
  'TrueNasAuthMechanism',
  'UserRole',
  'VersionCompatibility',
  'VersionDiscovery',
  'VersionDiscoveryError',
  'VersionDiscoveryNetworkError',
  'VersionDiscoveryTimeoutError',
  'VersionEndpointNotFoundError',
  'VersionTooNewError',
  'VersionTooOldError',
  'consoleLogger',
  'createTrueNasClient',
  'getApiErrorMessage',
  'isJobFinished',
  'noopLogger',
  'v25_10_0',
  'v25_10_1',
  'v25_10_2',
  'v25_10_3',
  'v25_10_4',
  'v25_10_5',
  'v26_0_0',
  'v27_0_0',
] as const;

describe('public barrel', () => {
  it('exports exactly what it claims to', () => {
    expect(Object.keys(api).sort()).toEqual([...RUNTIME_EXPORTS]);
  });

  /**
   * `TrueNasEndpoint` named 65 of the 641 methods the directories carry, and
   * was removed once `call` started keying off the directories themselves.
   * Named here because a re-export would look harmless in review and would
   * quietly reintroduce a second, always-incomplete list of method names.
   */
  it('does not carry a hand-maintained endpoint list', () => {
    expect(api).not.toHaveProperty('TrueNasEndpoint');
    expect(api).not.toHaveProperty('ApiCallDirectory');
  });

  it('exposes the factory entry point', () => {
    expect(typeof api.createTrueNasClient).toBe('function');
  });

  it('exposes the client classes', () => {
    expect(typeof api.TrueNasApiClient).toBe('function');
    expect(typeof api.TrueNasApiClientV2510).toBe('function');
    expect(typeof api.TrueNasApiClientV26).toBe('function');
    expect(typeof api.TrueNasApiClientV27).toBe('function');
  });

  it('exposes version-discovery + typed errors', () => {
    expect(typeof api.VersionDiscovery).toBe('function');
    expect(typeof api.VersionDiscoveryNetworkError).toBe('function');
    expect(typeof api.AuthError).toBe('function');
  });

  it('exposes the logger helpers and error codes', () => {
    expect(typeof api.noopLogger.info).toBe('function');
    expect(typeof api.consoleLogger.info).toBe('function');
    expect(api.AuthErrorCode.PasswordAuthFailed).toBe('PASSWORD_AUTH_FAILED');
  });

  /**
   * The generated namespaces are the reason a caller can name a version's
   * types at all, and they arrive through `export *` — so a change to the
   * generated barrel can add or drop one without anything else noticing.
   */
  it('re-exports one namespace per generated version', () => {
    expect(Object.keys(api).filter(k => /^v\d/.test(k)).sort()).toEqual(
      api.SUPPORTED_API_VERSIONS.map(v => v.replace(/\./g, '_'))
    );
  });
});
