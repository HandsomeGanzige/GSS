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

/** 运行统一 Vite fixture 的静态黑盒验收。 */
async function main() {
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

/** 使用真实 Vite 管线构建单个 suite/mode。 */
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

/** 校验基础 suite 的 atomic、fallback 与默认输出边界。 */
async function verifyBaseSemanticBuild(outDir) {
  const cssFile = path.join(outDir, 'assets/semantic-atomic.css');
  await assertExists(path.join(outDir, 'index.html'));
  await assertExists(cssFile);

  const html = await readFile(path.join(outDir, 'index.html'), 'utf8');
  const css = await readFile(cssFile, 'utf8');
  const js = await readAssets(path.join(outDir, 'assets'), '.js');

  assertIncludes(html, 'assets/semantic-atomic.css', 'base HTML 应注入聚合 CSS');
  assertIncludes(js, 'data-gss-case', 'base fixture 应保留稳定验收锚点');
  assertIncludes(js, 'Vite CSS Modules semantic/native parity cases', 'base fixture 应构建对照页');
  assertIncludes(js, 'dashed-token', 'base fixture 应覆盖 dashed token key');
  assertIncludes(js, 'camelToken', 'base fixture 应覆盖 camelCase token key');
  assertIncludes(css, 'grid-template-columns', '@supports declaration 应进入聚合 CSS');
  assertIncludes(css, '@media (max-width: 600px)', 'media atomic CSS 应进入聚合 CSS');
  assertIncludes(css, '@supports (display: grid)', 'supports atomic CSS 应进入聚合 CSS');
  assertIncludes(css, 'border-left-color', '顺序敏感 longhand 应保留');
  assertIncludes(css, '!important', 'important declaration 应进入 atomic key 与输出');
  assertIncludes(css, '--case-accent', 'custom property 应作为 fallback 保留');
  assertIncludes(css, 'box-shadow', 'descendant fallback 应保留');
  assertIncludes(css, '[data-tone=', 'attribute fallback 应保留');
  assertIncludes(css, 'content: "";', 'pseudo-element fallback 应保留');
  assertIncludes(css, '._', '聚合 CSS 应包含 readable atomic class');
  assertMatches(
    css,
    /\.-?[_a-zA-Z][-_a-zA-Z0-9]*\s+\.-?[_a-zA-Z][-_a-zA-Z0-9]*/,
    'descendant fallback 应使用 scoped class'
  );
  await assertNotExists(path.join(outDir, 'semantic-atomic-manifest.json'));
  await assertNotExists(path.join(outDir, 'semantic-atomic-report.json'));
}

/** 校验 base native 对照不产生 GSS 产物。 */
async function verifyBaseNativeBuild(outDir) {
  await assertNotExists(path.join(outDir, 'assets/semantic-atomic.css'));
  await assertNotExists(path.join(outDir, 'semantic-atomic-manifest.json'));
  await assertNotExists(path.join(outDir, 'semantic-atomic-report.json'));
  const css = await readAssets(path.join(outDir, 'assets'), '.css');
  assertIncludes(css, 'grid-template-columns', 'base native CSS 应保留 Vite 编译结果');
}

/** 校验预处理器 suite 的 tokens、资源、fallback 和 report。 */
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
  assertIncludes(js, '_color_0f766e', 'SCSS safe declaration 应追加 atomic class');
  assertIncludes(js, '_background_eff6ff', 'Less safe declaration 应追加 atomic class');
  assertIncludes(css, 'padding: 17px;', 'Sass partial 和 additionalData 应由 Vite 编译');
  assertIncludes(css, 'border-radius: 9px;', 'Less additionalData 应由 Vite 编译');
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

  const assetClass = Object.values(manifest.classes).find((entry) => entry.sourceClassName.includes('hero'));
  assert(assetClass && assetClass.atomicClassNames.length === 0, '资源 class 的 manifest atomicClassNames 应为空');
}

/** 校验 preprocessor native 对照不产生 GSS 产物。 */
async function verifyPreprocessorNativeBuild(outDir) {
  await assertNotExists(path.join(outDir, 'assets/semantic-atomic.css'));
  await assertNotExists(path.join(outDir, 'semantic-atomic-manifest.json'));
  await assertNotExists(path.join(outDir, 'semantic-atomic-report.json'));
  const css = await readAssets(path.join(outDir, 'assets'), '.css');
  assertIncludes(css, '.fixture_Theme-module__hero', 'native CSS 应包含 Vite scoped SCSS');
  assertIncludes(css, '.fixture_Panel-module__panel', 'native CSS 应包含 Vite scoped Less');
}

/** 比较同一 suite 连续两次 semantic build 的核心产物。 */
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

/** 验证 Sass import 错误保留 Vite/Sass 的原始位置信息。 */
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

/** 确认测试工具属于 fixture，不泄漏到 adapter 生产依赖。 */
async function verifyDependencyBoundary() {
  const adapterPackage = JSON.parse(await readFile(path.join(repositoryRoot, 'packages/vite/package.json'), 'utf8'));
  const fixturePackage = JSON.parse(await readFile(path.join(fixtureRoot, 'package.json'), 'utf8'));
  assert(!adapterPackage.dependencies?.sass, 'Vite adapter 不应生产依赖 sass');
  assert(!adapterPackage.dependencies?.less, 'Vite adapter 不应生产依赖 less');
  assert(adapterPackage.dependencies?.['postcss-value-parser'] === '^4.2.0', 'Vite adapter 应显式依赖 value parser');
  assert(fixturePackage.devDependencies?.sass === '1.101.0', 'fixture 应固定 Sass 验收版本');
  assert(fixturePackage.devDependencies?.less === '4.6.7', 'fixture 应固定 Less 验收版本');
}

/** 按文件名稳定顺序读取指定类型的 build assets。 */
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

async function assertExists(file) {
  await access(file);
}

async function assertNotExists(file) {
  try {
    await access(file);
  } catch {
    return;
  }

  throw new Error(`不应存在产物: ${path.relative(repositoryRoot, file)}`);
}

function assertIncludes(value, expected, message) {
  assert(value.includes(expected), message);
}

function assertDoesNotInclude(value, expected, message) {
  assert(!value.includes(expected), message);
}

function assertMatches(value, pattern, message) {
  assert(pattern.test(value), message);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

await main();
