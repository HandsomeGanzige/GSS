import { defineConfig } from 'vitest/config';

/** analyzer 包的 Vitest 配置。 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
});
