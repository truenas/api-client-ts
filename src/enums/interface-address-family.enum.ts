/**
 * Address family types for network interface aliases.
 * Corresponds to middleware's AddressFamily enum.
 *
 * These values indicate the type of address contained in an interface alias.
 */
export enum InterfaceAddressFamily {
  /**
   * Unix domain socket address (rarely used in network interfaces)
   */
  Unix = 'UNIX',

  /**
   * IPv4 address (Internet Protocol version 4)
   */
  Inet = 'INET',

  /**
   * IPv6 address (Internet Protocol version 6)
   */
  Inet6 = 'INET6',

  /**
   * Link layer address (MAC address)
   */
  Link = 'LINK',
}
