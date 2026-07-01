/**
 * Interface link state values.
 * Corresponds to middleware's InterfaceLinkState enum.
 *
 * These values indicate the operational state of a network interface's link.
 */
export enum InterfaceLinkState {
  /**
   * Link state is unknown or not applicable
   */
  Unknown = 'LINK_STATE_UNKNOWN',

  /**
   * Link is down - no carrier signal detected
   */
  Down = 'LINK_STATE_DOWN',

  /**
   * Link is up - carrier signal is active and operational
   */
  Up = 'LINK_STATE_UP',
}
