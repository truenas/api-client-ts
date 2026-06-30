/**
 * API error types for versioned TrueNAS API
 *
 * Handles both JSON-RPC 2.0 standard errors and TrueNAS custom error formats.
 */

/**
 * JSON-RPC 2.0 standard error format
 * @see https://www.jsonrpc.org/specification#error_object
 */
export interface JsonRpcError {
  /** Error code indicating the error type */
  code: number;
  /** Human-readable error message */
  message: string;
  /** Optional additional error data */
  data?: unknown;
}

/**
 * TrueNAS custom error format
 * Used in some API responses alongside JSON-RPC errors
 */
export interface TrueNasError {
  /** Additional error properties */
  [key: string]: unknown;
  /** Human-readable error reason (TrueNAS-specific field) */
  reason: string;
}

/**
 * Union type for all possible API error formats
 */
export type ApiError = JsonRpcError | TrueNasError;

/**
 * Type guard to check if an error is a JSON-RPC error
 */
export function isJsonRpcError(error: unknown): error is JsonRpcError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as JsonRpcError).message === 'string'
  );
}

/**
 * Type guard to check if an error is a TrueNAS error
 */
export function isTrueNasError(error: unknown): error is TrueNasError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'reason' in error &&
    typeof (error as TrueNasError).reason === 'string'
  );
}

/**
 * Extract a human-readable error message from an API error
 *
 * Handles multiple error formats:
 * - JSON-RPC 2.0 with nested TrueNAS data: uses `data.reason` field
 * - JSON-RPC 2.0 standard: uses `message` field
 * - TrueNAS custom: uses `reason` field
 * - Unknown format: returns fallback message
 *
 * @param error - The error object from API response
 * @param fallback - Fallback message if error format is unrecognized
 * @returns Human-readable error message
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'API call failed'
): string {
  // Check for JSON-RPC error with nested TrueNAS data (most specific)
  // Format: { code, message, data: { reason: "actual error" } }
  if (isJsonRpcError(error) && error.data && isTrueNasError(error.data)) {
    return error.data.reason;
  }

  // Check for direct TrueNAS error format
  if (isTrueNasError(error)) {
    return error.reason;
  }

  // Fall back to JSON-RPC standard message
  if (isJsonRpcError(error)) {
    return error.message;
  }

  return fallback;
}
