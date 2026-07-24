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
    // ~30 types are referenced by public signatures (ApiCallDirectory etc.)
    // but intentionally not re-exported from the barrel; re-enable if the
    // public surface is ever widened to include them.
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
