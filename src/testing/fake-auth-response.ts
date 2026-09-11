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
 * A complete `AuthResponse`, so a scripted login is the shape a caller reads.
 *
 * `user_info` has twenty-three required fields and three nested objects. Every
 * spec in this repo that needed one wrote three of them and cast the rest away
 * with `as unknown as AuthResponse`, which accepts a `response_type` that is
 * not a `response_type` and a `roles` that is not an array — and the cast is
 * what a consumer copies out of our own specs.
 *
 * The defaults describe a successful password login by a full admin.
 *
 * **`user_info` follows `response_type`.** Middleware sends it on success and
 * not otherwise, so asking for `AUTH_ERR` or `OTP_REQUIRED` gets a response
 * without one rather than a successful login wearing a failure's label. Pass
 * `user_info` explicitly to override that in either direction — the builder
 * will not take it away from you, it only declines to add it.
 *
 * `reconnect_token` defaults to `null`, which is the v26+ shape for "no token
 * was minted". v25.10 does not declare the field at all, and this builder has
 * no way to say that: an override of literally `undefined` means "leave the
 * default alone", the same as everywhere else here. It costs nothing, because
 * every reader of the field treats absent and `null` alike — but do not read
 * `'reconnect_token' in response` as a claim about the version.
 *
 * `satisfies` rather than a cast, so the literal is checked: a field added to
 * `AuthResponse` fails here, which is the whole reason to have a builder.
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
    username: 'root',
    authenticator: 'LEVEL_1',
    reconnect_token: null,
    max_session_age: 300,
    max_inactivity: 300,
    urls: [],
    ...present(rest),
    ...(userInfo ? { user_info: userInfo } : {}),
  } satisfies AuthResponse;
}
