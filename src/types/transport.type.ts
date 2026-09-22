/**
 * The scheme used to reach the appliance, in `location.protocol` form.
 *
 * Colon included, so a caller served *by the appliance* can pass
 * `location.protocol` unchanged. That equivalence only holds same-origin: this
 * value is spliced onto the hostname the client connects to, so a page served
 * from somewhere else must say what the appliance uses, not what it uses.
 */
export type ApplianceProtocol = 'http:' | 'https:';

/**
 * Both schemes fall back to the encrypted option rather than the plaintext one.
 *
 * TypeScript admits only the two members, but `createTrueNasClient` is a
 * published entry point and `location.protocol` is a `string` — genuinely
 * `file:` for a locally opened page, `chrome-extension:` in an extension.
 * Written the other way round, those would select `ws://` for credentials and
 * plaintext `http://` for discovery.
 */
export function httpScheme(protocol: ApplianceProtocol): 'http:' | 'https:' {
  return protocol === 'http:' ? 'http:' : 'https:';
}

/** As {@link httpScheme}, for the websocket half. */
export function socketScheme(protocol: ApplianceProtocol): 'ws:' | 'wss:' {
  return protocol === 'http:' ? 'ws:' : 'wss:';
}

/**
 * Where the connection points: the hostnames it races and the appliance's scheme.
 * Passed to `connection.setEndpoint()` to re-point a live client.
 */
export interface ConnectionEndpoint {
  /**
   * Hostnames to race, as for `createTrueNasClient`. Must not be empty.
   * Readonly so `connection.endpoint` can be spread back into `setEndpoint`.
   */
  hostnames: readonly string[];
  /** Defaults to the connection's current protocol. */
  protocol?: ApplianceProtocol;
}

/**
 * How the connection retries. Reconnecting never stops on its own — only a
 * refusal (1008), `setEnabled(false)` or `close()` stops it; these set its pace.
 */
export interface ReconnectOptions {
  /** Milliseconds between attempts that failed to open. Defaults to 10 000. */
  retryDelay?: number;
  /**
   * Retries per hostname before the connection reports an error state
   * (`hasConnectionError$`) and starts the next cycle. Defaults to 3.
   * `Infinity` reports none for attempts that fail to open; losing a live
   * socket still reports one until a socket opens again.
   */
  maxRetry?: number;
}

/** One socket closing, as `connection.closes$` reports it. */
export interface ConnectionClose {
  /** The WebSocket close code. */
  code: number;
  /** The server's reason text, verbatim; often empty. */
  reason: string;
  /** This client's rendering of the code (or of an HTTP status in the reason). */
  message: string;
  hostname: string;
  /** `false` for an attempt that never opened, `true` for a live socket lost. */
  wasOpen: boolean;
  /**
   * The appliance refused this client (1008, e.g. not in Allowed IP Addresses).
   * The connection does not retry after it; `setEnabled` or `setEndpoint` asks again.
   */
  refused: boolean;
}
