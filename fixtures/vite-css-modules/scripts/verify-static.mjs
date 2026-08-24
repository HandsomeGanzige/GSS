import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build } from 'vite';
import { semanticAtomicCss } from '@semantic-atomic-css/vite';

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(fixtureRoot, '../..');
const suiteRoots = {
  base: path.join(fixtureRoot, 'suites/base'),
  preprocessor: path.join(fixtureRoot, 'suites/preprocessor')
};

/**
 * 运行统一 Vite fixture 的静态黑盒验收，并始终清理临时构建目录。
 *
 * @returns {Promise<void>} 所有构建及断言通过后解决。
 * @throws {Error} 当构建失败或任一验收断言不成立时抛出。
 */
async function main() {
  verifyExactSelectorRulePositionGuard();
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'gss-vite-fixture-'));
  const outputs = {
    baseSemanticA: path.join(tempRoot, 'base-semantic-a'),
    baseSemanticB: path.join(tempRoot, 'base-semantic-b'),
    baseNative: path.join(tempRoot, 'base-native'),
    preprocessorSemanticA: path.join(tempRoot, 'preprocessor-semantic-a'),
    preprocessorSemanticB: path.join(tempRoot, 'preprocessor-semantic-b'),
    preprocessorNative: path.join(tempRoot, 'preprocessor-native')
  };

  try {
    await runFixtureBuild('base', 'semantic', outputs.baseSemanticA);
    await runFixtureBuild('base', 'semantic', outputs.baseSemanticB);
    await runFixtureBuild('base', 'native', outputs.baseNative);
    await runFixtureBuild('preprocessor', 'semantic', outputs.preprocessorSemanticA);
    await runFixtureBuild('preprocessor', 'semantic', outputs.preprocessorSemanticB);
    await runFixtureBuild('preprocessor', 'native', outputs.preprocessorNative);

    await verifyBaseSemanticBuild(outputs.baseSemanticA);
    await verifyBaseNativeBuild(outputs.baseNative);
    await verifyPreprocessorSemanticBuild(outputs.preprocessorSemanticA);
    await verifyPreprocessorNativeBuild(outputs.preprocessorNative);
    await verifyStableBuilds('base', outputs.baseSemanticA, outputs.baseSemanticB);
    await verifyStableBuilds('preprocessor', outputs.preprocessorSemanticA, outputs.preprocessorSemanticB);
    await verifyPreprocessorErrorBoundary(tempRoot);
    await verifyDependencyBoundary();
    console.log('Vite CSS Modules fixture 静态验收通过');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/**
 * 使用真实 Vite 管线构建单个 suite/mode。
 *
 * @param {'base' | 'preprocessor'} suite - 要构建的 fixture 场景。
 * @param {'semantic' | 'native'} mode - adapter 增强或原生对照模式。
 * @param {string} outDir - 隔离的构建输出目录。
 * @returns {Promise<void>} Vite 构建完成后解决。
 */
async function runFixtureBuild(suite, mode, outDir) {
  const semantic = mode === 'semantic';
  const preprocessor = suite === 'preprocessor';

  await build({
    root: suiteRoots[suite],
    configFile: false,
    logLevel: 'silent',
    plugins: semantic
      ? [
          semanticAtomicCss({
            core: { className: { strategy: 'readable' } },
            ...(preprocessor
              ? {
                  manifest: { enabled: true },
                  report: { enabled: true }
                }
              : {})
          }),
          react()
        ]
      : [react()],
    ...(preprocessor
      ? {
          css: {
            modules: {
              localsConvention: 'camelCaseOnly',
              generateScopedName: 'fixture_[name]__[local]'
            },
            preprocessorOptions: {
              scss: { additionalData: '$fixture-runtime-gap: 3px;\n' },
              less: { additionalData: '@fixture-runtime-radius: 9px;\n' }
            }
          }
        }
      : {}),
    build: {
      outDir,
      emptyOutDir: true,
      ...(preprocessor ? { assetsInlineLimit: 0 } : {})
    }
  });
}

/**
 * 校验基础 suite 的 atomic、fallback 与默认输出边界。
 *
 * @param {string} outDir - semantic 构建输出目录。
 * @returns {Promise<void>} 所有基础场景断言通过后解决。
 * @throws {Error} 当产物缺失或内容不符合验收边界时抛出。
 */
async function verifyBaseSemanticBuild(outDir) {
  const cssFile = path.join(outDir, 'assets/semantic-atomic.css');
  await assertExists(path.join(outDir, 'index.html'));
  await assertExists(cssFile);

  const html = await readFile(path.join(outDir, 'index.html'), 'utf8');
  const css = await readFile(cssFile, 'utf8');
  const js = await readAssets(path.join(outDir, 'assets'), '.js');
  const assetNames = await readdir(path.join(outDir, 'assets'));

  assertIncludes(html, 'assets/semantic-atomic.css', 'base HTML 应注入聚合 CSS');
  assertIncludes(js, 'data-gss-case', 'base fixture 应保留稳定验收锚点');
  assertIncludes(js, 'Vite CSS Modules semantic/native parity cases', 'base fixture 应构建对照页');
  assertIncludes(js, 'dashed-token', 'base fixture 应覆盖 dashed token key');
  assertIncludes(js, 'camelToken', 'base fixture 应覆盖 camelCase token key');
  verifyBaseAttributeSelectors(js, css);
  verifyBaseSelectorList(js, css);
  assertIncludes(js, '_selector_q0dmug_padding_13px', 'selector-list 旁的无关 class 应追加当前 selector-aware atomic token');
  assertIncludes(css, 'grid-template-columns', '@supports declaration 应进入聚合 CSS');
  assertIncludes(css, '@media (max-width: 600px)', 'media atomic CSS 应进入聚合 CSS');
  assertIncludes(css, '@supports (display: grid)', 'supports atomic CSS 应进入聚合 CSS');
  assertIncludes(css, 'border-left-color', '顺序敏感 longhand 应保留');
  assertIncludes(css, '!important', 'important declaration 应进入 atomic key 与输出');
  assertIncludes(css, '--case-accent', 'custom property 应作为 fallback 保留');
  assertIncludes(css, 'box-shadow', 'descendant fallback 应保留');
  assertIncludes(css, '[data-tone=', 'attribute fallback 应保留');
  verifyBasePseudoElements(js, css);
  assertIncludes(css, '#2563eb', 'selector-list declaration 应进入单-arm atomic rule');
  assertIncludes(css, '#dc2626', '同 class 后置 declaration 应进入后置 atomic rule');
  for (const caseId of [
    'oracle-non-competing',
    'oracle-important',
    'oracle-specificity',
    'oracle-stable-order',
    'oracle-media-overlap',
    'oracle-supports-overlap',
    'duplicate-base',
    'duplicate-align'
  ]) {
    assertIncludes(js, caseId, `base bundle 应包含 ${caseId} 验收锚点`);
  }
  for (const atomicToken of [
    '_selector_q0dmug_color_4338ca',
    '_selector_q0dmug_color_9f1239_important',
    '_selector_q0dmug_color_7c3aed',
    '_selector_q0dmug_color_7c2d12',
    '_selector_q0dmug_color_1e3a8a',
    '_selector_q0dmug_color_2563eb',
    '_selector_q0dmug_color_be123c'
  ]) {
    assertIncludes(js, atomicToken, `base bundle 应包含 safe atomic token: ${atomicToken}`);
    assertIncludes(css, atomicToken, `聚合 CSS 应包含 safe atomic rule: ${atomicToken}`);
  }
  assertIncludes(css, "data-oracle='non-competing'", 'non-competing attribute atomic guard 应保留');
  assertIncludes(css, "data-oracle='specificity'", 'specificity attribute atomic guard 应保留');
  for (const fallbackValue of [
    '#fef3c7',
    '#6b7280',
    '#0e7490',
    '#0369a1',
    '#f1f5f9',
    '#f8fafc',
    '#dbeafe',
    '#dcfce7'
  ]) {
    assertIncludes(css, fallbackValue, `聚合 CSS 应保留 fallback value: ${fallbackValue}`);
  }
  const supportsFallbackToken = findBundleClassToken(js, '_oracleSupportsFallback_');
  assertIncludes(
    css,
    '._selector_q0dmug_background_f8fafc {',
    'supports base background 的同值 atomic rule 应存在，确保 fallback token guard 不是空断言'
  );
  assert(
    supportsFallbackToken.split(/\s+/u).length === 1,
    `supports fallback bundle token 只应包含 semantic scoped class: ${supportsFallbackToken}`
  );
  assertDoesNotInclude(
    supportsFallbackToken,
    '_selector_q0dmug_background_f8fafc',
    'supports fallback base background 不得追加同值 atomic token'
  );
  for (const forbiddenAtomicToken of [
    '_selector_q0dmug_color_6b7280',
    '_selector_q0dmug_color_0369a1',
    '_selector_q0dmug_background_f1f5f9',
    '_selector_q0dmug_background_dbeafe',
    '_selector_q0dmug_background_dcfce7'
  ]) {
    assertDoesNotInclude(
      css,
      forbiddenAtomicToken,
      `fallback declaration 不应进入对应 atomic token: ${forbiddenAtomicToken}`
    );
  }
  assertSnippetsInOrder(css, ['color: #4338ca;', 'background: #fef3c7;'], 'atomic CSS 应位于 preserved fallback 前');
  assertSnippetsInOrder(css, ['color: #7c2d12;', 'color: #0369a1;'], 'stable-order 应保持 atomic → fallback');
  assertSnippetsInOrder(
    css,
    ['color: #1e3a8a;', 'color: #2563eb;', 'color: #be123c;'],
    'media atomic declaration 应保持 base → min600 → min900'
  );
  assertSnippetsInOrder(
    css,
    [
      '._oracleSupportsFallback_',
      'background: #f8fafc;',
      '._oracleSupportsFallback_',
      'background: #dbeafe;',
      '._oracleSupportsFallback_',
      'background: #dcfce7;'
    ],
    'supports fallback 应保持 base → grid → flex'
  );
  assert(
    countOccurrences(css, '._selector_q0dmug_color_334155 {') === 1,
    'same-value duplicate color atomic rule 应只输出一次'
  );
  assert(
    countOccurrences(css, '._selector_q0dmug_align-items_center {') === 1,
    'same-value duplicate align-items atomic rule 应只输出一次'
  );
  assert(
    assetNames.filter((name) => name === 'semantic-atomic.css').length === 1,
    'base semantic build 应只生成一个统一 GSS 聚合 CSS'
  );
  assertIncludes(css, '._selector_q0dmug_', '聚合 CSS 应包含当前 selector-aware readable atomic class');
  assertMatches(
    css,
    /\.-?[_a-zA-Z][-_a-zA-Z0-9]*\s+\.-?[_a-zA-Z][-_a-zA-Z0-9]*/,
    'descendant fallback 应使用 scoped class'
  );
  await assertNotExists(path.join(outDir, 'semantic-atomic-manifest.json'));
  await assertNotExists(path.join(outDir, 'semantic-atomic-report.json'));
}

/**
 * 校验 base native 对照不产生 GSS 专属产物。
 *
 * @param {string} outDir - native 构建输出目录。
 * @returns {Promise<void>} 对照产物断言通过后解决。
 * @throws {Error} 当 native 构建包含 GSS 产物或缺少原生 CSS 时抛出。
 */
async function verifyBaseNativeBuild(outDir) {
  await assertNotExists(path.join(outDir, 'assets/semantic-atomic.css'));
  await assertNotExists(path.join(outDir, 'semantic-atomic-manifest.json'));
  await assertNotExists(path.join(outDir, 'semantic-atomic-report.json'));
  const css = await readAssets(path.join(outDir, 'assets'), '.css');
  assertIncludes(css, 'grid-template-columns', 'base native CSS 应保留 Vite 编译结果');
}

/**
 * 校验预处理器 suite 的 tokens、资源、fallback、manifest 与 report。
 *
 * @param {string} outDir - preprocessor semantic 构建输出目录。
 * @returns {Promise<void>} 所有预处理器场景断言通过后解决。
 * @throws {Error} 当预处理、资源替换或报告产物不符合预期时抛出。
 */
async function verifyPreprocessorSemanticBuild(outDir) {
  const cssFile = path.join(outDir, 'assets/semantic-atomic.css');
  const manifestFile = path.join(outDir, 'semantic-atomic-manifest.json');
  const reportFile = path.join(outDir, 'semantic-atomic-report.json');
  await Promise.all([assertExists(cssFile), assertExists(manifestFile), assertExists(reportFile)]);

  const css = await readFile(cssFile, 'utf8');
  const js = await readAssets(path.join(outDir, 'assets'), '.js');
  const assetNames = (await readdir(path.join(outDir, 'assets'))).filter((name) => name.endsWith('.svg'));
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const report = JSON.parse(await readFile(reportFile, 'utf8'));

  assertIncludes(js, 'fixture_Theme-module__safe-scss', 'SCSS token 应继承 Vite scoped class');
  assertIncludes(js, 'fixture_Panel-module__panel', 'Less token 应继承 Vite scoped class');
  assertIncludes(css, 'padding: 17px;', 'Sass partial 和 additionalData 应由 Vite 编译');
  assertIncludes(css, 'border-radius: 9px;', 'Less additionalData 应由 Vite 编译');
  assertIncludes(css, 'background: #eff6ff;', '参与 descendant selector 的 Less class 应整类保留');
  assertIncludes(css, '.fixture_Panel-module__panel .fixture_Panel-module__child', 'Less descendant 应保留 fallback');
  assertIncludes(css, '.fixture_Theme-module__hero', '资源 class 应保留 semantic selector');
  assertIncludes(css, 'fixture-mark-', '聚合 CSS 应引用 Vite 发布的资源');
  assertDoesNotInclude(css, '__VITE_', '聚合 CSS 不应残留 Vite 内部占位符');
  assertDoesNotInclude(css, '$accent', '聚合 CSS 不应残留 Sass 语法');
  assertDoesNotInclude(css, '@panel-surface', '聚合 CSS 不应残留 Less 语法');
  assert(assetNames.length === 1, '应只发布一个 fixture SVG 资源');
  assert(
    report.diagnostics.some((diagnostic) => diagnostic.code === 'preserved-class' && diagnostic.reason === 'asset-reference'),
    'report 应记录 asset-reference class 保留'
  );
  assert(
    report.diagnostics.some((diagnostic) => String(diagnostic.id).endsWith('.module.scss')) &&
      report.diagnostics.some((diagnostic) => String(diagnostic.id).endsWith('.module.less')),
    'report 应保留 SCSS/Less source id'
  );
  assert(report.analysis.size.beforeRawCssBytes > 0, 'analyzer 应输出 scoped CSS before-size');
  assert(Object.keys(manifest.classes).some((key) => key.includes('.module.scss::')), 'manifest 应包含 SCSS class');
  assert(Object.keys(manifest.classes).some((key) => key.includes('.module.less::')), 'manifest 应包含 Less class');
  verifyManifestAtomicSelectors(manifest, css);

  const safeScssClass = Object.values(manifest.classes).find(
    (entry) => entry.sourceClassName === 'fixture_Theme-module__safe-scss'
  );
  assert(safeScssClass, 'manifest 应包含 safe-scss class entry');
  verifySuggestedTokenMutationGuard(js, safeScssClass, 'Vite safe-scss');
  const compiledAttributeClass = Object.values(manifest.classes).find((entry) =>
    entry.sourceClassName.includes('compiled-attribute')
  );
  assert(compiledAttributeClass, 'manifest 应包含 SCSS compiled attribute class entry');
  verifySuggestedTokenMutationGuard(js, compiledAttributeClass, 'Vite SCSS compiled attribute');
  const compiledAttributeEntries = compiledAttributeClass.atomicClassNames
    .map((className) => manifest.atomic[className])
    .filter((entry) => ['color', 'background'].includes(entry?.declaration?.prop));
  assert(
    compiledAttributeEntries.length === 2,
    'SCSS compiled attribute class 应映射 color/background 两条 guarded atomic entries'
  );
  assert(
    compiledAttributeEntries.every(
      (entry) =>
        entry.selector.identity.includes('[data-state=ready]') &&
        entry.selector.css.includes('[data-state=ready]')
    ),
    'SCSS compiled attribute manifest selector.identity 与 selector.css 必须同时保留 compiled guard'
  );
  assert(
    compiledAttributeEntries.every((entry) => findExactSelectorRulePosition(css, entry.selector.css) >= 0),
    'SCSS compiled attribute manifest selector.css 必须精确存在于聚合 CSS'
  );
  assert(
    findExactSelectorRulePosition(
      css,
      `.${compiledAttributeClass.sourceClassName}[data-state=ready]`
    ) === -1,
    'eligible SCSS compiled attribute selector 不应重复保留 scoped fallback'
  );
  assert(
    !report.diagnostics.some(
      (diagnostic) =>
        diagnostic.reason === 'attribute-selector' && String(diagnostic.id).endsWith('Theme.module.scss')
    ),
    'eligible SCSS compiled attribute selector 不应报告 attribute-selector'
  );
  const assetClass = Object.values(manifest.classes).find((entry) => entry.sourceClassName.includes('hero'));
  assert(assetClass && assetClass.atomicClassNames.length === 0, '资源 class 的 manifest atomicClassNames 应为空');
  const descendantClass = Object.values(manifest.classes).find((entry) => entry.sourceClassName.includes('panel'));
  assert(descendantClass && descendantClass.atomicClassNames.length === 0, '参与 descendant selector 的 class 应整类保留');
}

/**
 * 校验 preprocessor native 对照保留 Vite scoped CSS 且不产生 GSS 产物。
 *
 * @param {string} outDir - preprocessor native 构建输出目录。
 * @returns {Promise<void>} 对照产物断言通过后解决。
 * @throws {Error} 当原生 scoped CSS 缺失或出现 GSS 产物时抛出。
 */
async function verifyPreprocessorNativeBuild(outDir) {
  await assertNotExists(path.join(outDir, 'assets/semantic-atomic.css'));
  await assertNotExists(path.join(outDir, 'semantic-atomic-manifest.json'));
  await assertNotExists(path.join(outDir, 'semantic-atomic-report.json'));
  const css = await readAssets(path.join(outDir, 'assets'), '.css');
  assertIncludes(css, '.fixture_Theme-module__hero', 'native CSS 应包含 Vite scoped SCSS');
  assertIncludes(css, '.fixture_Panel-module__panel', 'native CSS 应包含 Vite scoped Less');
}

/**
 * 比较同一 suite 连续两次 semantic build 的核心产物，验证输出可复现性。
 *
 * @param {'base' | 'preprocessor'} suite - 当前比较的 fixture 场景。
 * @param {string} leftDir - 第一次构建输出目录。
 * @param {string} rightDir - 第二次构建输出目录。
 * @returns {Promise<void>} 所有稳定性断言通过后解决。
 * @throws {Error} 当 CSS、tokens、manifest 或 report 哈希不一致时抛出。
 */
async function verifyStableBuilds(suite, leftDir, rightDir) {
  const relativeFiles = ['assets/semantic-atomic.css'];

  if (suite === 'preprocessor') {
    relativeFiles.push('semantic-atomic-manifest.json', 'semantic-atomic-report.json');
  }

  for (const relativeFile of relativeFiles) {
    const [left, right] = await Promise.all([
      readFile(path.join(leftDir, relativeFile)),
      readFile(path.join(rightDir, relativeFile))
    ]);
    assert(hash(left) === hash(right), `连续构建产物不稳定: ${suite}/${relativeFile}`);
  }

  const [leftJs, rightJs] = await Promise.all([
    readAssets(path.join(leftDir, 'assets'), '.js'),
    readAssets(path.join(rightDir, 'assets'), '.js')
  ]);
  assert(hash(leftJs) === hash(rightJs), `连续构建的 CSS Modules JS tokens 不稳定: ${suite}`);
}

/**
 * 验证 Sass import 错误保留 Vite/Sass 的原始位置信息。
 *
 * @param {string} tempRoot - 用于创建错误 fixture 的临时根目录。
 * @returns {Promise<void>} 错误边界断言通过后解决。
 * @throws {Error} 当构建意外成功或错误信息丢失文件定位时抛出。
 */
async function verifyPreprocessorErrorBoundary(tempRoot) {
  const missingRoot = path.join(tempRoot, 'missing-import');
  const srcDir = path.join(missingRoot, 'src');
  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(missingRoot, 'index.html'), '<script type="module" src="/src/main.js"></script>');
  await writeFile(path.join(srcDir, 'main.js'), "import styles from './Missing.module.scss';\nvoid styles.button;");
  await writeFile(
    path.join(srcDir, 'Missing.module.scss'),
    "@use './does-not-exist' as missing;\n.button { color: red; }"
  );

  let failure;

  try {
    await build({
      root: missingRoot,
      configFile: false,
      logLevel: 'silent',
      plugins: [semanticAtomicCss()],
      build: { outDir: path.join(missingRoot, 'dist'), emptyOutDir: true }
    });
  } catch (error) {
    failure = error;
  }

  const message = failure instanceof Error ? `${failure.stack ?? failure.message}` : String(failure ?? '');
  assert(failure && /Can't find stylesheet to import|does-not-exist/i.test(message), 'Sass missing import 应保留原始错误');
  assertIncludes(message, 'Missing.module.scss', 'Sass missing import 错误应包含源文件');
}

/**
 * 确认测试工具只属于 fixture，不泄漏到 adapter 生产依赖。
 *
 * @returns {Promise<void>} 依赖边界断言通过后解决。
 * @throws {Error} 当 adapter 声明测试专用依赖，或 fixture 缺少验收依赖时抛出。
 */
async function verifyDependencyBoundary() {
  const adapterPackage = JSON.parse(await readFile(path.join(repositoryRoot, 'packages/vite/package.json'), 'utf8'));
  const fixturePackage = JSON.parse(await readFile(path.join(fixtureRoot, 'package.json'), 'utf8'));
  assert(!adapterPackage.dependencies?.sass, 'Vite adapter 不应生产依赖 sass');
  assert(!adapterPackage.dependencies?.less, 'Vite adapter 不应生产依赖 less');
  assert(adapterPackage.dependencies?.['postcss-value-parser'] === '^4.2.0', 'Vite adapter 应显式依赖 value parser');
  assert(fixturePackage.devDependencies?.sass === '1.101.0', 'fixture 应固定 Sass 验收版本');
  assert(fixturePackage.devDependencies?.less === '4.6.7', 'fixture 应固定 Less 验收版本');
}

/**
 * 按文件名稳定顺序读取并拼接指定类型的 build assets。
 *
 * @param {string} dir - build assets 所在目录。
 * @param {string} extension - 要读取的文件扩展名。
 * @returns {Promise<string>} 以换行符连接的 asset 内容。
 */
async function readAssets(dir, extension) {
  const entries = (await readdir(dir, { withFileTypes: true })).filter(
    (entry) => entry.isFile() && entry.name.endsWith(extension)
  );
  const chunks = [];

  for (const entry of entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))) {
    chunks.push(await readFile(path.join(dir, entry.name), 'utf8'));
  }

  return chunks.join('\n');
}

