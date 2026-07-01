/**
 * Transmit hash policy for link aggregation load balancing.
 * Corresponds to middleware's xmit_hash_policy field values.
 *
 * Determines which packet header fields are used to calculate the hash
 * for distributing traffic across bonded interfaces.
 */
export enum InterfaceXmitHashPolicy {
  /**
   * Layer 2 hashing - uses source and destination MAC addresses
   * Best for simple scenarios where traffic patterns are consistent
   */
  Layer2 = 'LAYER2',

  /**
   * Layer 2+3 hashing - uses MAC addresses and IP addresses
   * Better distribution for multi-subnet environments
   */
  Layer2Plus3 = 'LAYER2+3',

  /**
   * Layer 3+4 hashing - uses MAC, IP, and TCP/UDP port information
   * Optimal distribution for diverse traffic patterns and multiple connections
   */
  Layer3Plus4 = 'LAYER3+4',
}
