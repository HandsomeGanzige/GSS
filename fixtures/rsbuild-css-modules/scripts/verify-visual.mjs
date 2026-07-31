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
const rsbuildBin = path.join(fixtureRoot, 'node_modules/.bin/rsbuild');
const host = '127.0.0.1';
const timeoutMs = 30_000;
const chromeExecutable = process.env.GSS_VISUAL_CHROME_EXECUTABLE;
const styleDiffReports = [];
const deferredVisualErrors = [];

/**
 * base suite 的 cascade oracle 契约。
 *
 * mixed case 同时绑定 native scoped token 数量、semantic-only atomic token 数量、
 * computed winner 与 atomic CSSOM rule，避免“页面碰巧一样”掩盖错误的拆分或加载顺序。
 */
const baseOracleContracts = [
  {
    id: 'oracle-non-competing',
    selector: '#oracle-non-competing',
    properties: ['color', 'backgroundColor'],
    nativeTokenCount: 2,
    exactAtomicTokenCount: 1,
    expected: { color: 'rgb(67, 56, 202)', backgroundColor: 'rgb(254, 243, 199)' },
    atomicRules: [{ property: 'color', value: '#4338ca' }]
  },
  {
    id: 'oracle-important',
    selector: '#oracle-important',
    properties: ['color'],
    nativeTokenCount: 2,
    exactAtomicTokenCount: 1,
    expected: { color: 'rgb(159, 18, 57)' },
    atomicRules: [{ property: 'color', value: '#9f1239', priority: 'important' }]
  },
  {
    id: 'oracle-specificity',
    selector: '#oracle-specificity',
    properties: ['color'],
    nativeTokenCount: 2,
    exactAtomicTokenCount: 1,
    expected: { color: 'rgb(14, 116, 144)' },
    atomicRules: [{ property: 'color', value: '#7c3aed' }]
  },
  {
    id: 'oracle-stable-order',
    selector: '#oracle-stable-order',
    properties: ['color'],
    nativeTokenCount: 2,
    exactAtomicTokenCount: 1,
    expected: { color: 'rgb(3, 105, 161)' },
    atomicRules: [{ property: 'color', value: '#7c2d12' }]
  },
  {
    id: 'oracle-media-overlap',
    selector: '#oracle-media-overlap',
    properties: ['color', 'backgroundColor'],
    nativeTokenCount: 2,
    exactAtomicTokenCount: 3,
    expected: { backgroundColor: 'rgb(241, 245, 249)' },
    expectedByViewport: {
      1280: { color: 'rgb(190, 18, 60)' },
      520: { color: 'rgb(30, 58, 138)' }
    },
    atomicRules: [
      { property: 'color', value: '#1e3a8a' },
      { property: 'color', value: '#2563eb', media: '(min-width: 600px)' },
      { property: 'color', value: '#be123c', media: '(min-width: 900px)' }
    ]
  },
  {
    id: 'oracle-supports-overlap',
    selector: '#oracle-supports-overlap',
    properties: ['color', 'backgroundColor'],
    nativeTokenCount: 2,
    exactAtomicTokenCount: 1,
    expected: { color: 'rgb(67, 56, 202)', backgroundColor: 'rgb(220, 252, 231)' },
    atomicRules: [{ property: 'color', value: '#4338ca' }]
  },
  {
    id: 'duplicate-late-reuse',
    selector: '#late-reuse',
    properties: ['color'],
    nativeTokenCount: 1,
    exactAtomicTokenCount: 1,
    expected: { color: 'rgb(51, 65, 85)' },
    atomicRules: [{ property: 'color', value: '#334155' }]
  },
  {
    id: 'selector-list-interactive',
    selector: '#selector-list-interactive',
    properties: ['backgroundColor'],
    nativeTokenCount: 1,
    exactAtomicTokenCount: 3,
    expected: { backgroundColor: 'rgb(248, 250, 252)' },
    atomicRules: [
      { property: 'background-color', value: '#f8fafc' },
      { property: 'background-color', value: '#dbeafe', selectorSuffix: ':hover' },
      { property: 'outline', value: '3px solid #f0abfc', selectorSuffix: ':focus-visible' }
    ]
  },
  {
    id: 'selector-list-interactive-peer',
    selector: '#selector-list-interactive-peer',
    properties: ['backgroundColor'],
    nativeTokenCount: 1,
    exactAtomicTokenCount: 3,
    expected: { backgroundColor: 'rgb(248, 250, 252)' },
    atomicRules: [
      { property: 'background-color', value: '#f8fafc' },
      { property: 'background-color', value: '#dbeafe', selectorSuffix: ':hover' },
      { property: 'outline', value: '3px solid #f0abfc', selectorSuffix: ':focus-visible' }
    ]
  },
  {
    id: 'pseudo-before',
    selector: '#pseudo-before',
    pseudo: '::before',
    properties: ['content', 'color', 'display', 'width', 'height', 'marginRight'],
    nativeTokenCount: 1,
    exactAtomicTokenCount: 8,
    expected: {
      content: '"B"',
      color: 'rgb(15, 118, 110)',
      display: 'inline-block',
      width: '7px',
      height: '5px',
      marginRight: '6px'
    },
    atomicRules: [
      { property: 'content', value: '"B"', selectorSuffix: ':before' },
      { property: 'color', value: '#0f766e', selectorSuffix: ':before' },
      { property: 'width', value: '7px', selectorSuffix: ':before' }
    ]
  },
  {
    id: 'pseudo-after',
    selector: '#pseudo-after',
    pseudo: '::after',
    properties: ['content', 'color', 'display', 'width', 'height', 'marginLeft'],
    nativeTokenCount: 1,
    exactAtomicTokenCount: 8,
    expected: {
      content: '"A"',
      color: 'rgb(124, 58, 237)',
      display: 'inline-block',
      width: '8px',
      height: '6px',
      marginLeft: '6px'
    },
    atomicRules: [
      { property: 'content', value: '"A"', selectorSuffix: ':after' },
      { property: 'color', value: '#7c3aed', selectorSuffix: ':after' },
      { property: 'width', value: '8px', selectorSuffix: ':after' }
    ]
  }
];

