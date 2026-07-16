import { describe, expect, it } from 'vitest';
import { pluginSemanticAtomicCss } from '../src/plugin.js';

describe('pluginSemanticAtomicCss options', () => {
  it('为当前未支持的 strict mode fail fast', () => {
    expect(() => pluginSemanticAtomicCss({ diagnostics: { strict: true } })).toThrow(
      /unsupported-feature feature=diagnostics\.strict/
    );
  });

  it('拒绝越出 dist 的 asset filename', () => {
    expect(() => pluginSemanticAtomicCss({ cssFilename: '../semantic.css' })).toThrow(
      /invalid-asset-filename/
    );
  });

  it('只在 dev 强制使用 style injection，build 保持 extraction', () => {
    let action: 'dev' | 'build' = 'dev';
    let modifyEnvironmentConfig: ((config: Record<string, any>, utils: Record<string, any>) => any) | undefined;
    const plugin = pluginSemanticAtomicCss();
    plugin.setup({
      context: {
        version: '2.1.6',
        get action() {
          return action;
        }
      },
      modifyEnvironmentConfig(callback: typeof modifyEnvironmentConfig) {
        modifyEnvironmentConfig = callback;
      },
      onBeforeEnvironmentCompile() {},
      modifyBundlerChain() {},
      modifyRspackConfig() {},
      modifyHTMLTags() {}
    } as never);

    const original = {
      dev: { hmr: true, liveReload: false },
      output: { injectStyles: false }
    };
    const mergeEnvironmentConfig = (base: typeof original, override: typeof original) => ({
      ...base,
      ...override,
      dev: { ...base.dev, ...override.dev },
      output: { ...base.output, ...override.output }
    });

    expect(modifyEnvironmentConfig?.(original, { mergeEnvironmentConfig })).toEqual({
      dev: { hmr: true, liveReload: false },
      output: { injectStyles: true }
    });
    action = 'build';
    expect(modifyEnvironmentConfig?.(original, { mergeEnvironmentConfig })).toBe(original);
  });
});
