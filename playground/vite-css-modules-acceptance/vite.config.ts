import react from '@vitejs/plugin-react';
import { semanticAtomicCss } from '@semantic-atomic-css/vite';
import { defineConfig, type PluginOption } from 'vite';

type AcceptanceCssMode = 'semantic' | 'native';

const cssMode = resolveCssMode(process.env.GSS_ACCEPTANCE_CSS_MODE);

/** 根据环境变量创建验收 fixture 的插件列表。 */
function createPlugins(mode: AcceptanceCssMode): PluginOption[] {
  return mode === 'semantic' ? [semanticAtomicCss(), react()] : [react()];
}

/** 解析验收模式，未知值保守回退到 semantic 模式。 */
function resolveCssMode(value: string | undefined): AcceptanceCssMode {
  return value === 'native' ? 'native' : 'semantic';
}

export default defineConfig({
  plugins: createPlugins(cssMode)
});
