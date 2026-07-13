// Post-build sanity checks on the emitted `dist/`:
//  1. no unresolved `@/` path-alias specifier leaked into the shipped code/types
//     (source maps legitimately embed the original `@/` source, so they are excluded);
//  2. both the ESM and CJS builds load and expose the public entry point.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const emitted = [
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/index.d.cts',
];

let failed = false;

// 1. alias-leak guard
for (const file of emitted) {
  const source = readFileSync(file, 'utf8');
  if (/from ['"]@\//.test(source)) {
    console.error(`✗ ${file} contains an unresolved '@/' import specifier`);
    failed = true;
  }
}
if (failed) {
  console.error(
    "The '@/' path alias did not inline during bundling — the package would be unpublishable."
  );
  process.exit(1);
}
console.log('✓ no unresolved @/ alias in emitted dist');

// 2. ESM + CJS smoke load
const esm = await import(pathToFileURL(resolve('dist/index.js')).href);
const require = createRequire(import.meta.url);
const cjs = require(resolve('dist/index.cjs'));

for (const [format, mod] of [
  ['ESM', esm],
  ['CJS', cjs],
]) {
  if (typeof mod.createTrueNasClient !== 'function') {
    console.error(`✗ ${format} build does not export createTrueNasClient`);
    process.exit(1);
  }
}
console.log('✓ ESM + CJS builds both export createTrueNasClient');
