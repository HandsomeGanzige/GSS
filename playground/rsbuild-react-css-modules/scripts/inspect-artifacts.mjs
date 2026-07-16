import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const playgroundRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const semanticRoot = path.join(playgroundRoot, 'dist/semantic');
const nativeRoot = path.join(playgroundRoot, 'dist/native');
const semanticAtomicPath = path.join(semanticRoot, 'static/css/semantic-atomic.css');
const semanticManifestPath = path.join(semanticRoot, 'semantic-atomic-manifest.json');
const semanticReportPath = path.join(semanticRoot, 'semantic-atomic-report.json');

/** 检查双入口 semantic/native 构建产物，并输出需要人工继续观察的契约结果。 */
async function main() {
  const [semanticFiles, nativeFiles] = await Promise.all([listFiles(semanticRoot), listFiles(nativeRoot)]);

  assertIncludes(semanticFiles, 'index.html', 'semantic build 应包含主入口 HTML');
  assertIncludes(semanticFiles, 'inspector.html', 'semantic build 应包含 inspector HTML');
  assertIncludes(nativeFiles, 'index.html', 'native build 应包含主入口 HTML');
  assertIncludes(nativeFiles, 'inspector.html', 'native build 应包含 inspector HTML');
  assertIncludes(semanticFiles, 'static/css/semantic-atomic.css', 'semantic build 应输出 atomic CSS');
  assertIncludes(semanticFiles, 'semantic-atomic-manifest.json', 'semantic build 应输出 manifest');
  assertIncludes(semanticFiles, 'semantic-atomic-report.json', 'semantic build 应输出 report');
  assert(!nativeFiles.some((file) => file.includes('semantic-atomic')), 'native build 不应输出 GSS assets');
  assert(semanticFiles.some((file) => file.endsWith('.svg')), 'semantic build 应发布本地 SVG');
  assert(nativeFiles.some((file) => file.endsWith('.svg')), 'native build 应发布本地 SVG');
  assert(semanticFiles.some((file) => file.includes('/async/') && file.endsWith('.js')), 'semantic build 应包含 lazy JS');
  assert(nativeFiles.some((file) => file.includes('/async/') && file.endsWith('.js')), 'native build 应包含 lazy JS');

  const [indexHtml, inspectorHtml, atomicCss, manifest, report] = await Promise.all([
    readFile(path.join(semanticRoot, 'index.html'), 'utf8'),
    readFile(path.join(semanticRoot, 'inspector.html'), 'utf8'),
    readFile(semanticAtomicPath, 'utf8'),
    readJson(semanticManifestPath),
    readJson(semanticReportPath)
  ]);

  verifyAtomicLinkOrder(indexHtml, 'index.html');
  verifyAtomicLinkOrder(inspectorHtml, 'inspector.html');

  const sourceIds = Object.keys(manifest.classes).map((key) => key.split('::')[0]);
  for (const extension of ['.module.css', '.module.scss', '.module.less']) {
    assert(sourceIds.some((id) => id.endsWith(extension)), `manifest 应包含 ${extension} source`);
  }
  assert(sourceIds.some((id) => id.endsWith('/ASourceOrder.module.css')), 'manifest 应包含 source-order A probe');
  assert(sourceIds.some((id) => id.endsWith('/ZSourceOrder.module.css')), 'manifest 应包含 source-order Z probe');
  assert(report.analysis?.size?.beforeRawCssBytes > 0, 'report 应包含 analyzer size');

  const [nativeInspectorCss, semanticInspectorJs, nativeInspectorJs] = await Promise.all([
    readEntryAsset(nativeRoot, 'static/css', 'inspector.', '.css'),
    readEntryAsset(semanticRoot, 'static/js', 'inspector.', '.js'),
    readEntryAsset(nativeRoot, 'static/js', 'inspector.', '.js')
  ]);
  const sourceOrder = inspectSourceOrder(manifest, atomicCss, nativeInspectorCss);
  const icss = inspectIcssCollision(semanticInspectorJs, nativeInspectorJs);

  const result = {
    entries: ['index.html', 'inspector.html'],
    semantic: {
      files: semanticFiles.length,
      sourceFiles: report.summary.files,
      sourceClasses: report.summary.sourceClasses,
      atomicDeclarations: report.summary.atomicDeclarations,
      reusedAtomicDeclarations: report.summary.reusedAtomicDeclarations,
      unsafeRules: report.summary.unsafeRules,
      health: report.analysis?.health?.status,
      estimatedTotalDiffBytes: report.analysis?.size?.estimatedTotalDiffBytes
    },
    native: {
      files: nativeFiles.length
    },
    observations: {
      sourceOrder,
      icss
    }
  };

  console.log(JSON.stringify(result, null, 2));
  if (!sourceOrder.parity) {
    console.warn('警告：semantic/native source-order probe 不一致，需要检查全局 atomic CSS 排序。');
  }
  if (!icss.nonClassExportPreserved) {
    console.warn('警告：ICSS 非 class export 被追加 atomic class，当前 adapter 仍存在 token 分类歧义。');
  }
}

