import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import maxCommentLines from '@truenas/common-typescript/eslint/rules/max-comment-lines.mjs';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'docs/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      truenas: { rules: { 'max-comment-lines': maxCommentLines } },
    },
    rules: {
      'truenas/max-comment-lines': ['error', { max: 10, skipBlankLines: true }],
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
    // Node-run scripts, not part of the published sources: the generator and
    // the release-config checks under scripts/.
    files: ['scripts/**/*.mjs', 'scripts/**/*.mts'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
  {
    // Generator output; shorten comments in the generator instead.
    files: ['src/generated/**'],
    rules: { 'truenas/max-comment-lines': 'off' },
  },
);
