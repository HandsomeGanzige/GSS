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
`;
    const appWithoutScss = appSource
      .replace("import scssStyles from './cases/Theme.module.scss';\n", '')
      .replace(scssMarkup, '');
    assert(!appWithoutScss.includes('scssStyles'), 'import-removal fixture 应完整移除 SCSS 引用');
    const importRemovalReload = page.waitForEvent('load', { timeout: timeoutMs });
    await writeFile(appFile, appWithoutScss);
    await importRemovalReload;

    await page.waitForFunction(async () => {
      try {
        const payload = await fetch('/__semantic-atomic-css/report').then((response) => response.json());
        const report = payload.environments?.[0]?.report;
        const hasStaleRule = Array.from(document.styleSheets).some((sheet) =>
          Array.from(sheet.cssRules).some((rule) => rule.cssText.includes('_color_7c3aed'))
        );
        return report?.summary?.files === 2 && !hasStaleRule;
      } catch {
        return false;
      }
    }, undefined, { timeout: timeoutMs });
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
        if (label.endsWith('/dev')) {
          await assertDevtools(semanticPage, nativePage);
        } else {
          const [semanticOverlay, nativeOverlay] = await Promise.all([
            semanticPage.locator('[data-semantic-atomic-css-overlay]').count(),
            nativePage.locator('[data-semantic-atomic-css-overlay]').count()
          ]);
          assert(semanticOverlay === 0 && nativeOverlay === 0, `${label}: preview 不应注入 GSS overlay`);
        }

        if (suite === 'base') {
          await compareCases(label, viewport, 'base', semanticPage, nativePage, baseCases);
          await Promise.all([
            semanticPage.locator('[data-gss-case="hover-button"]').hover(),
            nativePage.locator('[data-gss-case="hover-button"]').hover()
          ]);
          await compareCases(label, viewport, 'hover', semanticPage, nativePage, baseHoverCases);
          await Promise.all([
            semanticPage.locator('[data-gss-case="focus-button"]').focus(),
            nativePage.locator('[data-gss-case="focus-button"]').focus()
          ]);
          await compareCases(label, viewport, 'focus', semanticPage, nativePage, baseFocusCases);
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
async function assertDevtools(semanticPage, nativePage) {
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

  assert(payload.schemaVersion === 1 && payload.adapter === 'vite' && payload.status === 'ready', 'Vite dev report API 契约不成立');
  assert(payload.environments[0]?.report?.analysis, 'Vite dev report API 缺少 analyzer analysis');
  assert(overlayState.hasShadowRoot, 'Vite semantic dev overlay 应使用 Shadow DOM');
  assert(['ready', 'risky', 'blocked'].includes(overlayState.health), 'Vite overlay 未展示 report health');
  assert(overlayState.expanded === 'true' && overlayState.panelHidden === false, 'Vite overlay 展开交互失败');
  assert(nativeOverlay === 0, 'Vite native 对照不应注入 GSS overlay');
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

await main();