/**
 * 断言文件或目录存在。
 *
 * @param {string} file - 要检查的路径。
 * @returns {Promise<void>} 路径可访问时解决。
 * @throws {Error} 当路径不存在或不可访问时抛出。
 */
async function assertExists(file) {
  await access(file);
}

/**
 * 断言文件或目录不存在。
 *
 * @param {string} file - 要检查的路径。
 * @returns {Promise<void>} 路径不存在时解决。
 * @throws {Error} 当路径仍可访问或检查失败时抛出。
 */
async function assertNotExists(file) {
  try {
    await access(file);
  } catch {
    return;
  }

  throw new Error(`不应存在产物: ${path.relative(repositoryRoot, file)}`);
}

/**
 * 断言字符串包含指定片段。
 *
 * @param {string} value - 被检查的完整字符串。
 * @param {string} expected - 必须出现的片段。
 * @param {string} message - 断言失败时使用的说明。
 * @returns {void}
 * @throws {Error} 当目标片段不存在时抛出。
 */
function assertIncludes(value, expected, message) {
  assert(value.includes(expected), message);
}

/**
 * 断言字符串不包含指定片段。
 *
 * @param {string} value - 被检查的完整字符串。
 * @param {string} expected - 不允许出现的片段。
 * @param {string} message - 断言失败时使用的说明。
 * @returns {void}
 * @throws {Error} 当目标片段存在时抛出。
 */
