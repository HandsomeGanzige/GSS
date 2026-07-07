import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'playground/vite-css-modules-acceptance/dist');
const htmlFile = path.join(distDir, 'index.html');
const cssFile = path.join(distDir, 'assets/semantic-atomic.css');
const manifestFile = path.join(distDir, 'semantic-atomic-manifest.json');
const reportFile = path.join(distDir, 'semantic-atomic-report.json');

/** 运行 Phase 3 精简 fixture 产物验收。 */
async function main() {
  await assertExists(htmlFile, 'acceptance fixture build 应输出 index.html');
  await assertExists(cssFile, 'build 应输出全局聚合 semantic-atomic.css');

  const html = await readFile(htmlFile, 'utf8');
  const css = await readFile(cssFile, 'utf8');
  const js = await readBuiltAssets(path.join(distDir, 'assets'), '.js');

  assertIncludes(html, 'assets/semantic-atomic.css', 'index.html 应注入全局聚合 CSS asset');
  assertIncludes(js, 'data-gss-case', 'acceptance fixture 应保留稳定验收锚点');
  assertIncludes(js, 'Vite CSS Modules semantic/native parity cases', 'acceptance fixture 应构建精简对照页面');
  assertIncludes(js, 'phase-three-dashed', 'acceptance fixture 应覆盖 dashed CSS Modules tokens key');
  assertIncludes(js, 'phaseThreeCamel', 'acceptance fixture 应覆盖 camelCase CSS Modules tokens key');
  assertIncludes(css, 'grid-template-columns', '@supports 中的布局 declaration 应进入全局 CSS asset');
  assertIncludes(css, '@media (max-width: 600px)', 'media query atomic CSS 应进入全局 CSS asset');
  assertIncludes(css, '@supports (display: grid)', 'supports atomic CSS 应进入全局 CSS asset');
  assertIncludes(css, 'background', '基础背景 declaration 应进入全局 CSS asset');
  assertIncludes(css, 'font-weight', '文本 declaration 应进入全局 CSS asset');
  assertIncludes(css, 'border-left-color', '顺序敏感 longhand declaration 应进入全局 CSS asset');
  assertIncludes(css, '!important', 'important declaration 应进入 atomic key 和 CSS 输出');
  assertIncludes(css, '--case-accent', 'custom property declaration 应作为 preserved CSS 保留');
  assertIncludes(css, 'box-shadow', 'unsafe fallback CSS 应保留到全局 CSS asset');
  assertIncludes(css, '._', '全局 CSS asset 应包含 atomic class');
  assertIncludes(css, '[data-tone=', 'attribute selector fallback 应保留到全局 CSS asset');
  assertIncludes(css, 'content: "";', 'pseudo-element fallback 应保留到全局 CSS asset');
  assertMatches(
    css,
    /\.-?[_a-zA-Z][-_a-zA-Z0-9]*\s+\.-?[_a-zA-Z][-_a-zA-Z0-9]*/,
    'descendant selector fallback 应以 scoped class 形式保留'
  );
  await assertNotExists(manifestFile, 'manifest 默认不应输出');
  await assertNotExists(reportFile, 'report 默认不应输出');

  console.log('Phase 3 Vite adapter 验收通过');
}

/** 断言文件存在。 */
async function assertExists(file, message) {
  try {
    await access(file);
  } catch {
    throw new Error(`${message}: ${path.relative(root, file)}`);
  }
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

/** 断言文本中包含指定片段。 */
function assertIncludes(value, expected, message) {
  if (!value.includes(expected)) {
    throw new Error(message);
  }
}

/** 断言文本匹配指定正则。 */
function assertMatches(value, pattern, message) {
  if (!pattern.test(value)) {
    throw new Error(message);
  }
}

await main();