/** attribute 正向与 fallback 的 token/CSSOM 契约；selector variants 覆盖 dev 原始引号与 preview 原生压缩。 */
const baseAttributeContracts = {
  eligible: [
    {
      id: 'attribute-state',
      selector: '#attribute-state',
      rules: [
        { property: 'background', value: '#dcfce7', suffixes: ['[data-state="open"]', '[data-state=open]'] },
        { property: 'background', value: '#fee2e2', suffixes: ['[data-state="closed"]', '[data-state=closed]'] }
      ]
    },
    {
      id: 'attribute-presence',
      selector: '#attribute-presence',
      rules: [{ property: 'background', value: '#dbeafe', suffixes: ['[data-present]'] }]
    },
    {
      id: 'attribute-node-order',
      selector: '#attribute-node-order',
      rules: [{ property: 'background', value: '#f3e8ff', prefixes: ['[data-placement="before"]', '[data-placement=before]'] }]
    },
    {
      id: 'selector-list-attribute',
      selector: '#selector-list-attribute',
      rules: [{ property: 'background-color', value: '#dcfce7', suffixes: ['[data-list-state="open"]', '[data-list-state=open]'] }]
    },
    {
      id: 'selector-list-attribute-peer',
      selector: '#selector-list-attribute-peer',
      rules: [{ property: 'background-color', value: '#dcfce7', prefixes: ['[data-list-state="open"]', '[data-list-state=open]'] }]
    }
  ],
  fallback: [
    {
      id: 'attribute-order-risk',
      selector: '#attribute-order-risk',
      selectorVariants: (className) => [
        [`.${className}[data-state]`],
        [`.${className}:hover`]
      ]
    },
    {
      id: 'attribute-near-miss',
      selector: '#attribute-near-miss',
      selectorVariants: (className) => [[
        `.${className}[data-kind^="danger"]`,
        `.${className}[data-kind^=danger]`
      ]]
    }
  ]
};

const preprocessorAttributeContracts = {
  eligible: [
    {
      id: 'scss-attribute-ready',
      selector: '#scss-attribute-ready',
      rules: [
        { property: 'color', value: '#0f766e', suffixes: ['[data-state="ready"]', '[data-state=ready]'] },
        { property: 'background', value: '#ccfbf1', suffixes: ['[data-state="ready"]', '[data-state=ready]'] }
      ]
    }
  ],
  fallback: []
};