function assertDoesNotInclude(value, expected, message) {
  assert(!value.includes(expected), message);
}

/**
 * 断言字符串匹配给定正则表达式。
 *
 * @param {string} value - 被检查的字符串。
 * @param {RegExp} pattern - 必须匹配的表达式。
 * @param {string} message - 断言失败时使用的说明。
 * @returns {void}
 * @throws {Error} 当字符串不匹配表达式时抛出。
 */
function assertMatches(value, pattern, message) {
  assert(pattern.test(value), message);
}

/**
 * 断言多个 CSS 片段按指定顺序出现，防止仅验证“都存在”却遗漏 cascade 重排。
 *
 * @param {string} value - 被检查的完整 CSS。
 * @param {string[]} snippets - 按预期顺序排列的 CSS 片段。
 * @param {string} message - 断言失败时使用的说明。
 * @returns {void}
 */
function assertSnippetsInOrder(value, snippets, message) {
  let previousIndex = -1;

  for (const snippet of snippets) {
    const index = value.indexOf(snippet, previousIndex + 1);
    assert(index > previousIndex, `${message}: ${snippet}`);
    previousIndex = index;
  }
}

/**
 * 统计固定 CSS 片段的非重叠 occurrence，用于证明全局 atomic dedupe 未被重复输出掩盖。
 *
 * @param {string} value - 被检查的完整 CSS。
 * @param {string} snippet - 要统计的非空 CSS 片段。
 * @returns {number} 非重叠 occurrence 数量。
 */
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
 * 从真实 bundle string literal 中读取指定 source class marker 对应的完整 class token。
 *
 * @param {string} bundleJs - 当前 semantic build 的完整 JavaScript。
 * @param {string} sourceClassMarker - Vite scoped class 中保留的 source class marker。
 * @returns {string} 包含 semantic scoped class 与可能 atomic class 的完整 token。
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
  const targetToken = findBundleClassToken(bundleJs, '_selectorListTarget_');
  const peerToken = findBundleClassToken(bundleJs, '_selectorListPeer_');
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

