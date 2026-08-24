import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSemanticAtomicCss } from '@semantic-atomic-css/rsbuild';

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const suite = process.env.GSS_FIXTURE_SUITE === 'preprocessor' ? 'preprocessor' : 'base';
const mode = process.env.GSS_FIXTURE_CSS_MODE === 'native' ? 'native' : 'semantic';
const suiteRoot = path.join(fixtureRoot, 'suites', suite);
const outputRoot = process.env.GSS_FIXTURE_OUT_DIR ?? path.join(fixtureRoot, 'dist', suite, mode);

export default defineConfig({
  plugins: [
    pluginSass({ sassLoaderOptions: { additionalData: '$fixture-runtime-gap: 3px;\n' } }),
    pluginLess({ lessLoaderOptions: { additionalData: '@fixture-runtime-radius: 9px;\n' } }),
    ...(mode === 'semantic'
      ? [
          pluginSemanticAtomicCss({
            core: { className: { strategy: 'readable' } },
            manifest: { enabled: suite === 'preprocessor' },
            report: { enabled: suite === 'preprocessor' },
            devtools: { enabled: true, pollIntervalMs: 250 }
          })
        ]
      : [])
  ],
  source: {
    entry: {
      index: process.env.GSS_FIXTURE_ENTRY ?? path.join(suiteRoot, 'src/main.js')
    }
  },
  html: {
    template: path.join(suiteRoot, 'index.html')
  },
  output: {
    distPath: {
      root: outputRoot
    },
    cssModules: {
      exportLocalsConvention: 'camelCaseOnly',
      localIdentName: 'fixture_[name]__[local]'
    },
    dataUriLimit: process.env.GSS_FIXTURE_INLINE_ASSETS === 'true' ? 10_000 : 0,
    ...(process.env.GSS_FIXTURE_ASSET_PREFIX
      ? { assetPrefix: process.env.GSS_FIXTURE_ASSET_PREFIX }
      : {}),
    ...(process.env.GSS_FIXTURE_CSS_SOURCE_MAP === 'true'
      ? { sourceMap: { css: true } }
      : {})
  },
  ...(process.env.GSS_FIXTURE_TARGET === 'node'
    ? { output: { target: 'node' } }
    : {}),
  ...(process.env.GSS_FIXTURE_NAMED_EXPORT === 'true'
    ? { output: { cssModules: { namedExport: true } } }
    : {}),
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience'
    }
  },
  tools: {
    cssLoader: {
      url: {
        filter: (url) => !url.startsWith('/')
      }
    }
  }
});
