/**
 * LACP data unit transmission rate.
 * Corresponds to middleware's lacpdu_rate field values.
 *
 * Controls how frequently LACP packets are exchanged between bonded interfaces
 * for monitoring link health and detecting failures.
 */
export enum InterfaceLacpRate {
  /**
   * Send LACP packets every 30 seconds
   * Standard link monitoring interval, suitable for most deployments
   */
  Slow = 'SLOW',

  /**
   * Send LACP packets every 1 second
   * Rapid link failure detection for mission-critical applications
   */
  Fast = 'FAST',
}
