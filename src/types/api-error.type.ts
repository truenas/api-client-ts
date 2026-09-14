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
 * The TrueNAS payload a versioned-API error carries in its `data`.
 *
 * `/api/<version>` answers a failed method call with a JSON-RPC error whose
 * `data` holds this — `rpc.py`'s `format_truenas_error`. The legacy
 * `/websocket` endpoint sends these fields at the top level instead, which is
 * a different handler on a route this client never opens.
 */
export interface TrueNasErrorData extends TrueNasError {
  /** The errno middleware raised; `EINVAL` for anything it could not adapt. */
  error: number;
  /** `get_errname(errno)`, derived from `error` rather than chosen separately. */
  errname: string;
  /** `str(e) or repr(e)` — the repr for an exception that stringifies to nothing. */
  reason: string;
  /**
   * `null` when the appliance has nothing to add.
   *
   * `rpc.py`'s generic arm sets `extra = None` for any exception it cannot
   * adapt — `MatchNotFound` from an empty `get`, for one — and only an adapted
   * error carries a list. A validation error carries the errors themselves.
   */
  extra: unknown[] | null;
  /** The formatted traceback, or `null`, which is what a client normally sees. */
  trace: { class: string; formatted: string; repr: string } | null;
}

/**
 * The error a versioned-API frame carries.
 *
 * A JSON-RPC error object throughout: `code` and `message` are always present,
 * and `data` holds the TrueNAS payload for the codes that have one. The
 * dataless codes are real — `-32601 "Method does not exist"`,
 * `-32600 "Invalid request"`, `-32000 "too many concurrent calls"` — so `data`
 * is optional rather than merely defensive.
 */
export interface TrueNasErrorFrame extends JsonRpcError {
  data?: TrueNasErrorData;
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
