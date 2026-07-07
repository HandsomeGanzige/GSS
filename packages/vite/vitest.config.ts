import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/** Vite adapter 测试配置，workspace 包指向源码以避免依赖预构建 dist。 */
export default defineConfig({
  resolve: {
    alias: {
      '@semantic-atomic-css/core': resolve(__dirname, '../core/src/index.ts'),
      '@semantic-atomic-css/analyzer': resolve(__dirname, '../analyzer/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
});
