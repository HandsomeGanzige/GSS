import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Plugin, type PluginOption, type ViteDevServer } from 'vite';
import { semanticAtomicCss } from '../src/plugin.js';

const tempRoots: string[] = [];

describe('semanticAtomicCss dev plugin', () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('dev virtual CSS id 不暴露 .module.css，避免 atomic CSS 被 Vite 二次 CSS Modules 化', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gss-vite-dev-'));
    const srcDir = join(root, 'src');
    tempRoots.push(root);
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(root, 'index.html'), '<div id="root"></div>');
    await writeFile(
      join(srcDir, 'Button.module.css'),
      [
        '.button { color: red; }',
        '.button:hover { color: red; }',
        '.button:focus-visible { outline: 2px solid blue; }'
      ].join('\n')
    );

    const server = await createViteServer(root);

    try {
      const moduleResult = await server.transformRequest('/src/Button.module.css');
      const cssImport = moduleResult?.code.match(/import\s+"([^"]+)"/)?.[1];

      if (!cssImport) {
        throw new Error('未找到 dev virtual CSS import。');
      }

      expect(cssImport).not.toContain('.module.css');
      expect(cssImport).toContain('semantic-atomic-css/dev.css');

      const resolvedCssId = cssImport.replace(/^\/@id\/__x00__/, '\0');
      const cssResult = await server.transformRequest(resolvedCssId);
      const cssCode = cssResult?.code ?? '';

      expect(cssCode).toContain('._selector_q0dmug_color_red {');
      expect(cssCode).toContain('._selector_qf5xvc_color_red:hover {');
      expect(cssCode).toContain('._selector_1qzezs_outline_2px_solid_blue:focus-visible {');
      expect(cssCode).not.toContain('__GSS_ANCHOR__');
    } finally {
      await server.close();
    }
  });

  it('显式开启 devtools 后提供当前 report API 并注入隔离 overlay', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gss-vite-devtools-'));
    const srcDir = join(root, 'src');
    tempRoots.push(root);
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(root, 'index.html'), '<html><head></head><body><div id="root"></div></body></html>');
    await writeFile(
      join(srcDir, 'Button.module.css'),
      [
        '.button[data-state] { color: red; }',
        '.button:hover { color: blue; }',
        '.button { padding: 4px; }'
      ].join('\n')
    );

    const server = await createViteServer(root, semanticAtomicCss({ devtools: { overlay: true } }));

    try {
      await server.transformRequest('/src/Button.module.css');
      const headers = new Map<string, string>();
      const body = await new Promise<string>((resolve, reject) => {
        server.middlewares(
          { method: 'GET', url: '/__semantic-atomic-css/report?t=1' } as never,
          {
            statusCode: 0,
            setHeader(name: string, value: string) {
              headers.set(name, value);
            },
            end(value: string) {
              resolve(value);
            }
          } as never,
          reject
        );
      });
      const payload = JSON.parse(body);
      const html = await server.transformIndexHtml('/', '<html><head></head><body></body></html>');

      expect(headers.get('cache-control')).toBe('no-store');
      expect(payload).toMatchObject({
        adapter: 'vite',
        status: 'ready',
        environments: [
          {
            name: 'client',
            report: {
              summary: { files: 1, unsafeRules: 1 },
              diagnostics: [
                expect.objectContaining({
                  code: 'unsafe-selector',
                  reason: 'attribute-cascade-order',
                  sourceClassName: expect.stringContaining('button')
                })
              ],
              analysis: {
                health: { status: 'risky' },
                risk: {
                  unsafeReasonDistribution: { 'attribute-cascade-order': 1 },
                  highRiskFiles: [expect.objectContaining({ unsafeRules: 1 })]
                }
              }
            }
          }
        ]
      });
      expect(payload).not.toHaveProperty('schemaVersion');
      expect(html).toContain('data-semantic-atomic-css-overlay-runtime');
      expect(html).toContain('attachShadow');
    } finally {
      await server.close();
    }
  });

  it('dev report endpoint 只接受 GET', () => {
    const plugin = readPipelinePlugin(semanticAtomicCss({ devtools: { enabled: true } }));
    let middleware: ((request: Record<string, unknown>, response: Record<string, unknown>, next: () => void) => void) | undefined;
    const configureServer = plugin.configureServer;

    if (typeof configureServer !== 'function') {
      throw new Error('semanticAtomicCss 插件缺少 configureServer。');
    }

    configureServer({
      middlewares: {
        use(callback: typeof middleware) {
          middleware = callback;
        }
      }
    } as never);
    const next = vi.fn();
    middleware?.(
      { method: 'POST', url: '/__semantic-atomic-css/report' },
      { end: vi.fn() },
      next
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it('拒绝可能破坏 inline overlay 的非法 endpoint', () => {
    expect(() => semanticAtomicCss({ devtools: { endpoint: '/report?<script>' } })).toThrow(
      /invalid-dev-report-endpoint/
    );
    expect(() => semanticAtomicCss({ devtools: { enabled: true, pollIntervalMs: Number.NaN } })).toThrow(
      /invalid-overlay-poll-interval/
    );
    expect(() => semanticAtomicCss({ devtools: { endpoint: '/../report' } })).toThrow(
      /invalid-dev-report-endpoint/
    );
  });

  it('shared CSS 已缓存后首次转换新模块会刷新服务端快照并通知浏览器', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gss-vite-dev-'));
    const srcDir = join(root, 'src');
    const wsMessages: unknown[] = [];
    tempRoots.push(root);
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(root, 'index.html'), '<div id="root"></div>');
    await writeFile(join(srcDir, 'Shell.module.css'), '.shell { color: red; }');
    await writeFile(join(srcDir, 'Panel.module.css'), '.panel { color: blue; }');

    const server = await createViteServer(root);

    try {
      const shellResult = await server.transformRequest('/src/Shell.module.css');
      const cssImport = readCssImport(shellResult?.code);
      const firstCss = await loadVirtualCss(server, cssImport);

      expect(firstCss).toContain('._selector_q0dmug_color_red');
      expect(firstCss).not.toContain('._selector_q0dmug_color_blue');

      server.ws.send = ((payload: unknown) => {
        wsMessages.push(payload);
      }) as ViteDevServer['ws']['send'];

      const panelResult = await server.transformRequest('/src/Panel.module.css');
      const secondCssImport = readCssImport(panelResult?.code);
      const secondCss = await loadVirtualCss(server, secondCssImport);

      expect(stripTimestampQuery(secondCssImport)).toBe(stripTimestampQuery(cssImport));
      expect(secondCss).toContain('._selector_q0dmug_color_red');
      expect(secondCss).toContain('._selector_q0dmug_color_blue');
      expect(wsMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'update',
            updates: expect.arrayContaining([
              expect.objectContaining({
                type: 'js-update',
                acceptedPath: expect.stringContaining('semantic-atomic-css/dev.css')
              })
            ])
          })
        ])
      );
    } finally {
      await server.close();
    }
  });

  it('dev virtual CSS 聚合 atomic class，避免后续模块重复 class 覆盖状态和媒体查询', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gss-vite-dev-'));
    const srcDir = join(root, 'src');
    tempRoots.push(root);
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(root, 'index.html'), '<div id="root"></div>');
    await writeFile(
      join(srcDir, 'Shell.module.css'),
      [
        '.navItem {',
        '  background: #ffffff;',
        '  align-items: center;',
        '}',
        '',
        '.activeNavItem {',
        '  background: #ecfdf5;',
        '}',
        '',
        '@media (max-width: 620px) {',
        '  .navItem {',
        '    align-items: flex-start;',
        '    grid-template-columns: 1fr;',
        '  }',
        '}'
      ].join('\n')
    );
    await writeFile(
      join(srcDir, 'Panel.module.css'),
      [
        '.panel {',
        '  background: #ffffff;',
        '  align-items: center;',
        '  grid-template-columns: 200px 1fr;',
        '}',
        '',
        '@media (max-width: 1100px) {',
        '  .panel {',
        '    grid-template-columns: repeat(2, minmax(0, 1fr));',
        '  }',
        '}',
        '',
        '@media (max-width: 620px) {',
        '  .panel {',
        '    grid-template-columns: 1fr;',
        '  }',
        '}'
      ].join('\n')
    );

    const server = await createViteServer(root);

    try {
      const shellResult = await server.transformRequest('/src/Shell.module.css');
      const panelResult = await server.transformRequest('/src/Panel.module.css');
      const shellCssImport = readCssImport(shellResult?.code);
      const cssImport = panelResult?.code.match(/import\s+"([^"]+)"/)?.[1];

      if (!cssImport) {
        throw new Error('未找到 dev virtual CSS import。');
      }

      expect(stripTimestampQuery(shellCssImport)).toBe(stripTimestampQuery(cssImport));

      const cssCode = await loadVirtualCss(server, cssImport);

      expect(cssCode).not.toContain('@layer gss-');
      expect(countOccurrences(cssCode, '._selector_q0dmug_background_ffffff {')).toBe(1);
      expect(countOccurrences(cssCode, '._selector_q0dmug_align-items_center {')).toBe(1);
      expect(cssCode.indexOf('._selector_q0dmug_background_ffffff {')).toBeLessThan(
        cssCode.indexOf('._selector_q0dmug_background_ecfdf5 {')
      );
      expect(cssCode.indexOf('align-items: center;')).toBeLessThan(cssCode.indexOf('align-items: flex-start;'));
      expect(cssCode.indexOf('grid-template-columns: 200px 1fr;')).toBeLessThan(
        cssCode.indexOf('grid-template-columns: repeat(2, minmax(0, 1fr));')
      );
      expect(cssCode.indexOf('grid-template-columns: repeat(2, minmax(0, 1fr));')).toBeLessThan(
        cssCode.indexOf('grid-template-columns: 1fr;')
      );
    } finally {
      await server.close();
    }
  });

  it('selector-list CSS Module 更新时触发 full reload，并清理旧 arm tokens、atomic CSS 和 fallback CSS', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gss-vite-dev-'));
    const srcDir = join(root, 'src');
    const cssFile = join(srcDir, 'Button.module.css');
    const pluginOption = semanticAtomicCss({
      modules: { generateScopedName: 'hmr_[local]' },
      core: { className: { strategy: 'readable' } }
    });
    const plugin = readPipelinePlugin(pluginOption);
    const wsMessages: unknown[] = [];
    tempRoots.push(root);
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(root, 'index.html'), '<div id="root"></div>');
    await writeFile(
      cssFile,
      [
        '.button[data-state="open"], .peer[data-state="open"] {',
        '  color: red;',
        '}',
        '',
        '.unsupported[data-state^="op"] {',
        '  box-shadow: 0 0 0 1px red;',
        '}'
      ].join('\n')
    );

    const server = await createViteServer(root, pluginOption);
    server.ws.send = ((payload: unknown) => {
      wsMessages.push(payload);
    }) as ViteDevServer['ws']['send'];

    try {
      const firstResult = await server.transformRequest('/src/Button.module.css');
      const firstCssImport = readCssImport(firstResult?.code);
      const firstCss = await loadRawVirtualCss(plugin, firstCssImport);

      expect(firstResult?.code).toContain('hmr_button _selector_4e0slb_color_red');
      expect(firstResult?.code).toContain('hmr_peer _selector_4e0slb_color_red');
      expect(firstResult?.code).toContain('hmr_unsupported');
      expect(firstResult?.code).not.toMatch(/hmr_unsupported _selector_/);
      expect(firstCss).toContain('._selector_4e0slb_color_red[data-state="open"]');
      expect(firstCss).toContain('.hmr_unsupported[data-state^="op"]');
      expect(firstCss).not.toContain('.hmr_button[data-state="open"]');
      expect(firstCss).not.toContain('.hmr_peer[data-state="open"]');

      await writeFile(
        cssFile,
        [
          '.button[data-mode="ready"], .peer[data-mode="ready"] {',
          '  border-color: blue;',
          '}',
          '',
          '.unsupported[data-role^="admin"] {',
          '  outline: 2px solid blue;',
          '}'
        ].join('\n')
      );

      const handleHotUpdate = plugin.handleHotUpdate;

      if (typeof handleHotUpdate !== 'function') {
        throw new Error('semanticAtomicCss 插件缺少 handleHotUpdate。');
      }

      const hmrResult = handleHotUpdate({
        file: cssFile,
        server,
        modules: [],
        timestamp: Date.now(),
        read: async () => ''
      });

      expect(hmrResult).toEqual([]);
      expect(wsMessages).toContainEqual({ type: 'full-reload' });

      expect(await loadRawVirtualCss(plugin, firstCssImport)).toBe('');

      const secondResult = await server.transformRequest('/src/Button.module.css');
      const secondCssImport = readCssImport(secondResult?.code);
      const secondCss = await loadRawVirtualCss(plugin, secondCssImport);

      expect(stripTimestampQuery(secondCssImport)).toBe(stripTimestampQuery(firstCssImport));
      expect(secondResult?.code).toContain('hmr_button _selector_56moj6_border-color_blue');
      expect(secondResult?.code).toContain('hmr_peer _selector_56moj6_border-color_blue');
      expect(secondResult?.code).not.toContain('_selector_4e0slb_color_red');
      expect(secondResult?.code).toContain('hmr_unsupported');
      expect(secondResult?.code).not.toMatch(/hmr_unsupported _selector_/);
      expect(secondCss).toContain('._selector_56moj6_border-color_blue[data-mode="ready"]');
      expect(secondCss).toContain('.hmr_unsupported[data-role^="admin"]');
      expect(secondCss).not.toContain('_selector_4e0slb_color_red');
      expect(secondCss).not.toContain('[data-state="open"]');
      expect(secondCss).not.toContain('[data-state^="op"]');
      expect(secondCss).not.toContain('box-shadow: 0 0 0 1px red;');
    } finally {
      await server.close();
    }
  });

  it('pseudo-element HMR 清理旧 spelling、token 与 selector-list fallback', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gss-vite-pseudo-dev-'));
    const srcDir = join(root, 'src');
    const cssFile = join(srcDir, 'Pseudo.module.css');
    const pluginOption = semanticAtomicCss({
      modules: { generateScopedName: 'pseudo_[local]' },
      core: { className: { strategy: 'readable' } }
    });
    const plugin = readPipelinePlugin(pluginOption);
    const wsMessages: unknown[] = [];
    tempRoots.push(root);
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(root, 'index.html'), '<div id="root"></div>');
    await writeFile(
      cssFile,
      [
        '.icon::before { content: "old"; color: red; }',
        '.fallback::before, .peer { color: blue; }'
      ].join('\n')
    );

    const server = await createViteServer(root, pluginOption);
    server.ws.send = ((payload: unknown) => wsMessages.push(payload)) as ViteDevServer['ws']['send'];

    try {
      const firstResult = await server.transformRequest('/src/Pseudo.module.css');
      const cssImport = readCssImport(firstResult?.code);
      const firstCss = await loadRawVirtualCss(plugin, cssImport);

      expect(firstResult?.code).toMatch(/pseudo_icon _selector_[a-z0-9_-]+/u);
      expect(firstCss).toContain('::before');
      expect(firstCss).toContain('.pseudo_fallback::before, .pseudo_peer');

      await writeFile(cssFile, '.icon:after { content: "new"; color: green; }');
      invokeHotUpdate(plugin, server, cssFile);

      expect(wsMessages).toContainEqual({ type: 'full-reload' });
      expect(await loadRawVirtualCss(plugin, cssImport)).toBe('');

      const secondResult = await server.transformRequest('/src/Pseudo.module.css');
      const secondCssImport = readCssImport(secondResult?.code);
      const secondCss = await loadRawVirtualCss(plugin, secondCssImport);

      expect(stripTimestampQuery(secondCssImport)).toBe(stripTimestampQuery(cssImport));
      expect(secondResult?.code).toMatch(/pseudo_icon _selector_[a-z0-9_-]+/u);
      expect(secondCss).toContain(':after');
      expect(secondCss).toContain('content: "new";');
      expect(secondCss).not.toContain('::before');
      expect(secondCss).not.toContain('content: "old";');
      expect(secondCss).not.toContain('pseudo_fallback');
    } finally {
      await server.close();
    }
  });

  it('JS 移除 CSS Module import 时立即清理 stale CSS 与 dev report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gss-vite-import-removal-'));
    const srcDir = join(root, 'src');
    const entryFile = join(srcDir, 'main.ts');
    const pluginOption = semanticAtomicCss({ devtools: { enabled: true, overlay: false } });
    const plugin = readPipelinePlugin(pluginOption);
    tempRoots.push(root);
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(root, 'index.html'), '<div id="root"></div>');
    await writeFile(entryFile, "import styles from './Button.module.css';\nconsole.log(styles.button);\n");
    await writeFile(join(srcDir, 'Button.module.css'), '.button, .peer { color: red; }');

    const server = await createViteServer(root, pluginOption);

    try {
      await server.transformRequest('/src/main.ts');
      const moduleResult = await server.transformRequest('/src/Button.module.css');
      const cssImport = readCssImport(moduleResult?.code);
      expect(await loadRawVirtualCss(plugin, cssImport)).toContain('._selector_q0dmug_color_red');

      await writeFile(entryFile, "console.log('CSS import removed');\n");
      invokeHotUpdate(plugin, server, entryFile);

      expect(await loadRawVirtualCss(plugin, cssImport)).toBe('');
      expect(await requestViteDevReport(server)).toMatchObject({ status: 'idle', environments: [] });
    } finally {
      await server.close();
    }
  });

  it('HMR 失效后拒绝旧异步 transform 回写 dev cache', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gss-vite-generation-'));
    const srcDir = join(root, 'src');
    const cssFile = join(srcDir, 'Button.module.css');
    const pluginOption = semanticAtomicCss();
    const plugin = readPipelinePlugin(pluginOption);
    tempRoots.push(root);
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(root, 'index.html'), '<div id="root"></div>');
    await writeFile(cssFile, '.button { color: red; }');

    const server = await createViteServer(root, pluginOption);

    try {
      const firstResult = await server.transformRequest('/src/Button.module.css');
      const cssImport = readCssImport(firstResult?.code);
      expect(await loadRawVirtualCss(plugin, cssImport)).toContain('._selector_q0dmug_color_red');

      const originalReadFile = fs.readFile.bind(fs);
      let releaseRead: (() => void) | undefined;
      let markReadStarted: (() => void) | undefined;
      const readStarted = new Promise<void>((resolve) => {
        markReadStarted = resolve;
      });
      const readFileSpy = vi.spyOn(fs, 'readFile').mockImplementation(((filename: unknown, options: unknown) => {
        if (filename !== cssFile) {
          return originalReadFile(filename as string, options as BufferEncoding);
        }
        markReadStarted?.();
        return new Promise((resolve, reject) => {
          releaseRead = () => {
            originalReadFile(filename, options as BufferEncoding).then(resolve, reject);
          };
        });
      }) as typeof fs.readFile);

      try {
        const transform = plugin.transform;
        if (typeof transform !== 'function') {
          throw new Error('semanticAtomicCss 插件缺少 transform。');
        }
        const staleTransform = (transform as Function).call(
          { warn() {} },
          '.fixture_button { color: red; }',
          cssFile
        ) as Promise<unknown>;
        await readStarted;
        invokeHotUpdate(plugin, server, cssFile);
        releaseRead?.();
        await staleTransform;
        expect(await loadRawVirtualCss(plugin, cssImport)).toBe('');
      } finally {
        readFileSpy.mockRestore();
        releaseRead?.();
      }
    } finally {
      await server.close();
    }
  });

  it('SCSS shared partial 通过 Vite graph 失效 dependent，旧 watch 边会保守重验证', async () => {
    const { root, partialFile, alphaFile, betaFile } = await createPreprocessorDevFixture();
    const pluginOption = semanticAtomicCss();
    const plugin = readPipelinePlugin(pluginOption);
    const server = await createViteServer(root, pluginOption);
    const wsMessages: unknown[] = [];
    server.ws.send = ((payload: unknown) => {
      wsMessages.push(payload);
    }) as ViteDevServer['ws']['send'];

    try {
      const alphaResult = await server.transformRequest('/src/Alpha.module.scss');
      const betaResult = await server.transformRequest('/src/Beta.module.scss');
      const cssImport = readCssImport(alphaResult?.code);
      expect(stripTimestampQuery(readCssImport(betaResult?.code))).toBe(stripTimestampQuery(cssImport));
      expect(await loadRawVirtualCss(plugin, cssImport)).toContain('color: red;');

      await writeFile(alphaFile, '.alpha { color: green; }');
      invokeHotUpdate(plugin, server, alphaFile);
      await server.transformRequest('/src/Alpha.module.scss');

      await writeFile(partialFile, '$color: blue;');
      invokeHotUpdate(plugin, server, partialFile);

      await server.transformRequest('/src/Alpha.module.scss');
      await server.transformRequest('/src/Beta.module.scss');
      const refreshedCss = await loadRawVirtualCss(plugin, cssImport);
      expect(refreshedCss).toContain('color: green;');
      expect(refreshedCss).toContain('color: blue;');
      expect(refreshedCss).not.toContain('color: red;');
      expect(wsMessages).toContainEqual({ type: 'full-reload' });
      expect(betaFile).toMatch(/Beta\.module\.scss$/);
    } finally {
      await server.close();
    }
  });
});

