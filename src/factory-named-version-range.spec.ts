/**
 * The named-version path still range-checks, pinned in its own file because
 * doing so needs `@/config/api-version.config` mocked — `MAX_SUPPORTED_VERSION`
 * matches the newest generated version today, so the case this guards cannot be
 * reached without moving it.
 *
 * The case is real rather than theoretical. `MAX` is a hand-written literal
 * (deliberately, see that config: generating types for a year does not write a
 * client for it), so a regeneration can add a version that is nameable here,
 * promised by the derived overload, and has no client behind it. Unmocked, the
 * check this pins is deletable with the whole suite still green — which is how
 * it would be lost.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/api-version.config', async () => {
  // MIN and FALLBACK are derived the way the real config derives MIN, so
  // raising `--min-version` moves this mock with it. Restating them as literals
  // would leave the mock behind silently, still asserting a client is built for
  // a version the real config had started rejecting.
  const { SUPPORTED_API_VERSIONS } = await import('@/generated');
  return {
    apiVersionConfig: {
      MIN_SUPPORTED_VERSION: SUPPORTED_API_VERSIONS[0],
      // Behind the newest generated version, which is what a regeneration does.
      MAX_SUPPORTED_VERSION: 'v26.0.0',
      FALLBACK_VERSION: SUPPORTED_API_VERSIONS[0],
    },
  };
});

const { createTrueNasClient } = await import('./factory');
const { VersionTooNewError } = await import('@/errors/version-discovery.errors');

describe('naming a version above the supported ceiling', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('is refused with the same typed error discovery raises', async () => {
    const call = createTrueNasClient({
      uuid: 'uuid-1234',
      hostnames: ['box'],
      enabled: false,
      version: 'v27.0.0',
    });

    // Typed, not a bare Error: a caller catching VersionTooNewError from the
    // discovery path catches this too. Without the check it reaches client
    // selection and throws `Error: No client implementation for API version`.
    await expect(call).rejects.toBeInstanceOf(VersionTooNewError);
    // And it refuses before contacting anything — declining discovery still means declining it.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still builds a version at or below the ceiling', async () => {
    const client = await createTrueNasClient({
      uuid: 'uuid-1234', hostnames: ['box'], enabled: false, version: 'v26.0.0',
    });

    expect(client.version.version).toBe('v26.0.0');
    await client.close();
  });
});
