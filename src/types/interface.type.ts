import { InterfaceAddressFamily } from '@/enums/interface-address-family.enum';
import { InterfaceLacpRate } from '@/enums/interface-lacp-rate.enum';
import { InterfaceLagProtocol } from '@/enums/interface-lag-protocol.enum';
import { InterfaceLinkState } from '@/enums/interface-link-state.enum';
import { InterfaceType } from '@/enums/interface-type.enum';
import { InterfaceXmitHashPolicy } from '@/enums/interface-xmit-hash-policy.enum';
import { VrrpState } from '@/enums/vrrp-state.enum';

export interface InterfaceEntryAlias {
  type: InterfaceAddressFamily;
  /** The type of IP address (INET for IPv4, INET6 for IPv6). */
  address: string;
  /** The IP address value. */
  netmask: string | number;
  /** The network mask for the IP address, either as a string or CIDR notation integer. */
}

export interface InterfaceEntryStateAlias
  extends Omit<InterfaceEntryAlias, 'netmask'> {
  netmask?: string | number;
  broadcast?: string;
  /** Broadcast address for the network interface. */
}

export interface InterfaceVrrpConfig {
  address: string;
  /** Virtual IP address managed by VRRP. */
  state: VrrpState;
  /** VRRP state (MASTER, BACKUP, FAULT). */
}

export interface InterfaceEntryStatePort {
  name: string;
  /** The name of the port interface. */
  flags: string[];
  /** List of flags associated with the port. */
}

export interface InterfaceEntryState {
  name: string;
  /** Current name of the network interface. */
  orig_name: string;
  /** Original name of the network interface before any renaming. */
  description: string;
  /** Human-readable description of the network interface. */
  mtu: number;
  /** Maximum transmission unit size for the interface. */
  cloned: boolean;
  /** Whether the interface is a cloned/virtual interface. */
  flags: string[];
  /** List of interface flags indicating various states and capabilities. */
  nd6_flags: unknown[];
  /** IPv6 neighbor discovery flags. */
  capabilities: string[];
  /** List of hardware capabilities supported by the interface. */
  link_state: InterfaceLinkState;
  /** Current link state of the interface (up, down, etc.). */
  media_type: string;
  /** Type of media/connection for the interface. */
  media_subtype: string;
  /** Subtype of media/connection for the interface. */
  active_media_type: string;
  /** Currently active media type. */
  active_media_subtype: string;
  /** Currently active media subtype. */
  supported_media: string[];
  /** List of supported media types for the interface. */
  media_options?: string[] | null;
  /** Available media options for the interface. */
  link_address: string;
  /** MAC address of the interface. */
  permanent_link_address?: string | null;
  /** Permanent MAC address of the interface if different from current. */
  hardware_link_address: string;
  /** Hardware MAC address of the interface. */
  rx_queues?: number;
  /** Number of receive queues configured for the interface. */
  tx_queues?: number;
  /** Number of transmit queues configured for the interface. */
  aliases: InterfaceEntryStateAlias[];
  /** List of IP address aliases configured on the interface. */
  vrrp_config?: InterfaceVrrpConfig[] | null;
  /** VRRP (Virtual Router Redundancy Protocol) configuration for the interface. */
  protocol?: InterfaceLagProtocol | null;
  /** Link aggregation protocol used (LACP, FAILOVER, etc.). */
  ports?: InterfaceEntryStatePort[];
  /** List of ports that are members of this link aggregation group. */
  xmit_hash_policy?: InterfaceXmitHashPolicy | null;
  /** Transmit hash policy for load balancing in link aggregation. */
  lacpdu_rate?: InterfaceLacpRate | null;
  /** LACP data unit transmission rate. */
  parent?: string | null;
  /** Parent interface for VLAN configuration. */
  tag?: number | null;
  /** VLAN tag number. */
  pcp?: number | null;
  /** Priority Code Point for VLAN traffic prioritization. */
}

export interface InterfaceEntry {
  id: string;
  /** Unique identifier for the network interface. */
  name: string;
  /** Name of the network interface. */
  fake: boolean;
  /** Whether this is a fake/simulated interface for testing purposes. */
  type: InterfaceType;
  /** Type of interface (PHYSICAL, BRIDGE, LINK_AGGREGATION, VLAN, etc.). */
  state: InterfaceEntryState;
  /** Current runtime state information for the interface. */
  aliases: InterfaceEntryAlias[];
  /** List of IP address aliases configured on the interface. */
  ipv4_dhcp: boolean;
  /** Whether IPv4 DHCP is enabled for automatic IP address assignment. */
  ipv6_auto: boolean;
  /** Whether IPv6 autoconfiguration is enabled. */
  description: string;
  /** Human-readable description of the interface. */
  mtu?: number | null;
  /** Maximum transmission unit size for the interface. */
  vlan_parent_interface?: string | null;
  /** Parent interface for VLAN configuration. */
  vlan_tag?: number | null;
  /** VLAN tag number for VLAN interfaces. */
  vlan_pcp?: number | null;
  /** Priority Code Point for VLAN traffic prioritization. */
  lag_protocol?: InterfaceLagProtocol;
  /** Link aggregation protocol. */
  lag_ports?: string[];
  /** List of ports in the link aggregation group. */
  xmit_hash_policy?: InterfaceXmitHashPolicy | null;
  /** Transmit hash policy for link aggregation. */
  lacpdu_rate?: InterfaceLacpRate | null;
  /** LACP data unit transmission rate. */
  disable_offload_capabilities?: boolean;
  /** Whether to disable hardware offload capabilities. */
  mtu_configured?: number | null;
  /** Configured MTU size (may differ from actual). */
  enabled: boolean;
  /** Whether the interface is enabled. */
  failover_critical?: boolean;
  /** Whether this interface is critical for High Availability failover. */
  failover_vhid?: number | null;
  /** Virtual Host ID for CARP-based failover (FreeBSD). */
  failover_group?: number;
  /** Failover group number for organizing interfaces in HA configurations. */
  failover_aliases?: InterfaceEntryAlias[];
  /** List of IP aliases for the standby/backup controller in HA configurations. */
  failover_virtual_aliases?: InterfaceEntryAlias[];
  /** List of virtual IP aliases (VIPs) that float between controllers in HA configurations. */
}
