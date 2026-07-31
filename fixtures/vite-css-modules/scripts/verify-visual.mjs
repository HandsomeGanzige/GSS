import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  captureComputedStyles,
  createStyleDiffReport,
  mergeStyleDiffReports,
  writeAndAssertStyleDiffReport
} from '@semantic-atomic-css/devtools';

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(fixtureRoot, 'node_modules/.bin/vite');
const host = '127.0.0.1';
const timeoutMs = 30_000;
const rectTolerance = 1;
const chromeExecutable = process.env.GSS_VISUAL_CHROME_EXECUTABLE;
const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'narrow', width: 520, height: 900 }
];
const styleDiffReports = [];
const deferredVisualErrors = [];

const baseCases = [
  {
    id: 'cascade-active',
    properties: ['display', 'backgroundColor', 'borderTopColor', 'color', 'fontWeight', 'borderRadius'],
    rect: true,
    expected: {
      backgroundColor: 'rgb(236, 253, 245)',
      borderTopColor: 'rgb(94, 234, 212)',
      color: 'rgb(15, 118, 110)'
    }
  },
  {
    id: 'responsive-stack',
    properties: ['display', 'alignItems', 'flexDirection', 'backgroundColor'],
    rect: true,
    expectedByViewport: {
      desktop: { alignItems: 'center', flexDirection: 'row' },
      narrow: { alignItems: 'flex-start', flexDirection: 'column' }
    }
  },
  {
    id: 'order-box',
    properties: ['borderTopColor', 'borderLeftColor', 'borderTopWidth', 'borderLeftWidth'],
    expected: {
      borderTopColor: 'rgb(254, 202, 202)',
      borderLeftColor: 'rgb(15, 118, 110)'
    }
  },
  {
    id: 'important-box',
    properties: ['color', 'backgroundColor', 'fontWeight'],
    expected: { color: 'rgb(153, 27, 27)' }
  },
  {
    id: 'custom-token',
    properties: ['color', 'backgroundColor', 'borderTopColor'],
    expected: { color: 'rgb(15, 118, 110)' }
  },
  {
    id: 'supports-grid',
    properties: ['display', 'gridTemplateColumns', 'gap'],
    expected: { display: 'grid' }
  },
  {
    id: 'dashed-token',
    properties: ['color', 'backgroundColor', 'borderTopColor', 'fontWeight'],
    expected: {
      color: 'rgb(29, 78, 216)',
      backgroundColor: 'rgb(239, 246, 255)',
      borderTopColor: 'rgb(191, 219, 254)'
    }
  },
  {
    id: 'camel-token',
    properties: ['color', 'backgroundColor', 'borderTopColor', 'fontWeight'],
    expected: {
      color: 'rgb(4, 120, 87)',
      backgroundColor: 'rgb(236, 253, 245)',
      borderTopColor: 'rgb(153, 246, 228)'
    }
  },
  {
    id: 'selector-list-cascade',
    properties: ['color'],
    expected: { color: 'rgb(220, 38, 38)' }
  },
  {
    id: 'selector-list-peer',
    properties: ['color'],
    expected: { color: 'rgb(37, 99, 235)' }
  },
  {
    id: 'selector-list-interactive',
    properties: ['backgroundColor'],
    expected: { backgroundColor: 'rgb(248, 250, 252)' }
  },
  {
    id: 'selector-list-interactive-peer',
    properties: ['backgroundColor'],
    expected: { backgroundColor: 'rgb(248, 250, 252)' }
  },
  {
    id: 'selector-list-attribute',
    properties: ['backgroundColor'],
    expected: { backgroundColor: 'rgb(248, 250, 252)' }
  },
  {
    id: 'selector-list-attribute-peer',
    properties: ['backgroundColor'],
    expected: { backgroundColor: 'rgb(220, 252, 231)' }
  },
  {
    id: 'selector-list-attribute-coincident',
    properties: ['backgroundColor'],
    expected: { backgroundColor: 'rgb(220, 252, 231)' }
  },
  {
    id: 'selector-list-independent',
    properties: ['paddingTop', 'color'],
    expected: {
      paddingTop: '13px',
      color: 'rgb(71, 85, 105)'
    }
  },
  {
    id: 'oracle-non-competing',
    properties: ['color', 'backgroundColor'],
    expected: {
      color: 'rgb(67, 56, 202)',
      backgroundColor: 'rgb(254, 243, 199)'
    }
  },
  {
    id: 'oracle-important',
    properties: ['color'],
    expected: { color: 'rgb(159, 18, 57)' }
  },
  {
    id: 'oracle-specificity',
    properties: ['color'],
    expected: { color: 'rgb(14, 116, 144)' }
  },
  {
    id: 'oracle-stable-order',
    properties: ['color'],
    expected: { color: 'rgb(3, 105, 161)' }
  },
  {
    id: 'oracle-media-overlap',
    properties: ['color', 'backgroundColor'],
    expected: { backgroundColor: 'rgb(241, 245, 249)' },
    expectedByViewport: {
      desktop: { color: 'rgb(190, 18, 60)' },
      narrow: { color: 'rgb(30, 58, 138)' }
    }
  },
  {
    id: 'oracle-supports-overlap',
    properties: ['color', 'backgroundColor'],
    expected: {
      color: 'rgb(67, 56, 202)',
      backgroundColor: 'rgb(220, 252, 231)'
    }
  },
  {
    id: 'duplicate-base',
    properties: ['backgroundColor', 'color', 'paddingTop'],
    expected: {
      backgroundColor: 'rgb(255, 255, 255)',
      color: 'rgb(51, 65, 85)',
      paddingTop: '14px'
    }
  },
  {
    id: 'duplicate-align',
    properties: ['display', 'alignItems', 'backgroundColor', 'paddingTop'],
    expected: {
      display: 'flex',
      alignItems: 'center',
      backgroundColor: 'rgb(255, 255, 255)',
      paddingTop: '14px'
    }
  },
  {
    id: 'attribute-presence',
    properties: ['color', 'backgroundColor', 'paddingTop'],
    expected: {
      color: 'rgb(30, 58, 138)',
      backgroundColor: 'rgb(219, 234, 254)'
    }
  },
  {
    id: 'attribute-node-order',
    properties: ['color', 'backgroundColor', 'paddingTop'],
    expected: {
      color: 'rgb(88, 28, 135)',
      backgroundColor: 'rgb(243, 232, 255)'
    }
  },
  {
    id: 'attribute-order-risk',
    properties: ['color', 'backgroundColor', 'borderTopColor', 'fontWeight'],
    expected: {
      color: 'rgb(180, 83, 9)',
      backgroundColor: 'rgb(255, 251, 235)'
    }
  },
  {
    id: 'attribute-near-miss',
    properties: ['color', 'boxShadow', 'paddingTop'],
    expected: {
      color: 'rgb(51, 65, 85)',
      boxShadow: 'rgba(248, 113, 113, 0.45) 0px 0px 0px 3px'
    }
  },
  {
    id: 'fallback-child',
    properties: ['boxShadow', 'backgroundColor', 'borderTopColor'],
    expected: { boxShadow: 'rgba(15, 23, 42, 0.12) 0px 12px 22px 0px' }
  },
  {
    id: 'compound-chip',
    properties: ['color', 'backgroundColor', 'borderTopColor'],
    expected: {
      color: 'rgb(146, 64, 14)',
      backgroundColor: 'rgb(255, 247, 237)',
      borderTopColor: 'rgb(254, 215, 170)'
    }
  },
  {
    id: 'attribute-state-risk',
    properties: ['color', 'backgroundColor', 'fontWeight'],
    expected: {
      color: 'rgb(153, 27, 27)',
      backgroundColor: 'rgb(254, 226, 226)'
    }
  },
  {
    id: 'disabled-button',
    properties: ['color', 'backgroundColor', 'cursor', 'fontWeight'],
    expected: {
      color: 'rgb(148, 163, 184)',
      backgroundColor: 'rgb(241, 245, 249)',
      cursor: 'not-allowed',
      fontWeight: '800'
    }
  },
  {
    id: 'pseudo-marker',
    pseudo: '::before',
    properties: ['content', 'backgroundColor', 'width'],
    expected: {
      content: '""',
      backgroundColor: 'rgb(15, 118, 110)',
      width: '4px'
    }
  },
  {
    id: 'pseudo-after',
    pseudo: '::after',
    properties: ['content', 'color', 'display', 'width', 'height', 'marginLeft'],
    expected: {
      content: '"A"',
      color: 'rgb(124, 58, 237)',
      display: 'inline-block',
      width: '8px',
      height: '6px',
      marginLeft: '6px'
    }
  }
];