/** 比较 native scoped rules 与 semantic atomic rules 对两个 probe class 的最终覆盖顺序。 */
function inspectSourceOrder(manifest, atomicCss, nativeCss) {
  const aEntry = findClassEntry(manifest, '/ASourceOrder.module.css');
  const zEntry = findClassEntry(manifest, '/ZSourceOrder.module.css');
  const aColor = findAtomicDeclaration(manifest, aEntry, 'color');
  const zColor = findAtomicDeclaration(manifest, zEntry, 'color');
  const nativeAIndex = nativeCss.indexOf(`.${aEntry.resolvedClassName}`);
  const nativeZIndex = nativeCss.indexOf(`.${zEntry.resolvedClassName}`);
  const semanticAIndex = atomicCss.indexOf(`.${aColor.className}`);
  const semanticZIndex = atomicCss.indexOf(`.${zColor.className}`);

  assert(Math.min(nativeAIndex, nativeZIndex, semanticAIndex, semanticZIndex) >= 0, '无法定位 source-order probe rules');
  const nativeWinner = nativeAIndex < nativeZIndex ? 'ZSourceOrder' : 'ASourceOrder';
  const semanticWinner = semanticAIndex < semanticZIndex ? 'ZSourceOrder' : 'ASourceOrder';
  return {
    nativeWinner,
    semanticWinner,
    parity: nativeWinner === semanticWinner
  };
}

/** 检查 class token 与同值 ICSS export 是否被 adapter 一并增强。 */
function inspectIcssCollision(semanticJs, nativeJs) {
  const scopedClass = 'pilot_IcssProbe-module__collision';
  const augmentedPattern = new RegExp(`${escapeRegExp(scopedClass)} _`, 'g');
  const semanticAugmentedOccurrences = [...semanticJs.matchAll(augmentedPattern)].length;
  const nativeScopedOccurrences = [...nativeJs.matchAll(new RegExp(escapeRegExp(scopedClass), 'g'))].length;

  return {
    nativeScopedOccurrences,
    semanticAugmentedOccurrences,
    nonClassExportPreserved: semanticAugmentedOccurrences === 1
  };
}

/** 根据 source 文件后缀读取唯一 class manifest entry。 */
function findClassEntry(manifest, sourceSuffix) {
  const match = Object.entries(manifest.classes).find(([key]) => key.includes(sourceSuffix));
  if (!match) throw new Error(`manifest 缺少 class entry: ${sourceSuffix}`);
  return match[1];
}

/** 从 class mapping 找到指定 property 的 atomic declaration。 */
function findAtomicDeclaration(manifest, classEntry, property) {
  for (const className of classEntry.atomicClassNames) {
    const declaration = manifest.atomic[className];
    if (declaration?.declaration?.prop === property) return declaration;
  }
  throw new Error(`class ${classEntry.resolvedClassName} 缺少 ${property} atomic declaration`);
}

/** 校验 atomic stylesheet 在当前 entry 原生 stylesheet 之前。 */
function verifyAtomicLinkOrder(html, entryName) {
  const atomicIndex = html.indexOf('/static/css/semantic-atomic.css');
  const nativeIndex = html.indexOf('/static/css/', atomicIndex + 1);
  assert(atomicIndex >= 0, `${entryName} 应引用 semantic atomic CSS`);
  assert(nativeIndex > atomicIndex, `${entryName} 的 atomic link 应位于原生 CSS link 之前`);
}

/** 读取 entry 对应的唯一产物。 */
async function readEntryAsset(root, directory, prefix, suffix) {
  const target = path.join(root, directory);
  const names = (await readdir(target)).filter((name) => name.startsWith(prefix) && name.endsWith(suffix));
  assert(names.length === 1, `${directory} 应有一个 ${prefix}*${suffix}，实际 ${names.length}`);
  return await readFile(path.join(target, names[0]), 'utf8');
}

/** 递归列出 dist 相对文件名。 */
async function listFiles(root, prefix = '') {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, relative));
    else files.push(relative.replaceAll(path.sep, '/'));
  }
  return files;
}

/** 读取 JSON 文件。 */
async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}

function assertIncludes(values, expected, message) {
  assert(values.includes(expected), `${message}：缺少 ${expected}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await main();