/** 验证 modern before 与 legacy after 保留 spelling、semantic token 和单-arm atomic CSS。 */
function verifyBasePseudoElements(bundleJs, atomicCss) {
  const beforeToken = findBundleClassToken(bundleJs, '_pseudoMarker_');
  const afterToken = findBundleClassToken(bundleJs, '_pseudoAfter_');
  const beforeAtomic = findClassTokenPart(beforeToken, 'background_0f766e');
  const afterAtomic = findClassTokenPart(afterToken, 'color_7c3aed');
  const beforeScoped = beforeToken.split(/\s+/u)[0];
  const afterScoped = afterToken.split(/\s+/u)[0];

  assert(beforeToken.split(/\s+/u).length > 1, 'modern before semantic token 应追加 atomic classes');
  assert(afterToken.split(/\s+/u).length > 1, 'legacy after semantic token 应追加 atomic classes');
  assert(findExactSelectorRulePosition(atomicCss, `.${beforeAtomic}::before`) >= 0, 'modern before atomic CSSOM spelling 应保留');
  assert(findExactSelectorRulePosition(atomicCss, `.${afterAtomic}:after`) >= 0, 'legacy after atomic CSSOM spelling 应保留');
  assert(findExactSelectorRulePosition(atomicCss, `.${beforeScoped}::before`) === -1, 'eligible before 不应重复 scoped fallback');
  assert(findExactSelectorRulePosition(atomicCss, `.${afterScoped}:after`) === -1, 'eligible legacy after 不应重复 scoped fallback');
}