/**
 * 创建位于 Sass 依赖搜索路径下的 dev partial fixture。
 *
 * @returns fixture 根目录、partial 文件及两个消费模块的绝对路径。
 * @remarks 使用 fixture 已安装的 Sass，避免测试辅助依赖泄漏到 adapter 生产包。
 */
async function createPreprocessorDevFixture(): Promise<{
  root: string;
  partialFile: string;
  alphaFile: string;
  betaFile: string;
}> {
  const fixtureDir = join(process.cwd(), '../../fixtures/vite-css-modules');
  const root = await mkdtemp(join(fixtureDir, '.tmp-vite-dev-'));
  const srcDir = join(root, 'src');
  const partialFile = join(srcDir, '_tokens.scss');
  const alphaFile = join(srcDir, 'Alpha.module.scss');
  const betaFile = join(srcDir, 'Beta.module.scss');
  tempRoots.push(root);
  await mkdir(srcDir, { recursive: true });
  await writeFile(join(root, 'index.html'), '<div id="root"></div>');
  await writeFile(partialFile, '$color: red;');
  await writeFile(alphaFile, "@use './tokens' as tokens;\n.alpha { color: tokens.$color; }");
  await writeFile(betaFile, "@use './tokens' as tokens;\n.beta { color: tokens.$color; }");
  return { root, partialFile, alphaFile, betaFile };
}

