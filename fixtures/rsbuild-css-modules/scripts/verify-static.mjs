import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(fixtureRoot, '../..');
const rsbuildBin = path.join(fixtureRoot, 'node_modules/.bin/rsbuild');

/** 运行 semantic/native 连续构建、配置保护和产物黑盒验收。 */
async function main() {
  verifyExactSelectorRulePositionGuard();
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'gss-rsbuild-fixture-'));
  const outputs = {
    baseSemanticA: path.join(tempRoot, 'base-semantic-a'),
    baseSemanticB: path.join(tempRoot, 'base-semantic-b'),
    baseNative: path.join(tempRoot, 'base-native'),
    preprocessorSemanticA: path.join(tempRoot, 'preprocessor-semantic-a'),
    preprocessorSemanticB: path.join(tempRoot, 'preprocessor-semantic-b'),
    preprocessorNative: path.join(tempRoot, 'preprocessor-native'),
    prefixedSemantic: path.join(tempRoot, 'prefixed-semantic'),
    inlineSemantic: path.join(tempRoot, 'inline-semantic')
  };

  try {
    await runBuild('base', 'semantic', outputs.baseSemanticA);
    await runBuild('base', 'semantic', outputs.baseSemanticB);
    await runBuild('base', 'native', outputs.baseNative);
    await runBuild('preprocessor', 'semantic', outputs.preprocessorSemanticA);
    await runBuild('preprocessor', 'semantic', outputs.preprocessorSemanticB);
    await runBuild('preprocessor', 'native', outputs.preprocessorNative);
    await runBuild('preprocessor', 'semantic', outputs.prefixedSemantic, {
      GSS_FIXTURE_ASSET_PREFIX: '/fixture-cdn/'
    });
    await runBuild('base', 'semantic', outputs.inlineSemantic, {
      GSS_FIXTURE_INLINE_ASSETS: 'true'
    });

    await verifyBaseSemantic(outputs.baseSemanticA);
    await verifyBaseNative(outputs.baseNative);
    await verifyPreprocessorSemantic(outputs.preprocessorSemanticA);
    await verifyPreprocessorNative(outputs.preprocessorNative);
    await verifyStableBuilds('base', outputs.baseSemanticA, outputs.baseSemanticB);
    await verifyStableBuilds('preprocessor', outputs.preprocessorSemanticA, outputs.preprocessorSemanticB);
    await verifyAssetPrefix(outputs.prefixedSemantic);
    await verifyInlineAndPublicAssets(outputs.inlineSemantic);
    await verifyFailFastBoundaries(tempRoot);
    await verifyPreprocessorErrorBoundary(tempRoot);
    await verifyDependencyBoundary();
    console.log('Rsbuild CSS Modules fixture 静态验收通过');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/** 使用锁定版本的真实 Rsbuild 管线构建单个 suite/mode。 */
async function runBuild(suite, mode, outDir, extraEnv = {}) {
  const result = await runRsbuild({
    GSS_FIXTURE_SUITE: suite,
    GSS_FIXTURE_CSS_MODE: mode,
    GSS_FIXTURE_OUT_DIR: outDir,
    ...extraEnv
  });
  if (result.code !== 0) {
    throw new Error(`Rsbuild build 失败: suite=${suite} mode=${mode}\n${result.output}`);
  }
}

/** 校验 base semantic 的 tokens、atomic/fallback、条件规则、资源和 lazy chunk。 */
async function verifyBaseSemantic(outDir) {
  const atomicCss = await readFile(path.join(outDir, 'static/css/semantic-atomic.css'), 'utf8');
  const nativeCss = await readMatchingFiles(path.join(outDir, 'static/css'), (name) => name.endsWith('.css') && !name.includes('semantic-atomic'));
  const mainJs = await readMatchingFiles(path.join(outDir, 'static/js'), (name) => name.endsWith('.js') && !name.includes('/async/'));
  const asyncJs = await readMatchingFiles(path.join(outDir, 'static/js/async'), (name) => name.endsWith('.js'));
  const html = await readFile(path.join(outDir, 'index.html'), 'utf8');

  assertIncludes(atomicCss, '@media (max-width:640px)', 'base atomic CSS 应包含 media');
  assertIncludes(atomicCss, '@supports (display:grid)', 'base atomic CSS 应包含 supports');
  assert(atomicCss.indexOf('padding:16px') < atomicCss.indexOf('@media'), '基础 atomic 应位于条件 atomic 之前');
  assertIncludes(atomicCss, '!important', 'important declaration 应进入 atomic key');
  assertIncludes(nativeCss, '--shell-gap:12px', 'custom property 应保留为 scoped fallback');
  assertIncludes(nativeCss, '.fixture_Base-module__unsafeParent span', 'unsafe descendant 应保留');
  assertIncludes(nativeCss, '.fixture_Base-module__assetButton', '资源 class 应整体保留');
  assertIncludes(nativeCss, '.fixture_Base-module__collision', '同值 ICSS class 应整体保留');
  assertDoesNotInclude(nativeCss, '.fixture_Base-module__selectorListTarget', 'eligible selector-list 不应重复保留 semantic selector');
  assertDoesNotInclude(nativeCss, '.fixture_Base-module__selectorListPeer', 'eligible peer arm 不应重复保留 semantic selector');
  assertIncludes(nativeCss, 'url(/static/svg/mark.', '资源应使用 Rspack 最终发布路径');
  assertIncludes(nativeCss, 'url(/public-fixture-mark.svg)', 'publicDir URL 应保留原生绝对路径');
  assertIncludes(await readFile(path.join(outDir, 'public-fixture-mark.svg'), 'utf8'), '<svg', 'publicDir asset 应由 Rsbuild 复制');
  assertDoesNotInclude(nativeCss, 'rspack-semantic-atomic-css:', '产物不得残留 synthetic base URI');
  assertDoesNotInclude(nativeCss, '.fixture_Base-module__hoverButton', 'safe scoped rule 不应在原生 chunk 重复');
  assertIncludes(mainJs, 'fixture_Base-module__shell', 'tokens 应保留 Rsbuild scoped class');
  assertIncludes(mainJs, '_selector_q0dmug_padding_16px', 'tokens 应追加当前 selector-aware atomic class');
  verifyBaseSelectorList(mainJs, atomicCss);
  assertIncludes(mainJs, '_selector_q0dmug_padding_13px', 'selector-list 旁的无关 class 应追加当前 selector-aware atomic token');
  for (const anchor of [
    'oracle-non-competing',
    'oracle-important',
    'oracle-specificity',
    'oracle-stable-order',
    'oracle-media-overlap',
    'oracle-supports-overlap',
    'duplicate-late-reuse',
    'attribute-state',
    'attribute-presence',
    'attribute-node-order',
    'attribute-order-risk',
    'attribute-near-miss'
  ]) {
    assertIncludes(mainJs, anchor, `base bundle 应包含 ${anchor} 验收锚点`);
  }
  const safeTokenCases = [
    ['oracleNonCompetingAtomic', ['_selector_q0dmug_color_4338ca']],
    ['oracleImportantAtomic', ['_selector_q0dmug_color_9f1239_important']],
    ['oracleSpecificityAtomic', ['_selector_q0dmug_color_7c3aed']],
    ['oracleStableOrderAtomic', ['_selector_q0dmug_color_7c2d12']],
    [
      'oracleMediaAtomic',
      [
        '_selector_q0dmug_color_1e3a8a',
        '_selector_q0dmug_color_2563eb',
        '_selector_q0dmug_color_be123c'
      ]
    ],
    ['oracleSupportsAtomic', ['_selector_q0dmug_color_4338ca']]
  ];
  for (const [sourceClassName, atomicTokens] of safeTokenCases) {
    const token = findBundleClassToken(mainJs, `fixture_Base-module__${sourceClassName}`);
    for (const atomicToken of atomicTokens) {
      assertIncludes(token, atomicToken, `${sourceClassName} bundle token 应包含 safe atomic token`);
      assertIncludes(atomicCss, atomicToken, `${sourceClassName} safe rule 应进入 atomic asset`);
    }
  }
  for (const sourceClassName of [
    'oracleNonCompetingFallback',
    'oracleImportantFallback',
    'oracleSpecificityFallback',
    'oracleStableOrderFallback',
    'oracleMediaFallback',
    'oracleSupportsFallback'
  ]) {
    const token = findBundleClassToken(mainJs, `fixture_Base-module__${sourceClassName}`);
    assert(
      token.split(/\s+/u).length === 1,
      `${sourceClassName} bundle token 只应包含一枚 scoped fallback class\ntoken=${token}`
    );
    assertIncludes(nativeCss, `fixture_Base-module__${sourceClassName}`, `${sourceClassName} selector 应进入 native fallback asset`);
  }
  assertIncludes(nativeCss, 'data-oracle^=non-competing', 'non-competing unsupported attribute fallback selector 应保留');
  assertIncludes(nativeCss, 'data-oracle^=specificity', 'specificity unsupported attribute fallback selector 应保留');
  for (const fallbackValue of [
    'background:#fef3c7',
    'color:#6b7280',
    'color:#0e7490',
    'color:#0369a1',
    'background:#f1f5f9',
    'background:#f8fafc',
    'background:#dbeafe',
    'background:#dcfce7'
  ]) {
    assertIncludes(nativeCss, fallbackValue, `native extracted CSS 应包含 fallback declaration: ${fallbackValue}`);
  }
  // declaration value 可能被独立 eligible class 合法复用；fallback 由 scoped selector 存在和单-token class 边界证明。
  assertIncludes(atomicCss, 'color:#7c2d12', 'stable-order atomic side 应进入 atomic asset');
  assertIncludes(nativeCss, 'color:#0369a1', 'stable-order fallback side 应进入 native extracted CSS');
  assertSnippetsInOrder(
    atomicCss,
    ['color:#1e3a8a', 'color:#2563eb', 'color:#be123c'],
    'media atomic declaration 应保持 base → min600 → min900'
  );
  assertSnippetsInOrder(
    nativeCss,
    [
      'fixture_Base-module__oracleSupportsFallback',
      'background:#f8fafc',
      'fixture_Base-module__oracleSupportsFallback',
      'background:#dbeafe',
      'fixture_Base-module__oracleSupportsFallback',
      'background:#dcfce7'
    ],
    'supports fallback 应保持 base → grid → flex'
  );
  const earlyReuseToken = findBundleClassToken(mainJs, 'fixture_ACascadeOwner-module__base');
  const lateReuseToken = findBundleClassToken(mainJs, 'fixture_LateReuse-module__lateReuse');
  const reusedAtomicToken = earlyReuseToken.split(/\s+/).find((token) => token.startsWith('_selector_q0dmug_color_334155'));
  assert(reusedAtomicToken, 'early owner 应使用共享 #334155 atomic token');
  assertIncludes(lateReuseToken, reusedAtomicToken, 'late consumer 应复用共享 #334155 atomic token');
  assert(
    countOccurrences(atomicCss, `.${reusedAtomicToken}{`) === 1,
    '共享 #334155 atomic rule 在统一 atomic asset 中应只输出一次'
  );
  const semanticAtomicAssets = await findRelativeFiles(
    path.join(outDir, 'static/css'),
    (name) => name.endsWith('.css') && name.includes('semantic-atomic')
  );
  assert(semanticAtomicAssets.length === 1, 'base semantic build 应只生成一个统一 atomic asset');
  assertIncludes(mainJs, 'fixture_Shared-module__shared', 'composes 应继承原生最终 token');
  assertIncludes(mainJs, 'semantic-fixture', ':export value 应继承原生 token');
  assertDoesNotInclude(mainJs, 'fixture_Base-module__collision _', '同值 ICSS class/value 不应追加 atomic class');
  assertIncludes(asyncJs, '_selector_q0dmug_margin-top_12px', 'lazy chunk token 应追加当前 selector-aware atomic class');
  verifyBaseAttributeSelectors(atomicCss, nativeCss, mainJs);
  verifyBasePseudoElements(atomicCss, nativeCss, mainJs);
  const atomicLinkPosition = html.indexOf('/static/css/semantic-atomic.css');
  const nativeLinkPosition = html.indexOf('/static/css/index.');
  assert(atomicLinkPosition >= 0, 'HTML 应包含 atomic CSS link');
  assert(nativeLinkPosition >= 0, 'HTML 应包含 native fallback CSS link');
  assert(atomicLinkPosition < nativeLinkPosition, 'atomic link 应先于 native fallback link');
  await assertMissing(path.join(outDir, 'semantic-atomic-manifest.json'));
  await assertMissing(path.join(outDir, 'semantic-atomic-report.json'));
}

/** 校验 native 对照完整保留原生 CSS 且不产生 GSS 产物。 */
async function verifyBaseNative(outDir) {
  const css = await readMatchingFiles(path.join(outDir, 'static/css'), (name) => name.endsWith('.css'));
  const js = await readMatchingFiles(path.join(outDir, 'static/js'), (name) => name.endsWith('.js'));
  assertIncludes(css, '.fixture_Base-module__hoverButton', 'native CSS 应保留 safe scoped rule');
  assertIncludes(css, '.fixture_Lazy-module__lazy', 'native lazy CSS 应保留 scoped rule');
  assertIncludes(js, 'fixture_Base-module__shell', 'native tokens 应使用相同 scoped ident');
  assertDoesNotInclude(js, '_selector_q0dmug_padding_16px', 'native tokens 不应包含当前 GSS atomic class');
  await assertMissing(path.join(outDir, 'static/css/semantic-atomic.css'));
}

/** 校验 Sass/Less、资源、manifest/report 和 analyzer。 */
async function verifyPreprocessorSemantic(outDir) {
  const atomicCss = await readFile(path.join(outDir, 'static/css/semantic-atomic.css'), 'utf8');
  const nativeCss = await readMatchingFiles(path.join(outDir, 'static/css'), (name) => name.endsWith('.css') && !name.includes('semantic-atomic'));
  const js = await readMatchingFiles(path.join(outDir, 'static/js'), (name) => name.endsWith('.js'));
  const manifest = JSON.parse(await readFile(path.join(outDir, 'semantic-atomic-manifest.json'), 'utf8'));
  const report = JSON.parse(await readFile(path.join(outDir, 'semantic-atomic-report.json'), 'utf8'));
  const svgAssets = await findRelativeFiles(path.join(outDir, 'static'), (name) => name.endsWith('.svg'));

  assertIncludes(atomicCss, 'padding:17px', 'Sass partial 与 additionalData 应由原生管线编译');
  assertIncludes(nativeCss, 'border-radius:9px', '参与 descendant selector 的 Less class 应整类保留');
  assertIncludes(nativeCss, '.fixture_Theme-module__hero', 'SCSS 资源 class 应保留');
  assertIncludes(nativeCss, '.fixture_Panel-module__panel .fixture_Panel-module__child', 'Less descendant 应保留');
  assertIncludes(nativeCss, 'url(/static/svg/mark.', 'SCSS 外部资源应由 Rspack 发布');
  assertDoesNotInclude(nativeCss, 'rspack-semantic-atomic-css:', 'SCSS 资源不应残留 synthetic URI');
  assertIncludes(js, 'fixture_Theme-module__safe-scss', 'SCSS token 应继承 custom ident');
  assert(svgAssets.length === 1, 'preprocessor semantic 应发布一个 SVG');
  assert(report.analysis?.size?.beforeRawCssBytes > 0, 'report 应包含 analyzer before-size');
  assert(report.diagnostics.some((item) => item.reason === 'asset-reference'), 'report 应记录 asset-reference preservation');
  assert(report.diagnostics.some((item) => String(item.id).endsWith('.module.scss')), 'report 应保留 SCSS source id');
  assert(report.diagnostics.some((item) => String(item.id).endsWith('.module.less')), 'report 应保留 Less source id');
  verifyManifestAtomicSelectors(manifest, atomicCss);
  const safeScssClass = Object.values(manifest.classes).find(
    (entry) => entry.sourceClassName === 'fixture_Theme-module__safe-scss'
  );
  assert(safeScssClass, 'manifest 应包含 safe-scss class entry');
  verifySuggestedTokenMutationGuard(js, safeScssClass, 'Rsbuild safe-scss');
  verifyPreprocessorAttributeSelector(manifest, atomicCss, nativeCss, js);
  const assetClass = Object.values(manifest.classes).find((entry) => entry.sourceClassName.includes('hero'));
  assert(assetClass?.atomicClassNames?.length === 0, '资源 class manifest 不应包含 atomic classes');
  const descendantClass = Object.values(manifest.classes).find((entry) => entry.sourceClassName.includes('panel'));
  assert(descendantClass?.atomicClassNames?.length === 0, '参与 descendant selector 的 class 应整类保留');
}

/**
 * 验证真实 Rspack serializer 输出的 eligible attribute selector 与 fallback 边界。
 *
 * 引号是否保留由 css-loader/Rspack 决定，因此这里锁定 compiled CSS、atomic token 与最终 selector
 * 使用同一无引号 spelling，而不是由 adapter 猜测或重建 selector。
 */
function verifyBaseAttributeSelectors(atomicCss, nativeCss, bundleJs) {
  const cases = [
    {
      source: 'attributeState',
      rules: [
        { suffix: '[data-state=open]', declaration: 'background:#dcfce7' },
        { suffix: '[data-state=closed]', declaration: 'background:#fee2e2' }
      ]
    },
    {
      source: 'presenceGuard',
      rules: [{ suffix: '[data-present]', declaration: 'background:#dbeafe' }]
    },
    {
      source: 'nodeOrder',
      rules: [{ prefix: '[data-placement=before]', declaration: 'background:#f3e8ff' }]
    }
  ];

  for (const spec of cases) {
    const token = findBundleClassToken(bundleJs, `fixture_AttributeCase-module__${spec.source}`);
    const tokens = token.split(/\s+/u);
    const scopedClass = tokens.find((value) => value.startsWith('fixture_'));
    const atomicTokens = tokens.filter((value) => !value.startsWith('fixture_'));
    assert(scopedClass, `${spec.source} 应保留 native scoped token`);
    assert(atomicTokens.length > 0, `${spec.source} 应追加 guarded atomic token`);

    for (const rule of spec.rules) {
      const atomicToken = findGuardedAtomicToken(atomicCss, atomicTokens, rule);
      assert(atomicToken, `${spec.source} 缺少完整 guarded atomic rule: ${JSON.stringify(rule)}`);
      const scopedSelector = `${rule.prefix ?? ''}.${scopedClass}${rule.suffix ?? ''}`;
      assert(
        findExactSelectorRulePosition(nativeCss, scopedSelector) === -1,
        `${spec.source} eligible selector 不应以 scoped class 重复输出 fallback: ${scopedSelector}`
      );
    }
  }

  assertDoesNotInclude(atomicCss, '[data-state="open"]', 'Rsbuild compiled attribute selector 不应被 adapter 改回双引号');
  assertDoesNotInclude(atomicCss, "[data-state='open']", 'Rsbuild compiled attribute selector 不应被 adapter 改回单引号');

  const fallbackCases = [
    {
      source: 'orderRisk',
      selectors: [
        (className) => `.${className}[data-state]`,
        (className) => `.${className}:hover`,
        (className) => `.${className}`
      ]
    },
    {
      source: 'nearMiss',
      selectors: [(className) => `.${className}[data-kind^=danger]`]
    }
  ];
  for (const spec of fallbackCases) {
    const token = findBundleClassToken(bundleJs, `fixture_AttributeCase-module__${spec.source}`);
    const tokens = token.split(/\s+/u);
    assert(tokens.length === 1, `${spec.source} fallback class 不得追加 partial atomic token\ntoken=${token}`);
    for (const createSelector of spec.selectors) {
      const selector = createSelector(tokens[0]);
      assert(
        findExactSelectorRulePosition(nativeCss, selector) >= 0,
        `${spec.source} scoped fallback CSS 应包含完整 selector: ${selector}`
      );
    }
  }
}

/** 验证 Sass nested selector 编译后的 descriptor、manifest、stylesheet 与真实 token 自洽。 */
function verifyPreprocessorAttributeSelector(manifest, atomicCss, nativeCss, bundleJs) {
  const classEntry = Object.values(manifest.classes).find(
    (entry) => entry.sourceClassName.includes('compiled-attribute')
  );
  assert(classEntry, 'manifest 应包含 compiled-attribute class entry');
  verifySuggestedTokenMutationGuard(bundleJs, classEntry, 'Rsbuild compiled-attribute');

  const guardedEntries = classEntry.atomicClassNames
    .map((className) => manifest.atomic[className])
    .filter((entry) => ['color', 'background'].includes(entry?.declaration?.prop));
  assert(guardedEntries.length === 2, 'compiled-attribute 应包含 color/background 两条 guarded atomic declaration');
  for (const entry of guardedEntries) {
    assertIncludes(entry.selector.identity, '[data-state="ready"]', 'SCSS descriptor identity 应保留 Core serializer spelling');
    assertIncludes(entry.selector.css, '[data-state="ready"]', 'SCSS descriptor CSS 应保留 Core serializer spelling');
    assert(
      findRsbuildSerializedRulePosition(atomicCss, entry.selector.css) >= 0,
      'SCSS guarded selector 应经 Rsbuild 原生 minifier serializer 进入 atomic stylesheet'
    );
  }
  assertIncludes(atomicCss, '[data-state=ready]', 'Rspack/Lightning CSS 最终 stylesheet 应允许移除 attribute value quotes');
  verifyEligibleScopedAttributeFallbackAbsenceMutationGuard(
    nativeCss,
    classEntry.sourceClassName,
    'Rsbuild compiled-attribute'
  );
}

/**
 * 拒绝 eligible SCSS selector 以 scoped class 重复输出 fallback，不依赖 minifier 是否保留引号。
 *
 * @param {string} css - 当前 native fallback stylesheet。
 * @param {string} scopedClassName - CSS Modules 原生 scoped class。
 * @param {string} label - 断言错误中的场景名。
 */
function verifyEligibleScopedAttributeFallbackAbsent(css, scopedClassName, label) {
  for (const selector of createEligibleScopedAttributeSelectorVariants(scopedClassName)) {
    assert(
      findExactSelectorRulePosition(css, selector) === -1,
      `${label} eligible selector 不应以 scoped class 重复输出 fallback: ${selector}`
    );
  }
}

/** 对每种 attribute value spelling 注入内存 fallback mutation，证明负向门禁会失败。 */
function verifyEligibleScopedAttributeFallbackAbsenceMutationGuard(css, scopedClassName, label) {
  verifyEligibleScopedAttributeFallbackAbsent(css, scopedClassName, label);

  for (const selector of createEligibleScopedAttributeSelectorVariants(scopedClassName)) {
    const mutatedCss = `${css}\n${selector}{background:#000}`;
    let rejected = false;
    try {
      verifyEligibleScopedAttributeFallbackAbsent(mutatedCss, scopedClassName, `${label} mutation`);
    } catch {
      rejected = true;
    }
    assert(rejected, `${label} 插入 scoped fallback 时门禁必须失败: ${selector}`);
  }
}

/** 列出 Rsbuild/Lightning CSS 可能产生的 exact attribute selector spelling。 */
function createEligibleScopedAttributeSelectorVariants(scopedClassName) {
  return [
    `.${scopedClassName}[data-state=ready]`,
    `.${scopedClassName}[data-state="ready"]`,
    `.${scopedClassName}[data-state='ready']`
  ];
}

/** 从候选 atomic tokens 中定位同时满足完整 selector node order 与 declaration 的 rule。 */
function findGuardedAtomicToken(css, tokens, rule) {
  for (const token of tokens) {
    const selector = `${rule.prefix ?? ''}.${token}${rule.suffix ?? ''}`;
    const position = findExactSelectorRulePosition(css, selector);
    if (position < 0) continue;
    const end = css.indexOf('}', position);
    if (end >= 0 && css.slice(position, end).includes(rule.declaration)) return token;
  }
  return undefined;
}

/**
 * 定位 descriptor 对应的最终 Rsbuild rule。
 *
 * Core identity/descriptor 保留其 AST serializer 的双引号；Rsbuild 原生 Lightning CSS minifier
 * 会对本 fixture 的安全 ident value `ready` 移除引号。这里同时锁定两层 spelling，不让 adapter
 * 为迎合最终压缩结果去 canonicalize 或重建 selector。
 */
function findRsbuildSerializedRulePosition(css, selector) {
  const candidates = [selector, selector.replaceAll('[data-state="ready"]', '[data-state=ready]')];
  return Math.max(...candidates.map((candidate) => findExactSelectorRulePosition(css, candidate)));
}

/** 校验 native 预处理器对照。 */
async function verifyPreprocessorNative(outDir) {
  const css = await readMatchingFiles(path.join(outDir, 'static/css'), (name) => name.endsWith('.css'));
  assertIncludes(css, '.fixture_Theme-module__safe-scss', 'native CSS 应保留 SCSS safe rule');
  assertIncludes(css, '.fixture_Panel-module__panel', 'native CSS 应保留 Less rule');
  await assertMissing(path.join(outDir, 'semantic-atomic-manifest.json'));
  await assertMissing(path.join(outDir, 'semantic-atomic-report.json'));
}

/** 对同一 suite 两次输出的相对文件名和内容做完整哈希比较。 */
async function verifyStableBuilds(suite, leftDir, rightDir) {
  const [left, right] = await Promise.all([hashDirectory(leftDir), hashDirectory(rightDir)]);
  assert(JSON.stringify(left) === JSON.stringify(right), `连续 semantic build 不稳定: ${suite}`);
}

/** 校验 assetPrefix 同时进入 HTML、preserved CSS 与 atomic link。 */
async function verifyAssetPrefix(outDir) {
  const html = await readFile(path.join(outDir, 'index.html'), 'utf8');
  const css = await readMatchingFiles(path.join(outDir, 'static/css'), (name) => name.endsWith('.css'));
  assertIncludes(html, '/fixture-cdn/static/css/semantic-atomic.css', 'atomic link 应继承 assetPrefix');
  assertIncludes(css, 'url(/fixture-cdn/static/svg/mark.', '资源 URL 应继承 assetPrefix');
}

/** 校验 Rspack 阈值内联与 publicDir 复制均未被 bridge 破坏。 */
async function verifyInlineAndPublicAssets(outDir) {
  const css = await readMatchingFiles(path.join(outDir, 'static/css'), (name) => name.endsWith('.css'));
  const svgAssets = await findRelativeFiles(path.join(outDir, 'static'), (name) => name.endsWith('.svg'));
  assertIncludes(css, 'data:image/svg+xml', '阈值内资源应由 Rspack 内联');
  assertIncludes(css, 'url(/public-fixture-mark.svg)', 'publicDir 绝对 URL 应保持不变');
  assert(svgAssets.length === 0, 'inline build 不应额外发布 imported SVG');
  assertIncludes(await readFile(path.join(outDir, 'public-fixture-mark.svg'), 'utf8'), '<svg', 'publicDir asset 应存在');
}

/** 用真实配置证明 named exports、Node target 与 CSS source map fail fast。 */
async function verifyFailFastBoundaries(tempRoot) {
  const cases = [
    ['named-export', { GSS_FIXTURE_NAMED_EXPORT: 'true' }, 'rsbuild.output.cssModules.namedExport'],
    ['node-target', { GSS_FIXTURE_TARGET: 'node' }, 'rsbuild.target'],
    ['css-source-map', { GSS_FIXTURE_CSS_SOURCE_MAP: 'true' }, 'rsbuild.output.sourceMap.css']
  ];

  for (const [name, env, feature] of cases) {
    const result = await runRsbuild({
      GSS_FIXTURE_SUITE: 'base',
      GSS_FIXTURE_CSS_MODE: 'semantic',
      GSS_FIXTURE_OUT_DIR: path.join(tempRoot, `unsupported-${name}`),
      ...env
    });
    assert(result.code !== 0, `${name} 配置应 fail fast`);
    assertIncludes(result.output, `feature=${feature}`, `${name} 错误应包含稳定 feature code`);
  }
}

/** 证明 Sass 原生错误与 source path 不被 adapter 吞掉。 */
async function verifyPreprocessorErrorBoundary(tempRoot) {
  const sourceRoot = path.join(tempRoot, 'missing-import');
  await mkdir(sourceRoot, { recursive: true });
  const modulePath = path.join(sourceRoot, 'Missing.module.scss');
  const entryPath = path.join(sourceRoot, 'main.js');
  await writeFile(modulePath, "@use './does-not-exist' as missing;\n.button { color: red; }\n");
  await writeFile(entryPath, "import styles from './Missing.module.scss';\nvoid styles.button;\n");

  const result = await runRsbuild({
    GSS_FIXTURE_SUITE: 'preprocessor',
    GSS_FIXTURE_CSS_MODE: 'semantic',
    GSS_FIXTURE_OUT_DIR: path.join(tempRoot, 'missing-import-dist'),
    GSS_FIXTURE_ENTRY: entryPath
  });
  assert(result.code !== 0, 'Sass missing import 应构建失败');
  assertIncludes(result.output, 'Missing.module.scss', 'Sass 错误应包含源文件');
  assert(/does-not-exist|Can't find stylesheet to import/i.test(result.output), 'Sass 错误应保留原始原因');
}

/** 确认预处理器和浏览器测试依赖没有泄漏到生产 adapter。 */
async function verifyDependencyBoundary() {
  const adapter = JSON.parse(await readFile(path.join(repositoryRoot, 'packages/rsbuild/package.json'), 'utf8'));
  for (const dependency of ['playwright', 'sass', 'less', '@rsbuild/plugin-sass', '@rsbuild/plugin-less']) {
    assert(!adapter.dependencies?.[dependency], `生产 adapter 不应依赖 fixture 工具: ${dependency}`);
  }
}

/** 在隔离环境执行 Rsbuild 并收集完整输出。 */
async function runRsbuild(env) {
  return await new Promise((resolve, reject) => {
    const child = spawn(rsbuildBin, ['build'], {
      cwd: fixtureRoot,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`Rsbuild 被信号 ${signal} 终止`));
      else resolve({ code: code ?? 1, output });
    });
  });
}

