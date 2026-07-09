import { describe, expect, it } from 'vitest';
import * as api from './index';

describe('public barrel', () => {
  it('exposes the factory entry point', () => {
    expect(typeof api.createTrueNasClient).toBe('function');
  });

  it('exposes the client classes', () => {
    expect(typeof api.TrueNasApiClient).toBe('function');
    expect(typeof api.TrueNasApiClientV2510).toBe('function');
    expect(typeof api.TrueNasApiClientV26).toBe('function');
  });

  it('exposes version-discovery + typed errors', () => {
    expect(typeof api.VersionDiscovery).toBe('function');
    expect(typeof api.VersionDiscoveryNetworkError).toBe('function');
    expect(typeof api.AuthError).toBe('function');
  });

  it('exposes the logger helpers and enums', () => {
    expect(typeof api.noopLogger.info).toBe('function');
    expect(typeof api.consoleLogger.info).toBe('function');
    expect(api.TrueNasEndpoint.SystemInfo).toBe('system.info');
    expect(api.AuthErrorCode.PasswordAuthFailed).toBe('PASSWORD_AUTH_FAILED');
  });
});
