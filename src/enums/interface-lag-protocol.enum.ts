/**
 * Link aggregation protocols for bonding network interfaces.
 * Corresponds to middleware's lag_protocol field values.
 *
 * These protocols determine how multiple physical interfaces are combined
 * into a single logical interface for redundancy and/or increased bandwidth.
 */
export enum InterfaceLagProtocol {
  /**
   * LACP (Link Aggregation Control Protocol) - IEEE 802.3ad
   * Dynamic link aggregation with automatic failover and load balancing
   */
  Lacp = 'LACP',

  /**
   * Active-backup failover
   * One interface active, others standby. Provides redundancy but not load balancing.
   */
  Failover = 'FAILOVER',

  /**
   * Load balancing across all bonded interfaces
   * Distributes traffic based on configured hash policy
   */
  LoadBalance = 'LOADBALANCE',

  /**
   * Round-robin distribution
   * Distributes packets across interfaces in sequential order
   */
  RoundRobin = 'ROUNDROBIN',

  /**
   * No aggregation protocol configured
   */
  None = 'NONE',
}
