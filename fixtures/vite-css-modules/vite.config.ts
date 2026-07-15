import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { semanticAtomicCss } from '@semantic-atomic-css/vite';
import { defineConfig, type PluginOption, type UserConfig } from 'vite';

type FixtureSuite = 'base' | 'preprocessor';
type FixtureCssMode = 'semantic' | 'native';

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));

/** 根据当前 suite 与 CSS 模式创建真实 Vite 消费方配置。 */
export default defineConfig(() => {
  const suite = resolveSuite(process.env.GSS_FIXTURE_SUITE);
  const cssMode = resolveCssMode(process.env.GSS_FIXTURE_CSS_MODE);
  const preprocessor = suite === 'preprocessor';

  return {
    root: path.join(fixtureRoot, 'suites', suite),
    plugins: createPlugins(cssMode, preprocessor),
    ...(preprocessor ? createPreprocessorConfig() : {}),
    build: preprocessor ? { assetsInlineLimit: 0 } : undefined
  };
});

/** semantic 模式启用 adapter，native 模式只保留 Vite 与 React。 */
function createPlugins(cssMode: FixtureCssMode, preprocessor: boolean): PluginOption[] {
  if (cssMode === 'native') {
    return [react()];
  }

  // pnpm 会因 Sass/Less 可选 peer 为 fixture 与 adapter 实例化两份 Vite 类型身份，
  // 运行时仍由当前 fixture 的单一 Vite 管线调用该插件，因此只在消费方边界归一化类型。
  const semanticPlugin = semanticAtomicCss(
    preprocessor
      ? {
          manifest: { enabled: true },
          report: { enabled: true }
        }
      : undefined
  ) as unknown as PluginOption;

  return [
    semanticPlugin,
    react()
  ];
}

/** 只在 preprocessor suite 中开启 Sass/Less 与资源验收所需配置。 */
function createPreprocessorConfig(): Pick<UserConfig, 'css'> {
  return {
    css: {
      modules: {
        localsConvention: 'camelCaseOnly',
        generateScopedName: 'fixture_[name]__[local]'
      },
      preprocessorOptions: {
        scss: {
          additionalData: '$fixture-runtime-gap: 3px;\n'
        },
        less: {
          additionalData: '@fixture-runtime-radius: 9px;\n'
        }
      }
    }
  };
}

/** 未指定时使用基础 suite，非法值直接失败避免跑错验收。 */
function resolveSuite(value: string | undefined): FixtureSuite {
  if (value === undefined || value === 'base') return 'base';
  if (value === 'preprocessor') return 'preprocessor';
  throw new Error(`不支持的 fixture suite: ${value}`);
}

/** 未指定时使用 semantic，非法值直接失败。 */
function resolveCssMode(value: string | undefined): FixtureCssMode {
  if (value === undefined || value === 'semantic') return 'semantic';
  if (value === 'native') return 'native';
  throw new Error(`不支持的 fixture CSS 模式: ${value}`);
}