/** 运行 semantic/native dev、preview 与 Sass partial/full reload 浏览器验收。 */
async function main() {
  const args = process.argv.slice(2);
  const suites = resolveSuites(args);
  const reportFile = resolveReportFile(args);
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'gss-rsbuild-visual-'));

  try {
    for (const suite of suites) {
      await compareDev(suite);
      await comparePreview(suite, tempRoot);
    }
    if (suites.includes('preprocessor')) await verifyPartialReload(tempRoot);
    const report = mergeStyleDiffReports(styleDiffReports);
    await writeAndAssertStyleDiffReport(report, reportFile ? path.resolve(reportFile) : undefined);
    if (deferredVisualErrors.length > 0) {
      throw new AggregateError(deferredVisualErrors, 'Rsbuild cascade oracle 验收失败');
    }
    console.log(`Rsbuild CSS Modules visual 验收通过: ${suites.join(', ')}`);
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

/** 解析可选的单 suite 参数。 */
function resolveSuites(args) {
  const index = args.indexOf('--suite');
  const suite = index === -1 ? 'all' : args[index + 1];
  if (suite === 'all') return ['base', 'preprocessor'];
  if (suite === 'base' || suite === 'preprocessor') return [suite];
  throw new Error(`不支持的 visual suite: ${suite}`);
}

/** 启动 semantic/native dev 并比较 computed style 与 tokens。 */
async function compareDev(suite) {
  const [semanticPort, nativePort] = await allocatePorts(2);
  const semantic = await startServer('dev', fixtureRoot, suite, 'semantic', semanticPort);
  const native = await startServer('dev', fixtureRoot, suite, 'native', nativePort);
  try {
    await compareServers(`${suite}/dev`, suite, urlFor(semanticPort), urlFor(nativePort));
  } finally {
    await Promise.all([stopProcess(semantic), stopProcess(native)]);
  }
}

/** 构建隔离产物并比较 semantic/native preview。 */
async function comparePreview(suite, tempRoot) {
  const semanticOut = path.join(tempRoot, `${suite}-semantic`);
  const nativeOut = path.join(tempRoot, `${suite}-native`);
  await runBuild(fixtureRoot, suite, 'semantic', semanticOut);
  await runBuild(fixtureRoot, suite, 'native', nativeOut);
  const [semanticPort, nativePort] = await allocatePorts(2);
  const semantic = await startServer('preview', fixtureRoot, suite, 'semantic', semanticPort, semanticOut);
  const native = await startServer('preview', fixtureRoot, suite, 'native', nativePort, nativeOut);
  try {
    await compareServers(`${suite}/preview`, suite, urlFor(semanticPort), urlFor(nativePort));
  } finally {
    await Promise.all([stopProcess(semantic), stopProcess(native)]);
  }
}

/** 在两个 URL 上收集相同交互快照并做严格对照。 */
async function compareServers(label, suite, semanticUrl, nativeUrl) {
  const browser = await chromium.launch(chromeExecutable ? { executablePath: chromeExecutable } : {});
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 520, height: 900 }]) {
      const semantic = await capturePage(browser, semanticUrl, suite, viewport);
      const native = await capturePage(browser, nativeUrl, suite, viewport);
      const report = createStyleDiffReport({
        baselineLabel: 'native',
        candidateLabel: 'semantic',
        runs: [{
          id: `${label}@${viewport.width}x${viewport.height}`,
          viewport,
          baseline: native.styles,
          candidate: semantic.styles
        }]
      });
      styleDiffReports.push(report);
      try {
        assertTokenCompatibility(semantic.tokens, native.tokens, `${label} tokens`);
        assertAttributeTokenContracts(
          semantic.attributeEvidence,
          native.attributeEvidence,
          suite === 'base' ? baseAttributeContracts : preprocessorAttributeContracts,
          label
        );
        if (suite === 'base') {
          assertBaseOracleExpected(semantic.styles, viewport, `${label} semantic`);
          assertBaseOracleExpected(native.styles, viewport, `${label} native`);
          assertBaseOracleTokenContracts(semantic.oracleEvidence, native.oracleEvidence, label);
          assertBaseAttributeExpected(semantic.styles, `${label} semantic`);
          assertBaseAttributeExpected(native.styles, `${label} native`);
          assertAttributeClassNameStability(semantic.attributeMutation, `${label} semantic`);
          assertAttributeClassNameStability(native.attributeMutation, `${label} native`);
        } else {
          assertPreprocessorAttributeExpected(semantic.styles, `${label} semantic`);
          assertPreprocessorAttributeExpected(native.styles, `${label} native`);
        }
      } catch (error) {
        deferredVisualErrors.push(error);
      }
      assert(semantic.assetStatus === 200 && native.assetStatus === 200, `${label} 资源请求应成功`);
      if (label.endsWith('/dev')) {
        assert(
          semantic.devtools?.adapter === 'rsbuild' && semantic.devtools.status === 'ready',
          `${label} dev report API 契约不成立`
        );
        assert(semantic.devtools.environments[0]?.report?.analysis, `${label} dev report 缺少 analyzer analysis`);
        // 首个 viewport 在 lazy incremental compile 前锁定完整 eager graph report；后续快照按 Rsbuild 当前编译轮次重置。
        if (suite === 'base' && viewport.width === 1280) {
          const report = semantic.devtools.environments[0].report;
          assert(
            report.diagnostics.some((diagnostic) => diagnostic.reason === 'attribute-cascade-order'),
            `${label} dev report 应透传 attribute-cascade-order diagnostic\n` +
              `diagnostics=${JSON.stringify(report.diagnostics)}`
          );
          assert(
            report.analysis.risk.unsafeReasonDistribution['attribute-cascade-order'] > 0,
            `${label} analyzer distribution 应包含 attribute-cascade-order\n` +
              `distribution=${JSON.stringify(report.analysis.risk.unsafeReasonDistribution)}`
          );
        }
        assert(semantic.hasOverlay, `${label} semantic 页面缺少 Shadow DOM overlay`);
        assert(['ready', 'risky', 'blocked'].includes(semantic.overlayState?.health), `${label} overlay 未展示 report health`);
        assert(semantic.overlayState.expanded === 'true' && semantic.overlayState.panelHidden === false, `${label} overlay 展开交互失败`);
        assert(!native.hasOverlay, `${label} native 页面不应注入 GSS overlay`);
      } else {
        assert(!semantic.hasOverlay && !native.hasOverlay, `${label} preview 不应注入 GSS overlay`);
      }
    }
  } finally {
    await browser.close();
  }
}

