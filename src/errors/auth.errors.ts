/**
 * Stable, framework-agnostic authentication error codes. The authenticator throws
 * `AuthError` with one of these codes; consumers translate the code to a localized
 * message (the `message` here is a plain-English default / fallback).
 */
import type { AuthResponse } from '@/types/auth.type';

export enum AuthErrorCode {
  PasswordAuthFailed = 'PASSWORD_AUTH_FAILED',

  /**
   * The appliance refused the one-time code. `loginPending` says what comes
   * next: `true`, the same login takes another code; `false`, it is gone and
   * the login starts over with the password.
   */
  OtpAuthFailed = 'OTP_AUTH_FAILED',

  /**
   * A one-time code was sent with no login waiting for one: the appliance
   * dropped it after an earlier refusal, or it never asked. Start over with the
   * password. `loginPending` is always `false`.
   */
  OtpLoginNotPending = 'OTP_LOGIN_NOT_PENDING',

  ApiKeyAuthFailed = 'API_KEY_AUTH_FAILED',
  TokenAuthFailed = 'TOKEN_AUTH_FAILED',

  /**
   * A login was overtaken by a logout, or by a later login, while its response
   * was in flight. The server may well have accepted it; this client discarded
   * the result rather than authenticate a session the caller had moved on from.
   */
  LoginSuperseded = 'LOGIN_SUPERSEDED',

  /**
   * @deprecated Nothing throws this. The authenticator no longer refuses a
   * login for want of a role — see `TrueNasAuthenticator`. Kept so consumers
   * still narrowing on the code keep compiling; removing it would be a breaking
   * change for a member that can no longer occur.
   */
  FullAdminRequired = 'FULL_ADMIN_REQUIRED',
}

export class AuthError extends Error {
  /**
   * Whether the appliance still holds this login open for another attempt, so
   * the caller can ask for a new one-time code instead of the password.
   *
   * Only a refused code can leave it `true`, and only on releases that keep a
   * two-factor login after a wrong code (25.10, up to three tries); 26 and
   * later drop it on the first. It is read from the appliance's answer, never
   * from the API version, which does not tell the two apart. Every other
   * failure is `false`: the next attempt is a fresh login.
   */
  readonly loginPending: boolean;

  /**
   * @param response - the answer middleware refused the login with, when there was one.
   * Its `response_type` is what tells `EXPIRED`, `DENIED` and `REDIRECT` apart from
   * `AUTH_ERR`; the code alone says only which mechanism failed. Absent when the login
   * never got an answer of that kind (an error frame, or a superseded login).
   */
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly response?: AuthResponse,
    options: { loginPending?: boolean } = {},
  ) {
    super(message);
    this.name = 'AuthError';
    this.loginPending = options.loginPending ?? false;
    // Preserve `instanceof AuthError` across down-level compilation targets.
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}