/**
 * 使用 Vite 当前 module graph 节点调用 pipeline HMR hook。
 *
 * @param plugin - 持有 handleHotUpdate hook 的 pipeline 插件。
 * @param server - 提供 module graph 与 websocket 的 Vite dev server。
 * @param file - 发生变化的绝对文件路径。
 * @returns 无返回值；hook Promise 由测试通过 mock 调用链观察。
 * @throws 当插件未暴露可调用的 handleHotUpdate hook 时抛出。
 */
function invokeHotUpdate(plugin: Plugin, server: ViteDevServer, file: string): void {
  const handleHotUpdate = plugin.handleHotUpdate;

  if (typeof handleHotUpdate !== 'function') {
    throw new Error('semanticAtomicCss 插件缺少 handleHotUpdate。');
  }

  const modules = [...(server.moduleGraph.getModulesByFile(file) ?? [])];
  server.moduleGraph.onFileChange(file);
  handleHotUpdate({
    file,
    server,
    modules,
    timestamp: Date.now(),
    read: async () => ''
  });
}

/** 通过 Vite middleware stack 读取当前 dev report JSON。 */
async function requestViteDevReport(server: ViteDevServer): Promise<Record<string, unknown>> {
  const body = await new Promise<string>((resolve, reject) => {
    server.middlewares(
      { method: 'GET', url: '/__semantic-atomic-css/report' } as never,
      {
        statusCode: 0,
        setHeader() {},
        end(value: string) {
          resolve(value);
        }
      } as never,
      reject
    );
  });
  return JSON.parse(body) as Record<string, unknown>;
}