/**
 * 验证 base fixture 能区分 guarded atomic selector 与 scoped fallback，并锁定 attribute node order。
 *
 * @param {string} bundleJs - base semantic build 的完整 JavaScript。
 * @param {string} atomicCss - base semantic build 的统一 GSS stylesheet。
 * @returns {void}
 */
function verifyBaseAttributeSelectors(bundleJs, atomicCss) {
  const stateToken = findBundleClassToken(bundleJs, '_attributeState_');
  const stateTokens = stateToken.split(/\s+/u);
  const stateScopedClass = stateTokens[0];
  const openBackground = findClassTokenPart(stateToken, 'background_dcfce7');
  const closedBackground = findClassTokenPart(stateToken, 'background_fee2e2');
  assert(
    findExactSelectorRulePosition(atomicCss, `.${openBackground}[data-state='open']`) >= 0,
    'exact open selector 应绑定 atomic token 与 attribute guard'
  );
  assert(
    findExactSelectorRulePosition(atomicCss, `.${closedBackground}[data-state='closed']`) >= 0,
    'exact closed selector 应绑定 atomic token 与 attribute guard'
  );
  assert(
    findExactSelectorRulePosition(atomicCss, `.${stateScopedClass}[data-state='open']`) === -1,
    'eligible exact open selector 不应以 scoped class 重复输出 fallback'
  );
  assert(
    findExactSelectorRulePosition(atomicCss, `.${stateScopedClass}[data-state='closed']`) === -1,
    'eligible exact closed selector 不应以 scoped class 重复输出 fallback'
  );

  const presenceToken = findBundleClassToken(bundleJs, '_presenceGuard_');
  const presenceScopedClass = presenceToken.split(/\s+/u)[0];
  const presenceAtomic = findClassTokenPart(presenceToken, 'background_dbeafe');
  assert(
    findExactSelectorRulePosition(atomicCss, `.${presenceAtomic}[data-present]`) >= 0,
    'presence selector 应绑定 atomic token 与 attribute guard'
  );
  assert(
    findExactSelectorRulePosition(atomicCss, `.${presenceScopedClass}[data-present]`) === -1,
    'eligible presence selector 不应以 scoped class 重复输出 fallback'
  );

  const nodeOrderToken = findBundleClassToken(bundleJs, '_nodeOrder_');
  const nodeOrderScopedClass = nodeOrderToken.split(/\s+/u)[0];
  const nodeOrderAtomic = findClassTokenPart(nodeOrderToken, 'background_f3e8ff');
  assert(
    findExactSelectorRulePosition(atomicCss, `[data-placement='before'].${nodeOrderAtomic}`) >= 0,
    'attribute-before-class selector 应保留原始 node order'
  );
  assert(
    findExactSelectorRulePosition(atomicCss, `[data-placement='before'].${nodeOrderScopedClass}`) === -1,
    'eligible attribute-before-class selector 不应以 scoped class 重复输出 fallback'
  );

  const orderRiskToken = findBundleClassToken(bundleJs, '_orderRisk_');
  const orderRiskTokens = orderRiskToken.split(/\s+/u);
  assert(orderRiskTokens.length === 1, 'order-risk class 只能保留 semantic scoped token');
  assert(
    findExactSelectorRulePosition(atomicCss, `.${orderRiskTokens[0]}[data-state]`) >= 0 &&
      findExactSelectorRulePosition(atomicCss, `.${orderRiskTokens[0]}:hover`) >= 0,
    'order-risk attribute/pseudo rules 应整类保留 scoped fallback'
  );

  const nearMissToken = findBundleClassToken(bundleJs, '_nearMiss_');
  const nearMissTokens = nearMissToken.split(/\s+/u);
  assert(nearMissTokens.length === 1, 'near-miss class 只能保留 semantic scoped token');
  assert(
    findExactSelectorRulePosition(atomicCss, `.${nearMissTokens[0]}[data-kind^='danger']`) >= 0,
    '不支持的 ^= operator 应保留 scoped fallback'
  );
}

