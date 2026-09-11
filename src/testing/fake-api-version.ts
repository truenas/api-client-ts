import { SUPPORTED_API_VERSIONS } from '@/generated';
import type { SupportedApiVersion } from '@/generated';
import type { ApiVersion } from '@/types/api-version.type';
import { parseApiVersion } from '@/utils/api-version.utils';

/**
 * A parsed `ApiVersion`, built by the parser the client itself uses.
 *
 * `parseApiVersion` returns `ApiVersion | null`, so a spec that wants one
 * writes `parseApiVersion('v27.0.0')!` and carries a non-null assertion for a
 * string it can see is fine. This throws on a string that does not parse
 * instead, which puts the failure at the fixture rather than at whatever
 * dereferences the `null` three calls later.
 *
 * Going through the parser is the point: the year/minor/patch split and the
 * websocket path are its rules, and a fixture that wrote them out by hand
 * would be a second statement of them, free to drift.
 *
 * `overrides` is for the versions the parser will not produce — a spec about
 * compatibility handling may want a year the package does not support, or a
 * websocket path the version does not imply. Deliberate, and visible at the
 * call site rather than smuggled in through a string.
 */
export function fakeApiVersion(
  version: SupportedApiVersion | (string & {}) = SUPPORTED_API_VERSIONS[0],
  overrides: Partial<ApiVersion> = {}
): ApiVersion {
  const parsed = parseApiVersion(version);
  if (!parsed) {
    throw new Error(
      `fakeApiVersion('${version}'): not a version this package parses. ` +
        'Expected vYY.MINOR.PATCH — v25.10.0, v27.0.0. Pass overrides if you ' +
        'need a version the parser rejects.'
    );
  }

  return { ...parsed, ...overrides };
}
