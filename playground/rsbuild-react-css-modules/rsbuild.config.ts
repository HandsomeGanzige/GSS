import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';
import { pluginSemanticAtomicCss } from '@semantic-atomic-css/rsbuild';

type PlaygroundCssMode = 'semantic' | 'native';

const cssMode = resolveCssMode(process.env.GSS_PLAYGROUND_CSS_MODE);

/**
 * 创建 Rsbuild React Pilot 配置，并让 semantic/native 共享同一份业务入口和原生 CSS 配置。
 *
 * @remarks
 * `index` 入口承载较完整的懒加载业务界面；`inspector` 入口集中观察多入口、跨模块 cascade 和
 * ICSS token。两种模式只在是否注册 GSS adapter 上存在差异。
 */
export default defineConfig({
  plugins: [
    pluginReact(),
    pluginSass({
      sassLoaderOptions: {
        additionalData: '$pilot-runtime-gap: 3px;\n$pilot-runtime-shell-padding: 28px;\n'
      }
    }),
    pluginLess({
      lessLoaderOptions: {
        additionalData: '@pilot-runtime-radius: 8px;\n'
      }
    }),
    ...(cssMode === 'semantic'
      ? [
          pluginSemanticAtomicCss({
            manifest: { enabled: true },
            report: { enabled: true }
          })
        ]
      : [])
  ],
  source: {
    entry: {
      index: './src/main.tsx',
      inspector: './src/inspector.tsx'
    },
    define: {
      __GSS_CSS_MODE__: JSON.stringify(cssMode)
    }
  },
  html: {
    title({ entryName }) {
      return entryName === 'inspector' ? 'GSS Rsbuild Contract Inspector' : 'GSS Rsbuild React Pilot';
    }
  },
  output: {
    distPath: {
      root: `dist/${cssMode}`
    },
    cssModules: {
      exportLocalsConvention: 'camelCase',
      localIdentName: 'pilot_[name]__[local]'
    },
    dataUriLimit: 0
  },
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience'
    }
  }
});

/** 解析命令行环境传入的 CSS 输出模式。 */
function resolveCssMode(value: string | undefined): PlaygroundCssMode {
  return value === 'native' ? 'native' : 'semantic';
}