/** 递归读取匹配文件并按相对路径稳定拼接。 */
async function readMatchingFiles(root, predicate) {
  const files = await findRelativeFiles(root, predicate);
  return (await Promise.all(files.map((file) => readFile(path.join(root, file), 'utf8')))).join('\n');
}

/** 递归列出匹配的相对文件名。 */
async function findRelativeFiles(root, predicate, prefix = '') {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await findRelativeFiles(root, predicate, relative));
    else if (predicate(relative.replaceAll(path.sep, '/'))) files.push(relative);
  }
  return files;
}

/** 对目录的文件名和内容建立稳定摘要。 */
async function hashDirectory(root) {
  const files = await findRelativeFiles(root, () => true);
  return await Promise.all(files.map(async (file) => [
    file.replaceAll(path.sep, '/'),
    createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')
  ]));
}

/** 验证 manifest descriptor、className 索引与最终 atomic stylesheet 使用同一当前 selector。 */
function verifyManifestAtomicSelectors(manifest, atomicCss) {
  const entries = Object.entries(manifest.atomic ?? {});
  assert(entries.length > 0, 'manifest 应包含 atomic entries');

  for (const [className, entry] of entries) {
    assert(entry?.className === className, `manifest atomic 索引应等于 entry.className: ${className}`);
    assert(
      typeof entry.selector?.identity === 'string' && entry.selector.identity.length > 0,
      `manifest atomic selector.identity 必填: ${className}`
    );
    assert(
      typeof entry.selector?.css === 'string' && entry.selector.css.length > 0,
      `manifest atomic selector.css 必填: ${className}`
    );
    assert(
      entry.selector.css === entry.selector.identity.replace('__GSS_ANCHOR__', className),
      `manifest identity 与 descriptor CSS 应只替换 anchor class: ${className}`
    );
    assert(
      findRsbuildSerializedRulePosition(atomicCss, entry.selector.css) >= 0,
      `atomic CSS 应包含完整 manifest selector.css rule: ${className}`
    );
  }

  let mappedAtomicClasses = 0;
  for (const [classId, classEntry] of Object.entries(manifest.classes ?? {})) {
    for (const className of classEntry.atomicClassNames ?? []) {
      mappedAtomicClasses += 1;
      assert(
        manifest.atomic?.[className]?.className === className,
        `class mapping atomicClassNames 应命中同名 manifest atomic entry: ${classId} -> ${className}`
      );
    }
  }
  assert(mappedAtomicClasses > 0, 'manifest class mappings 应至少引用一个 atomic entry');
}

