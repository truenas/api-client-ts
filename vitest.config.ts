import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));
const testDataDir = fileURLToPath(new URL('./test-data', import.meta.url));

export default defineConfig({
  // Resolve the tsconfig path aliases explicitly. vite-tsconfig-paths only maps
  // paths for files a tsconfig *includes*, and `*.spec.ts` are excluded from
  // tsconfig.json (they live in tsconfig.spec.json), so specs importing `@/…`
  // would not resolve. These aliases apply to specs and sources alike.
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${srcDir}/` },
      { find: /^test-data\//, replacement: `${testDataDir}/` },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts', 'scripts/**/*.spec.mts'],
  },
});
