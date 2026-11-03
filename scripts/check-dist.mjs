// Post-build sanity checks on the emitted `dist/`:
//  1. no unresolved `@/` path-alias specifier leaked into the shipped code/types
//     (source maps legitimately embed the original `@/` source, so they are excluded);
//  2. both entries load in both formats and expose what they promise;
//  3. the testing entry's client is the *same* class the main entry exports;
//  4. the version namespaces' enums are values in the declarations, not types only.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Everything shipped, found rather than listed.
//
// This was a list of the eight entry files — two entries, two formats, code
// and types — which was the whole output until `splitting: true` arrived.
// Splitting leaves `dist/index.js` an 858-byte re-export stub and puts the
// code — and, more to the point, the types both entries share — in
// content-hashed chunks whose names no list can carry. A leak in one of those
// passed this check in silence, which is worse than not having it: the script
// printed a guarantee it had stopped enforcing.
//
// `.map` files are excluded by the extension filter rather than by name: a
// source map legitimately embeds the original `@/` source.
const emitted = readdirSync('dist', { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.(?:js|cjs|mjs|d\.ts|d\.cts|d\.mts)$/.test(file))
  .map((file) => `dist/${file}`);

let failed = false;

// A glob that matches nothing passes every check under it. The floor is the
// two entries in two formats plus their four type files.
if (emitted.length < 8) {
  console.error(
    `✗ only ${emitted.length} emitted file(s) found under dist/ — expected at ` +
      'least the two entries in both formats, with their types'
  );
  process.exit(1);
}

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
  // No version: `createFakeClient` defaults to the oldest supported one, so
  // this keeps working when the supported set moves rather than failing
  // with an unhandled rejection about a version that has been dropped.
  const client = testing.createFakeClient();
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

// 4. The version namespaces' enums are values in the declarations too.
//
// The runtime namespaces carry each enum's const object, so
// `v28_0_0.Aclmode.Passthrough` works when run. The bundled `.d.ts` used to
// declare every namespace member as a type only, so the same line did not
// compile and consumers kept their own copy of each enum.
// `fix-namespace-enums.mjs` restores them after tsup; this compiles a probe
// that reads every enum the runtime namespaces carry, through both entries'
// declarations, so the day the bundler's output changes shape the build
// fails here rather than shipping types-only enums again.
const enumReads = Object.keys(builds.ESM.main)
  .filter((name) => /^v\d+_\d+_\d+$/.test(name))
  .flatMap((ns) =>
    Object.entries(builds.ESM.main[ns])
      .filter(([, value]) => value !== null && typeof value === 'object')
      .map(([name, value]) => `${ns}.${name}[${JSON.stringify(Object.keys(value)[0])}]`)
  );
if (enumReads.length === 0) {
  console.error('✗ no enum const objects found in the runtime version namespaces');
  process.exit(1);
}

// `process.exit` inside the `try` would skip the `finally` and leave the probe behind.
let diagnostics = [];
const probeDir = mkdtempSync(resolve('.check-dist-probe-'));
try {
  const names = [...new Set(enumReads.map((read) => read.split('.')[0]))].join(', ');
  const body = `export const reads: unknown[] = [\n  ${enumReads.join(',\n  ')},\n];\n`;
  const distPath = resolve('dist').replaceAll('\\', '/');
  writeFileSync(
    resolve(probeDir, 'esm.mts'),
    `import { ${names} } from '${distPath}/index.js';\n${body}`
  );
  writeFileSync(
    resolve(probeDir, 'cjs.cts'),
    `import { ${names} } from '${distPath}/index.cjs';\n${body}`
  );
  const program = ts.createProgram(
    [resolve(probeDir, 'esm.mts'), resolve(probeDir, 'cjs.cts')],
    {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
    }
  );
  diagnostics = ts.getPreEmitDiagnostics(program);
} finally {
  rmSync(probeDir, { recursive: true, force: true });
}
if (diagnostics.length > 0) {
  console.error(
    ts.formatDiagnostics(diagnostics.slice(0, 10), {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    })
  );
  console.error(
    `✗ ${diagnostics.length} error(s) reading the version namespaces' enums as ` +
      'values through the declarations — did fix-namespace-enums.mjs run after tsup?'
  );
  process.exit(1);
}
console.log(
  `✓ ${enumReads.length} enum reads compile through the namespaces in ESM and CJS declarations`
);
