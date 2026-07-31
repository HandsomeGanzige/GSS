import { describe, expect, it, vi } from 'vitest';
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

  it('显式开启 devtools 后登记 report middleware 并注入 overlay', () => {
    let onBeforeStartDevServer: ((input: Record<string, any>) => void) | undefined;
    let modifyHTMLTags: ((tags: Record<string, any>, context: Record<string, any>) => any) | undefined;
    let middleware: ((request: Record<string, any>, response: Record<string, any>, next: (error?: unknown) => void) => void) | undefined;
    const plugin = pluginSemanticAtomicCss({ devtools: { enabled: true } });

    plugin.setup({
      context: {
        version: '2.1.6',
        action: 'dev'
      },
      modifyEnvironmentConfig() {},
      onBeforeEnvironmentCompile() {},
      onBeforeStartDevServer(callback: typeof onBeforeStartDevServer) {
        onBeforeStartDevServer = callback;
      },
      modifyBundlerChain() {},
      modifyRspackConfig() {},
      modifyHTMLTags(callback: typeof modifyHTMLTags) {
        modifyHTMLTags = callback;
      }
    } as never);

    onBeforeStartDevServer?.({
      server: {
        middlewares: {
          use(callback: typeof middleware) {
            middleware = callback;
          }
        }
      }
    });

    let body = '';
    const headers = new Map<string, string>();
    middleware?.(
      { method: 'GET', url: '/__semantic-atomic-css/report?t=1' },
      {
        statusCode: 0,
        setHeader(name: string, value: string) {
          headers.set(name, value);
        },
        end(value: string) {
          body = value;
        }
      },
      (error) => {
        if (error) throw error;
      }
    );

    const tags = modifyHTMLTags?.(
      { headTags: [], bodyTags: [] },
      {
        assetPrefix: '',
        compilation: { getAsset: () => undefined },
        environment: { name: 'web' }
      }
    );

    expect(headers.get('cache-control')).toBe('no-store');
    const payload = JSON.parse(body);
    expect(payload).toEqual({
      adapter: 'rsbuild',
      status: 'idle',
      environments: []
    });
    expect(payload).not.toHaveProperty('schemaVersion');
    expect(tags.headTags[0]).toMatchObject({
      tag: 'script',
      attrs: { 'data-semantic-atomic-css-overlay-runtime': '' }
    });
    expect(tags.headTags[0].children).toContain('attachShadow');

    const next = vi.fn();
    middleware?.(
      { method: 'DELETE', url: '/__semantic-atomic-css/report' },
      { statusCode: 0, setHeader: vi.fn(), end: vi.fn() },
      next
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('拒绝非法 dev report endpoint', () => {
    expect(() => pluginSemanticAtomicCss({ devtools: { endpoint: '../report' } })).toThrow(
      /invalid-dev-report-endpoint/
    );
    expect(() => pluginSemanticAtomicCss({ devtools: { enabled: true, pollIntervalMs: 0 } })).toThrow(
      /invalid-overlay-poll-interval/
    );
    expect(() => pluginSemanticAtomicCss({ devtools: { endpoint: '/a/../report' } })).toThrow(
      /invalid-dev-report-endpoint/
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
