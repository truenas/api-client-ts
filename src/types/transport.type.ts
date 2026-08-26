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
