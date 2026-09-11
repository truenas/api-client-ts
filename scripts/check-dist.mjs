// Post-build sanity checks on the emitted `dist/`:
//  1. no unresolved `@/` path-alias specifier leaked into the shipped code/types
//     (source maps legitimately embed the original `@/` source, so they are excluded);
//  2. both entries load in both formats and expose what they promise;
//  3. the testing entry's client is the *same* class the main entry exports.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const emitted = [
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/index.d.cts',
  'dist/testing/index.js',
  'dist/testing/index.cjs',
  'dist/testing/index.d.ts',
  'dist/testing/index.d.cts',
];

let failed = false;

// 1. alias-leak guard
// Matches `from '@/…'`, `import '@/…'`, and the `import("@/…")` / `require('@/…')`
// forms a `.d.ts` emit can use for un-inlined types.
const aliasSpecifier = /(?:from|import|require)\s*\(?\s*['"]@\//;
for (const file of emitted) {
  const source = readFileSync(file, 'utf8');
  if (aliasSpecifier.test(source)) {
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

// 2. ESM + CJS smoke load, both entries
const require = createRequire(import.meta.url);
const load = async (path) =>
  path.endsWith('.cjs')
    ? require(resolve(path))
    : await import(pathToFileURL(resolve(path)).href);

const builds = {
  ESM: { main: await load('dist/index.js'), testing: await load('dist/testing/index.js') },
  CJS: { main: await load('dist/index.cjs'), testing: await load('dist/testing/index.cjs') },
};

for (const [format, { main, testing }] of Object.entries(builds)) {
  if (typeof main.createTrueNasClient !== 'function') {
    console.error(`✗ ${format} build does not export createTrueNasClient`);
    process.exit(1);
  }
  if (typeof testing.createFakeClient !== 'function') {
    console.error(`✗ ${format} testing entry does not export createFakeClient`);
    process.exit(1);
  }
}
console.log('✓ both entries load in ESM and CJS and export what they promise');

// 3. One copy of the client, not two.
//
// Two entries built from one source can each carry their own copy of every
// class they use. The values still compare equal — the enums are strings — so
// nothing looks wrong until a consumer writes
// `expect(client).toBeInstanceOf(TrueNasApiClient)` against a fake built from
// the other entry and is told it is not one.
//
// This is what `splitting: true` in tsup.config.ts buys, and it is not the
// default for CJS: without it the CJS testing entry bundles its own client and
// this check fails while every other check here passes.
for (const [format, { main, testing }] of Object.entries(builds)) {
  const client = testing.createFakeClient({ version: 'v27.0.0' });
  const shared = client instanceof main.TrueNasApiClient;
  client.connection.close();

  if (!shared) {
    console.error(
      `✗ ${format}: a client from the testing entry is not an instance of the ` +
        'main entry\'s TrueNasApiClient — the two entries bundled separate copies'
    );
    process.exit(1);
  }
}
console.log('✓ both entries share one copy of the client classes');
