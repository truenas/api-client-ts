import {
  getApiErrorMessage,
  type TrueNasErrorData,
  type TrueNasErrorFrame,
} from '@/types/api-error.type';

/**
 * A method call middleware refused, with the whole error it refused it with.
 *
 * `message` is the human-readable reason, as the plain `Error` this replaced
 * carried. What that dropped is the rest of the frame: `errname` is how a
 * caller tells `ENOTAUTHENTICATED` from `EINVAL`, and `extra` is where a
 * validation error names the fields it rejected. Both are on {@link frame}.
 *
 * Thrown by `call`, the query verbs, and a job method refused before it
 * started a job. A job that starts and then fails is not this: it is reported
 * through its own `FAILED` state, with `error` and `exc_info` on the job.
 */
export class TrueNasApiError extends Error {
  constructor(
    /** The JSON-RPC error object, as middleware sent it. */
    readonly frame: TrueNasErrorFrame,
    /** The method that was refused. */
    readonly method: string,
  ) {
    super(getApiErrorMessage(frame, 'API call failed'));
    this.name = 'TrueNasApiError';
    // Preserve `instanceof TrueNasApiError` across down-level compilation targets.
    Object.setPrototypeOf(this, TrueNasApiError.prototype);
  }

  /** The JSON-RPC code: `-32001` for a refused call, others for a malformed one. */
  get code(): number {
    return this.frame.code;
  }

  /**
   * The TrueNAS payload — `errname`, `reason`, `extra`, `trace`.
   *
   * `undefined` for the codes middleware sends without one, such as
   * `-32601 "Method does not exist"`.
   */
  get data(): TrueNasErrorData | undefined {
    return this.frame.data;
  }

  /** `data.errname`, e.g. `EINVAL`, or `undefined` when there is no payload. */
  get errname(): string | undefined {
    return this.frame.data?.errname;
  }
}
