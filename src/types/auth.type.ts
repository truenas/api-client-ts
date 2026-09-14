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
   * Absent below v26. From v26 always present, and `null` when none was minted:
   * none was requested, the session used a one-time *password* (not 2FA), or it
   * is a 2FA login — `loginWithOtp` does not resend `login_options` on the
   * second step, a client-side gap that middleware would honour if closed.
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
