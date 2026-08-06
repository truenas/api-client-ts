import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'docs/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node-run scripts (not part of the published sources): the generator, and
    // the CI helpers under .github/scripts.
    files: ['scripts/**/*.mjs', 'scripts/**/*.mts', '.github/scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' },
    },
  },
);
