import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({resolve:{alias:{
  '@semantic-atomic-css/core':resolve(__dirname,'../core/src/index.ts'),
  '@semantic-atomic-css/analyzer':resolve(__dirname,'../analyzer/src/index.ts'),
  '@semantic-atomic-css/devtools':resolve(__dirname,'../devtools/src/index.ts'),
  '@semantic-atomic-css/css-loader-bridge/dev-styles':resolve(__dirname,'../css-loader-bridge/src/devStyles.ts'),
  '@semantic-atomic-css/css-loader-bridge':resolve(__dirname,'../css-loader-bridge/src/index.ts')
}},test:{environment:'node',include:['test/**/*.test.ts']}});
