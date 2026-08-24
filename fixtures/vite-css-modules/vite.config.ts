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

/**
 * 根据 CSS 模式创建 fixture 插件列表。
 *
 * @param cssMode - semantic 模式启用 adapter，native 模式仅保留 React 插件。
 * @param preprocessor - 是否开启 manifest/report 以验收预处理器输出。
 * @returns 交给 Vite 的插件列表；adapter 始终位于 React 插件之前。
 */
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
          report: { enabled: true },
          devtools: { enabled: true, pollIntervalMs: 250 }
        }
      : { devtools: { enabled: true, pollIntervalMs: 250 } }
  ) as unknown as PluginOption;

  return [
    semanticPlugin,
    react()
  ];
}

/**
 * 创建 Sass/Less 与资源验收所需的 Vite CSS 配置。
 *
 * @returns 只包含 css 字段的预处理器配置片段。
 * @remarks scoped name 与 localsConvention 是 native/semantic 对照成立的共同输入，不应在 adapter 中重复实现。
 */
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

/**
 * 解析 fixture suite，未指定时使用基础场景。
 *
 * @param value - 环境变量提供的 suite 值。
 * @returns 已验证的 fixture suite。
 * @throws 当值不属于 base 或 preprocessor 时抛出，避免静默跑错验收。
 */
function resolveSuite(value: string | undefined): FixtureSuite {
  if (value === undefined || value === 'base') return 'base';
  if (value === 'preprocessor') return 'preprocessor';
  throw new Error(`不支持的 fixture suite: ${value}`);
}

/**
 * 解析 fixture CSS 模式，未指定时使用 semantic。
 *
 * @param value - 环境变量提供的 CSS 模式。
 * @returns 已验证的 semantic 或 native 模式。
 * @throws 当值不受支持时抛出，避免误把非法模式当作对照结果。
 */
function resolveCssMode(value: string | undefined): FixtureCssMode {
  if (value === undefined || value === 'semantic') return 'semantic';
  if (value === 'native') return 'native';
  throw new Error(`不支持的 fixture CSS 模式: ${value}`);
}
