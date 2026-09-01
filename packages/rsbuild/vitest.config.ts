import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/** Rsbuild adapter 测试直接指向 workspace 源码，避免依赖预构建 dist。 */
export default defineConfig({
  resolve: {
    alias: {
      '@semantic-atomic-css/core': resolve(__dirname, '../core/src/index.ts'),
      '@semantic-atomic-css/analyzer': resolve(__dirname, '../analyzer/src/index.ts'),
      '@semantic-atomic-css/css-loader-bridge/dev-styles': resolve(__dirname, '../css-loader-bridge/src/devStyles.ts'),
      '@semantic-atomic-css/css-loader-bridge': resolve(__dirname, '../css-loader-bridge/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
});
