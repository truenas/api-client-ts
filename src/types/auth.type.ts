/**
 * Authentication types, derived from the generated API surface.
 *
 * `auth.login_ex` returns a discriminated union keyed on `response_type`, so
 * narrowing a response unlocks exactly the fields that variant carries — an
 * `OTP_REQUIRED` response has no `user_info`, and reading one is a compile
 * error rather than a runtime `undefined`.
 *
 * Everything here tracks the configured supported range: widen it and any
 * newly-possible response variant (v26 added `SCRAM` and `DENIED`) appears at
 * the narrowing sites.
 */

import { UserRole } from '@/enums/user-role.enum';
import { ApiCallParams, ApiCallResponse } from '@/types/api-surface.type';

/** Every response `auth.login_ex` may return across the supported range. */
export type AuthResponse = ApiCallResponse<'auth.login_ex'>;

/** The `response_type` discriminator values. */
export type AuthResponseType = AuthResponse['response_type'];

/** Login payloads accepted by every supported version. */
export type AuthLoginParams = ApiCallParams<'auth.login_ex'>;

/** Result of `api_key.create` — the new key plus its entry metadata. */
export type ApiKeyCreateResult = ApiCallResponse<'api_key.create'>;

/**
 * The parts of `user_info` this client reads.
 *
 * PARTIALLY-NOT-IN-DUMP: middleware models `privilege` and `attributes` as
 * opaque `{ [k: string]: unknown }` dicts, so the generated types cannot say
 * what is inside them. These refinements are hand-written and are the one
 * place in the auth path not backed by the dump — if middleware ever models
 * them properly, delete this and use the generated shape directly.
 */
export interface AuthUserInfoRefinements {
  privilege: {
    roles: {
      $set: UserRole[];
    };
  };
  attributes: {
    preferences?: {
      lifetime?: number;
    } | null;
  };
}

/** Generated `user_info`, with the opaque dicts refined. */
export type AuthUserInfo = NonNullable<
  Extract<AuthResponse, { response_type: 'SUCCESS' }>['user_info']
> &
  AuthUserInfoRefinements;

/** Distributes over the success variants so per-version fields survive. */
type WithRefinedUserInfo<T> = T extends { user_info: unknown }
  ? Omit<T, 'user_info'> & { user_info: AuthUserInfo | null }
  : T;

/** A successful login, with `user_info` refined. */
export type AuthSuccessResponse = WithRefinedUserInfo<
  Extract<AuthResponse, { response_type: 'SUCCESS' }>
>;

/** Narrows a login response to the success variant. */
export function isAuthSuccess(
  response: AuthResponse
): response is AuthSuccessResponse {
  return response.response_type === 'SUCCESS';
}