const baseHoverCases = [
  {
    id: 'hover-button',
    properties: ['backgroundColor', 'borderTopColor', 'cursor', 'fontWeight'],
    expected: {
      backgroundColor: 'rgb(248, 250, 252)',
      borderTopColor: 'rgb(148, 163, 184)',
      fontWeight: '800'
    }
  }
];

const baseSelectorListHoverCases = [
  {
    id: 'selector-list-interactive',
    properties: ['backgroundColor'],
    expected: { backgroundColor: 'rgb(219, 234, 254)' }
  }
];

const baseAttributeHoverCases = [
  {
    id: 'attribute-order-risk',
    properties: ['color', 'backgroundColor', 'fontWeight'],
    expected: { color: 'rgb(124, 58, 237)' }
  }
];

const baseFocusCases = [
  {
    id: 'focus-button',
    properties: ['outlineColor', 'outlineStyle', 'outlineWidth', 'outlineOffset', 'fontWeight'],
    expected: {
      outlineColor: 'rgb(153, 246, 228)',
      outlineStyle: 'solid',
      outlineWidth: '3px',
      fontWeight: '800'
    }
  }
];

const baseSelectorListFocusCases = [
  {
    id: 'selector-list-interactive-peer',
    properties: ['outlineColor', 'outlineStyle', 'outlineWidth'],
    expected: {
      outlineColor: 'rgb(240, 171, 252)',
      outlineStyle: 'solid',
      outlineWidth: '3px'
    }
  }
];

const preprocessorCases = [
  {
    id: 'scss-asset',
    properties: ['color', 'backgroundColor', 'paddingTop', 'borderTopColor', 'borderRadius'],
    expected: { backgroundColor: 'rgb(204, 251, 241)' }
  },
  {
    id: 'scss-safe',
    properties: ['color', 'backgroundColor', 'paddingTop', 'outlineColor', 'outlineWidth'],
    expected: { color: 'rgb(15, 118, 110)' }
  },
  {
    id: 'scss-attribute-ready',
    properties: ['color', 'backgroundColor', 'paddingTop', 'borderTopColor'],
    expected: {
      color: 'rgb(15, 118, 110)',
      backgroundColor: 'rgb(204, 251, 241)'
    }
  },
  {
    id: 'less-safe',
    properties: ['color', 'backgroundColor', 'borderRadius', 'gap'],
    expected: { borderRadius: '9px' }
  },
  {
    id: 'less-child',
    properties: ['fontWeight'],
    expected: { fontWeight: '700' }
  }
];

/**
 * 运行选定 suite 的 semantic/native dev、preview 与 HMR 视觉验收。
 *
 * @returns {Promise<void>} 所有浏览器对照与 HMR 断言通过后解决。
 * @throws {Error} 当参数非法、进程失败、浏览器不可用或视觉断言不成立时抛出。
 */
