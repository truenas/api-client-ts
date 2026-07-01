/**
 * Network interface types.
 * Corresponds to middleware's InterfaceType enum.
 *
 * These values classify the type/role of a network interface.
 */
export enum InterfaceType {
  /**
   * Bridge interface - software bridge connecting multiple network segments
   */
  Bridge = 'BRIDGE',

  /**
   * Link aggregation (bonding) interface - combines multiple physical interfaces
   */
  LinkAggregation = 'LINK_AGGREGATION',

  /**
   * Physical network interface - actual hardware NIC
   */
  Physical = 'PHYSICAL',

  /**
   * Unknown interface type
   */
  Unknown = 'UNKNOWN',

  /**
   * VLAN (Virtual LAN) interface - 802.1Q tagged virtual interface
   */
  Vlan = 'VLAN',
}
