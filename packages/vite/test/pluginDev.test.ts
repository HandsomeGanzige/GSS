import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
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

      expect(countOccurrences(cssCode, '._background_ffffff {')).toBe(1);
      expect(countOccurrences(cssCode, '._align-items_center {')).toBe(1);
      expect(cssCode.indexOf('._background_ffffff {')).toBeLessThan(cssCode.indexOf('._background_ecfdf5 {'));
      expect(cssCode.indexOf('align-items: center;')).toBeLessThan(cssCode.indexOf('align-items: flex-start;'));
    } finally {
      await server.close();
    }
  });
});

/** 创建只用于 transformRequest 的 Vite dev server。 */
async function createViteServer(root: string): Promise<ViteDevServer> {
  return createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [semanticAtomicCss()]
  });
}

/** 通过 Vite dev server 读取 virtual CSS transform 结果。 */
async function loadVirtualCss(server: ViteDevServer, cssImport: string): Promise<string> {
  const resolvedCssId = cssImport.replace(/^\/@id\/__x00__/, '\0');
  const cssResult = await server.transformRequest(resolvedCssId);
  return cssResult?.code ?? '';
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
