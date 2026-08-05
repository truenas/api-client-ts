import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'docs/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // `const { collection, ...change } = params` is how a key is dropped
      // from an object whose remaining shape matters; the named sibling is the
      // mechanism, not an oversight. This is the base rule's own default,
      // which typescript-eslint's recommended config drops.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Node-run build scripts (not part of the published sources).
    files: ['scripts/**/*.mjs', 'scripts/**/*.mts'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
);
