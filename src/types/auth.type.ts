import { UserRoleName } from '@/enums/user-role.enum';

export interface UserPreferences {
  language: string;
  lifetime: number;
}

export enum AuthResponseType {
  Success = 'SUCCESS',
  OtpRequired = 'OTP_REQUIRED',
  AuthErr = 'AUTH_ERR',
  Expired = 'EXPIRED',
  Redirect = 'REDIRECT',
}

export interface AuthResponse {
  response_type: AuthResponseType;
  username?: string;
  authenticator?: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
  /**
   * A token for re-authenticating without credentials.
   *
   * Absent below v26: `AuthRespSuccess` there declares only `response_type`,
   * `user_info` and `authenticator`. From v26 it is always present and is
   * `null` when no token was minted — because none was asked for, or because
   * the session cannot have one. Middleware refuses for a session authenticated
   * by a one-time *password* (`auth.generate_onetime_password`), which is not
   * the same thing as 2FA despite this codebase spelling 2FA "OTP" throughout.
   *
   * A 2FA account gets `null` for a different reason, and it is this client's
   * doing rather than the server's: the password request carrying the option is
   * answered `OTP_REQUIRED` before anything is minted, and `loginWithOtp` does
   * not send `login_options` on the second step. Middleware would honour it
   * there — `auth.login_ex_continue` re-enters `login_ex`, and a 2FA session
   * may hold a token — so this is a gap to close, not a limit to work around.
   */
  reconnect_token?: string | null;
  max_session_age?: number;
  max_inactivity?: number;
  urls?: string[];
  user_info?: {
    username: string;
    fullname: string;
    builtin: boolean;
    email: string | null;
    groups: number[];
    privilege: {
      roles: {
        $set: UserRoleName[];
      };
    };
    two_factor_auth_configured: boolean;
    immutable: boolean;
    sid: string;
    id: number;
    uid: number;
    gid: number;
    shell: string;
    home: string;
    locked: boolean;
    sudo: boolean;
    sudo_nopasswd: boolean;
    sudo_commands: string[];
    smb: boolean;
    group: {
      id: number;
      bsdgrp_builtin: boolean;
      bsdgrp_gid: number;
      bsdgrp_group: string;
      bsdgrp_sudo: boolean;
      bsdgrp_sudo_nopasswd: boolean;
      bsdgrp_sudo_commands: string[];
      bsdgrp_smb: boolean;
      bsdgrp_users: number[];
    };
    sshpubkey: string | null;
    attributes: {
      [key: string]: unknown;
      preferences: UserPreferences;
    };
  };
}