/** 收集静态、hover/focus、lazy 和资源请求状态。 */
async function capturePage(browser, url, suite, viewport) {
  const page = await browser.newPage({ viewport });
  try {
    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    await page.waitForSelector('#tokens');
    const styles = await captureCases(page, suite);
    const oracleEvidence = suite === 'base'
      ? await captureBaseOracleEvidence(page)
      : undefined;
    const attributeEvidence = await captureAttributeEvidence(
      page,
      suite === 'base' ? baseAttributeContracts : preprocessorAttributeContracts
    );
    let attributeMutation;
    if (suite === 'base') {
      attributeMutation = await captureBaseAttributeInteractions(page, styles);
      await page.hover('#hover-button');
      styles.hover = await readStyle(page, '#hover-button', ['color', 'backgroundColor']);
      await page.hover('#selector-list-interactive');
      styles.selectorListInteractiveHover = await readStyle(
        page,
        '#selector-list-interactive',
        ['backgroundColor']
      );
      await page.focus('#hover-button');
      styles.focus = await readStyle(page, '#hover-button', ['outlineColor', 'outlineStyle', 'outlineWidth']);
      await page.focus('#selector-list-interactive-peer');
      styles.selectorListInteractiveFocus = await readStyle(
        page,
        '#selector-list-interactive-peer',
        ['outlineColor', 'outlineStyle', 'outlineWidth']
      );
    }

    const assetStatus = await page.evaluate(async () => {
      const selector = document.querySelector('#asset-button, #scss-asset');
      const background = getComputedStyle(selector).backgroundImage;
      const match = background.match(/^url\(["']?(.*?)["']?\)$/);
      return match ? (await fetch(match[1])).status : 200;
    });
    const hasOverlay = await page.locator('[data-semantic-atomic-css-overlay]').evaluateAll(
      (elements) => elements.some((element) => Boolean(element.shadowRoot))
    );
    if (hasOverlay) {
      await page.waitForFunction(() => {
        const host = document.querySelector('[data-semantic-atomic-css-overlay]');
        const health = host?.shadowRoot?.querySelector('button')?.getAttribute('data-health');
        return health === 'ready' || health === 'risky' || health === 'blocked';
      });
    }
    const overlayState = hasOverlay
      ? await page.locator('[data-semantic-atomic-css-overlay]').evaluate((element) => {
          const button = element.shadowRoot?.querySelector('button');
          const panel = element.shadowRoot?.querySelector('section');
          button?.click();
          return {
            health: button?.getAttribute('data-health'),
            expanded: button?.getAttribute('aria-expanded'),
            panelHidden: panel?.hasAttribute('hidden')
          };
        })
      : undefined;
    const devtools = hasOverlay
      ? await page.evaluate(async () => (await fetch('/__semantic-atomic-css/report')).json())
      : undefined;
    if (suite === 'base') {
      await page.click('#load-lazy');
      await page.waitForSelector('#lazy');
      styles.lazy = await readStyle(page, '#lazy', ['color', 'marginTop']);
    }
    const tokens = await page.evaluate(() => ({
      eager: globalThis.__GSS_FIXTURE_TOKENS__,
      lazy: globalThis.__GSS_FIXTURE_LAZY_TOKEN__
    }));
    return {
      styles,
      tokens,
      oracleEvidence,
      attributeEvidence,
      attributeMutation,
      assetStatus,
      hasOverlay,
      overlayState,
      devtools
    };
  } finally {
    await page.close();
  }
}

/** 按 suite 读取稳定验收锚点。 */
async function captureCases(page, suite) {
  const definitions = suite === 'base'
    ? [
        ['shell', '#shell', ['display', 'gap', 'padding', 'gridTemplateColumns']],
        ['asset', '#asset-button', ['color', 'backgroundColor', 'backgroundImage', 'borderRadius']],
        ['publicAsset', '#public-asset', ['backgroundImage', 'minHeight']],
        ['disabled', '#disabled-button', ['color', 'cursor']],
        ['cascade', '#cascade-box', ['color', 'borderTopColor', 'borderLeftColor', 'borderTopWidth']],
        ['devCascade', '#dev-cascade', ['color']],
        ['important', '#important-box', ['color']],
        ['dashed', '#dashed-token', ['color', 'backgroundColor']],
        ['icssCollision', '#icss-collision', ['color', 'padding']],
        ['selectorListCascade', '#selector-list-cascade', ['color']],
        ['selectorListPeer', '#selector-list-peer', ['color']],
        ['selectorListAttribute', '#selector-list-attribute', ['backgroundColor']],
        ['selectorListAttributePeer', '#selector-list-attribute-peer', ['backgroundColor']],
        ['selectorListAttributeCoincident', '#selector-list-attribute-coincident', ['backgroundColor']],
        ['selectorListIndependent', '#selector-list-independent', ['color', 'paddingTop']],
        ['attributePresence', '#attribute-presence', ['color', 'backgroundColor', 'paddingTop']],
        ['attributeNodeOrder', '#attribute-node-order', ['color', 'backgroundColor', 'paddingTop']],
        ['attributeOrderRisk', '#attribute-order-risk', ['color', 'backgroundColor', 'fontWeight']],
        ['attributeNearMiss', '#attribute-near-miss', ['color', 'boxShadow', 'paddingTop']],
        ['fallback', '#unsafe-child', ['boxShadow']],
        ...baseOracleContracts.map(({ id, selector, properties, pseudo }) => [id, selector, properties, pseudo])
      ]
    : [
        ['shell', '#preprocessor-shell', ['display', 'gap', 'padding']],
        ['scssAsset', '#scss-asset', ['color', 'backgroundColor', 'backgroundImage']],
        ['scssSafe', '#scss-safe', ['color', 'padding']],
        ['scssAttributeReady', '#scss-attribute-ready', ['color', 'backgroundColor', 'paddingTop', 'borderTopColor']],
        ['lessSafe', '#less-safe', ['color', 'backgroundColor', 'borderRadius']],
        ['lessChild', '#less-child', ['fontWeight']]
      ];
  return captureComputedStyles(
    page,
    definitions.map(([name, selector, properties, pseudo]) => ({ id: name, selector, properties, pseudo }))
  );
}

/**
 * 收集 attribute case 的 native/scoped token、semantic-only token 与完整 guarded CSSOM selector。
 * dev 保留 Core 引号，preview 可由 Rsbuild 原生 minifier 移除引号，两者都必须精确命中候选之一。
 */
async function captureAttributeEvidence(page, contracts) {
  const serializable = {
    eligible: contracts.eligible,
    fallback: contracts.fallback.map(({ id, selector }) => ({ id, selector }))
  };
  return await page.evaluate((specs) => {
    const allCases = [...specs.eligible, ...specs.fallback];
    const cases = Object.fromEntries(allCases.map(({ id, selector }) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`缺少 attribute DOM: ${selector}`);
      return [id, { tokens: Array.from(element.classList), rules: [] }];
    }));
    const styleSelectors = [];
    const expectedValues = Object.fromEntries(specs.eligible.flatMap(({ rules }) =>
      rules.map(({ property, value }) => {
        const probe = document.createElement('div').style;
        probe.setProperty(property, value);
        return [`${property}\0${value}`, probe.getPropertyValue(property)];
      })
    ));

    /** 递归读取 style rules，保留完整 selectorText，避免子串 false green。 */
    function visitRules(ruleList) {
      for (const rule of Array.from(ruleList)) {
        if (rule instanceof CSSStyleRule) {
          styleSelectors.push(rule.selectorText);
          for (const spec of specs.eligible) {
            for (const token of cases[spec.id].tokens) {
              for (const expectedRule of spec.rules) {
                const prefixes = expectedRule.prefixes ?? [''];
                const suffixes = expectedRule.suffixes ?? [''];
                const candidates = prefixes.flatMap((prefix) =>
                  suffixes.map((suffix) => `${prefix}.${CSS.escape(token)}${suffix}`)
                );
                const selectorArms = rule.selectorText.split(',').map((selector) => selector.trim());
                if (!candidates.some((candidate) => selectorArms.includes(candidate))) continue;
                cases[spec.id].rules.push({
                  token,
                  selector: rule.selectorText,
                  property: expectedRule.property,
                  value: rule.style.getPropertyValue(expectedRule.property),
                  expectedValue: expectedValues[`${expectedRule.property}\0${expectedRule.value}`]
                });
              }
            }
          }
          continue;
        }
        if ('cssRules' in rule) visitRules(rule.cssRules);
      }
    }

    for (const sheet of Array.from(document.styleSheets)) visitRules(sheet.cssRules);
    return { cases, styleSelectors };
  }, serializable);
}

/** 依次采集 absent/open/closed/removed 和 order-risk hover，并记录 mutation 前后 className。 */
async function captureBaseAttributeInteractions(page, styles) {
  const selector = '#attribute-state';
  const initialClassName = await page.locator(selector).evaluate((element) => element.className);
  const classNames = [];
  const states = [
    ['AttributeAbsent', null],
    ['AttributeOpen', 'open'],
    ['AttributeClosed', 'closed'],
    ['AttributeRemoved', null]
  ];
  for (const [name, value] of states) {
    await page.locator(selector).evaluate((element, nextValue) => {
      if (nextValue === null) element.removeAttribute('data-state');
      else element.setAttribute('data-state', nextValue);
    }, value);
    classNames.push(await page.locator(selector).evaluate((element) => element.className));
    styles[name] = await readStyle(page, selector, ['color', 'backgroundColor', 'paddingTop', 'fontWeight']);
  }
  await page.hover('#attribute-order-risk');
  styles.attributeOrderRiskHover = await readStyle(
    page,
    '#attribute-order-risk',
    ['color', 'backgroundColor', 'fontWeight']
  );

  const listSelector = '#selector-list-attribute';
  const listInitialClassName = await page.locator(listSelector).evaluate((element) => element.className);
  const listClassNames = [];
  for (const [name, value] of [
    ['SelectorListAttributeAbsent', null],
    ['SelectorListAttributeOpen', 'open'],
    ['SelectorListAttributeChanged', 'closed'],
    ['SelectorListAttributeRemoved', null]
  ]) {
    await page.locator(listSelector).evaluate((element, nextValue) => {
      if (nextValue === null) element.removeAttribute('data-list-state');
      else element.setAttribute('data-list-state', nextValue);
    }, value);
    listClassNames.push(await page.locator(listSelector).evaluate((element) => element.className));
    styles[name] = await readStyle(page, listSelector, ['backgroundColor']);
  }
  return { initialClassName, classNames, listInitialClassName, listClassNames };
}

/** 验证 eligible guarded rule 和两个保守失败 class 的 token/CSSOM 边界。 */
function assertAttributeTokenContracts(semanticEvidence, nativeEvidence, contracts, label) {
  assert(semanticEvidence && nativeEvidence, `${label} 缺少 attribute evidence`);
  for (const spec of contracts.eligible) {
    const semantic = semanticEvidence.cases[spec.id];
    const native = nativeEvidence.cases[spec.id];
    assert(semantic && native, `${label}/${spec.id} 缺少 eligible evidence`);
    assert(
      native.tokens.every((token) => semantic.tokens.includes(token)),
      `${label}/${spec.id}: semantic 必须保留 native scoped token`
    );
    const atomicTokens = semantic.tokens.filter((token) => !native.tokens.includes(token));
    assert(atomicTokens.length > 0, `${label}/${spec.id}: eligible attribute class 应追加 atomic token`);
    for (const expectedRule of spec.rules) {
      assert(
        semantic.rules.some((rule) =>
          atomicTokens.includes(rule.token) &&
          rule.property === expectedRule.property &&
          rule.value === rule.expectedValue
        ),
        `${label}/${spec.id}: semantic-only token 未绑定完整 guarded CSSOM rule ${JSON.stringify(expectedRule)}\n` +
          `rules=${JSON.stringify(semantic.rules)}\n` +
          `selectors=${JSON.stringify(semanticEvidence.styleSelectors.filter((selector) => selector.includes('data-list-state')))}`
      );
    }
  }

  for (const spec of contracts.fallback) {
    const semantic = semanticEvidence.cases[spec.id];
    const native = nativeEvidence.cases[spec.id];
    assert(semantic && native, `${label}/${spec.id} 缺少 fallback evidence`);
    assertDeepEqual(semantic.tokens, native.tokens, `${label}/${spec.id} fallback token`);
    const scopedClass = native.tokens[0];
    for (const variants of spec.selectorVariants(scopedClass)) {
      assert(
        variants.some((selector) => semanticEvidence.styleSelectors.includes(selector)),
        `${label}/${spec.id}: scoped fallback CSSOM 缺少 ${variants.join(' 或 ')}`
      );
    }
  }
}

/** 固定 winner 检查，避免 semantic/native 同时错误时只靠 parity 通过。 */
function assertBaseAttributeExpected(styles, label) {
  const expected = {
    selectorListAttribute: { backgroundColor: 'rgb(248, 250, 252)' },
    selectorListAttributePeer: { backgroundColor: 'rgb(220, 252, 231)' },
    selectorListAttributeCoincident: { backgroundColor: 'rgb(220, 252, 231)' },
    selectorListInteractiveHover: { backgroundColor: 'rgb(219, 234, 254)' },
    selectorListInteractiveFocus: {
      outlineColor: 'rgb(240, 171, 252)',
      outlineStyle: 'solid',
      outlineWidth: '3px'
    },
    attributePresence: { color: 'rgb(30, 58, 138)', backgroundColor: 'rgb(219, 234, 254)' },
    attributeNodeOrder: { color: 'rgb(88, 28, 135)', backgroundColor: 'rgb(243, 232, 255)' },
    attributeOrderRisk: { color: 'rgb(180, 83, 9)', backgroundColor: 'rgb(255, 251, 235)', fontWeight: '800' },
    attributeOrderRiskHover: { color: 'rgb(124, 58, 237)' },
    AttributeAbsent: { color: 'rgb(71, 85, 105)', backgroundColor: 'rgb(248, 250, 252)' },
    AttributeOpen: { color: 'rgb(22, 101, 52)', backgroundColor: 'rgb(220, 252, 231)' },
    AttributeClosed: { color: 'rgb(153, 27, 27)', backgroundColor: 'rgb(254, 226, 226)' },
    AttributeRemoved: { color: 'rgb(71, 85, 105)', backgroundColor: 'rgb(248, 250, 252)' },
    SelectorListAttributeAbsent: { backgroundColor: 'rgb(248, 250, 252)' },
    SelectorListAttributeOpen: { backgroundColor: 'rgb(220, 252, 231)' },
    SelectorListAttributeChanged: { backgroundColor: 'rgb(248, 250, 252)' },
    SelectorListAttributeRemoved: { backgroundColor: 'rgb(248, 250, 252)' }
  };
  assertExpectedStyles(styles, expected, label);
}

function assertPreprocessorAttributeExpected(styles, label) {
  assertExpectedStyles(styles, {
    scssAttributeReady: {
      color: 'rgb(15, 118, 110)',
      backgroundColor: 'rgb(204, 251, 241)',
      paddingTop: '14px',
      borderTopColor: 'rgb(153, 246, 228)'
    }
  }, label);
}

/** mutation 只改变 attribute，不允许任一侧重写 className。 */
function assertAttributeClassNameStability(mutation, label) {
  assert(mutation, `${label} 缺少 attribute mutation evidence`);
  assert(
    mutation.classNames.every((className) => className === mutation.initialClassName),
    `${label}: absent/open/closed/removed 期间 className 必须保持不变`
  );
  assert(
    mutation.listClassNames.every((className) => className === mutation.listInitialClassName),
    `${label}: selector-list attribute absent/open/change/remove 期间 className 必须保持不变`
  );
}

function assertExpectedStyles(styles, expected, label) {
  for (const [caseName, properties] of Object.entries(expected)) {
    assert(styles[caseName], `${label}/${caseName} 缺少 computed style`);
    for (const [property, value] of Object.entries(properties)) {
      assert(
        styles[caseName][property] === value,
        `${label}/${caseName}.${property} winner 错误\nactual=${styles[caseName][property]}\nexpected=${value}`
      );
    }
  }
}

/** 验证 oracle 的固定 winner，避免 semantic/native 同时错误却仍通过 parity。 */
function assertBaseOracleExpected(styles, viewport, label) {
  for (const contract of baseOracleContracts) {
    const actual = styles[contract.id];
    assert(actual, `${label}/${contract.id} 缺少 computed style 快照`);
    const expected = {
      ...contract.expected,
      ...(contract.expectedByViewport?.[viewport.width] ?? {})
    };
    for (const [property, value] of Object.entries(expected)) {
      assert(
        actual[property] === value,
        `${label}/${contract.id}.${property} winner 错误\nactual=${actual[property]}\nexpected=${value}`
      );
    }
  }
}

/**
 * 验证每个 oracle 的 token 差集与 CSSOM rule 绑定。
 *
 * native token 定义 semantic 必须保留的 scoped 边界；二者差集才允许作为 atomic token，
 * 从而不会把任意页面 class 或仅存在于字符串中的 token 误判为有效 atomic 输出。
 */
function assertBaseOracleTokenContracts(semanticEvidence, nativeEvidence, label) {
  assert(semanticEvidence && nativeEvidence, `${label} 缺少 base cascade oracle 证据`);

  for (const contract of baseOracleContracts) {
    const semantic = semanticEvidence[contract.id];
    const native = nativeEvidence[contract.id];
    assert(semantic && native, `${label}/${contract.id} 缺少 token/CSSOM 证据`);
    assert(
      native.tokens.length === contract.nativeTokenCount,
      `${label}/${contract.id}: native scoped token 数应为 ${contract.nativeTokenCount}\n` +
        `native=${native.tokens.join(' ')}`
    );
    assert(
      native.tokens.every((token) => semantic.tokens.includes(token)),
      `${label}/${contract.id}: semantic 必须保留全部 native scoped token\n` +
        `semantic=${semantic.tokens.join(' ')}\nnative=${native.tokens.join(' ')}`
    );

    const atomicTokens = semantic.tokens.filter((token) => !native.tokens.includes(token));
    assert(
      atomicTokens.length === contract.exactAtomicTokenCount,
      `${label}/${contract.id}: semantic-only atomic token 数应为 ${contract.exactAtomicTokenCount}\n` +
        `atomic=${atomicTokens.join(' ')}`
    );

    for (const expectedRule of contract.atomicRules) {
      assert(
        semantic.rules.some((actualRule) =>
          atomicTokens.includes(actualRule.token) &&
          actualRule.property === expectedRule.property &&
          actualRule.value === actualRule.expectedValue &&
          actualRule.priority === (expectedRule.priority ?? '') &&
          actualRule.media === (expectedRule.media ?? '')
        ),
        `${label}/${contract.id}: semantic-only token 未绑定预期 atomic CSSOM rule ` +
          `${JSON.stringify(expectedRule)}\natomic=${atomicTokens.join(' ')}\nrules=${JSON.stringify(semantic.rules)}`
      );
    }
  }
}

/**
 * 在页面关闭前一次性采集 oracle DOM token 与递归 CSSOM 证据。
 *
 * 条件规则会保留 media 上下文；selector 必须与单一 atomic class 完全相等，
 * 因而 selector-list、前缀相同或仅声明值相同的其他规则都不能形成误命中。
 */
async function captureBaseOracleEvidence(page) {
  const cssomContracts = baseOracleContracts.map((contract) => ({
    ...contract,
    atomicRules: contract.atomicRules.map((rule) => ({
      ...rule,
      selectorSuffixes: cssomSelectorSuffixes(rule.selectorSuffix)
    }))
  }));

  return await page.evaluate((contracts) => {
    const evidence = Object.fromEntries(contracts.map(({ id, selector }) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`缺少 cascade oracle DOM: ${selector}`);
      return [id, { tokens: Array.from(element.classList), rules: [] }];
    }));
    const expectedValues = Object.fromEntries(contracts.flatMap(({ atomicRules }) =>
      atomicRules.map(({ property, value }) => {
        const probe = document.createElement('div').style;
        probe.setProperty(property, value);
        return [`${property}\0${value}`, probe.getPropertyValue(property)];
      })
    ));

    /**
     * 递归读取 CSSOM，条件上下文必须与 atomic rule 一起成为证据。
     *
     * @param {CSSRuleList} ruleList - 当前层级的规则。
     * @param {{ media: string }} context - 继承的 media 条件。
     */
    function visitRules(ruleList, context) {
      for (const rule of Array.from(ruleList)) {
        if (rule instanceof CSSStyleRule) {
          for (const contract of contracts) {
            for (const token of evidence[contract.id].tokens) {
              for (const expectedRule of contract.atomicRules) {
                const expectedSelectors = expectedRule.selectorPrefix
                  ? [`${expectedRule.selectorPrefix}.${CSS.escape(token)}`]
                  : expectedRule.selectorSuffixes.map(
                      (suffix) => `.${CSS.escape(token)}${suffix}`
                    );
                if (!expectedSelectors.includes(rule.selectorText)) continue;
                evidence[contract.id].rules.push({
                  token,
                  selector: rule.selectorText,
                  property: expectedRule.property,
                  value: rule.style.getPropertyValue(expectedRule.property),
                  expectedValue: expectedValues[`${expectedRule.property}\0${expectedRule.value}`],
                  priority: rule.style.getPropertyPriority(expectedRule.property),
                  media: context.media
                });
              }
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
    return evidence;
  }, cssomContracts);
}

/**
 * 返回 CSSOM 允许的 selector suffix；Chrome 会把 legacy pseudo element 序列化为双冒号。
 *
 * static fixture 仍直接检查构建产物 spelling，本函数只服务浏览器 selectorText 匹配。
 */
function cssomSelectorSuffixes(selectorSuffix = '') {
  const match = /^:(before|after)$/u.exec(selectorSuffix);
  return match ? [selectorSuffix, `::${match[1]}`] : [selectorSuffix];
}

/** 用模拟的 Chrome legacy canonicalization 锁定 CSSOM mutation 兼容边界。 */
function verifyPseudoElementCssomSerializationSelfTest() {
  assert(
    cssomSelectorSuffixes(':before').includes('::before') &&
      cssomSelectorSuffixes(':after').includes('::after'),
    'CSSOM self-test 必须接受 legacy pseudo element 被序列化为双冒号'
  );
  assert(
    JSON.stringify(cssomSelectorSuffixes('::after')) === JSON.stringify(['::after']) &&
      JSON.stringify(cssomSelectorSuffixes(':focus')) === JSON.stringify([':focus']),
    'CSSOM self-test 不得放宽 modern pseudo element 或 pseudo class selector'
  );
}

/** 读取指定 computed style 属性。 */
async function readStyle(page, selector, properties) {
  return await page.$eval(selector, (element, names) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(names.map((name) => [name, String(style[name]).replace(location.origin, '<origin>')]));
  }, properties);
}

/** 在临时副本中修改 Sass partial，再移除 import，证明没有 stale style。 */
async function verifyPartialReload(tempRoot) {
  const copyRoot = path.join(tempRoot, 'hmr-fixture');
  await cp(fixtureRoot, copyRoot, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}node_modules`) && !source.includes(`${path.sep}dist`)
  });
  await symlink(path.join(fixtureRoot, 'node_modules'), path.join(copyRoot, 'node_modules'), 'dir');
  const port = (await allocatePorts(1))[0];
  const server = await startServer('dev', copyRoot, 'preprocessor', 'semantic', port);
  const browser = await chromium.launch(chromeExecutable ? { executablePath: chromeExecutable } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });

  try {
    await page.goto(urlFor(port), { waitUntil: 'load', timeout: timeoutMs });
    const partial = path.join(copyRoot, 'suites/preprocessor/src/_tokens.scss');
    const before = await readFile(partial, 'utf8');
    await writeFile(partial, before.replace('#0f766e', '#be123c'));
    try {
      await page.waitForFunction(
        () => getComputedStyle(document.querySelector('#scss-safe')).color === 'rgb(190, 18, 60)',
        undefined,
        { timeout: timeoutMs }
      );
    } catch (error) {
      const state = await page.evaluate(() => ({
        color: getComputedStyle(document.querySelector('#scss-safe')).color,
        token: globalThis.__GSS_FIXTURE_TOKENS__?.sassStyles?.safeScss,
        body: document.body.innerHTML
      }));
      throw new Error(`Sass partial 更新未生效: ${JSON.stringify(state)}\n${server.output}`, { cause: error });
    }
    const staleSelectors = await captureClassSelectors(page, '#scss-safe');
    const guardedStaleSelectors = await captureClassSelectors(page, '#scss-attribute-ready');
    assert(
      staleSelectors.some(({ className }) => !className.startsWith('fixture_')),
      'partial 更新后的 semantic token 应包含待清理 atomic class'
    );
    const staleAtomicSelectors = staleSelectors.filter(({ className }) => !className.startsWith('fixture_'));
    const guardedAtomicSelectors = guardedStaleSelectors.filter(({ className }) => !className.startsWith('fixture_'));
    const hasReadableAtomicSelector = await page.evaluate((selectors) => {
      let found = false;
      for (const sheet of document.styleSheets) {
        try {
          if ([...sheet.cssRules].some((rule) =>
            selectors.some(({ selector }) => rule.cssText.includes(selector))
          )) {
            found = true;
          }
        } catch {
          return false;
        }
      }
      return found;
    }, staleAtomicSelectors);
    assert(hasReadableAtomicSelector, 'import 移除前至少一个捕获到的 atomic selector 应存在于可读 CSSOM');
    const hasGuardedAtomicSelector = await page.evaluate((selectors) => {
      for (const sheet of document.styleSheets) {
        try {
          if ([...sheet.cssRules].some((rule) =>
            rule instanceof CSSStyleRule &&
            selectors.some(({ selector }) => rule.selectorText.startsWith(selector)) &&
            rule.selectorText.includes('[data-state')
          )) return true;
        } catch {
          return false;
        }
      }
      return false;
    }, guardedAtomicSelectors);
    assert(hasGuardedAtomicSelector, 'import 移除前 compiled SCSS atomic token 应绑定 guarded CSSOM selector');

    const entry = path.join(copyRoot, 'suites/preprocessor/src/main.js');
    await writeFile(entry, [
      "import './styles.css';",
      "import baseStyles from './Base.module.css';",
      "globalThis.__GSS_FIXTURE_TOKENS__ = { baseStyles };",
      "document.querySelector('#root').innerHTML = `<main id=\"preprocessor-shell\" class=\"${baseStyles.shell}\"><pre id=\"tokens\">base only</pre></main>`;",
      ''
    ].join('\n'));
    await page.waitForFunction(() => !document.querySelector('#scss-safe'), undefined, { timeout: timeoutMs });
    await page.waitForFunction((selectors) => {
      for (const sheet of document.styleSheets) {
        try {
          if ([...sheet.cssRules].some((rule) =>
            selectors.some(({ selector }) => rule.cssText.includes(selector))
          )) {
            return false;
          }
        } catch {
          return false;
        }
      }
      return true;
    }, [...staleSelectors, ...guardedStaleSelectors], { timeout: timeoutMs });
  } finally {
    await page.close();
    await browser.close();
    await stopProcess(server);
  }
}

