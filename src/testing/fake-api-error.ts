import type {
  TrueNasErrorData,
  TrueNasErrorFrame,
} from '@/types/api-error.type';
import { present } from './present';

/** Flat overrides for a nested frame: say what varies, get the real shape. */
export interface FakeApiErrorOverrides extends Partial<TrueNasErrorData> {
  /** JSON-RPC code. Defaults to `-32001`, middleware's "method call error". */
  code?: number;
  /** JSON-RPC message. Defaults to `'Method call error'`, which is what `rpc.py` sends. */
  message?: string;
}

/**
 * The error a method call fails with on `/api/<version>`.
 *
 * The versioned endpoint answers a failed call with a JSON-RPC error whose
 * `data` carries the TrueNAS payload:
 *
 * ```json
 * {"code": -32001, "message": "Method call error",
 *  "data": {"error": 22, "errname": "EINVAL", "reason": "…", "trace": null, "extra": null}}
 * ```
 *
 * That nesting is the part worth having a builder for. The flat
 * `{error, errname, extra, reason}` is what `/websocket` sends — a different
 * handler for a different endpoint — and a spec that answers with it passes
 * against this package's own `getApiErrorMessage`, which reads either, while a
 * consumer branching on `error.code` or `error.data.errname` fails against an
 * appliance.
 *
 * Verified against middleware master at `4303dc8`:
 * `api/base/server/ws_handler/rpc.py:81-124` builds the envelope,
 * `:408,422` passes `"Method call error"` for both the `CallError` and generic
 * arms, and `middlewared_docs/docs/jsonrpc.rst` documents `-32001`.
 *
 * **`error` and `errname` have to agree, and this does not check.** Middleware
 * derives the name from the number with `get_errname`, so there is exactly one
 * pairing; reproducing that here would mean carrying a copy of Python's errno
 * table, which this package has declined to do elsewhere for the same reason.
 * Pass both when you want something other than `EINVAL`.
 */
export function fakeApiError(overrides: FakeApiErrorOverrides = {}): TrueNasErrorFrame {
  const { code, message, ...data } = overrides;

  return {
    code: code ?? -32001,
    message: message ?? 'Method call error',
    data: {
      error: 22,
      errname: 'EINVAL',
      reason: 'Invalid argument',
      extra: null,
      trace: null,
      ...present(data),
    } satisfies TrueNasErrorData,
  };
}
