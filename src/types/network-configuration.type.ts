/**
 * TrueNAS Network Configuration
 * Response from network.configuration.config middleware endpoint
 */
export interface NetworkConfiguration {
  /** Unique identifier for the network configuration */
  id: number;
  /** System hostname (short name without domain) */
  hostname: string;
  /** DNS domain name */
  domain: string;
  /** IPv4 default gateway address */
  ipv4gateway: string;
  /** IPv6 default gateway address */
  ipv6gateway: string;
  /** Primary DNS nameserver */
  nameserver1: string;
  /** Secondary DNS nameserver */
  nameserver2: string;
  /** Tertiary DNS nameserver */
  nameserver3: string;
  /** HTTP proxy server URL */
  httpproxy: string;
  /** Custom hostname to IP mappings (hosts file entries) */
  hosts: string;
  /** Additional domain search paths */
  domains: string[];
  /** Service announcement configuration */
  service_announcement: {
    /** Enable NetBIOS name service */
    netbios: boolean;
    /** Enable multicast DNS (Bonjour) */
    mdns: boolean;
    /** Enable Web Services Discovery */
    wsd: boolean;
  };
  /** Network activity restrictions */
  activity: {
    /** Activity restriction type (ALLOW or DENY) */
    type: string;
    /** List of restricted network activities */
    activities: string[];
  };
  /** Hostname with .local suffix for mDNS */
  hostname_local: string;
  /** Runtime network state (may differ from configured values) */
  state: {
    /** Active IPv4 gateway */
    ipv4gateway: string;
    /** Active IPv6 gateway */
    ipv6gateway: string;
    /** Active primary nameserver */
    nameserver1: string;
    /** Active secondary nameserver */
    nameserver2: string;
    /** Active tertiary nameserver */
    nameserver3: string;
    /** Active custom host mappings */
    hosts: string;
  };
}