/** semantic token 必须以前缀方式继承 native token，且至少一个 class 获得增强。 */
function assertTokenCompatibility(semantic, native, label) {
  let augmented = 0;
  const walk = (semanticValue, nativeValue, key) => {
    if (nativeValue && typeof nativeValue === 'object') {
      assertDeepEqual(Object.keys(semanticValue).sort(), Object.keys(nativeValue).sort(), `${label}.${key} keys`);
      for (const child of Object.keys(nativeValue)) walk(semanticValue[child], nativeValue[child], `${key}.${child}`);
      return;
    }
    assert(typeof semanticValue === 'string' && typeof nativeValue === 'string', `${label}.${key} 应为字符串`);
    if (nativeValue.includes('fixture_')) {
      assert(semanticValue.startsWith(nativeValue), `${label}.${key} 应保留 native token 前缀`);
      if (semanticValue.length > nativeValue.length) augmented += 1;
    } else {
      assert(semanticValue === nativeValue, `${label}.${key} 非 class export 应保持一致`);
    }
  };
  walk(semantic.eager, native.eager, 'eager');
  if (native.lazy) walk(semantic.lazy, native.lazy, 'lazy');
  if (native.eager?.collisionLabel) {
    assert(semantic.eager.collision === native.eager.collision, `${label}.eager.collision 同值歧义应保持 native class token`);
    assert(semantic.eager.collisionLabel === native.eager.collisionLabel, `${label}.eager.collisionLabel 非 class export 应保持原值`);
  }
  assert(augmented > 0, `${label} 至少一个 token 应追加 atomic class`);
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

/** 启动 dev/preview 并等待 HTTP 可用。 */
async function startServer(action, cwd, suite, mode, port, outDir) {
  const child = spawn(rsbuildBin, [action, '--host', host, '--port', String(port)], {
    cwd,
    env: {
      ...process.env,
      GSS_FIXTURE_SUITE: suite,
      GSS_FIXTURE_CSS_MODE: mode,
      ...(outDir ? { GSS_FIXTURE_OUT_DIR: outDir } : {})
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.output = '';
  child.stdout.on('data', (chunk) => { child.output = `${child.output}${chunk}`.slice(-12_000); });
  child.stderr.on('data', (chunk) => { child.output = `${child.output}${chunk}`.slice(-12_000); });
  await waitForServer(child, urlFor(port));
  return child;
}

/** 执行隔离 build。 */
async function runBuild(cwd, suite, mode, outDir) {
  const child = spawn(rsbuildBin, ['build'], {
    cwd,
    env: {
      ...process.env,
      GSS_FIXTURE_SUITE: suite,
      GSS_FIXTURE_CSS_MODE: mode,
      GSS_FIXTURE_OUT_DIR: outDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const [code, signal] = await once(child, 'exit');
  if (signal || code !== 0) throw new Error(`Rsbuild build 失败: ${suite}/${mode}\n${output}`);
}

/** 轮询服务，同时观察子进程提前退出。 */
async function waitForServer(child, url) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Rsbuild server 提前退出 (${child.exitCode})\n${child.output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`等待 Rsbuild server 超时: ${url}\n${child.output}`);
}

/** 只终止本脚本创建的子进程。 */
async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

/** 获取当前可绑定的临时端口。 */
async function allocatePorts(count) {
  const ports = [];
  for (let index = 0; index < count; index += 1) {
    const server = net.createServer();
    server.listen(0, host);
    await once(server, 'listening');
    ports.push(server.address().port);
    server.close();
    await once(server, 'close');
  }
  return ports;
}

function urlFor(port) {
  return `http://${host}:${port}/`;
}

function assertDeepEqual(left, right, message) {
  assert(JSON.stringify(left) === JSON.stringify(right), `${message}\nsemantic=${JSON.stringify(left)}\nnative=${JSON.stringify(right)}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

verifyPseudoElementCssomSerializationSelfTest();
if (process.env.GSS_VISUAL_SELF_TEST_ONLY !== '1') {
  await main();
}