/**
 * 创建只用于 transformRequest 的隔离 Vite dev server。
 *
 * @param root - 临时 fixture 根目录。
 * @param plugin - 要加载的插件配置，默认创建 GSS adapter。
 * @returns 已启动且关闭 websocket 热更新通道的 Vite dev server。
 */
async function createViteServer(root: string, plugin: PluginOption = semanticAtomicCss()): Promise<ViteDevServer> {
  return createServer({
    root: await realpath(root),
    configFile: false,
    logLevel: 'silent',
    plugins: [plugin]
  });
}

/**
 * 从公开 PluginOption 中取出持有 HMR 与 virtual CSS hook 的 pipeline 插件。
 *
 * @param pluginOption - `semanticAtomicCss` 返回的 Vite PluginOption。
 * @returns adapter 的 pipeline 插件。
 * @throws 当插件结构不符合预期或找不到 pipeline 插件时抛出。
 */
function readPipelinePlugin(pluginOption: PluginOption): Plugin {
  if (!Array.isArray(pluginOption)) {
    throw new Error('semanticAtomicCss 未返回预期的插件数组。');
  }

  const plugin = pluginOption.find(
    (entry): entry is Plugin => Boolean(entry && typeof entry === 'object' && 'name' in entry && entry.name === 'semantic-atomic-css:vite-pipeline')
  );

  if (!plugin) {
    throw new Error('未找到 semantic-atomic-css:vite-pipeline。');
  }

  return plugin;
}

