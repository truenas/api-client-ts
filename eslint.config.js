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
      // mechanism, not an oversight. `ignoreRestSiblings` is `false` by
      // default in both the core rule and the typescript-eslint extension, so
      // this turns it on rather than restoring it — without this block the
      // rest-sibling above is reported as an unused variable.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Node-run scripts (not part of the published sources): the generator, and
    // the CI helpers under .github/scripts.
    files: ['scripts/**/*.mjs', 'scripts/**/*.mts', '.github/scripts/**/*.mjs'],
    languageOptions: {
      // `fetch` is global from Node 18; the CI helpers call the GitHub API with
      // it rather than pulling in a client.
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
      },
    },
  },
);