/** 在内存 bundle 中验证完整 suggested token，并以删除 mutation 证明缺失时会失败。 */
function verifySuggestedTokenMutationGuard(bundleJs, classEntry, label) {
  verifySuggestedTokenInBundle(bundleJs, classEntry, label);
  const mutatedJs = bundleJs.replace(classEntry.suggestedClassName, '');
  assert(mutatedJs !== bundleJs, `${label} mutation 应实际删除完整 suggested token`);

  let rejected = false;
  try {
    verifySuggestedTokenInBundle(mutatedJs, classEntry, `${label} mutation`);
  } catch {
    rejected = true;
  }
  assert(rejected, `${label} 缺少完整 suggested token 时门禁必须失败`);
}

/** 验证真实 bundle 包含 manifest 声明的完整 scoped + atomic token sequence。 */
function verifySuggestedTokenInBundle(bundleJs, classEntry, label) {
  assert(classEntry.atomicClassNames?.length > 0, `${label} atomicClassNames 应非空`);
  assert(
    typeof classEntry.suggestedClassName === 'string' && classEntry.suggestedClassName.length > 0,
    `${label} suggestedClassName 必填`
  );
  assertIncludes(bundleJs, classEntry.suggestedClassName, `${label} bundle 应包含完整 suggestedClassName`);
}

