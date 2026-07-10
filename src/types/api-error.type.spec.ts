import { describe, expect, it } from 'vitest';
import {
  getApiErrorMessage,
  isJsonRpcError,
  isTrueNasError,
  JsonRpcError,
  TrueNasError,
} from './api-error.type';

describe('API Error Types', () => {
  describe('isJsonRpcError', () => {
    it('should return true for valid JSON-RPC error', () => {
      const error: JsonRpcError = {
        code: -32600,
        message: 'Invalid Request',
      };

      expect(isJsonRpcError(error)).toBe(true);
    });

    it('should return true for JSON-RPC error with data', () => {
      const error: JsonRpcError = {
        code: -32600,
        message: 'Invalid Request',
        data: { details: 'Something went wrong' },
      };

      expect(isJsonRpcError(error)).toBe(true);
    });

    it('should return false for TrueNAS error', () => {
      const error: TrueNasError = {
        reason: 'Something failed',
      };

      expect(isJsonRpcError(error)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isJsonRpcError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isJsonRpcError(undefined)).toBe(false);
    });

    it('should return false for non-object types', () => {
      expect(isJsonRpcError('error')).toBe(false);
      expect(isJsonRpcError(123)).toBe(false);
      expect(isJsonRpcError(true)).toBe(false);
    });

    it('should return false for object without message field', () => {
      expect(isJsonRpcError({ code: 123 })).toBe(false);
    });

    it('should return false for object with non-string message', () => {
      expect(isJsonRpcError({ message: 123 })).toBe(false);
    });
  });

  describe('isTrueNasError', () => {
    it('should return true for valid TrueNAS error', () => {
      const error: TrueNasError = {
        reason: 'Operation failed',
      };

      expect(isTrueNasError(error)).toBe(true);
    });

    it('should return true for TrueNAS error with additional properties', () => {
      const error: TrueNasError = {
        reason: 'Operation failed',
        code: 500,
        details: 'Additional info',
      };

      expect(isTrueNasError(error)).toBe(true);
    });

    it('should return false for JSON-RPC error', () => {
      const error: JsonRpcError = {
        code: -32600,
        message: 'Invalid Request',
      };

      expect(isTrueNasError(error)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isTrueNasError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isTrueNasError(undefined)).toBe(false);
    });

    it('should return false for non-object types', () => {
      expect(isTrueNasError('error')).toBe(false);
      expect(isTrueNasError(123)).toBe(false);
      expect(isTrueNasError(false)).toBe(false);
    });

    it('should return false for object without reason field', () => {
      expect(isTrueNasError({ code: 123 })).toBe(false);
    });

    it('should return false for object with non-string reason', () => {
      expect(isTrueNasError({ reason: 123 })).toBe(false);
    });
  });

  describe('getApiErrorMessage', () => {
    it('should extract message from JSON-RPC error', () => {
      const error: JsonRpcError = {
        code: -32600,
        message: 'Invalid Request',
      };

      expect(getApiErrorMessage(error)).toBe('Invalid Request');
    });

    it('should extract message from JSON-RPC error with data', () => {
      const error: JsonRpcError = {
        code: -32600,
        message: 'Invalid Request',
        data: { details: 'Something went wrong' },
      };

      expect(getApiErrorMessage(error)).toBe('Invalid Request');
    });

    it('should extract reason from TrueNAS error', () => {
      const error: TrueNasError = {
        reason: 'Operation failed',
      };

      expect(getApiErrorMessage(error)).toBe('Operation failed');
    });

    it('should extract reason from TrueNAS error with additional properties', () => {
      const error: TrueNasError = {
        reason: 'Database error',
        code: 500,
        details: 'Connection timeout',
      };

      expect(getApiErrorMessage(error)).toBe('Database error');
    });

    it('should return default fallback for unknown error format', () => {
      expect(getApiErrorMessage(null)).toBe('API call failed');
      expect(getApiErrorMessage(undefined)).toBe('API call failed');
      expect(getApiErrorMessage('error string')).toBe('API call failed');
      expect(getApiErrorMessage(123)).toBe('API call failed');
      expect(getApiErrorMessage({})).toBe('API call failed');
    });

    it('should return custom fallback when provided', () => {
      const customFallback = 'Custom error message';
      expect(getApiErrorMessage(null, customFallback)).toBe(customFallback);
      expect(getApiErrorMessage(undefined, customFallback)).toBe(
        customFallback
      );
      expect(getApiErrorMessage({}, customFallback)).toBe(customFallback);
    });

    it('should prioritize JSON-RPC message over fallback', () => {
      const error: JsonRpcError = {
        code: -32600,
        message: 'Invalid Request',
      };

      expect(getApiErrorMessage(error, 'Should not use this')).toBe(
        'Invalid Request'
      );
    });

    it('should prioritize TrueNAS reason over fallback', () => {
      const error: TrueNasError = {
        reason: 'Operation failed',
      };

      expect(getApiErrorMessage(error, 'Should not use this')).toBe(
        'Operation failed'
      );
    });

    it('should handle error object with both message and reason (reason takes precedence as more specific)', () => {
      const error = {
        message: 'JSON-RPC message',
        reason: 'TrueNAS reason',
      };

      // reason is more specific than generic JSON-RPC message
      expect(getApiErrorMessage(error)).toBe('TrueNAS reason');
    });
  });
});
