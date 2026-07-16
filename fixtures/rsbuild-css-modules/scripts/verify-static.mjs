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
      GSS_FIXTURE_ASSET_PREFIX: '/phase-6-cdn/'
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
  assertIncludes(nativeCss, 'url(/static/svg/mark.', '资源应使用 Rspack 最终发布路径');
  assertIncludes(nativeCss, 'url(/phase6-public.svg)', 'publicDir URL 应保留原生绝对路径');
  assertIncludes(await readFile(path.join(outDir, 'phase6-public.svg'), 'utf8'), '<svg', 'publicDir asset 应由 Rsbuild 复制');
  assertDoesNotInclude(nativeCss, 'rspack-semantic-atomic-css:', '产物不得残留 synthetic base URI');
  assertDoesNotInclude(nativeCss, '.fixture_Base-module__hoverButton', 'safe scoped rule 不应在原生 chunk 重复');
  assertIncludes(mainJs, 'fixture_Base-module__shell', 'tokens 应保留 Rsbuild scoped class');
  assertIncludes(mainJs, '_padding_16px', 'tokens 应追加 atomic classes');
  assertIncludes(mainJs, 'fixture_Shared-module__shared', 'composes 应继承原生最终 token');
  assertIncludes(mainJs, 'phase-six', ':export value 应继承原生 token');
  assertIncludes(asyncJs, '_margin-top_12px', 'lazy chunk token 应追加 atomic class');
  assert(html.indexOf('/static/css/semantic-atomic.css') < html.indexOf('/static/css/index.'), 'atomic link 应先于 native fallback link');
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
  assertDoesNotInclude(js, '_padding_16px', 'native tokens 不应包含 GSS atomic class');
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
  assertIncludes(atomicCss, 'border-radius:9px', 'Less import 与 additionalData 应由原生管线编译');
  assertIncludes(nativeCss, '.fixture_Theme-module__hero', 'SCSS 资源 class 应保留');
  assertIncludes(nativeCss, '.fixture_Panel-module__panel .fixture_Panel-module__child', 'Less descendant 应保留');
  assertIncludes(nativeCss, 'url(/static/svg/mark.', 'SCSS 外部资源应由 Rspack 发布');
  assertDoesNotInclude(nativeCss, 'rspack-semantic-atomic-css:', 'SCSS 资源不应残留 synthetic URI');
  assertIncludes(js, 'fixture_Theme-module__safe-scss', 'SCSS token 应继承 custom ident');
  assertIncludes(js, '_padding_17px', 'SCSS token 应追加 atomic class');
  assertIncludes(js, '_border-radius_9px', 'Less token 应追加 atomic class');
  assert(svgAssets.length === 1, 'preprocessor semantic 应发布一个 SVG');
  assert(report.analysis?.size?.beforeRawCssBytes > 0, 'report 应包含 analyzer before-size');
  assert(report.diagnostics.some((item) => item.reason === 'asset-reference'), 'report 应记录 asset-reference preservation');
  assert(report.diagnostics.some((item) => String(item.id).endsWith('.module.scss')), 'report 应保留 SCSS source id');
  assert(report.diagnostics.some((item) => String(item.id).endsWith('.module.less')), 'report 应保留 Less source id');
  const assetClass = Object.values(manifest.classes).find((entry) => entry.sourceClassName.includes('hero'));
  assert(assetClass?.atomicClassNames?.length === 0, '资源 class manifest 不应包含 atomic classes');
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
  assertIncludes(html, '/phase-6-cdn/static/css/semantic-atomic.css', 'atomic link 应继承 assetPrefix');
  assertIncludes(css, 'url(/phase-6-cdn/static/svg/mark.', '资源 URL 应继承 assetPrefix');
}

/** 校验 Rspack 阈值内联与 publicDir 复制均未被 bridge 破坏。 */
async function verifyInlineAndPublicAssets(outDir) {
  const css = await readMatchingFiles(path.join(outDir, 'static/css'), (name) => name.endsWith('.css'));
  const svgAssets = await findRelativeFiles(path.join(outDir, 'static'), (name) => name.endsWith('.svg'));
  assertIncludes(css, 'data:image/svg+xml', '阈值内资源应由 Rspack 内联');
  assertIncludes(css, 'url(/phase6-public.svg)', 'publicDir 绝对 URL 应保持不变');
  assert(svgAssets.length === 0, 'inline build 不应额外发布 imported SVG');
  assertIncludes(await readFile(path.join(outDir, 'phase6-public.svg'), 'utf8'), '<svg', 'publicDir asset 应存在');
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
