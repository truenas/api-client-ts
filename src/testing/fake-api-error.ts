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

/** A reason that is a bare `repr()` — an exception raised with no arguments. */
const BARE_REPR = /^([A-Za-z_][A-Za-z0-9_]*)\(\)$/;

/**
 * Characters CPython's `str.isprintable()` calls unprintable.
 *
 * Its rule is: not printable if the code point is in category Cc, Cf, Cs, Co,
 * Cn, Zl, Zp or Zs — with U+0020 the one exception, which is printable. Every
 * other printable non-ASCII character, `é` and `日` and `😀` alike, is left
 * alone by `repr()` and is left alone here.
 */
const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

/** One code point, escaped the way `repr()` escapes it. */
function escapeCodePoint(character: string): string {
  if (character === '\n') return '\\n';
  if (character === '\r') return '\\r';
  if (character === '\t') return '\\t';

  // `\b`, `\f` and `\v` are not among them: `repr('\x08')` is `'\x08'`.
  const code = character.codePointAt(0) ?? 0;
  if (code < 0x100) return `\\x${code.toString(16).padStart(2, '0')}`;
  if (code < 0x10000) return `\\u${code.toString(16).padStart(4, '0')}`;
  return `\\U${code.toString(16).padStart(8, '0')}`;
}

/**
 * A Python `repr()` of a string, quoting and escaping the way CPython does.
 *
 * Interpolating into single quotes is not it, and neither is escaping the
 * three whitespace controls. `repr` picks `"` when the string contains a `'`
 * and no `"`, escapes the backslash and the quote it chose, and escapes every
 * code point `str.isprintable()` rejects — `\xNN` below U+0100, `\uNNNN` below
 * U+10000, `\UNNNNNNNN` above, with `\n`, `\r` and `\t` the three short forms.
 *
 * The inputs that need it are the ordinary ones. Middleware names things with
 * `{x!r}` in f-strings, so `CallError` messages are full of single quotes;
 * `adapt_exception` interpolates a command's decoded stderr after a newline
 * (`4303dc8:src/middlewared/middlewared/service_exception.py:106-114`), and
 * plugins do the same by hand — so ANSI colour, a stray `\x00` or a `\x0c`
 * arrives in a reason without anything stripping it.
 *
 * Checked against `python3` rather than against expectations written here: see
 * `fake-api-error.spec.ts`.
 */
export function pythonRepr(value: string): string {
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";

  let escaped = '';
  for (const character of value) {
    if (character === '\\') escaped += '\\\\';
    else if (character === quote) escaped += `\\${quote}`;
    else if (character === ' ' || !UNPRINTABLE.test(character)) escaped += character;
    else escaped += escapeCodePoint(character);
  }

  return `${quote}${escaped}${quote}`;
}

/**
 * A trace whose `class` and `repr` agree with the reason, so the three
 * together are a triple an appliance could send. See {@link fakeApiError}.
 */
function syntheticTrace(reason: string): NonNullable<TrueNasErrorData['trace']> {
  const bare = BARE_REPR.exec(reason);
  const cls = bare ? bare[1] : 'ValueError';
  const repr = bare ? reason : `ValueError(${pythonRepr(reason)})`;

  return {
    class: cls,
    formatted: `Traceback (most recent call last):\n  <synthetic>\n${repr}\n`,
    repr,
  };
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
 * `trace: null` is not something the versioned endpoint produces.
 *
 * `formatted` is synthetic, because a fixture has no Python stack to format.
 * `class` and `repr` are not: they are chosen so the triple is one an
 * appliance could send. The generic arm's `reason` is `str(error) or
 * repr(error)`, so a reason that reads as a bare repr — `MatchNotFound()` —
 * means an argument-free exception, and `class` is its name and `repr` is the
 * reason itself. Any other reason is `str(e)` of an exception that has
 * arguments, so `class` is `ValueError` and `repr` is that call written out.
 * `CallError` is the one name deliberately not used: it is never
 * argument-free — `__init__` always passes three arguments to `super()` — so
 * its repr is never the reason
 * (`4303dc8:src/middlewared/middlewared/service_exception.py:15-21`).
 *
 * **Two things this derivation does not model, deliberately.** The
 * `CallException` arm sends plain `str(e)`, and `CallError.__str__` is
 * `[<get_errname(self.errno)>] errmsg` (`:22-24`) — `[EFAULT] ` for the
 * constructor's default errno, not the `[EINVAL] ` this fixture happens to
 * default `error` to — so the commonest real reason has a prefix this rule
 * reads as an ordinary message. And on the adapted path the reason and the
 * trace describe *different* exceptions: `adapt_exception` returns a new
 * `CallError` whose `str()` becomes the reason, while `sys.exc_info()` is
 * still the original, so `trace.class` is something like
 * `CalledProcessError`. A spec that needs either shape should pass `trace`
 * itself; what the default guarantees is that the `class` and `repr` it does
 * produce are a pair an appliance could send, not that they are the pair it
 * would have sent. `formatted` is outside that guarantee — middleware builds
 * it from `traceback.format_exception`, whose frame lines this fixture has no
 * stack to produce and whose last line is `str(value)` rather than the repr.
 *
 * Pass `trace: null` explicitly for the one payload that genuinely has none —
 * the job-event error, which `format_truenas_error` builds without `exc_info`
 * and which is not a JSON-RPC error frame at all.
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
      trace: syntheticTrace(reason),
      ...present(data),
    } satisfies TrueNasErrorData,
  };
}