/** 定位 descriptor selector 作为完整 rule prelude 的位置，拒绝更长 selector 前缀误命中。 */
function findExactSelectorRulePosition(css, selector) {
  let searchFrom = 0;
  while (searchFrom <= css.length) {
    const position = css.indexOf(selector, searchFrom);
    if (position < 0) return -1;

    let before = position - 1;
    while (before >= 0 && /\s/u.test(css[before])) before -= 1;
    let after = position + selector.length;
    while (after < css.length && /\s/u.test(css[after])) after += 1;
    const startsAtRuleBoundary = before < 0 || css[before] === '{' || css[before] === '}';
    if (startsAtRuleBoundary && css[after] === '{') return position;
    searchFrom = position + 1;
  }
  return -1;
}

/** 以更长 selector mutation、顶层和条件嵌套规则自检 exact rule boundary。 */
function verifyExactSelectorRulePositionGuard() {
  assert(findExactSelectorRulePosition('.foo_suffix {}', '.foo') === -1, 'exact selector 不得命中更长 class');
  assert(findExactSelectorRulePosition('.foo {}', '.foo') === 0, 'exact selector 应命中顶层 rule');
  assert(
    findExactSelectorRulePosition('@media (min-width: 1px) {\n  .foo {}\n}', '.foo') > 0,
    'exact selector 应命中条件规则中的完整 prelude'
  );
}

