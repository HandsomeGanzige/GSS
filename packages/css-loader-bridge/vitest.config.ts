import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({ test: { environment: 'node' }, resolve: { alias: {
  '@semantic-atomic-css/core': path.resolve(here, '../core/src/index.ts'),
  '@semantic-atomic-css/analyzer': path.resolve(here, '../analyzer/src/index.ts')
} } });
