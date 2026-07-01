/**
 * TrueNAS System User Account (from TrueNAS middleware)
 */
export interface TrueNasUser {
  /** User ID */
  id: number;
  /** User ID number */
  uid: number;
  /** Username */
  username: string;
  /** User's full name */
  full_name: string;
  /** Home directory path */
  home: string;
  /** Login shell */
  shell: string;
  /** Primary group ID */
  group: {
    id: number;
    bsdgrp_gid: number;
    bsdgrp_group: string;
  };
  /** Additional group memberships */
  groups: number[];
  /** Email address */
  email: string | null;
  /** Password disabled flag */
  password_disabled: boolean;
  /** Locked account flag */
  locked: boolean;
  /** Microsoft account flag */
  microsoft_account: boolean;
  /** Sudo access without password */
  sudo_nopasswd: boolean;
  /** Sudo commands allowed */
  sudo_commands: string[];
  /** SSH public key for authorized_keys */
  sshpubkey: string | null;
  /** Account attributes */
  attributes: Record<string, unknown>;
  /** Immutable account (cannot be modified) */
  immutable: boolean;
  /** Built-in system user */
  builtin: boolean;
  /** SMB hash */
  smb: boolean;
}

/**
 * TrueNAS System User update parameters
 */
export interface TrueNasUserUpdate {
  /** User ID number (cannot be changed for existing users) */
  uid?: number;
  /** Username (cannot be changed for built-in users) */
  username?: string;
  /** User's full name */
  full_name?: string;
  /** Home directory path */
  home?: string;
  /** Login shell */
  shell?: string;
  /** Primary group ID */
  group?: number;
  /** Additional group memberships */
  groups?: number[];
  /** Email address */
  email?: string | null;
  /** Password (plain text, will be hashed) */
  password?: string;
  /** Password disabled flag */
  password_disabled?: boolean;
  /** Locked account flag */
  locked?: boolean;
  /** Microsoft account flag */
  microsoft_account?: boolean;
  /** Sudo access without password */
  sudo_nopasswd?: boolean;
  /** Sudo commands allowed */
  sudo_commands?: string[];
  /** SSH public key for authorized_keys */
  sshpubkey?: string | null;
  /** SMB hash */
  smb?: boolean;
}