/** 断言多个 CSS 片段按指定顺序出现，防止只检查存在而遗漏 cascade 重排。 */
function assertSnippetsInOrder(value, snippets, message) {
  let previousIndex = -1;
  for (const snippet of snippets) {
    const index = value.indexOf(snippet, previousIndex + 1);
    assert(index > previousIndex, `${message}\n片段: ${snippet}`);
    previousIndex = index;
  }
}

/** 统计固定字符串的非重叠 occurrence，用于证明 atomic rule 全局去重。 */
function countOccurrences(value, snippet) {
  let count = 0;
  let searchFrom = 0;
  while (searchFrom < value.length) {
    const index = value.indexOf(snippet, searchFrom);
    if (index < 0) return count;
    count += 1;
    searchFrom = index + snippet.length;
  }
  return count;
}

/**
 * 从真实 bundle 的字符串字面量读取 source class 对应的完整 scoped + atomic token。
 *
 * @param {string} bundleJs - 当前 semantic build 的完整 JavaScript。
 * @param {string} sourceClassMarker - Rsbuild scoped class 中的稳定 source class marker。
 * @returns {string} 完整 class token 字符串。
 */
function findBundleClassToken(bundleJs, sourceClassMarker) {
  const markerIndex = bundleJs.indexOf(sourceClassMarker);
  if (markerIndex < 0) throw new Error(`bundle 缺少 source class marker: ${sourceClassMarker}`);

  const doubleQuoteIndex = bundleJs.lastIndexOf('"', markerIndex);
  const singleQuoteIndex = bundleJs.lastIndexOf("'", markerIndex);
  const start = Math.max(doubleQuoteIndex, singleQuoteIndex);
  const quote = bundleJs[start];
  const end = quote ? bundleJs.indexOf(quote, markerIndex) : -1;
  assert(start >= 0 && end > markerIndex, `bundle source class token 边界不完整: ${sourceClassMarker}`);
  return bundleJs.slice(start + 1, end);
}