/**
 * 从 CSS Module JS 输出中读取 virtual CSS import id。
 *
 * @param code - Vite transformRequest 返回的模块代码。
 * @returns 匹配到的 virtual CSS import id。
 * @throws 当模块代码不存在或未包含 virtual CSS import 时抛出。
 */
function readCssImport(code: string | undefined): string {
  const cssImport = code?.match(/import\s+"([^"]+)"/)?.[1];

  if (!cssImport) {
    throw new Error('未找到 dev virtual CSS import。');
  }

  return cssImport;
}

/**
 * 通过 Vite dev server 读取 virtual CSS transform 结果。
 *
 * @param server - 当前 Vite dev server。
 * @param cssImport - CSS Module JS 中导入的 virtual CSS id。
 * @returns 经过 Vite CSS 管线转换后的 virtual CSS 代码。
 * @throws 当 virtual module 无法解析或 transform 结果缺少代码时抛出。
 */
async function loadVirtualCss(server: ViteDevServer, cssImport: string): Promise<string> {
  const resolvedCssId = cssImport.replace(/^\/@id\/__x00__/, '\0');
  const cssResult = await server.transformRequest(resolvedCssId);
  return cssResult?.code ?? '';
}

/**
 * 绕过 Vite transform 缓存读取插件 raw virtual CSS。
 *
 * @param plugin - adapter pipeline 插件。
 * @param cssImport - CSS Module JS 中导入的 virtual CSS id。
 * @returns 插件 load hook 当前生成的原始 virtual CSS。
 * @throws 当插件缺少 load hook、virtual id 无法解析或返回值不是字符串时抛出。
 * @remarks 该路径专门验证 devResults 是否已失效，不代表 Vite 的正常消费流程。
 */
