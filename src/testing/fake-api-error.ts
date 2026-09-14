import type {
  TrueNasErrorData,
  TrueNasErrorFrame,
} from '@/types/api-error.type';
import { present } from './present';

/**
 * Flat overrides for a nested frame: say what varies, get the real shape.
 *
 * Picked field by field rather than `Partial<TrueNasErrorData>`, which would
 * inherit that type's `[key: string]: unknown` — legitimate on the payload,
 * since middleware adds `py_exception` there, and fatal on an overrides bag,
 * because it turns off excess-property checking. `fakeApiError({ resaon: … })`
 * typechecked, put `resaon` in the payload and left `reason` at its default.
 */
export interface FakeApiErrorOverrides
  extends Partial<
    Pick<TrueNasErrorData, 'error' | 'errname' | 'reason' | 'extra' | 'trace'>
  > {
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
 *
 * **`trace` is an object, not `null`.** Both arms that send `-32001` pass
 * `sys.exc_info()`, which inside an `except` block is always truthy, so
 * `format_truenas_error` always builds one for this code — an error frame with
 * `trace: null` is not something the versioned endpoint produces. Its
 * *contents* here are synthetic, because a fixture has no Python stack to
 * format; only the shape is faithful, and `repr` carries the reason the way
 * middleware's does for an exception with no arguments. Pass `trace: null`
 * explicitly for the one payload that genuinely has none — the job-event error,
 * which `format_truenas_error` builds without `exc_info` and which is not a
 * JSON-RPC error frame at all.
 */
export function fakeApiError(overrides: FakeApiErrorOverrides = {}): TrueNasErrorFrame {
  const { code, message, ...data } = overrides;
  const reason = data.reason ?? 'Invalid argument';

  return {
    code: code ?? -32001,
    message: message ?? 'Method call error',
    data: {
      error: 22,
      errname: 'EINVAL',
      reason,
      extra: null,
      trace: {
        class: 'CallError',
        formatted: `Traceback (most recent call last):\n  <synthetic>\n${reason}\n`,
        repr: reason,
      },
      ...present(data),
    } satisfies TrueNasErrorData,
  };
}