/** 验证全 eligible selector-list 的 token 复用、semantic preservation 与单-arm descriptor 输出。 */
function verifyBaseSelectorList(bundleJs, atomicCss) {
  const targetToken = findBundleClassToken(bundleJs, 'fixture_Base-module__selectorListTarget');
  const peerToken = findBundleClassToken(bundleJs, 'fixture_Base-module__selectorListPeer');
  const targetTokens = targetToken.split(/\s+/u);
  const peerTokens = peerToken.split(/\s+/u);
  const sharedColor = findClassTokenPart(targetToken, 'color_2563eb');
  const laterColor = findClassTokenPart(targetToken, 'color_dc2626');

  assert(targetTokens.length === 3, `selector-list target 应包含 semantic + 两个 atomic token: ${targetToken}`);
  assert(peerTokens.length === 2, `selector-list peer 应包含 semantic + 共享 atomic token: ${peerToken}`);
  assert(peerTokens.includes(sharedColor), 'selector-list 两个 base arm 应复用同一个 atomic token');
  assert(!peerTokens.includes(laterColor), '后置 target declaration 不得泄漏给 peer arm');
  assert(findExactSelectorRulePosition(atomicCss, `.${sharedColor}`) >= 0, '共享 atomic selector 应存在');
  assert(findExactSelectorRulePosition(atomicCss, `.${laterColor}`) >= 0, '后置 target atomic selector 应存在');
  assertDoesNotInclude(atomicCss, `.${sharedColor},`, 'atomic descriptor 不得重新输出组合 selector-list');
}

