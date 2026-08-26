import { describe, expect, it } from 'vitest';
import { httpScheme, socketScheme, type ApplianceProtocol } from '@/types/transport.type';

describe('socketScheme', () => {
  it('maps the two supported protocols', () => {
    expect(socketScheme('https:')).toBe('wss:');
    expect(socketScheme('http:')).toBe('ws:');
  });

  /**
   * TypeScript rejects these, but the README shows callers casting
   * `location.protocol` — a `string` that is genuinely `file:` for a local page
   * and `chrome-extension:` in an extension origin. Getting a plaintext socket
   * out of that would put credentials on the wire with nothing raised.
   */
  it('falls back to wss for anything off-contract', () => {
    for (const value of ['file:', 'chrome-extension:', 'HTTPS:', 'https', '']) {
      expect(socketScheme(value as ApplianceProtocol), value).toBe('wss:');
    }
  });
});

describe('httpScheme', () => {
  it('maps the two supported protocols', () => {
    expect(httpScheme('https:')).toBe('https:');
    expect(httpScheme('http:')).toBe('http:');
  });

  /**
   * Without this the two halves disagree. An off-contract value left raw makes
   * `fetch` throw, which `classify` reports as a network error and the factory
   * reads as the v25.10.0 CORS case — so the caller gets a client silently
   * pinned to the wrong API version instead of an error naming the option.
   */
  it('falls back to https for anything off-contract', () => {
    for (const value of ['file:', 'chrome-extension:', 'HTTPS:', 'https', '']) {
      expect(httpScheme(value as ApplianceProtocol), value).toBe('https:');
    }
  });
});