async function loadRawVirtualCss(plugin: Plugin, cssImport: string): Promise<string> {
  const load = plugin.load;

  if (typeof load !== 'function') {
    throw new Error('semanticAtomicCss 插件缺少 load。');
  }

  const resolvedCssId = stripTimestampQuery(cssImport).replace(/^\/@id\/__x00__/, '\0');
  const loadVirtualModule = load as (this: unknown, id: string) => unknown | Promise<unknown>;
  const result = await loadVirtualModule.call(undefined, resolvedCssId);

  if (typeof result === 'string') {
    return result;
  }

  if (result && typeof result === 'object' && 'code' in result && typeof result.code === 'string') {
    return result.code;
  }

  return '';
}

/**
 * 移除 Vite 为失效模块追加的 HMR 时间戳。
 *
 * @param id - 可能包含 `t` 查询参数的模块 id。
 * @returns 保留其他查询参数、但移除 HMR 时间戳的稳定模块 id。
 * @remarks 仅用于比较 shared owner 的模块身份，不用于改写生产请求。
 */
function stripTimestampQuery(id: string): string {
  return id.replace(/\?t=\d+$/, '');
}

/**
 * 统计固定片段在字符串中的非重叠出现次数。
 *
 * @param source - 被检查的完整字符串。
 * @param needle - 要统计的非空固定片段。
 * @returns 片段出现次数，用于确认 dev 聚合 CSS 已去重。
 * @remarks 调用方必须传入非空 needle，否则游标无法前进。
 */
function countOccurrences(source: string, needle: string): number {
  let count = 0;
  let index = source.indexOf(needle);

  while (index !== -1) {
    count += 1;
    index = source.indexOf(needle, index + needle.length);
  }

  return count;
}