/** 从完整 suggested class token 中定位一枚带稳定 declaration marker 的 atomic token。 */
function findClassTokenPart(classToken, marker) {
  const match = classToken.split(/\s+/u).find((token) => token.includes(marker));
  assert(match, `class token 缺少 atomic marker: ${marker}\n${classToken}`);
  return match;
}

/**
 * 验证 manifest 的 className 索引、opaque selector identity 与最终 selector CSS 保持一致。
 *
 * @param {Record<string, unknown>} manifest - 当前 build 输出的 manifest。
 * @param {string} atomicCss - 当前 build 输出的完整 atomic stylesheet。
 * @returns {void}
 */
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
      findExactSelectorRulePosition(atomicCss, entry.selector.css) >= 0,
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

/**
 * 在内存 bundle 中验证完整 suggested token，并以删除该 token 的 mutation 证明门禁能够失败。
 *
 * @param {string} bundleJs - 真实构建输出的 JavaScript。
 * @param {Record<string, unknown>} classEntry - safe-scss class manifest entry。
 * @param {string} label - 失败信息的场景标签。
 * @returns {void}
 */
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

/**
 * 定位 selector 作为完整 rule prelude 的精确位置，不允许更长 selector 以前缀方式误命中。
 *
 * @param {string} css - 完整 stylesheet。
 * @param {string} selector - descriptor 提供的完整 selector.css。
 * @returns {number} rule prelude 起点；未命中返回 -1。
 */
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

/**
 * 执行静态验收的通用条件断言。
 *
 * @param {unknown} condition - 需要成立的条件。
 * @param {string} message - 条件不成立时使用的错误信息。
 * @returns {void}
 * @throws {Error} 当条件为假值时抛出。
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * 计算内容的 SHA-256 哈希，用于比较构建产物稳定性。
 *
 * @param {string | NodeJS.ArrayBufferView} value - 要计算摘要的文本或二进制内容。
 * @returns {string} 十六进制 SHA-256 摘要。
 */
function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

await main();
