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
 * A `Record` keyed by the enum rather than a chain of comparisons, so a member
 * added to `AuthResponseType` is a compile error here instead of silently
 * taking an empty arm.
 *
 * Each entry is a *function*, because a spread copies references: as plain
 * objects in module scope, every `REDIRECT` response shared one `urls` array,
 * so a spec pushing a second SSO URL onto one response changed every later
 * response in that file. The chain this replaced built its literal per call and
 * did not have that problem — the exhaustiveness fix introduced it, which is
 * why the fix that keeps both is one pair of parens rather than a rewrite. That matters now rather than hypothetically: the enum
 * is two arms short of middleware's union — `AuthLoginExResult.result` at
 * `4303dc8:src/middlewared/middlewared/api/v27_0_0/auth.py:335-338` has seven,
 * including `AuthRespDenied` (`:206-209`) and `AuthRespScram` (`:245-262`),
 * and `AuthRespScram` requires `scram_type` and `rfc_str`. Adding either to
 * the enum should stop the build here and make someone say what it carries.
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
 * `user_info` has twenty-two required fields and three nested objects. Every
 * spec in this repo that needed one wrote three of them and cast the rest away
 * with `as unknown as AuthResponse`, which accepts a `response_type` that is
 * not a `response_type` and a `roles` that is not an array — and the cast is
 * what a consumer copies out of our own specs.
 *
 * The defaults describe a successful password login by a full admin.
 *
 * **The whole envelope follows `response_type`, not just `user_info`.**
 * `auth.login_ex` returns a discriminated union and each arm carries only its
 * own fields. The table below is the five arms *this package* can name — the
 * members of `AuthResponseType` — with the fields middleware gives each at
 * `4303dc8:src/middlewared/middlewared/api/v27_0_0/auth.py`. It is not the
 * whole union: that has seven arms (`:335-338`), and `AuthRespDenied`
 * (`:206-209`) and `AuthRespScram` (`:245-262`) are missing from the enum, so
 * this package cannot name two of the responses a v26+ appliance can send.
 * See {@link ARMS} for what happens when they are added:
 *
 * | `response_type` | fields |
 * |---|---|
 * | `SUCCESS` | `user_info`, `authenticator`, `reconnect_token` |
 * | `OTP_REQUIRED` | `username` |
 * | `REDIRECT` | `urls` |
 * | `AUTH_ERR`, `EXPIRED` | none |
 *
 * So asking for `AUTH_ERR` gets `{ response_type }` and nothing else, rather
 * than a successful login wearing a failure's label. Any field passed
 * explicitly is kept whatever the type — the builder declines to add, it does
 * not take away.
 *
 * `max_session_age` and `max_inactivity` are declared by this package's
 * `AuthResponse` but are on no arm of that union at any version; middleware
 * has `max_session_age` only as an internal AAL attribute. They are settable
 * and never defaulted, and the type is worth a look separately.
 *
 * `reconnect_token` defaults to `null` on the success arm, which is the v26+
 * shape for "no token was minted". v25.10 does not declare the field at all,
 * and this builder has no way to say that: an override of literally
 * `undefined` means "leave the default alone", the same as everywhere else
 * here. It costs nothing, because every reader treats absent and `null` alike
 * — but do not read `'reconnect_token' in response` as a claim about the
 * version.
 *
 * `satisfies` rather than a cast, so the literal is checked — but only for
 * *required* fields. Every member of `AuthResponse` except `response_type` is
 * optional, so an optional addition passes here unnoticed; the guard that
 * bites is `ARMS`, whose `Record` fails on an unhandled `response_type`. The
 * `user_info` literal is the stronger half: its type has twenty-two required
 * members, so anything *required* added there fails on the spot. An optional
 * addition passes there too — `AuthUserInfo` extends `UserGetUserObj`, and
 * middleware adds fields to it with defaults.
 */
export function fakeAuthResponse(
  overrides: FakeAuthResponseOverrides = {}
): AuthResponse {
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
