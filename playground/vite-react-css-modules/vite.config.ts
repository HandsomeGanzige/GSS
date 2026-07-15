import react from '@vitejs/plugin-react';
import { semanticAtomicCss } from '@semantic-atomic-css/vite';
import { defineConfig, type PluginOption } from 'vite';

type PlaygroundCssMode = 'semantic' | 'native';

const cssMode = resolveCssMode(process.env.GSS_PLAYGROUND_CSS_MODE);

/** 根据环境变量创建 playground 使用的 Vite 插件列表。 */
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

/** 解析 dev 指令传入的 CSS 模式，未知值保守回退到 semantic 模式。 */
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