/** 验证 modern before 与 legacy after 由 generic descriptor 输出并保留 semantic token。 */
function verifyBasePseudoElements(atomicCss, nativeCss, bundleJs) {
  const beforeToken = findBundleClassToken(bundleJs, 'fixture_Base-module__pseudoBefore');
  const afterToken = findBundleClassToken(bundleJs, 'fixture_Base-module__pseudoAfter');
  const beforeAtomic = findClassTokenPart(beforeToken, 'color_0f766e');
  const afterAtomic = findClassTokenPart(afterToken, 'color_7c3aed');

  assert(beforeToken.split(/\s+/u).length > 1, 'modern before 应保留 scoped token并追加 atomic token');
  assert(afterToken.split(/\s+/u).length > 1, 'legacy after 应保留 scoped token并追加 atomic token');
  assert(findExactSelectorRulePosition(atomicCss, `.${beforeAtomic}:before`) >= 0, 'Rspack 传入 Core 的 legacy before spelling 应保留');
  assert(findExactSelectorRulePosition(atomicCss, `.${afterAtomic}:after`) >= 0, 'legacy after atomic selector 应保留 spelling');
  assertDoesNotInclude(nativeCss, '.fixture_Base-module__pseudoBefore::before', 'eligible before 不应进入 native fallback asset');
  assertDoesNotInclude(nativeCss, '.fixture_Base-module__pseudoAfter:after', 'eligible legacy after 不应进入 native fallback asset');
}

/** 从完整 CSS Modules token string 中找出带指定 marker 的 token。 */
function findClassTokenPart(classToken, marker) {
  const token = classToken.split(/\s+/u).find((candidate) => candidate.includes(marker));
  assert(token, `class token 应包含 ${marker}: ${classToken}`);
  return token;
}

/** 断言文件不存在。 */
async function assertMissing(file) {
  try {
    await readFile(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`不应存在文件: ${file}`);
}

function assertIncludes(value, expected, message) {
  assert(value.includes(expected), `${message}\n缺少: ${expected}`);
}

function assertDoesNotInclude(value, expected, message) {
  assert(!value.includes(expected), `${message}\n不应包含: ${expected}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await main();
