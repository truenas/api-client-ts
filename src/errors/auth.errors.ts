/**
 * Stable, framework-agnostic authentication error codes. The authenticator throws
 * `AuthError` with one of these codes; consumers translate the code to a localized
 * message (the `message` here is a plain-English default / fallback).
 */
export enum AuthErrorCode {
  PasswordAuthFailed = 'PASSWORD_AUTH_FAILED',
  OtpAuthFailed = 'OTP_AUTH_FAILED',
  ApiKeyAuthFailed = 'API_KEY_AUTH_FAILED',
  FullAdminRequired = 'FULL_ADMIN_REQUIRED',
}

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
    // Preserve `instanceof AuthError` across down-level compilation targets.
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}
