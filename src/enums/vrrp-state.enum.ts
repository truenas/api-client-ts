/**
 * VRRP (Virtual Router Redundancy Protocol) state values.
 * Used in High Availability configurations to indicate controller state.
 */
export enum VrrpState {
  Master = 'MASTER',
  Backup = 'BACKUP',
  Fault = 'FAULT',
}
