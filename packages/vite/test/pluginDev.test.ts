import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
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
    await writeFile(join(srcDir, 'Button.module.css'), '.button { color: red; }');

    const server = await createViteServer(root);

    try {
      const moduleResult = await server.transformRequest('/src/Button.module.css');
      const cssImport = moduleResult?.code.match(/import\s+"([^"]+)"/)?.[1];

      if (!cssImport) {
        throw new Error('未找到 dev virtual CSS import。');
      }

      expect(cssImport).not.toContain('.module.css');

      const resolvedCssId = cssImport.replace(/^\/@id\/__x00__/, '\0');
      const cssResult = await server.transformRequest(resolvedCssId);
      const cssCode = cssResult?.code ?? '';

      expect(cssCode).toContain('._color_red');
      expect(cssCode).not.toContain('export const _color_red');
      expect(cssCode).not.toContain('.__color_red_');
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
        '@media (max-width: 900px) {',
        '  .navItem {',
        '    align-items: flex-start;',
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
        '}'
      ].join('\n')
    );

    const server = await createViteServer(root);

    try {
      await server.transformRequest('/src/Shell.module.css');
      const panelResult = await server.transformRequest('/src/Panel.module.css');
      const cssImport = panelResult?.code.match(/import\s+"([^"]+)"/)?.[1];

      if (!cssImport) {
        throw new Error('未找到 dev virtual CSS import。');
      }

      const cssCode = await loadVirtualCss(server, cssImport);

      expect(cssCode).toContain('@layer gss-');
      expect(countOccurrences(cssCode, '._background_ffffff {')).toBe(1);
      expect(countOccurrences(cssCode, '._align-items_center {')).toBe(1);
      expect(cssCode.indexOf('._background_ffffff {')).toBeLessThan(cssCode.indexOf('._background_ecfdf5 {'));
      expect(cssCode.indexOf('align-items: center;')).toBeLessThan(cssCode.indexOf('align-items: flex-start;'));
    } finally {
      await server.close();
    }
  });

  it('CSS Module 更新时触发 full reload，并在重新请求后使用新 tokens、atomic CSS 和 fallback CSS', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gss-vite-dev-'));
    const srcDir = join(root, 'src');
    const cssFile = join(srcDir, 'Button.module.css');
    const plugin = semanticAtomicCss();
    const wsMessages: unknown[] = [];
    tempRoots.push(root);
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(root, 'index.html'), '<div id="root"></div>');
    await writeFile(
      cssFile,
      [
        '.button {',
        '  color: red;',
        '}',
        '',
        '.button[data-state="open"] {',
        '  box-shadow: 0 0 0 1px red;',
        '}'
      ].join('\n')
    );

    const server = await createViteServer(root, plugin);
    server.ws.send = ((payload: unknown) => {
      wsMessages.push(payload);
    }) as ViteDevServer['ws']['send'];

    try {
      const firstResult = await server.transformRequest('/src/Button.module.css');
      const firstCssImport = readCssImport(firstResult?.code);
      const firstCss = await loadVirtualCss(server, firstCssImport);

      expect(firstResult?.code).toContain('_color_red');
      expect(firstCss).toContain('._color_red');
      expect(firstCss).toContain('box-shadow: 0 0 0 1px red;');

      await writeFile(
        cssFile,
        [
          '.button {',
          '  color: blue;',
          '}',
          '',
          '.button[data-state="open"] {',
          '  border-color: blue;',
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
      server.moduleGraph.invalidateAll();

      const secondResult = await server.transformRequest('/src/Button.module.css?phase3-hmr=1');
      const secondCssImport = readCssImport(secondResult?.code);
      const secondCss = await loadRawVirtualCss(plugin, secondCssImport);

      expect(secondResult?.code).toContain('_color_blue');
      expect(secondResult?.code).not.toContain('_color_red');
      expect(secondCss).toContain('._color_blue');
      expect(secondCss).not.toContain('._color_red');
      expect(secondCss).toContain('border-color: blue;');
      expect(secondCss).not.toContain('box-shadow: 0 0 0 1px red;');
    } finally {
      await server.close();
    }
  });
});

/** 创建只用于 transformRequest 的 Vite dev server。 */
async function createViteServer(root: string, plugin: Plugin = semanticAtomicCss()): Promise<ViteDevServer> {
  return createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [plugin]
  });
}

/** 从 CSS Module JS 中读取 virtual CSS import。 */
function readCssImport(code: string | undefined): string {
  const cssImport = code?.match(/import\s+"([^"]+)"/)?.[1];

  if (!cssImport) {
    throw new Error('未找到 dev virtual CSS import。');
  }

  return cssImport;
}

/** 通过 Vite dev server 读取 virtual CSS transform 结果。 */
async function loadVirtualCss(server: ViteDevServer, cssImport: string): Promise<string> {
  const resolvedCssId = cssImport.replace(/^\/@id\/__x00__/, '\0');
  const cssResult = await server.transformRequest(resolvedCssId);
  return cssResult?.code ?? '';
}

/** 绕过 Vite transform 缓存读取插件 raw virtual CSS，用于验证 devResults 是否已失效。 */
async function loadRawVirtualCss(plugin: Plugin, cssImport: string): Promise<string> {
  const load = plugin.load;

  if (typeof load !== 'function') {
    throw new Error('semanticAtomicCss 插件缺少 load。');
  }

  const resolvedCssId = cssImport.replace(/^\/@id\/__x00__/, '\0');
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

/** 统计固定片段出现次数，用于确认 dev 聚合 CSS 已去重。 */
function countOccurrences(source: string, needle: string): number {
  let count = 0;
  let index = source.indexOf(needle);

  while (index !== -1) {
    count += 1;
    index = source.indexOf(needle, index + needle.length);
  }

  return count;
}
