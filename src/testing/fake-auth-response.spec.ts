import { describe, expect, it } from 'vitest';
import { AuthResponseType } from '@/types/auth.type';
import { UserRole } from '@/enums/user-role.enum';
import { ARMS, fakeAuthResponse } from './fake-auth-response';

/**
 * What each arm should come back with, stated here rather than derived from
 * `ARMS` — derived, this would assert that the builder emits what its own
 * table says, which is true by construction. These rows are the fidelity
 * claim, checked against middleware `4303dc8:…/api/v27_0_0/auth.py`:
 * `AuthRespSuccess` `:226-242`, `AuthRespOTPRequired` `:212-216`,
 * `AuthRespAuthRedirect` `:193-197`, `AuthRespAuthErr` `:187-190`,
 * `AuthRespExpired` `:200-203`.
 */
const ARM_FIELDS = [
  [AuthResponseType.Success, ['response_type', 'authenticator', 'reconnect_token', 'user_info']],
  [AuthResponseType.OtpRequired, ['response_type', 'username']],
  [AuthResponseType.Redirect, ['response_type', 'urls']],
  [AuthResponseType.AuthErr, ['response_type']],
  [AuthResponseType.Expired, ['response_type']],
] as const satisfies readonly (readonly [AuthResponseType, readonly string[]])[];

describe('fakeAuthResponse', () => {
  /**
   * The rows above are a list; `ARMS` is the builder's own. An arm added to
   * one and not the other is an arm nobody has said anything about — which is
   * the state the `Record` was introduced to make impossible one level up.
   */
  /**
   * A spread copies references. With the arms as plain objects in module
   * scope, every `REDIRECT` response shared one `urls` array: a spec pushing a
   * second SSO URL onto one response — or code under test calling `.sort()` on
   * it — changed every later response in the file, and the failure landed in a
   * test that did not cause it.
   */
  it('gives each response its own arrays', () => {
    const first = fakeAuthResponse({ response_type: AuthResponseType.Redirect });
    const second = fakeAuthResponse({ response_type: AuthResponseType.Redirect });

    expect(first.urls).not.toBe(second.urls);

    first.urls?.push('https://evil.example/added');

    expect(second.urls).toEqual(['https://truenas.local/sso']);
  });

  it('has a row for every arm the builder knows', () => {
    expect(ARM_FIELDS.map(([type]) => String(type)).sort()).toEqual(
      Object.keys(ARMS).sort()
    );
  });

  it('describes a successful full-admin login by default', () => {
    const response = fakeAuthResponse();

    expect(response.response_type).toBe(AuthResponseType.Success);
    expect(response.user_info?.privilege.roles.$set).toEqual([
      UserRole.FullAdmin,
    ]);
  });

  /**
   * Middleware sends `user_info` on success and not otherwise, so a builder
   * that attached it to every response would hand a spec a failure carrying a
   * logged-in user — a frame no appliance sends, and the one shape a spec
   * about failed logins is most likely to read.
   */
  it.each([AuthResponseType.AuthErr, AuthResponseType.OtpRequired])(
    'omits user_info from a %s response',
    responseType => {
      expect(fakeAuthResponse({ response_type: responseType }).user_info).toBeUndefined();
    }
  );

  /** It declines to add one; it does not take one away. */
  it('keeps a user_info given explicitly on a failure', () => {
    const response = fakeAuthResponse({
      response_type: AuthResponseType.AuthErr,
      user_info: { username: 'operator' },
    });

    expect(response.user_info?.username).toBe('operator');
    // Still complete: the override is one field, not the whole object.
    expect(response.user_info?.privilege.roles.$set).toEqual([
      UserRole.FullAdmin,
    ]);
  });

  it('merges a partial user_info over the defaults', () => {
    const response = fakeAuthResponse({ user_info: { uid: 1000, username: 'jane' } });

    expect(response.user_info?.uid).toBe(1000);
    expect(response.user_info?.username).toBe('jane');
    expect(response.user_info?.home).toBe('/root');
  });

  /**
   * A `Partial<…>` built with a conditional puts `undefined` where a field is
   * declared, and spreading that over the defaults would emit
   * `{ response_type: undefined }` — a response whose type is missing, which
   * fails in whatever reads it rather than here. An absent override means
   * "unchanged", so the default stands.
   */
  it('leaves the default in place for a field overridden with undefined', () => {
    const response = fakeAuthResponse({
      response_type: undefined,
      authenticator: undefined,
    });

    expect(response.response_type).toBe(AuthResponseType.Success);
    expect(response.authenticator).toBe('LEVEL_1');
  });

  /**
   * `auth.login_ex` returns a discriminated union and each arm carries only
   * its own fields. A builder that filled the whole envelope every time would
   * hand a spec `authenticator: 'LEVEL_1'` on an `AUTH_ERR` — a shape no arm
   * has, and one a consumer might reasonably read as "this login succeeded".
   */
  it.each(ARM_FIELDS)('carries only the %s arm\'s own fields', (responseType, expected) => {
    const response = fakeAuthResponse({ response_type: responseType });

    expect(Object.keys(response).sort()).toEqual([...expected].sort());
  });

  /**
   * Declared by this package's `AuthResponse`, on no arm of middleware's
   * union at any version. Settable, never defaulted.
   */
  it('does not invent max_session_age or max_inactivity', () => {
    const response = fakeAuthResponse();

    expect('max_session_age' in response).toBe(false);
    expect('max_inactivity' in response).toBe(false);
    expect(fakeAuthResponse({ max_session_age: 300 }).max_session_age).toBe(300);
  });
});
