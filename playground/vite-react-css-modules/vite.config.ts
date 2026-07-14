import react from '@vitejs/plugin-react';
import { semanticAtomicCss } from '@semantic-atomic-css/vite';
import { defineConfig, type PluginOption } from 'vite';

type PlaygroundCssMode = 'semantic' | 'native';

const cssMode = resolveCssMode(process.env.GSS_PLAYGROUND_CSS_MODE);

/** 根据环境变量创建 playground 使用的 Vite 插件列表。 */
function createPlugins(mode: PlaygroundCssMode): PluginOption[] {
  return mode === 'semantic'
    ? [
        semanticAtomicCss({
          manifest: { enabled: true },
          report: { enabled: true }
        }),
        react()
      ]
    : [react()];
}

/** 解析 dev 指令传入的 CSS 模式，未知值保守回退到 semantic 模式。 */
function resolveCssMode(value: string | undefined): PlaygroundCssMode {
  return value === 'native' ? 'native' : 'semantic';
}

export default defineConfig({
  plugins: createPlugins(cssMode),
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: 'pilot_[name]__[local]'
    }
  }
});
