import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
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
    await writeFile(join(srcDir, 'Button.module.css'), '.button { color: red; }');

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

      expect(cssCode).toContain('._color_red');
      expect(cssCode).not.toContain('export const _color_red');
      expect(cssCode).not.toContain('.__color_red_');
    } finally {
      await server.close();
    }
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

      expect(firstCss).toContain('._color_red');
      expect(firstCss).not.toContain('._color_blue');

      server.ws.send = ((payload: unknown) => {
        wsMessages.push(payload);
      }) as ViteDevServer['ws']['send'];

      const panelResult = await server.transformRequest('/src/Panel.module.css');
      const secondCssImport = readCssImport(panelResult?.code);
      const secondCss = await loadVirtualCss(server, secondCssImport);

      expect(stripTimestampQuery(secondCssImport)).toBe(stripTimestampQuery(cssImport));
      expect(secondCss).toContain('._color_red');
      expect(secondCss).toContain('._color_blue');
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
      expect(countOccurrences(cssCode, '._background_ffffff {')).toBe(1);
      expect(countOccurrences(cssCode, '._align-items_center {')).toBe(1);
      expect(cssCode.indexOf('._background_ffffff {')).toBeLessThan(cssCode.indexOf('._background_ecfdf5 {'));
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

  it('CSS Module 更新时触发 full reload，并在重新请求后使用新 tokens、atomic CSS 和 fallback CSS', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gss-vite-dev-'));
    const srcDir = join(root, 'src');
    const cssFile = join(srcDir, 'Button.module.css');
    const pluginOption = semanticAtomicCss();
    const plugin = readPipelinePlugin(pluginOption);
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

    const server = await createViteServer(root, pluginOption);
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

      const secondResult = await server.transformRequest('/src/Button.module.css');
      const secondCssImport = readCssImport(secondResult?.code);
      const secondCss = await loadRawVirtualCss(plugin, secondCssImport);

      expect(stripTimestampQuery(secondCssImport)).toBe(stripTimestampQuery(firstCssImport));
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

/** 创建位于 Sass 依赖搜索路径下的 dev partial fixture。 */
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

/** 使用 Vite 当前 graph 节点调用 pipeline HMR hook。 */
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

/** 创建只用于 transformRequest 的 Vite dev server。 */
async function createViteServer(root: string, plugin: PluginOption = semanticAtomicCss()): Promise<ViteDevServer> {
  return createServer({
    root: await realpath(root),
    configFile: false,
    logLevel: 'silent',
    plugins: [plugin]
  });
}

/** 从公开 PluginOption 返回值中取出持有 HMR 和 virtual CSS hook 的 pipeline 插件。 */
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

/** 移除 Vite 为已失效模块追加的 HMR 时间戳，只比较 shared owner 的稳定模块身份。 */
function stripTimestampQuery(id: string): string {
  return id.replace(/\?t=\d+$/, '');
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
