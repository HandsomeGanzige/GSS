import react from '@vitejs/plugin-react';
import { semanticAtomicCss } from '@semantic-atomic-css/vite';
import { defineConfig, type PluginOption } from 'vite';

type PlaygroundCssMode = 'semantic' | 'native';

const cssMode = resolveCssMode(process.env.GSS_PLAYGROUND_CSS_MODE);

/**
 * 根据 CSS 模式创建 playground 使用的 Vite 插件列表。
 *
 * @param mode - semantic adapter 模式或 native 对照模式。
 * @returns 按正确执行顺序排列的 Vite 插件列表。
 * @remarks 仅在消费边界归一化 workspace 中可能不同来源的 Vite PluginOption 类型。
 */
function createPlugins(mode: PlaygroundCssMode): PluginOption[] {
  if (mode === 'native') {
    return [react()];
  }

  // pnpm 可因其他 workspace 的 Vite 可选 peer 产生不同类型身份，
  // Pilot 运行时仍只有当前 Vite 管线，因此仅在消费方边界归一化插件类型。
  const semanticPlugin = semanticAtomicCss({
    manifest: { enabled: true },
    report: { enabled: true }
  }) as unknown as PluginOption;

  return [semanticPlugin, react()];
}

/**
 * 解析 dev 指令传入的 CSS 模式。
 *
 * @param value - 环境变量中的候选模式。
 * @returns native 或默认的 semantic 模式；未知值保守回退到 semantic。
 */
function resolveCssMode(value: string | undefined): PlaygroundCssMode {
  return value === 'native' ? 'native' : 'semantic';
}

export default defineConfig({
  plugins: createPlugins(cssMode),
  define: {
    __GSS_CSS_MODE__: JSON.stringify(cssMode)
  },
  build: {
    assetsInlineLimit: 0
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: 'pilot_[name]__[local]'
    },
    preprocessorOptions: {
      scss: {
        additionalData: '$pilot-runtime-gap: 3px;\n$pilot-runtime-shell-padding: 28px;\n'
      },
      less: {
        additionalData: '@pilot-runtime-radius: 8px;\n'
      }
    }
  }
});
