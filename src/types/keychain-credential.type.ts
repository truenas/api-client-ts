export interface SSHKeyPair {
  /** SSH private key in OpenSSH format. `null` if only public key is provided. */
  private_key: string | null;
  /** Can be omitted and automatically derived from the private key. */
  public_key: string | null;
}

export interface SSHCredentials {
  /** SSH server hostname or IP address. */
  host: string;
  /** SSH server port number. */
  port: number;
  /** SSH username for authentication. */
  username: string;
  /** Keychain Credential ID. */
  private_key: number;
  /** Can be discovered with keychaincredential.remote_ssh_host_key_scan. */
  remote_host_key: string;
  /** Connection timeout in seconds for SSH connections. */
  connect_timeout: number;
}

/** Minimal SSH credentials containing only the host information needed for target system identification */
export interface MinimalSshCredentials {
  /** SSH server hostname or IP address. */
  host: string;
}

export interface KeychainCredentialEntry {
  /** Unique identifier for this keychain credential. */
  id: number;
  /** Distinguishes this Keychain Credential from others. */
  name: string;
  /** Type of credential stored in the keychain. */
  type: 'SSH_KEY_PAIR' | 'SSH_CREDENTIALS';
  /** Credential-specific configuration and authentication data. */
  attributes: SSHKeyPair | SSHCredentials;
}

export interface SSHKeyPairEntry extends KeychainCredentialEntry {
  /** Keychain credential type identifier for SSH key pairs. */
  type: 'SSH_KEY_PAIR';
  /** SSH key pair attributes including public and private keys. */
  attributes: SSHKeyPair;
}

export interface SSHCredentialsEntry extends KeychainCredentialEntry {
  /** Keychain credential type identifier for SSH connection credentials. */
  type: 'SSH_CREDENTIALS';
  /** SSH connection attributes including host, authentication, and connection settings. */
  attributes: SSHCredentials;
}

/** Minimal keychain credential entry containing only host information for target system identification */
export interface MinimalKeychainCredentialEntry {
  /** Unique identifier for this keychain credential. */
  id: number;
  /** Type of credential stored in the keychain. */
  type: 'SSH_KEY_PAIR' | 'SSH_CREDENTIALS';
  /** Minimal credential attributes containing only the host information. */
  attributes: MinimalSshCredentials;
}

/** Parameters for scanning remote SSH host key */
export interface RemoteSshHostKeyScanParams {
  /** SSH server hostname or IP address */
  host: string;
  /** SSH server port number (default: 22) */
  port?: number;
  /** Connection timeout in seconds (default: 10) */
  connect_timeout?: number;
}

/** Parameters for creating a keychain credential */
export interface KeychainCredentialCreate {
  /** Credential name */
  name: string;
  /** Credential type */
  type: 'SSH_KEY_PAIR' | 'SSH_CREDENTIALS';
  /** Credential attributes (varies by type) */
  attributes: SSHKeyPair | SSHCredentials;
}
