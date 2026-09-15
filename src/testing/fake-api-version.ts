import { SUPPORTED_API_VERSIONS } from '@/generated';
import type { SupportedApiVersion } from '@/generated';
import type { ApiVersion } from '@/types/api-version.type';
import { parseApiVersion } from '@/utils/api-version.utils';
import { present } from './present';

/**
 * Overrides for {@link fakeApiVersion}: the fields the parser would have
 * derived, for the versions it will not produce.
 */
export type FakeApiVersionOverrides = Partial<ApiVersion>;

/**
 * A parsed `ApiVersion`, built by the parser the client itself uses.
 *
 * Going through `parseApiVersion` is the point: the year/minor/patch split and
 * the websocket path are its rules, and writing them out here would be a
 * second statement free to drift. It returns `ApiVersion | null`, so this
 * throws on a string that does not parse rather than handing back a `null` a
 * spec then carries a non-null assertion for.
 *
 * `overrides` is for versions the parser will not produce — a compatibility
 * spec may want a year this package does not support — and is visible at the
 * call site rather than smuggled in through a string.
 */
export function fakeApiVersion(
  version: SupportedApiVersion | (string & {}) = SUPPORTED_API_VERSIONS[0],
  overrides: FakeApiVersionOverrides = {}
): ApiVersion {
  const parsed = parseApiVersion(version);
  if (!parsed) {
    throw new Error(
      `fakeApiVersion('${version}'): not a version this package parses. ` +
        'Expected vYY.MINOR.PATCH — v25.10.0, v27.0.0. For a version the ' +
        'parser rejects, pass one it accepts and override its fields.'
    );
  }

  return { ...parsed, ...present(overrides) };
}
