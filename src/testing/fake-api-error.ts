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
 * Characters CPython's `str.isprintable()` calls unprintable: categories Cc,
 * Cf, Cs, Co, Cn, Zl, Zp and Zs, with U+0020 the one exception. Printable
 * non-ASCII — `é`, `日`, `😀` — is left alone, as `repr()` leaves it.
 *
 * `Cn` is the one category this cannot get exactly right. "Unassigned" is a
 * property of a code point *in a Unicode version*, and this class reads the
 * engine's table while the appliance's `repr()` reads its Python's. They agree
 * on the code points unassigned in both, which is almost all of them, and
 * disagree either way on the rest; neither side is reliably newer. Everything
 * below U+0100 is exact, and so is any reason made of ordinary prose.
 */
const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

/** One code point, escaped the way `repr()` escapes it. */
function escapeCodePoint(character: string): string {
  if (character === '\n') return '\\n';
  if (character === '\r') return '\\r';
  if (character === '\t') return '\\t';

  // `\b`, `\f` and `\v` are not among them: `repr('\x08')` is `'\x08'`.
  //
  // Non-null rather than `?? 0`: `character` comes from `for…of` over a
  // string, which never yields an empty one, and a fallback here would
  // silently emit `\x00` for a character it could not read.
  const code = character.codePointAt(0)!;
  if (code < 0x100) return `\\x${code.toString(16).padStart(2, '0')}`;
  if (code < 0x10000) return `\\u${code.toString(16).padStart(4, '0')}`;
  return `\\U${code.toString(16).padStart(8, '0')}`;
}

/**
 * A Python `repr()` of a string, quoting and escaping the way CPython does —
 * within the one limit {@link UNPRINTABLE} describes.
 *
 * `repr` picks `"` when the string holds a `'` and no `"`, escapes the
 * backslash and the chosen quote, and escapes every code point
 * `str.isprintable()` rejects: `\xNN` below U+0100, `\uNNNN` below U+10000,
 * `\UNNNNNNNN` above, with `\n`, `\r` and `\t` the short forms. Ordinary
 * middleware messages need all of it — `{x!r}` f-strings carry single quotes,
 * and `adapt_exception` interpolates raw stderr after a newline.
 *
 * Checked against `python3`, not against expectations written here; see
 * `fake-api-error.spec.ts` and `python-repr.spec.ts`. Exported for those alone.
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
 * A trace whose `class` and `repr` agree with the reason, so those two are a
 * pair an appliance could send. `formatted` is outside that: middleware builds
 * it from `traceback.format_exception`, whose frames a fixture cannot produce.
 *
 * It is an object rather than `null` because both arms sending `-32001` pass
 * `sys.exc_info()`, always truthy inside an `except`.
 *
 * The rule follows the generic arm's `str(error) or repr(error)`: a bare repr
 * means an argument-free exception, so the class is its name; anything else is
 * `ValueError` with the call written out. `CallError` is never argument-free
 * and so is deliberately not used.
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
 * The versioned endpoint wraps the TrueNAS payload in a JSON-RPC error —
 * `{code: -32001, message: 'Method call error', data: {…}}` — and that nesting
 * is the part worth a builder. The flat `{error, errname, extra, reason}` is
 * `/websocket`'s, a route this client never opens; `getApiErrorMessage` reads
 * either, so only a consumer branching on `error.code` or `error.data.errname`
 * finds out. Verified at middleware `4303dc8`, `ws_handler/rpc.py:81-124`.
 *
 * `error` and `errname` are the caller's to keep consistent; middleware
 * derives one from the other. `trace` defaults to one whose `class` and `repr`
 * agree with `reason`; pass `null` only for the job-event payload.
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