async function main() {
  const args = process.argv.slice(2);
  const selectedSuites = resolveSuites(args);
  const reportFile = resolveReportFile(args);
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'gss-vite-visual-'));

  try {
    for (const suite of selectedSuites) {
      await compareDev(suite);
      await comparePreview(suite, tempRoot);
    }

    if (selectedSuites.includes('preprocessor')) {
      await verifyPartialReload(tempRoot);
    }
    const report = mergeStyleDiffReports(styleDiffReports);
    await writeAndAssertStyleDiffReport(report, reportFile ? path.resolve(reportFile) : undefined);
    if (deferredVisualErrors.length > 0) {
      throw new AggregateError(deferredVisualErrors, 'Vite visual 固定值或布局断言失败');
    }
    console.log(`Vite CSS Modules visual 验收通过: ${selectedSuites.join(', ')}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/** 解析可选的 style diff report 输出路径。 */
function resolveReportFile(args) {
  const index = args.indexOf('--report');
  if (index === -1) return undefined;
  const filename = args[index + 1];
  if (!filename || filename.startsWith('--')) throw new Error('--report 需要文件路径。');
  return filename;
}

/**
 * 解析 visual 验收的 suite 参数，未指定时运行全部场景。
 *
 * @param {string[]} args - 命令行参数。
 * @returns {Array<'base' | 'preprocessor'>} 需要运行的 suite 列表。
 * @throws {Error} 当 suite 参数不受支持时抛出。
 */
function resolveSuites(args) {
  const suiteIndex = args.indexOf('--suite');
  const suite = suiteIndex === -1 ? 'all' : args[suiteIndex + 1];

  if (suite === 'all') return ['base', 'preprocessor'];
  if (suite === 'base' || suite === 'preprocessor') return [suite];
  throw new Error(`不支持的 visual suite: ${suite}`);
}

/**
 * 启动 semantic/native 开发服务器并比较浏览器渲染结果。
 *
 * @param {'base' | 'preprocessor'} suite - 要验证的 fixture 场景。
 * @returns {Promise<void>} 开发模式对照通过且服务器完成清理后解决。
 */
async function compareDev(suite) {
  const [semanticPort, nativePort] = await allocatePorts(2);
  const semantic = await startVite(`${suite}-semantic-dev`, fixtureRoot, suite, 'semantic', [
    '--host',
    host,
    '--port',
    String(semanticPort),
    '--strictPort'
  ]);
  const native = await startVite(`${suite}-native-dev`, fixtureRoot, suite, 'native', [
    '--host',
    host,
    '--port',
    String(nativePort),
    '--strictPort'
  ]);

  try {
    await compareServers(`${suite}/dev`, suite, urlFor(semanticPort), urlFor(nativePort));
  } finally {
    await Promise.all([stopProcess(semantic), stopProcess(native)]);
  }
}

/**
 * 分别构建 semantic/native 产物，并通过 preview 服务比较渲染结果。
 *
 * @param {'base' | 'preprocessor'} suite - 要验证的 fixture 场景。
 * @param {string} tempRoot - 隔离 build 输出的临时目录。
 * @returns {Promise<void>} preview 对照通过且服务器完成清理后解决。
 */
async function comparePreview(suite, tempRoot) {
  const semanticOutDir = path.join(tempRoot, `${suite}-semantic-dist`);
  const nativeOutDir = path.join(tempRoot, `${suite}-native-dist`);
  await runVite(`${suite}-semantic-build`, fixtureRoot, suite, 'semantic', [
    'build',
    '--outDir',
    semanticOutDir,
    '--emptyOutDir'
  ]);
  await runVite(`${suite}-native-build`, fixtureRoot, suite, 'native', [
    'build',
    '--outDir',
    nativeOutDir,
    '--emptyOutDir'
  ]);

  const [semanticPort, nativePort] = await allocatePorts(2);
  const semantic = await startVite(`${suite}-semantic-preview`, fixtureRoot, suite, 'semantic', [
    'preview',
    '--host',
    host,
    '--port',
    String(semanticPort),
    '--strictPort',
    '--outDir',
    semanticOutDir
  ]);
  const native = await startVite(`${suite}-native-preview`, fixtureRoot, suite, 'native', [
    'preview',
    '--host',
    host,
    '--port',
    String(nativePort),
    '--strictPort',
    '--outDir',
    nativeOutDir
  ]);

  try {
    await compareServers(`${suite}/preview`, suite, urlFor(semanticPort), urlFor(nativePort));
  } finally {
    await Promise.all([stopProcess(semantic), stopProcess(native)]);
  }
}

/**
 * 在临时 fixture 中修改 Sass partial，确认 full reload 后使用新结果。
 *
 * @param {string} tempRoot - 用于复制 fixture 的临时根目录。
 * @returns {Promise<void>} partial 更新已反映到 computed style 后解决。
 * @throws {Error} 当页面未加载、样式未更新或 full reload 未发生时抛出。
 */
async function verifyPartialReload(tempRoot) {
  const tempFixture = path.join(tempRoot, 'hmr-fixture');
  await cp(fixtureRoot, tempFixture, {
    recursive: true,
    /**
     * 排除体积大且可通过软链接复用的依赖与历史构建目录。
     *
     * @param {string} source - `cp` 当前准备复制的源路径。
     * @returns {boolean} 当前路径是否应复制到临时 fixture。
     */
    filter(source) {
      return !source.includes(`${path.sep}node_modules`) && !source.includes(`${path.sep}dist`);
    }
  });
  // 临时副本离开 workspace 后不能继承仓库根 tsconfig，只保留 Vite 转译 TSX 所需的最小配置。
  await writeFile(
    path.join(tempFixture, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          isolatedModules: true,
          jsx: 'react-jsx'
        }
      },
      null,
      2
    )}\n`
  );
  await symlink(path.join(fixtureRoot, 'node_modules'), path.join(tempFixture, 'node_modules'), 'dir');

  const port = await allocatePort();
  const server = await startVite('preprocessor-semantic-hmr', tempFixture, 'preprocessor', 'semantic', [
    '--host',
    host,
    '--port',
    String(port),
    '--strictPort'
  ]);
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let loadCount = 0;
  page.on('load', () => {
    loadCount += 1;
  });

  try {
    await page.goto(urlFor(port), { waitUntil: 'load' });
    try {
      await page.waitForSelector('[data-gss-case="scss-safe"]', { timeout: 5_000 });
    } catch (error) {
      throw new Error(
        `临时 HMR fixture 未渲染 preprocessor suite\nurl=${page.url()}\nhtml=${await page.content()}\nserver=${server.output.join('')}\n${formatError(error)}`
      );
    }
    await assertComputedColor(page, 'scss-safe', 'rgb(15, 118, 110)');
    // 页面初次编译完成不代表 chokidar 已建立全部 partial watch，留出短窗口避免丢失紧随其后的写入。
    await delay(750);

    const tokenFile = path.join(tempFixture, 'suites/preprocessor/src/cases/_tokens.scss');
    const source = await readFile(tokenFile, 'utf8');
    assert(source.includes('#0f766e'), 'partial HMR fixture 缺少预期的初始颜色');
    await writeFile(tokenFile, source.replace('#0f766e', '#7c3aed'));

    try {
      await page.waitForFunction(
        () => {
          const element = document.querySelector('[data-gss-case="scss-safe"]');
          return element && getComputedStyle(element).color === 'rgb(124, 58, 237)';
        },
        undefined,
        { timeout: timeoutMs }
      );
    } catch (error) {
      const currentColor = await page
        .locator('[data-gss-case="scss-safe"]')
        .evaluate((element) => getComputedStyle(element).color);
      throw new Error(
        `partial HMR 超时 currentColor=${currentColor} loadCount=${loadCount}\nserver=${server.output.join('')}\n${formatError(error)}`
      );
    }
    assert(loadCount >= 2, 'partial 更新应触发浏览器 full reload');
    const staleSelectors = await captureClassSelectors(page, '[data-gss-case="scss-safe"]');
    assert(
      staleSelectors.some(({ className }) => !className.startsWith('fixture_')),
      'partial 更新后的 semantic token 应包含待清理 atomic class'
    );

    const appFile = path.join(tempFixture, 'suites/preprocessor/src/App.tsx');
    const appSource = await readFile(appFile, 'utf8');
    const scssMarkup = `      <section
        className={scssStyles.assetComposed}
        data-gss-case="scss-asset"
        data-state="ready"
      >
        SCSS asset fallback
      </section>
      <button className={scssStyles.safeScss} data-gss-case="scss-safe">
        SCSS safe atomic
      </button>
      <section
        className={scssStyles.compiledAttribute}
        data-state="ready"
        data-gss-case="scss-attribute-ready"
      >
        SCSS compiled attribute selector
      </section>
`;
    const appWithoutScss = appSource
      .replace("import scssStyles from './cases/Theme.module.scss';\n", '')
      .replace(scssMarkup, '');
    assert(!appWithoutScss.includes('scssStyles'), 'import-removal fixture 应完整移除 SCSS 引用');
    const importRemovalReload = page.waitForEvent('load', { timeout: timeoutMs });
    await writeFile(appFile, appWithoutScss);
    await importRemovalReload;

    await page.waitForFunction(async (selectors) => {
      try {
        const payload = await fetch('/__semantic-atomic-css/report').then((response) => response.json());
        const report = payload.environments?.[0]?.report;
        const hasStaleRule = Array.from(document.styleSheets).some((sheet) =>
          Array.from(sheet.cssRules).some((rule) =>
            selectors.some(({ selector }) => rule.cssText.includes(selector))
          )
        );
        return report?.summary?.files === 2 && !hasStaleRule;
      } catch {
        return false;
      }
    }, staleSelectors, { timeout: timeoutMs });
    assert(loadCount >= 3, '移除 CSS Module import 应触发 full reload');
  } finally {
    await browser.close();
    await stopProcess(server);
  }
}

/**
 * 在全部视口比较 semantic/native 的 class 增强与 computed style。
 *
 * @param {string} label - 用于错误定位的运行标签。
 * @param {'base' | 'preprocessor'} suite - 当前 fixture 场景。
 * @param {string} semanticUrl - semantic 服务地址。
 * @param {string} nativeUrl - native 对照服务地址。
 * @returns {Promise<void>} 所有视口和交互状态一致后解决。
 */
