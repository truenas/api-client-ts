import { AuthResponseType, type AuthResponse } from '@/types/auth.type';
import { UserRole } from '@/enums/user-role.enum';
import { present } from './present';

type UserInfo = NonNullable<AuthResponse['user_info']>;

/**
 * Overrides for {@link fakeAuthResponse}.
 *
 * `user_info` is partial one level down, like `fakeJob`'s `progress`: a spec
 * that wants a different username should not have to restate twenty-odd fields
 * around it. The structures below it — `privilege`, `group`, `attributes` —
 * are replaced whole when given, because a partial `privilege` is a shape that
 * cannot reach a consumer and merging it would invent one.
 */
export interface FakeAuthResponseOverrides
  extends Partial<Omit<AuthResponse, 'user_info'>> {
  user_info?: Partial<UserInfo>;
}

/**
 * What each arm of the union carries beyond `response_type`.
 *
 * A `Record` keyed by the enum, so a member added to `AuthResponseType` is a
 * compile error here rather than an empty arm. That matters now: the enum is
 * two arms short of middleware's union — `AuthLoginExResult.result` at
 * `4303dc8:…/api/v27_0_0/auth.py:335-338` has seven, and `AuthRespScram`
 * (`:245-262`) requires fields of its own.
 *
 * Each entry is a *function*: as plain objects in module scope every
 * `REDIRECT` response shared one `urls` array, so a spec mutating one changed
 * every later response in that file.
 *
 * Exported for `fake-auth-response.spec.ts` alone, not from the entry.
 */
export const ARMS: Record<AuthResponseType, () => Partial<AuthResponse>> = {
  [AuthResponseType.Success]: () => ({
    authenticator: 'LEVEL_1',
    reconnect_token: null,
  }),
  [AuthResponseType.OtpRequired]: () => ({ username: 'root' }),
  [AuthResponseType.Redirect]: () => ({ urls: ['https://truenas.local/sso'] }),
  [AuthResponseType.AuthErr]: () => ({}),
  [AuthResponseType.Expired]: () => ({}),
};

/**
 * A complete `AuthResponse`, so a scripted login is the shape a caller reads.
 *
 * The envelope follows `response_type`: `auth.login_ex` is a discriminated
 * union and each arm carries only its own fields, so `AUTH_ERR` comes back as
 * `{ response_type }` rather than a success wearing a failure's label.
 *
 * | `response_type` | fields |
 * |---|---|
 * | `SUCCESS` | `user_info`, `authenticator`, `reconnect_token` |
 * | `OTP_REQUIRED` | `username` |
 * | `REDIRECT` | `urls` |
 * | `AUTH_ERR`, `EXPIRED` | none |
 */
export function fakeAuthResponse(
  overrides: FakeAuthResponseOverrides = {}
): AuthResponse {
  // The defaults are a successful password login by a full admin. `user_info`
  // has twenty-two required fields, which every spec here used to supply three
  // of and cast the rest away — the cast a consumer then copies.
  //
  // Any field passed explicitly is kept whatever the type: the builder
  // declines to add, it does not take away. `max_session_age` and
  // `max_inactivity` are settable and never defaulted, being on no arm of
  // middleware's union at any version. `satisfies` below checks the literal,
  // but only its *required* fields — `ARMS` is the guard that bites.
  const { user_info: userInfoOverrides, ...rest } = overrides;
  const responseType = rest.response_type ?? AuthResponseType.Success;
  const succeeded = responseType === AuthResponseType.Success;

  const userInfo: UserInfo | undefined =
    succeeded || userInfoOverrides
      ? ({
          username: 'root',
          fullname: 'root',
          builtin: true,
          email: null,
          groups: [0],
          privilege: { roles: { $set: [UserRole.FullAdmin] } },
          two_factor_auth_configured: false,
          immutable: true,
          sid: 'S-1-5-21-0-0-0-1000',
          id: 1,
          uid: 0,
          gid: 0,
          shell: '/usr/bin/bash',
          home: '/root',
          locked: false,
          sudo: true,
          sudo_nopasswd: true,
          sudo_commands: [],
          smb: false,
          group: {
            id: 1,
            bsdgrp_builtin: true,
            bsdgrp_gid: 0,
            bsdgrp_group: 'root',
            bsdgrp_sudo: true,
            bsdgrp_sudo_nopasswd: true,
            bsdgrp_sudo_commands: [],
            bsdgrp_smb: false,
            bsdgrp_users: [],
          },
          sshpubkey: null,
          attributes: { preferences: { language: 'en', lifetime: 300 } },
          ...present(userInfoOverrides ?? {}),
        } satisfies UserInfo)
      : undefined;

  return {
    response_type: responseType,
    ...ARMS[responseType](),
    ...present(rest),
    ...(userInfo ? { user_info: userInfo } : {}),
  } satisfies AuthResponse;
}
