import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { semanticAtomicCss } from '../packages/vite/dist/index.js';

const root = process.cwd();
const phase3DistDir = path.join(root, 'playground/vite-css-modules-acceptance/dist');
const phase3ManifestFile = path.join(phase3DistDir, 'semantic-atomic-manifest.json');
const phase3ReportFile = path.join(phase3DistDir, 'semantic-atomic-report.json');

/** 运行 Phase 4 Route A 静态验收。 */
async function main() {
  await assertNotExists(phase3ManifestFile, 'Phase 4 仍应继承默认不输出 manifest 的行为');
  await assertNotExists(phase3ReportFile, 'Phase 4 仍应继承默认不输出 report 的行为');

  const fixtureRoot = await createRouteAFixture();

  try {
    await build({
      root: fixtureRoot,
      configFile: false,
      logLevel: 'silent',
      css: {
        modules: false
      },
      plugins: [
        semanticAtomicCss({
          modules: {
            localsConvention: 'camelCaseOnly',
            generateScopedName: 'p4_[name]__[local]'
          },
          core: {
            className: {
              strategy: 'readable'
            }
          },
          report: {
            enabled: true
          }
        })
      ],
      build: {
        outDir: path.join(fixtureRoot, 'dist'),
        emptyOutDir: true
      }
    });

    await verifyRouteAFixture(fixtureRoot);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }

  await verifyViteNamedExportsProtection();

  console.log('Phase 4 Route A 验收通过');
}

/** 创建覆盖 Route A CSS Modules 继承和 analyzer report 的临时 fixture。 */
async function createRouteAFixture() {
  const fixtureRoot = await mkdtemp(path.join(root, '.tmp-phase4-'));
  const srcDir = path.join(fixtureRoot, 'src');
  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(fixtureRoot, 'index.html'), '<script type="module" src="/src/main.js"></script>');
  await writeFile(
    path.join(srcDir, 'main.js'),
    [
      "import './global.css';",
      "import styles from './Button.module.css';",
      "document.body.setAttribute('data-primary', styles.primaryButton);",
      "document.body.setAttribute('data-exported', styles.exported);",
      "document.body.setAttribute('data-gap', styles.gapValue);"
    ].join('\n')
  );
  await writeFile(path.join(srcDir, 'Base.module.css'), '.base {\n  color: red;\n}');
  await writeFile(path.join(srcDir, 'global.css'), '.global-banner {\n  color: black;\n}');
  await writeFile(path.join(srcDir, 'Tokens.module.css'), ':export {\n  brand: #0f0;\n}');
  await writeFile(
    path.join(srcDir, 'Button.module.css'),
    [
      ':import("./Tokens.module.css") {',
      '  importedBrand: brand;',
      '}',
      '@value gap: 8px;',
      ':export { exported: importedBrand; gapValue: gap; }',
      '.primary-button {',
      '  composes: base from "./Base.module.css";',
      '  background: importedBrand;',
      '  padding: gap;',
      '}',
      ':global(.ant-btn) {',
      '  color: blue;',
      '}'
    ].join('\n')
  );
  return fixtureRoot;
}

/** 校验临时 fixture 的 build 产物符合 Phase 4 Route A 预期。 */
async function verifyRouteAFixture(fixtureRoot) {
  const distDir = path.join(fixtureRoot, 'dist');
  const css = await readFile(path.join(distDir, 'assets/semantic-atomic.css'), 'utf8');
  const js = await readBuiltAssets(path.join(distDir, 'assets'), '.js');
  const viteCss = await readBuiltAssetsExcept(path.join(distDir, 'assets'), '.css', new Set(['semantic-atomic.css']));
  const report = JSON.parse(await readFile(path.join(distDir, 'semantic-atomic-report.json'), 'utf8'));

  assertIncludes(js, 'p4_Button-module__primary-button', 'tokens 应继承 Vite scoped class');
  assertIncludes(js, 'p4_Base-module__base', 'composes 应继承 Vite 原生跨文件 class token');
  assertIncludes(js, '_background_0f0', 'class token 应追加 background atomic class');
  assertIncludes(js, '_padding_8px', 'class token 应追加 @value 派生的 padding atomic class');
  assertIncludes(js, '_color_red', 'composes class token 应追加 base atomic class');
  assertIncludes(js, '#0f0', ':export 非 class 值应保持原值');
  assertDoesNotInclude(js, '#0f0 _', ':export 非 class 值不应追加 atomic class');
  assertIncludes(js, 'gapValue:"8px"', '@value 导出的非 class 值应保持原值');
  assertIncludes(css, '.ant-btn', 'global selector 应作为 fallback CSS 保留');
  assertIncludes(css, 'color: blue;', 'global selector fallback declaration 应保留');
  assertIncludes(viteCss, '.global-banner', '普通 CSS 应继续由 Vite 原生 CSS asset 输出');
  assertDoesNotInclude(viteCss, 'p4_Button-module__primary-button', '原 CSS Modules scoped CSS 不应重复进入 Vite 原生 CSS asset');
  assertIncludes(JSON.stringify(report.analysis), 'unsafeReasonDistribution', 'report 应包含 analyzer analysis');
  assertIncludes(JSON.stringify(report.analysis), 'non-exported-class', 'analysis 应聚合 non-exported-class 风险');
}

/** 校验未显式配置 GSS modules 时，继承 Vite namedExports 会明确失败。 */
async function verifyViteNamedExportsProtection() {
  const fixtureRoot = await createRouteAFixture();

  try {
    await assertRejectsBuild(
      () =>
        build({
          root: fixtureRoot,
          configFile: false,
          logLevel: 'silent',
          css: {
            modules: {
              namedExports: true
            }
          },
          plugins: [semanticAtomicCss()],
          build: {
            outDir: path.join(fixtureRoot, 'dist-named-exports'),
            emptyOutDir: true
          }
        }),
      'css.modules.namedExports',
      '继承 Vite css.modules.namedExports: true 时应显式失败'
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

/** 读取 build 输出目录中指定后缀的 asset 内容。 */
async function readBuiltAssets(dir, extension) {
  const entries = await readdir(dir, { withFileTypes: true });
  const chunks = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(extension)) {
      chunks.push(await readFile(path.join(dir, entry.name), 'utf8'));
    }
  }

  return chunks.join('\n');
}

/** 读取 build 输出目录中指定后缀且排除给定文件名的 asset 内容。 */
async function readBuiltAssetsExcept(dir, extension, excludedNames) {
  const entries = await readdir(dir, { withFileTypes: true });
  const chunks = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(extension) && !excludedNames.has(entry.name)) {
      chunks.push(await readFile(path.join(dir, entry.name), 'utf8'));
    }
  }

  return chunks.join('\n');
}

/** 断言文件不存在。 */
async function assertNotExists(file, message) {
  try {
    await access(file);
  } catch {
    return;
  }

  throw new Error(`${message}: ${path.relative(root, file)}`);
}

/** 断言文本包含指定片段。 */
function assertIncludes(value, expected, message) {
  if (!value.includes(expected)) {
    throw new Error(message);
  }
}

/** 断言文本不包含指定片段。 */
function assertDoesNotInclude(value, expected, message) {
  if (value.includes(expected)) {
    throw new Error(message);
  }
}

/** 断言异步构建失败且错误信息包含指定片段。 */
async function assertRejectsBuild(run, expected, message) {
  try {
    await run();
  } catch (error) {
    if (String(error?.message ?? error).includes(expected)) {
      return;
    }

    throw error;
  }

  throw new Error(message);
}

await main();
