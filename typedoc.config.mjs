// @ts-check
import { OptionDefaults } from 'typedoc';

/** @type {Partial<import('typedoc').TypeDocOptions>} */
export default {
  entryPoints: ['src/index.ts'],
  out: 'docs',
  readme: 'README.md',
  excludeInternal: true,
  excludePrivate: true,
  categorizeByGroup: true,
  navigationLinks: {
    GitHub: 'https://github.com/truenas/api-client-ts',
  },
  validation: {
    // The generated API types are reachable through the per-version
    // namespaces (`v26_0_0.PoolEntry`) rather than re-exported flat from the
    // barrel, so public signatures reference many types TypeDoc considers
    // "not exported". That is intentional — a flat re-export would collide
    // across versions.
    notExported: false,
    invalidLink: true,
    notDocumented: false,
  },
  // Tags in the generated API types: @roles (RBAC roles per method/event),
  // @minItems/@maxItems (json-schema-to-typescript constraint annotations),
  // @realm (verbatim text in a middleware docstring). Spread the defaults:
  // setting blockTags replaces the list.
  blockTags: [...OptionDefaults.blockTags, '@roles', '@minItems', '@maxItems', '@realm'],
  treatWarningsAsErrors: true,
};