async function compareServers(label, suite, semanticUrl, nativeUrl) {
  const browser = await launchBrowser();

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const semanticPage = await context.newPage();
      const nativePage = await context.newPage();
      const browserErrors = [];
      captureBrowserErrors(semanticPage, 'semantic', browserErrors);
      captureBrowserErrors(nativePage, 'native', browserErrors);

      try {
        await Promise.all([
          semanticPage.goto(semanticUrl, { waitUntil: 'load' }),
          nativePage.goto(nativeUrl, { waitUntil: 'load' })
        ]);
        await assertSemanticClassExpansion(label, suite, semanticPage, nativePage);
        if (suite === 'base') {
          await assertBaseCaseTokenContracts(label, semanticPage, nativePage);
          await assertBaseAttributeTokenContracts(label, semanticPage, nativePage);
        } else {
          await assertPreprocessorAttributeTokenContract(label, semanticPage, nativePage);
        }
        if (label.endsWith('/dev')) {
          await assertDevtools(label, suite, semanticPage, nativePage);
        } else {
          const [semanticOverlay, nativeOverlay] = await Promise.all([
            semanticPage.locator('[data-semantic-atomic-css-overlay]').count(),
            nativePage.locator('[data-semantic-atomic-css-overlay]').count()
          ]);
          assert(semanticOverlay === 0 && nativeOverlay === 0, `${label}: preview 不应注入 GSS overlay`);
        }

        if (suite === 'base') {
          await compareAttributeMutation(label, viewport, semanticPage, nativePage);
          await compareCases(label, viewport, 'base', semanticPage, nativePage, baseCases);
          await Promise.all([
            semanticPage.locator('[data-gss-case="hover-button"]').hover(),
            nativePage.locator('[data-gss-case="hover-button"]').hover()
          ]);
          await compareCases(label, viewport, 'hover', semanticPage, nativePage, baseHoverCases);
          await Promise.all([
            semanticPage.locator('[data-gss-case="selector-list-interactive"]').hover(),
            nativePage.locator('[data-gss-case="selector-list-interactive"]').hover()
          ]);
          await compareCases(
            label,
            viewport,
            'selector-list-hover',
            semanticPage,
            nativePage,
            baseSelectorListHoverCases
          );
          await Promise.all([
            semanticPage.locator('[data-gss-case="attribute-order-risk"]').hover(),
            nativePage.locator('[data-gss-case="attribute-order-risk"]').hover()
          ]);
          await compareCases(
            label,
            viewport,
            'attribute-hover',
            semanticPage,
            nativePage,
            baseAttributeHoverCases
          );
          await Promise.all([
            semanticPage.locator('[data-gss-case="focus-button"]').focus(),
            nativePage.locator('[data-gss-case="focus-button"]').focus()
          ]);
          await compareCases(label, viewport, 'focus', semanticPage, nativePage, baseFocusCases);
          await Promise.all([
            semanticPage.locator('[data-gss-case="selector-list-interactive-peer"]').focus(),
            nativePage.locator('[data-gss-case="selector-list-interactive-peer"]').focus()
          ]);
          await compareCases(
            label,
            viewport,
            'selector-list-focus',
            semanticPage,
            nativePage,
            baseSelectorListFocusCases
          );
        } else {
          await compareCases(label, viewport, 'base', semanticPage, nativePage, preprocessorCases);
          await Promise.all([
            semanticPage.locator('[data-gss-case="scss-safe"]').focus(),
            nativePage.locator('[data-gss-case="scss-safe"]').focus()
          ]);
          await compareCases(label, viewport, 'focus', semanticPage, nativePage, preprocessorCases);
        }

        assert(browserErrors.length === 0, `${label}/${viewport.name} 浏览器错误\n${browserErrors.join('\n')}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

/**
 * 断言 semantic token 比 native token 多出至少一个 atomic class。
 *
 * @param {string} label - 用于错误定位的运行标签。
 * @param {'base' | 'preprocessor'} suite - 当前 fixture 场景。
 * @param {import('playwright').Page} semanticPage - semantic 页面。
 * @param {import('playwright').Page} nativePage - native 对照页面。
 * @returns {Promise<void>} class token 增强断言通过后解决。
 * @throws {Error} 当 semantic class 数量未增加时抛出。
 */
async function assertSemanticClassExpansion(label, suite, semanticPage, nativePage) {
  const id = suite === 'base' ? 'cascade-active' : 'scss-safe';
  const selector = `[data-gss-case="${id}"]`;
  const [semanticClassName, nativeClassName] = await Promise.all([
    semanticPage.locator(selector).evaluate((element) => element.className),
    nativePage.locator(selector).evaluate((element) => element.className)
  ]);
  const semanticCount = splitClassName(semanticClassName).length;
  const nativeCount = splitClassName(nativeClassName).length;
  assert(
    semanticCount > nativeCount,
    `${label}: semantic class token 未体现 atomic 增强\nsemantic=${semanticClassName}\nnative=${nativeClassName}`
  );
}

/**
 * 逐个验证 mixed 与 duplicate case 保留原生 scoped token，并命中各自 safe-side atomic rule。
 *
 * @param {string} label - 用于错误定位的运行标签。
 * @param {import('playwright').Page} semanticPage - semantic 页面。
 * @param {import('playwright').Page} nativePage - native 对照页面。
 * @returns {Promise<void>} 八个 case 的 token 边界全部成立后解决。
 */
async function assertBaseCaseTokenContracts(label, semanticPage, nativePage) {
  const cases = [
    {
      id: 'oracle-non-competing',
      nativeTokenCount: 2,
      exactAtomicTokenCount: 2,
      atomicRules: [
        { property: 'color', value: '#4338ca' },
        {
          property: 'background',
          value: '#fef3c7',
          selectorSuffix: '[data-oracle="non-competing"]'
        }
      ]
    },
    {
      id: 'oracle-important',
      nativeTokenCount: 2,
      exactAtomicTokenCount: 1,
      atomicRules: [{ property: 'color', value: '#9f1239', priority: 'important' }]
    },
    {
      id: 'oracle-specificity',
      nativeTokenCount: 2,
      exactAtomicTokenCount: 2,
      atomicRules: [
        { property: 'color', value: '#7c3aed' },
        { property: 'color', value: '#0e7490', selectorSuffix: '[data-oracle="specificity"]' }
      ]
    },
    {
      id: 'oracle-stable-order',
      nativeTokenCount: 2,
      exactAtomicTokenCount: 1,
      atomicRules: [{ property: 'color', value: '#7c2d12' }]
    },
    {
      id: 'oracle-media-overlap',
      nativeTokenCount: 2,
      exactAtomicTokenCount: 3,
      atomicRules: [
        { property: 'color', value: '#1e3a8a' },
        { property: 'color', value: '#2563eb', media: '(min-width: 600px)' },
        { property: 'color', value: '#be123c', media: '(min-width: 900px)' }
      ]
    },
    {
      id: 'oracle-supports-overlap',
      nativeTokenCount: 2,
      exactAtomicTokenCount: 1,
      atomicRules: [{ property: 'color', value: '#4338ca' }]
    },
    {
      id: 'duplicate-base',
      nativeTokenCount: 1,
      atomicRules: [{ property: 'color', value: '#334155' }]
    },
    {
      id: 'duplicate-align',
      nativeTokenCount: 1,
      atomicRules: [{ property: 'align-items', value: 'center' }]
    },
    {
      id: 'selector-list-interactive',
      nativeTokenCount: 1,
      exactAtomicTokenCount: 3,
      atomicRules: [
        { property: 'background-color', value: '#f8fafc' },
        { property: 'background-color', value: '#dbeafe', selectorSuffix: ':hover' },
        { property: 'outline', value: '3px solid #f0abfc', selectorSuffix: ':focus-visible' }
      ]
    },
    {
      id: 'selector-list-interactive-peer',
      nativeTokenCount: 1,
      exactAtomicTokenCount: 3,
      atomicRules: [
        { property: 'background-color', value: '#f8fafc' },
        { property: 'background-color', value: '#dbeafe', selectorSuffix: ':hover' },
        { property: 'outline', value: '3px solid #f0abfc', selectorSuffix: ':focus-visible' }
      ]
    },
    {
      id: 'pseudo-marker',
      nativeTokenCount: 1,
      atomicRules: [
        { property: 'content', value: '""', selectorSuffix: '::before' },
        { property: 'background', value: '#0f766e', selectorSuffix: '::before' },
        { property: 'width', value: '4px', selectorSuffix: '::before' }
      ]
    },
    {
      id: 'pseudo-after',
      nativeTokenCount: 1,
      atomicRules: [
        { property: 'content', value: '"A"', selectorSuffix: ':after' },
        { property: 'color', value: '#7c3aed', selectorSuffix: ':after' },
        { property: 'width', value: '8px', selectorSuffix: ':after' }
      ]
    }
  ];

  for (const spec of cases) {
    const { id } = spec;
    const selector = `[data-gss-case="${id}"]`;
    const [semanticClassName, nativeClassName] = await Promise.all([
      semanticPage.locator(selector).evaluate((element) => element.className),
      nativePage.locator(selector).evaluate((element) => element.className)
    ]);
    const semanticTokens = splitClassName(semanticClassName);
    const nativeTokens = splitClassName(nativeClassName);

    assert(
      nativeTokens.length === spec.nativeTokenCount,
      `${label}/${id}: native scoped token 数应为 ${spec.nativeTokenCount}\nnative=${nativeClassName}`
    );
    assert(
      nativeTokens.every((token) => semanticTokens.includes(token)),
      `${label}/${id}: semantic 必须保留全部 native scoped token\nsemantic=${semanticClassName}\nnative=${nativeClassName}`
    );
    const atomicTokens = semanticTokens.filter((token) => !nativeTokens.includes(token));
    assert(
      atomicTokens.length > 0,
      `${label}/${id}: semantic 必须至少追加一枚 atomic token\nsemantic=${semanticClassName}\nnative=${nativeClassName}`
    );
    if (spec.exactAtomicTokenCount !== undefined) {
      assert(
        atomicTokens.length === spec.exactAtomicTokenCount,
        `${label}/${id}: safe side atomic token 数应为 ${spec.exactAtomicTokenCount}\natomic=${atomicTokens.join(' ')}`
      );
    }

    const atomicRuleMatches = await captureAtomicRuleMatches(semanticPage, atomicTokens, spec.atomicRules);
    for (const expectedRule of spec.atomicRules) {
      assert(
        atomicRuleMatches.some((actualRule) =>
          matchesCapturedAtomicRule(actualRule, expectedRule, atomicTokens)
        ),
        `${label}/${id}: semantic 新增 token 未绑定预期 atomic rule ${JSON.stringify(expectedRule)}\n` +
          `atomic=${atomicTokens.join(' ')}\nrules=${JSON.stringify(atomicRuleMatches)}`
      );
    }
  }
}

/**
 * 验证 base attribute 正向 class 的完整 guarded CSSOM selector，以及两个 fallback class 的 token 边界。
 */
async function assertBaseAttributeTokenContracts(label, semanticPage, nativePage) {
  const eligibleCases = [
    {
      id: 'attribute-state',
      atomicRules: [
        { property: 'background', value: '#dcfce7', selectorSuffix: '[data-state="open"]' },
        { property: 'background', value: '#fee2e2', selectorSuffix: '[data-state="closed"]' }
      ]
    },
    {
      id: 'attribute-presence',
      atomicRules: [{ property: 'background', value: '#dbeafe', selectorSuffix: '[data-present]' }]
    },
    {
      id: 'attribute-node-order',
      atomicRules: [
        { property: 'background', value: '#f3e8ff', selectorPrefix: '[data-placement="before"]' }
      ]
    },
    {
      id: 'selector-list-attribute',
      atomicRules: [
        { property: 'background-color', value: '#dcfce7', selectorSuffix: '[data-list-state="open"]' }
      ]
    },
    {
      id: 'selector-list-attribute-peer',
      atomicRules: [
        { property: 'background-color', value: '#dcfce7', selectorPrefix: '[data-list-state="open"]' }
      ]
    }
  ];

  for (const spec of eligibleCases) {
    const { semanticTokens, nativeTokens } = await readComparedClassTokens(
      label,
      spec.id,
      semanticPage,
      nativePage
    );
    const atomicTokens = semanticTokens.filter((token) => !nativeTokens.includes(token));
    assert(atomicTokens.length > 0, `${label}/${spec.id}: eligible attribute class 应追加 atomic token`);
    const matches = await captureAtomicRuleMatches(semanticPage, atomicTokens, spec.atomicRules);
    for (const expectedRule of spec.atomicRules) {
      assert(
        matches.some((match) => matchesCapturedAtomicRule(match, expectedRule, atomicTokens)),
        `${label}/${spec.id}: 缺少完整 guarded atomic selector ${JSON.stringify(expectedRule)}\n` +
          `matches=${JSON.stringify(matches)}`
      );
    }
  }

  const styleSelectors = await captureStyleSelectors(semanticPage);
  for (const spec of [
    {
      id: 'attribute-order-risk',
      expectedSelectors: (className) => [`.${className}[data-state]`, `.${className}:hover`]
    },
    {
      id: 'attribute-near-miss',
      expectedSelectors: (className) => [`.${className}[data-kind^="danger"]`]
    }
  ]) {
    const { semanticTokens, nativeTokens } = await readComparedClassTokens(
      label,
      spec.id,
      semanticPage,
      nativePage
    );
    assert(
      semanticTokens.length === nativeTokens.length,
      `${label}/${spec.id}: fallback class 不得追加 partial atomic token`
    );
    for (const expectedSelector of spec.expectedSelectors(nativeTokens[0])) {
      assert(
        styleSelectors.includes(expectedSelector),
        `${label}/${spec.id}: scoped fallback CSSOM 缺少 ${expectedSelector}`
      );
    }
  }
}

/** 验证 Sass nested selector 经 Vite 编译后仍以完整 attribute-guarded atomic selector 输出。 */
async function assertPreprocessorAttributeTokenContract(label, semanticPage, nativePage) {
  const { semanticTokens, nativeTokens } = await readComparedClassTokens(
    label,
    'scss-attribute-ready',
    semanticPage,
    nativePage
  );
  const atomicTokens = semanticTokens.filter((token) => !nativeTokens.includes(token));
  const expectedRules = [
    { property: 'color', value: '#0f766e', selectorSuffix: '[data-state="ready"]' },
    { property: 'background', value: '#ccfbf1', selectorSuffix: '[data-state="ready"]' }
  ];
  const matches = await captureAtomicRuleMatches(semanticPage, atomicTokens, expectedRules);
  for (const expectedRule of expectedRules) {
    assert(
      matches.some((match) => matchesCapturedAtomicRule(match, expectedRule, atomicTokens)),
      `${label}/scss-attribute-ready: SCSS compiled guard 缺少 ${JSON.stringify(expectedRule)}\n` +
        `matches=${JSON.stringify(matches)}`
    );
  }
}

/** 读取 semantic/native class tokens，并统一断言原生 scoped token 未被 adapter 丢失。 */
async function readComparedClassTokens(label, id, semanticPage, nativePage) {
  const selector = `[data-gss-case="${id}"]`;
  const [semanticClassName, nativeClassName] = await Promise.all([
    semanticPage.locator(selector).evaluate((element) => element.className),
    nativePage.locator(selector).evaluate((element) => element.className)
  ]);
  const semanticTokens = splitClassName(semanticClassName);
  const nativeTokens = splitClassName(nativeClassName);
  assert(
    nativeTokens.every((token) => semanticTokens.includes(token)),
    `${label}/${id}: semantic 必须保留全部 native scoped token\n` +
      `semantic=${semanticClassName}\nnative=${nativeClassName}`
  );
  return { semanticTokens, nativeTokens };
}

/**
 * 依次执行 absent → open → closed → removed，并证明 attribute mutation 不改变任何一侧 className。
 */
async function compareAttributeMutation(label, viewport, semanticPage, nativePage) {
  const selector = '[data-gss-case="attribute-state"]';
  const [semanticClassName, nativeClassName] = await Promise.all([
    semanticPage.locator(selector).evaluate((element) => element.className),
    nativePage.locator(selector).evaluate((element) => element.className)
  ]);
  const states = [
    {
      name: 'absent',
      value: null,
      expected: { color: 'rgb(71, 85, 105)', backgroundColor: 'rgb(248, 250, 252)' }
    },
    {
      name: 'open',
      value: 'open',
      expected: { color: 'rgb(22, 101, 52)', backgroundColor: 'rgb(220, 252, 231)' }
    },
    {
      name: 'closed',
      value: 'closed',
      expected: { color: 'rgb(153, 27, 27)', backgroundColor: 'rgb(254, 226, 226)' }
    },
    {
      name: 'removed',
      value: null,
      expected: { color: 'rgb(71, 85, 105)', backgroundColor: 'rgb(248, 250, 252)' }
    }
  ];

  for (const state of states) {
    await Promise.all(
      [semanticPage, nativePage].map((page) =>
        page.locator(selector).evaluate((element, value) => {
          if (value === null) element.removeAttribute('data-state');
          else element.setAttribute('data-state', value);
        }, state.value)
      )
    );
    const [currentSemanticClassName, currentNativeClassName] = await Promise.all([
      semanticPage.locator(selector).evaluate((element) => element.className),
      nativePage.locator(selector).evaluate((element) => element.className)
    ]);
    assert(
      currentSemanticClassName === semanticClassName && currentNativeClassName === nativeClassName,
      `${label}/${viewport.name}/attribute-${state.name}: attribute mutation 不得改变 className`
    );
    await compareCases(label, viewport, `attribute-${state.name}`, semanticPage, nativePage, [
      {
        id: 'attribute-state',
        properties: ['color', 'backgroundColor', 'paddingTop', 'borderTopColor', 'fontWeight'],
        expected: state.expected
      }
    ]);
  }

  const listSelector = '[data-gss-case="selector-list-attribute"]';
  const [semanticListClassName, nativeListClassName] = await Promise.all([
    semanticPage.locator(listSelector).evaluate((element) => element.className),
    nativePage.locator(listSelector).evaluate((element) => element.className)
  ]);
  for (const state of [
    { name: 'absent', value: null, backgroundColor: 'rgb(248, 250, 252)' },
    { name: 'open', value: 'open', backgroundColor: 'rgb(220, 252, 231)' },
    { name: 'changed', value: 'closed', backgroundColor: 'rgb(248, 250, 252)' },
    { name: 'removed', value: null, backgroundColor: 'rgb(248, 250, 252)' }
  ]) {
    await Promise.all(
      [semanticPage, nativePage].map((page) =>
        page.locator(listSelector).evaluate((element, value) => {
          if (value === null) element.removeAttribute('data-list-state');
          else element.setAttribute('data-list-state', value);
        }, state.value)
      )
    );
    const [currentSemanticClassName, currentNativeClassName] = await Promise.all([
      semanticPage.locator(listSelector).evaluate((element) => element.className),
      nativePage.locator(listSelector).evaluate((element) => element.className)
    ]);
    assert(
      currentSemanticClassName === semanticListClassName && currentNativeClassName === nativeListClassName,
      `${label}/${viewport.name}/selector-list-attribute-${state.name}: attribute mutation 不得改变 className`
    );
    await compareCases(
      label,
      viewport,
      `selector-list-attribute-${state.name}`,
      semanticPage,
      nativePage,
      [
        {
          id: 'selector-list-attribute',
          properties: ['backgroundColor'],
          expected: { backgroundColor: state.backgroundColor }
        }
      ]
    );
  }
}

/**
 * 从 CSSOM 中读取 semantic-only class 的 atomic rule，并保留 media 上下文用于精确匹配。
 *
 * @param {import('playwright').Page} page - 当前 semantic 页面。
 * @param {string[]} atomicTokens - 相对 native 新增的 atomic class token。
 * @param {Array<{ property: string, value: string }>} expectedRules - 需要规范化 value 的预期规则。
 * @returns {Promise<Array<Record<string, string>>>} 命中 token 的 atomic declaration 与上下文。
 */
async function captureAtomicRuleMatches(page, atomicTokens, expectedRules) {
  const cssomExpectedRules = expectedRules.map((rule) => ({
    ...rule,
    selectorSuffixes: cssomSelectorSuffixes(rule.selectorSuffix)
  }));

  return await page.evaluate(
    ({ tokens, rules }) => {
      const expectedValues = Object.fromEntries(
        rules.map(({ property, value }) => {
          const probe = document.createElement('div').style;
          probe.setProperty(property, value);
          return [`${property}\0${value}`, probe.getPropertyValue(property)];
        })
      );
      const matches = [];

      /**
       * 递归读取条件规则内的 atomic selector，避免仅检查 className 字符串造成 false-green。
       *
       * @param {CSSRuleList} ruleList - 当前层级的 CSS rule 列表。
       * @param {{ media: string }} context - 当前继承的 media 上下文。
       */
      function visitRules(ruleList, context) {
        for (const rule of Array.from(ruleList)) {
          if (rule instanceof CSSStyleRule) {
            for (const token of tokens) {
              for (const expectedRule of rules) {
                const expectedSelectors = expectedRule.selectorPrefix
                  ? [`${expectedRule.selectorPrefix}.${CSS.escape(token)}`]
                  : expectedRule.selectorSuffixes.map(
                      (suffix) => `.${CSS.escape(token)}${suffix}`
                    );
                if (!expectedSelectors.includes(rule.selectorText)) continue;
                matches.push({
                  token,
                  selector: rule.selectorText,
                  expectedSelectors,
                  property: expectedRule.property,
                  value: rule.style.getPropertyValue(expectedRule.property),
                  expectedValue: expectedValues[`${expectedRule.property}\0${expectedRule.value}`],
                  priority: rule.style.getPropertyPriority(expectedRule.property),
                  media: context.media
                });
              }
            }
            continue;
          }

          if ('cssRules' in rule) {
            visitRules(rule.cssRules, {
              media: rule instanceof CSSMediaRule ? rule.conditionText : context.media
            });
          }
        }
      }

      for (const sheet of Array.from(document.styleSheets)) {
        visitRules(sheet.cssRules, { media: '' });
      }

      return matches;
    },
    { tokens: atomicTokens, rules: cssomExpectedRules }
  );
}

/**
 * 返回 CSSOM 允许的 selector suffix；Chrome 会把 legacy pseudo element 序列化为双冒号。
 *
 * 这里只放宽浏览器 selectorText 断言，不改变 static build 对 Core descriptor spelling 的严格检查。
 */
function cssomSelectorSuffixes(selectorSuffix = '') {
  const match = /^:(before|after)$/u.exec(selectorSuffix);
  return match ? [selectorSuffix, `::${match[1]}`] : [selectorSuffix];
}

/**
 * 严格匹配一次已捕获的 atomic CSSOM evidence。
 *
 * selector 必须是当前 expected rule 生成的完整单 selector，token 必须来自 semantic/native 差集，
 * property/value/priority/media 也必须同时一致，避免 pseudo alias 兼容产生 false-green。
 */
function matchesCapturedAtomicRule(actualRule, expectedRule, atomicTokens) {
  return (
    atomicTokens.includes(actualRule.token) &&
    actualRule.expectedSelectors.includes(actualRule.selector) &&
    actualRule.property === expectedRule.property &&
    actualRule.value === actualRule.expectedValue &&
    actualRule.priority === (expectedRule.priority ?? '') &&
    actualRule.media === (expectedRule.media ?? '')
  );
}

/** 用模拟的 Chrome legacy canonicalization 锁定 CSSOM mutation 兼容边界。 */
function verifyPseudoElementCssomSerializationSelfTest() {
  assert(
    cssomSelectorSuffixes(':before').includes('::before') &&
      cssomSelectorSuffixes(':after').includes('::after'),
    'CSSOM self-test 必须接受 legacy pseudo element 被序列化为双冒号'
  );
  assert(
    JSON.stringify(cssomSelectorSuffixes('::before')) === JSON.stringify(['::before']) &&
      JSON.stringify(cssomSelectorSuffixes(':hover')) === JSON.stringify([':hover']),
    'CSSOM self-test 不得放宽 modern pseudo element 或 pseudo class selector'
  );

  const expectedRule = { property: 'color', value: 'red', selectorSuffix: ':before' };
  const validEvidence = {
    token: 'atomic-token',
    selector: '.atomic-token::before',
    expectedSelectors: ['.atomic-token:before', '.atomic-token::before'],
    property: 'color',
    value: 'red',
    expectedValue: 'red',
    priority: '',
    media: ''
  };
  assert(
    matchesCapturedAtomicRule(validEvidence, expectedRule, ['atomic-token']),
    'CSSOM self-test 应接受同 token/property 的 legacy before 双冒号序列化'
  );
  for (const mutation of [
    { ...validEvidence, selector: '.atomic-token::after' },
    { ...validEvidence, selector: '.atomic-token::before, .other' },
    { ...validEvidence, token: 'other-token' },
    { ...validEvidence, property: 'background' }
  ]) {
    assert(
      !matchesCapturedAtomicRule(mutation, expectedRule, ['atomic-token']),
      `CSSOM self-test 不得接受错误 evidence: ${JSON.stringify(mutation)}`
    );
  }
}

/**
 * 比较一组 semantic/native computed style 与布局快照。
 *
 * @param {string} label - 用于错误定位的运行标签。
 * @param {{ name: string, width: number, height: number }} viewport - 当前浏览器视口。
 * @param {string} state - 当前交互状态标签。
 * @param {import('playwright').Page} semanticPage - semantic 页面。
 * @param {import('playwright').Page} nativePage - native 对照页面。
 * @param {Array<Record<string, unknown>>} cases - 要采集的验收用例描述。
 * @returns {Promise<void>} 预期值与双端一致性断言通过后解决。
 */
async function compareCases(label, viewport, state, semanticPage, nativePage, cases) {
  const [semantic, native] = await Promise.all([
    collectSnapshots(semanticPage, cases),
    collectSnapshots(nativePage, cases)
  ]);

  const report = createStyleDiffReport({
    baselineLabel: 'native',
    candidateLabel: 'semantic',
    runs: [
      {
        id: `${label}/${viewport.name}/${state}`,
        viewport: { width: viewport.width, height: viewport.height },
        baseline: Object.fromEntries(Object.entries(native).map(([key, value]) => [key, value.styles])),
        candidate: Object.fromEntries(Object.entries(semantic).map(([key, value]) => [key, value.styles]))
      }
    ]
  });
  styleDiffReports.push(report);

  try {
    assertExpectedSnapshots(label, viewport, state, semantic, cases);
    assertExpectedSnapshots(label, viewport, state, native, cases);

    for (const [key, semanticValue] of Object.entries(semantic)) {
      const nativeValue = native[key];
      assert(nativeValue, `${label}/${viewport.name}/${state}: native 缺少 ${key}`);

      if (semanticValue.rect && nativeValue.rect) {
        for (const property of ['x', 'y', 'width', 'height']) {
          const difference = Math.abs(semanticValue.rect[property] - nativeValue.rect[property]);
          assert(difference <= rectTolerance, `${label}/${viewport.name}/${state}/${key}: ${property} 偏差 ${difference}`);
        }
      }
    }
  } catch (error) {
    // 先完成全部 style diff 采集并写盘，再统一报告固定值/布局失败。
    deferredVisualErrors.push(error);
  }
}

/**
 * 在浏览器上下文中采集用例的 computed style 与可选布局矩形。
 *
 * @param {import('playwright').Page} page - 要读取的页面。
 * @param {Array<Record<string, unknown>>} cases - 用例与属性采集描述。
 * @returns {Promise<Record<string, { styles: Record<string, string>, rect?: { x: number, y: number, width: number, height: number } }>>} 按用例键索引的样式快照。
 * @throws {Error} 当目标验收元素不存在时抛出。
 */
async function collectSnapshots(page, cases) {
  const verifierCases = cases.map((spec) => ({
    id: spec.pseudo ? `${spec.id}${spec.pseudo}` : spec.id,
    selector: `[data-gss-case="${spec.id}"]`,
    properties: spec.properties,
    pseudo: spec.pseudo
  }));
  const styles = await captureComputedStyles(page, verifierCases);
  const rects = await page.evaluate((caseSpecs) => {
    return Object.fromEntries(
      caseSpecs
        .filter((spec) => spec.rect)
        .map((spec) => {
          const element = document.querySelector(`[data-gss-case="${spec.id}"]`);
          if (!element) throw new Error(`缺少验收元素: ${spec.id}`);
          const rect = element.getBoundingClientRect();
          return [spec.pseudo ? `${spec.id}${spec.pseudo}` : spec.id, {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          }];
        })
    );
  }, cases);

  return Object.fromEntries(
    Object.entries(styles).map(([key, value]) => [key, { styles: value, rect: rects[key] }])
  );
}

/** 验证 dev report API 与 Shadow DOM overlay 只出现在 semantic dev 页面。 */
async function assertDevtools(label, suite, semanticPage, nativePage) {
  await semanticPage.waitForSelector('[data-semantic-atomic-css-overlay]');
  await semanticPage.waitForFunction(() => {
    const host = document.querySelector('[data-semantic-atomic-css-overlay]');
    const health = host?.shadowRoot?.querySelector('button')?.getAttribute('data-health');
    return health === 'ready' || health === 'risky' || health === 'blocked';
  });
  const [payload, overlayState, nativeOverlay] = await Promise.all([
    semanticPage.evaluate(async () => (await fetch('/__semantic-atomic-css/report')).json()),
    semanticPage.locator('[data-semantic-atomic-css-overlay]').evaluate((element) => {
      const button = element.shadowRoot?.querySelector('button');
      const panel = element.shadowRoot?.querySelector('section');
      button?.click();
      return {
        hasShadowRoot: Boolean(element.shadowRoot),
        health: button?.getAttribute('data-health'),
        expanded: button?.getAttribute('aria-expanded'),
        panelHidden: panel?.hasAttribute('hidden')
      };
    }),
    nativePage.locator('[data-semantic-atomic-css-overlay]').count()
  ]);

  const report = payload.environments[0]?.report;
  assert(payload.adapter === 'vite' && payload.status === 'ready', 'Vite dev report API 契约不成立');
  assert(!Object.hasOwn(payload, 'schemaVersion'), 'Vite dev report 当前 envelope 不应出现 schemaVersion');
  assert(report?.analysis, 'Vite dev report API 缺少 analyzer analysis');
  if (suite === 'base') {
    assert(
      report.diagnostics.some((diagnostic) => diagnostic.reason === 'attribute-cascade-order'),
      `${label}: Vite dev report 应透传 attribute-cascade-order diagnostic`
    );
    assert(
      report.analysis.risk.unsafeReasonDistribution['attribute-cascade-order'] > 0,
      `${label}: Analyzer distribution 应包含 attribute-cascade-order`
    );
  }
  assert(overlayState.hasShadowRoot, 'Vite semantic dev overlay 应使用 Shadow DOM');
  assert(['ready', 'risky', 'blocked'].includes(overlayState.health), 'Vite overlay 未展示 report health');
  assert(overlayState.expanded === 'true' && overlayState.panelHidden === false, 'Vite overlay 展开交互失败');
  assert(nativeOverlay === 0, 'Vite native 对照不应注入 GSS overlay');
}

/** 递归收集当前页面 CSSOM 中的完整 style rule selectorText。 */
async function captureStyleSelectors(page) {
  return await page.evaluate(() => {
    const selectors = [];
    function visitRules(ruleList) {
      for (const rule of Array.from(ruleList)) {
        if (rule instanceof CSSStyleRule) selectors.push(rule.selectorText);
        else if ('cssRules' in rule) visitRules(rule.cssRules);
      }
    }
    for (const sheet of Array.from(document.styleSheets)) visitRules(sheet.cssRules);
    return selectors;
  });
}

/**
 * 校验快照满足用例声明的固定值和视口特定值。
 *
 * @param {string} label - 用于错误定位的运行标签。
 * @param {{ name: string }} viewport - 当前视口标识。
 * @param {string} state - 当前交互状态标签。
 * @param {Record<string, { styles: Record<string, string> }>} snapshots - 已采集的页面快照。
 * @param {Array<Record<string, unknown>>} cases - 包含预期值的用例描述。
 * @returns {void}
 * @throws {Error} 当任一属性值不符合预期时抛出。
 */
function assertExpectedSnapshots(label, viewport, state, snapshots, cases) {
  for (const spec of cases) {
    const key = spec.pseudo ? `${spec.id}${spec.pseudo}` : spec.id;
    const expected = { ...(spec.expected ?? {}), ...(spec.expectedByViewport?.[viewport.name] ?? {}) };

    for (const [property, value] of Object.entries(expected)) {
      const actual = snapshots[key]?.styles[property];
      assert(actual === value, `${label}/${viewport.name}/${state}/${key}: ${property} 期望 ${value}，实际 ${actual}`);
    }
  }
}

/**
 * 监听页面异常、失败响应与 console error，并追加到共享错误列表。
 *
 * @param {import('playwright').Page} page - 要监听的页面。
 * @param {string} mode - 页面所属模式，用于错误前缀。
 * @param {string[]} errors - 收集错误文本的可变数组。
 * @returns {void}
 */
function captureBrowserErrors(page, mode, errors) {
  page.on('pageerror', (error) => errors.push(`${mode} pageerror: ${formatError(error)}`));
  page.on('response', (response) => {
    if (response.status() >= 400 && !new URL(response.url()).pathname.endsWith('/favicon.ico')) {
      errors.push(`${mode} HTTP ${response.status()}: ${response.url()}`);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      errors.push(`${mode} console: ${message.text()}`);
    }
  });
}

/**
 * 断言指定验收元素的 computed color。
 *
 * @param {import('playwright').Page} page - 要查询的页面。
 * @param {string} id - `data-gss-case` 标识。
 * @param {string} expected - 期望的规范化颜色字符串。
 * @returns {Promise<void>} 颜色断言通过后解决。
 * @throws {Error} 当实际颜色与期望值不一致时抛出。
 */
async function assertComputedColor(page, id, expected) {
  const color = await page.locator(`[data-gss-case="${id}"]`).evaluate((element) => getComputedStyle(element).color);
  assert(color === expected, `${id} color 期望 ${expected}，实际 ${color}`);
}

/**
 * 启动视觉验收使用的无头 Chrome。
 *
 * @returns {Promise<import('playwright').Browser>} 已启动的浏览器实例。
 * @throws {Error} 当默认 Chrome 或显式 executable path 无法启动时抛出说明性错误。
 */
async function launchBrowser() {
  try {
    return await chromium.launch(
      chromeExecutable ? { headless: true, executablePath: chromeExecutable } : { headless: true, channel: 'chrome' }
    );
  } catch (error) {
    throw new Error(`无法启动 Chrome，可通过 GSS_VISUAL_CHROME_EXECUTABLE 指定路径。\n${formatError(error)}`);
  }
}

/**
 * 启动 Vite 服务并等待其 HTTP 端点就绪。
 *
 * @param {string} label - 进程诊断标签。
 * @param {string} cwd - Vite 子进程工作目录。
 * @param {'base' | 'preprocessor'} suite - fixture 场景。
 * @param {'semantic' | 'native'} mode - CSS 模式。
 * @param {string[]} args - 传给 Vite CLI 的参数。
 * @returns {Promise<{ label: string, child: import('node:child_process').ChildProcess, output: string[] }>} 可用于停止进程和读取日志的引用。
 * @throws {Error} 当服务提前退出或未在超时内就绪时抛出。
 */
async function startVite(label, cwd, suite, mode, args) {
  const processRef = startProcess(label, cwd, suite, mode, args);
  const portIndex = args.indexOf('--port');
  await waitForHttp(urlFor(Number(args[portIndex + 1])), processRef);
  return processRef;
}

/**
 * 运行一次性 Vite 命令并等待退出。
 *
 * @param {string} label - 进程诊断标签。
 * @param {string} cwd - Vite 子进程工作目录。
 * @param {'base' | 'preprocessor'} suite - fixture 场景。
 * @param {'semantic' | 'native'} mode - CSS 模式。
 * @param {string[]} args - 传给 Vite CLI 的参数。
 * @returns {Promise<void>} 子进程成功退出后解决。
 * @throws {Error} 当 Vite 返回非零状态时抛出并附带完整输出。
 */
async function runVite(label, cwd, suite, mode, args) {
  const processRef = startProcess(label, cwd, suite, mode, args);
  const [code, signal] = await once(processRef.child, 'exit');

  if (code !== 0) {
    throw new Error(`${label} 失败 code=${code ?? 'null'} signal=${signal ?? 'null'}\n${processRef.output.join('')}`);
  }
}

/**
 * 创建 Vite 子进程并收集 stdout/stderr，供上层统一诊断和清理。
 *
 * @param {string} label - 进程诊断标签。
 * @param {string} cwd - 子进程工作目录。
 * @param {'base' | 'preprocessor'} suite - fixture 场景。
 * @param {'semantic' | 'native'} mode - CSS 模式。
 * @param {string[]} args - 传给 Vite CLI 的参数。
 * @returns {{ label: string, child: import('node:child_process').ChildProcess, output: string[] }} 子进程引用与可变输出缓冲区。
 */
function startProcess(label, cwd, suite, mode, args) {
  const child = spawn(viteBin, args, {
    cwd,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      GSS_FIXTURE_SUITE: suite,
      GSS_FIXTURE_CSS_MODE: mode
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => output.push(chunk));
  child.stderr.on('data', (chunk) => output.push(chunk));
  return { label, child, output };
}

/**
 * 轮询 HTTP 端点直到成功响应、进程提前退出或达到超时。
 *
 * @param {string} url - 要探测的服务地址。
 * @param {{ label: string, child: import('node:child_process').ChildProcess, output: string[] }} processRef - 被监控的 Vite 进程。
 * @returns {Promise<void>} 服务返回成功响应后解决。
 * @throws {Error} 当进程提前退出或服务启动超时时抛出。
 */
async function waitForHttp(url, processRef) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (processRef.child.exitCode !== null) {
      throw new Error(`${processRef.label} 启动前退出\n${processRef.output.join('')}`);
    }

    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return;
    } catch {
      // 服务尚未 ready。
    }

    await delay(200);
  }

  throw new Error(`${processRef.label} 启动超时\n${processRef.output.join('')}`);
}

/**
 * 温和终止子进程，并在三秒后升级为 SIGKILL，避免验收残留服务。
 *
 * @param {{ child: import('node:child_process').ChildProcess }} processRef - 要停止的进程引用。
 * @returns {Promise<void>} 进程已经退出后解决。
 */
async function stopProcess(processRef) {
  if (processRef.child.exitCode !== null) return;
  processRef.child.kill('SIGTERM');
  const result = await Promise.race([once(processRef.child, 'exit'), delay(3_000).then(() => 'timeout')]);

  if (result === 'timeout' && processRef.child.exitCode === null) {
    processRef.child.kill('SIGKILL');
    await once(processRef.child, 'exit');
  }
}

/**
 * 顺序分配一组当前可用的本地 TCP 端口。
 *
 * @param {number} count - 需要分配的端口数量。
 * @returns {Promise<number[]>} 可用于启动临时服务的端口列表。
 */
async function allocatePorts(count) {
  const ports = [];
  for (let index = 0; index < count; index += 1) ports.push(await allocatePort());
  return ports;
}

/**
 * 通过临时监听端口 0 获取一个当前可用的本地 TCP 端口。
 *
 * @returns {Promise<number>} 操作系统分配的端口号。
 * @throws {Error} 当监听、关闭或地址解析失败时抛出。
 */
async function allocatePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!address || typeof address === 'string') throw new Error('无法分配端口');
  return address.port;
}

/**
 * 将 DOM className 值规范化为非空 class token 列表。
 *
 * @param {unknown} value - 浏览器返回的 className 值。
 * @returns {string[]} 按空白字符拆分后的 class token。
 */
function splitClassName(value) {
  return String(value)
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
}

/**
 * 从更新后的 DOM token 捕获待清理 selector，避免把 atomic class 命名策略固化进 HMR 验收。
 *
 * @param {import('playwright').Page} page - 当前 semantic dev 页面。
 * @param {string} elementSelector - 携带待移除 CSS Module token 的元素 selector。
 * @returns {Promise<Array<{ className: string, selector: string }>>} 当前 class 及其精确 CSS selector。
 */
async function captureClassSelectors(page, elementSelector) {
  return await page.locator(elementSelector).evaluate((element) =>
    Array.from(element.classList, (className) => ({
      className,
      selector: `.${CSS.escape(className)}`
    }))
  );
}

/**
 * 生成 fixture 本地服务根地址。
 *
 * @param {number} port - 服务监听端口。
 * @returns {string} 使用统一 host 的 HTTP URL。
 */
function urlFor(port) {
  return `http://${host}:${port}/`;
}

/**
 * 创建不阻塞事件循环的延时 Promise。
 *
 * @param {number} ms - 延迟毫秒数。
 * @returns {Promise<void>} 延时结束后解决。
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 执行视觉验收的通用条件断言。
 *
 * @param {unknown} condition - 需要成立的条件。
 * @param {string} message - 条件不成立时使用的错误信息。
 * @returns {void}
 * @throws {Error} 当条件为假值时抛出。
 */
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * 将任意异常值格式化为适合验收日志的字符串。
 *
 * @param {unknown} error - 捕获到的异常值。
 * @returns {string} 优先包含 stack 的诊断文本。
 */
function formatError(error) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}

verifyPseudoElementCssomSerializationSelfTest();
if (process.env.GSS_VISUAL_SELF_TEST_ONLY !== '1') {
  await main();
}
