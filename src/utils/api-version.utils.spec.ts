import { describe, expect, it } from 'vitest';
import {
  ApiVersion,
  VersionCompatibility,
} from '@/types/api-version.type';
import {
  checkVersionCompatibility,
  compareVersions,
  filterCompatibleVersions,
  getWebSocketPath,
  isVersionSupported,
  parseApiVersion,
  selectLatestCompatibleVersion,
} from './api-version.utils';

// Helper to assert non-null for tests
function assertVersion(version: ApiVersion | null): ApiVersion {
  if (!version) {
    throw new Error('Expected version to be non-null');
  }
  return version;
}

describe('API Version Utils', () => {
  describe('parseApiVersion', () => {
    it('should parse legacy v25.x version (month-based)', () => {
      const result = parseApiVersion('v25.10.0');

      expect(result).toEqual({
        version: 'v25.10.0',
        year: 25,
        minor: 10,
        patch: 0,
        websocketPath: '/api/v25.10.0',
      });
    });

    it('should parse new v26+ version (minor version)', () => {
      const result = parseApiVersion('v26.0.0');

      expect(result).toEqual({
        version: 'v26.0.0',
        year: 26,
        minor: 0,
        patch: 0,
        websocketPath: '/api/v26.0.0',
      });
    });

    it('should parse version with multi-digit patch', () => {
      const result = parseApiVersion('v25.10.15');

      expect(result).toEqual({
        version: 'v25.10.15',
        year: 25,
        minor: 10,
        patch: 15,
        websocketPath: '/api/v25.10.15',
      });
    });

    it('should parse v26+ version with minor version', () => {
      const result = parseApiVersion('v26.1.0');

      expect(result).toEqual({
        version: 'v26.1.0',
        year: 26,
        minor: 1,
        patch: 0,
        websocketPath: '/api/v26.1.0',
      });
    });

    it('should return null for invalid format (missing v prefix)', () => {
      expect(parseApiVersion('26.04.0')).toBeNull();
    });

    it('should return null for invalid format (wrong separator)', () => {
      expect(parseApiVersion('v26-04-0')).toBeNull();
    });

    it('should return null for invalid format (too many segments)', () => {
      expect(parseApiVersion('v26.04.0.1')).toBeNull();
    });

    it('should return null for invalid format (too few segments)', () => {
      expect(parseApiVersion('v26.04')).toBeNull();
    });

    it('should return null for invalid v25.x month (0)', () => {
      expect(parseApiVersion('v25.00.0')).toBeNull();
    });

    it('should return null for invalid v25.x month (13)', () => {
      expect(parseApiVersion('v25.13.0')).toBeNull();
    });

    it('should parse minimum valid v25.x month (01)', () => {
      const result = parseApiVersion('v25.01.0');
      expect(result?.minor).toBe(1);
    });

    it('should parse maximum valid v25.x month (12)', () => {
      const result = parseApiVersion('v25.12.0');
      expect(result?.minor).toBe(12);
    });

    it('should parse v26+ with single-digit minor', () => {
      const result = parseApiVersion('v26.5.0');
      expect(result?.minor).toBe(5);
    });

    it('should parse v26+ with two-digit minor', () => {
      const result = parseApiVersion('v26.42.0');
      expect(result?.minor).toBe(42);
    });

    it('should return null for invalid v26+ minor (> 99)', () => {
      expect(parseApiVersion('v26.100.0')).toBeNull();
    });

    it('should allow minor version 0 for v26+', () => {
      const result = parseApiVersion('v26.0.0');
      expect(result?.minor).toBe(0);
    });
  });

  describe('compareVersions', () => {
    it('should return negative when first version is older (by year)', () => {
      const v1 = assertVersion(parseApiVersion('v25.10.0'));
      const v2 = assertVersion(parseApiVersion('v26.0.0'));
      expect(compareVersions(v1, v2)).toBeLessThan(0);
    });

    it('should return positive when first version is newer (by year)', () => {
      const v1 = assertVersion(parseApiVersion('v26.0.0'));
      const v2 = assertVersion(parseApiVersion('v25.10.0'));
      expect(compareVersions(v1, v2)).toBeGreaterThan(0);
    });

    it('should return negative when first version is older (by minor)', () => {
      const v1 = assertVersion(parseApiVersion('v26.0.0'));
      const v2 = assertVersion(parseApiVersion('v26.1.0'));
      expect(compareVersions(v1, v2)).toBeLessThan(0);
    });

    it('should return positive when first version is newer (by minor)', () => {
      const v1 = assertVersion(parseApiVersion('v26.1.0'));
      const v2 = assertVersion(parseApiVersion('v26.0.0'));
      expect(compareVersions(v1, v2)).toBeGreaterThan(0);
    });

    it('should return negative when first version is older (by patch)', () => {
      const v1 = assertVersion(parseApiVersion('v26.0.0'));
      const v2 = assertVersion(parseApiVersion('v26.0.1'));
      expect(compareVersions(v1, v2)).toBeLessThan(0);
    });

    it('should return positive when first version is newer (by patch)', () => {
      const v1 = assertVersion(parseApiVersion('v26.0.5'));
      const v2 = assertVersion(parseApiVersion('v26.0.2'));
      expect(compareVersions(v1, v2)).toBeGreaterThan(0);
    });

    it('should return zero when versions are equal', () => {
      const v1 = assertVersion(parseApiVersion('v26.0.0'));
      const v2 = assertVersion(parseApiVersion('v26.0.0'));
      expect(compareVersions(v1, v2)).toBe(0);
    });
  });

  describe('checkVersionCompatibility', () => {
    it('should return Compatible for version within supported range', () => {
      const version = assertVersion(parseApiVersion('v25.10.0'));
      expect(checkVersionCompatibility(version)).toBe(
        VersionCompatibility.Compatible
      );
    });

    it('should return Compatible for max supported version', () => {
      const version = assertVersion(parseApiVersion('v26.0.0'));
      expect(checkVersionCompatibility(version)).toBe(
        VersionCompatibility.Compatible
      );
    });

    it('should return Compatible for min supported version', () => {
      const version = assertVersion(parseApiVersion('v25.10.0'));
      expect(checkVersionCompatibility(version)).toBe(
        VersionCompatibility.Compatible
      );
    });

    it('should return TooOld for version below min', () => {
      const version = assertVersion(parseApiVersion('v24.04.0'));
      expect(checkVersionCompatibility(version)).toBe(
        VersionCompatibility.TooOld
      );
    });

    it('should return TooNew for version above max', () => {
      const version = assertVersion(parseApiVersion('v27.0.0'));
      expect(checkVersionCompatibility(version)).toBe(
        VersionCompatibility.TooNew
      );
    });

    it('should return Compatible for patch version within range', () => {
      const version = assertVersion(parseApiVersion('v25.10.5'));
      expect(checkVersionCompatibility(version)).toBe(
        VersionCompatibility.Compatible
      );
    });
  });

  describe('isVersionSupported', () => {
    it('should return true for supported version', () => {
      const version = assertVersion(parseApiVersion('v26.0.0'));
      expect(isVersionSupported(version)).toBe(true);
    });

    it('should return false for version too old', () => {
      const version = assertVersion(parseApiVersion('v24.04.0'));
      expect(isVersionSupported(version)).toBe(false);
    });

    it('should return false for version too new', () => {
      const version = assertVersion(parseApiVersion('v27.0.0'));
      expect(isVersionSupported(version)).toBe(false);
    });
  });

  describe('filterCompatibleVersions', () => {
    it('should filter out incompatible versions', () => {
      const versions = [
        assertVersion(parseApiVersion('v24.04.0')), // Too old
        assertVersion(parseApiVersion('v25.10.0')), // Compatible
        assertVersion(parseApiVersion('v26.0.0')), // Compatible
        assertVersion(parseApiVersion('v27.0.0')), // Too new
      ];

      const result = filterCompatibleVersions(versions);

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe('v25.10.0');
      expect(result[1].version).toBe('v26.0.0');
    });

    it('should return empty array when no compatible versions', () => {
      const versions = [
        assertVersion(parseApiVersion('v24.04.0')), // Too old
        assertVersion(parseApiVersion('v27.0.0')), // Too new
      ];

      const result = filterCompatibleVersions(versions);

      expect(result).toHaveLength(0);
    });

    it('should return all versions when all are compatible', () => {
      const versions = [
        assertVersion(parseApiVersion('v25.10.0')),
        assertVersion(parseApiVersion('v26.0.0')),
      ];

      const result = filterCompatibleVersions(versions);

      expect(result).toHaveLength(2);
    });
  });

  describe('selectLatestCompatibleVersion', () => {
    it('should select latest compatible version from multiple patches', () => {
      const versions = ['v25.10.0', 'v25.10.1', 'v25.10.2', 'v26.0.0'];

      const result = selectLatestCompatibleVersion(versions);

      expect(result?.version).toBe('v26.0.0');
    });

    it('should select latest patch version when same year.minor', () => {
      const versions = ['v25.10.0', 'v25.10.1', 'v25.10.2'];

      const result = selectLatestCompatibleVersion(versions);

      expect(result?.version).toBe('v25.10.2');
    });

    it('should return null when no compatible versions', () => {
      const versions = ['v24.04.0', 'v27.0.0'];

      const result = selectLatestCompatibleVersion(versions);

      expect(result).toBeNull();
    });

    it('should return null when given empty array', () => {
      const result = selectLatestCompatibleVersion([]);

      expect(result).toBeNull();
    });

    it('should return null when all version strings are invalid', () => {
      const versions = ['invalid', 'v26-04-0', '26.04.0'];

      const result = selectLatestCompatibleVersion(versions);

      expect(result).toBeNull();
    });

    it('should skip invalid versions and select from valid ones', () => {
      const versions = ['invalid', 'v25.10.0', 'v26.0.0', 'bad-format'];

      const result = selectLatestCompatibleVersion(versions);

      expect(result?.version).toBe('v26.0.0');
    });

    it('should handle unsorted input', () => {
      const versions = ['v26.0.0', 'v25.10.2', 'v25.10.0', 'v25.10.1'];

      const result = selectLatestCompatibleVersion(versions);

      expect(result?.version).toBe('v26.0.0');
    });

    it('should filter out versions outside supported range', () => {
      const versions = ['v24.04.0', 'v25.10.0', 'v26.0.0', 'v27.0.0'];

      const result = selectLatestCompatibleVersion(versions);

      expect(result?.version).toBe('v26.0.0');
    });
  });

  describe('getWebSocketPath', () => {
    it('should return correct WebSocket path', () => {
      const version = assertVersion(parseApiVersion('v26.0.0'));

      expect(getWebSocketPath(version)).toBe('/api/v26.0.0');
    });

    it('should return path with full version including patch', () => {
      const version = assertVersion(parseApiVersion('v25.10.5'));

      expect(getWebSocketPath(version)).toBe('/api/v25.10.5');
    });

    it('should not include /websocket suffix', () => {
      const version = assertVersion(parseApiVersion('v26.0.0'));
      const path = getWebSocketPath(version);

      expect(path).not.toContain('/websocket');
      expect(path).toBe('/api/v26.0.0');
    });
  });
});
