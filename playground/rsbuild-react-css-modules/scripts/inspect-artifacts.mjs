import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

const playgroundRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const semanticRoot = path.join(playgroundRoot, 'dist/semantic');
const nativeRoot = path.join(playgroundRoot, 'dist/native');
const semanticAtomicPath = path.join(semanticRoot, 'static/css/semantic-atomic.css');
const semanticManifestPath = path.join(semanticRoot, 'semantic-atomic-manifest.json');
const semanticReportPath = path.join(semanticRoot, 'semantic-atomic-report.json');

/** 检查双入口 semantic/native 构建产物，并输出需要人工继续观察的契约结果。 */
async function main() {
  verifyExactSelectorRulePositionGuard();
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
  const atomicRules = collectSelectorRules(atomicCss);
  verifyAtomicSelectors(manifest, atomicRules);

  const [nativeInspectorCss, semanticInspectorJs, nativeInspectorJs] = await Promise.all([
    readEntryAsset(nativeRoot, 'static/css', 'inspector.', '.css'),
    readEntryAsset(semanticRoot, 'static/js', 'inspector.', '.js'),
    readEntryAsset(nativeRoot, 'static/js', 'inspector.', '.js')
  ]);
  const sourceOrder = inspectSourceOrder(manifest, atomicRules, nativeInspectorCss);
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
  assert(sourceOrder.parity, 'semantic/native source-order probe 应保持一致');
  assert(icss.conservativePreservation, '同值 ICSS class/value 应全部保持 native token 且不追加 atomic class');
}

/** 比较 native scoped rules 与 semantic atomic rules 对两个 probe class 的最终覆盖顺序。 */
function inspectSourceOrder(manifest, atomicRules, nativeCss) {
  const aEntry = findClassEntry(manifest, '/ASourceOrder.module.css');
  const zEntry = findClassEntry(manifest, '/ZSourceOrder.module.css');
  const aColor = findAtomicDeclaration(manifest, aEntry, 'color');
  const zColor = findAtomicDeclaration(manifest, zEntry, 'color');
  const nativeAIndex = nativeCss.indexOf(`.${aEntry.resolvedClassName}`);
  const nativeZIndex = nativeCss.indexOf(`.${zEntry.resolvedClassName}`);
  const semanticAIndex = findExactSelectorRulePosition(atomicRules, aColor.selector.css);
  const semanticZIndex = findExactSelectorRulePosition(atomicRules, zColor.selector.css);

  assert(Math.min(nativeAIndex, nativeZIndex, semanticAIndex, semanticZIndex) >= 0, '无法定位 source-order probe rules');
  const nativeWinner = nativeAIndex < nativeZIndex ? 'ZSourceOrder' : 'ASourceOrder';
  const semanticWinner = semanticAIndex < semanticZIndex ? 'ZSourceOrder' : 'ASourceOrder';
  return {
    nativeWinner,
    semanticWinner,
    parity: nativeWinner === semanticWinner
  };
}

/** 检查 class token 与同值 ICSS export 是否都走保守 preservation。 */
function inspectIcssCollision(semanticJs, nativeJs) {
  const scopedClass = 'pilot_IcssProbe-module__collision';
  const augmentedPattern = new RegExp(`${escapeRegExp(scopedClass)} _`, 'g');
  const scopedPattern = new RegExp(escapeRegExp(scopedClass), 'g');
  const semanticAugmentedOccurrences = [...semanticJs.matchAll(augmentedPattern)].length;
  const semanticScopedOccurrences = [...semanticJs.matchAll(scopedPattern)].length;
  const nativeScopedOccurrences = [...nativeJs.matchAll(scopedPattern)].length;

  return {
    nativeScopedOccurrences,
    semanticScopedOccurrences,
    semanticAugmentedOccurrences,
    nonClassExportPreserved: semanticAugmentedOccurrences === 0,
    conservativePreservation:
      nativeScopedOccurrences >= 2 &&
      semanticScopedOccurrences === nativeScopedOccurrences &&
      semanticAugmentedOccurrences === 0
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

/** 校验 atomic entry 的当前 descriptor 必填，且 stylesheet 直接包含 descriptor CSS。 */
function verifyAtomicSelectors(manifest, rules) {
  const entries = Object.entries(manifest.atomic ?? {});
  assert(entries.length > 0, 'manifest 应包含 atomic entries');

  for (const [className, atomic] of entries) {
    assert(atomic?.className === className, `manifest atomic 索引应等于 entry.className: ${className}`);
    assert(
      typeof atomic.selector?.identity === 'string' && atomic.selector.identity.length > 0,
      `atomic selector.identity 必填: ${className}`
    );
    assert(
      typeof atomic.selector?.css === 'string' && atomic.selector.css.length > 0,
      `atomic selector.css 必填: ${className}`
    );
    assert(
      findExactSelectorRulePosition(rules, atomic.selector.css) >= 0,
      `atomic stylesheet 缺少完整 selector.css rule: ${className}`
    );
  }
}

/**
 * 用 PostCSS 提取完整 rule prelude，并保留每条 rule 的 source offset。
 *
 * @param css - 待检查的完整 stylesheet。
 * @returns 按原始出现顺序记录的 selector AST 投影。
 */
function collectSelectorRules(css) {
  const rules = [];
  postcss.parse(css).walkRules((rule) => {
    rules.push({
      normalizedSelector: normalizeEqualityAttributeQuotes(rule.selector),
      position: rule.source?.start?.offset ?? 0
    });
  });
  return rules;
}

/** 定位 descriptor selector 作为完整 rule prelude 的位置。 */
function findExactSelectorRulePosition(rules, selector) {
  const normalizedSelector = normalizeEqualityAttributeQuotes(selector);
  return rules.find((rule) => rule.normalizedSelector === normalizedSelector)?.position ?? -1;
}

/**
 * 只将无 escape、无 namespace/flag 的 equality attribute 值规范为无引号 ident。
 *
 * @remarks
 * selector 其余 AST 节点和 raw spacing 保持不变；这仅容忍 native minifier
 * 对 `[data-density="compact"]` / `[data-density=compact]` 的等价序列化。
 */
function normalizeEqualityAttributeQuotes(selector) {
  const root = selectorParser().astSync(selector);
  root.walkAttributes((attribute) => {
    const hasFlag = attribute.insensitive === true || Boolean(attribute.raws.insensitiveFlag);
    const hasEscape = attribute.raws.attribute?.includes('\\') || attribute.raws.value?.includes('\\');
    const canBeUnquoted = attribute.value !== undefined && attribute.smartQuoteMark({}) === null;

    if (
      attribute.operator === '=' &&
      attribute.namespace === undefined &&
      !hasFlag &&
      !hasEscape &&
      canBeUnquoted
    ) {
      attribute.setValue(attribute.value, { quoteMark: null });
    }
  });
  return root.toString();
}

/** 以 quote 等价、更长 selector mutation、顶层和条件嵌套规则自检 exact rule boundary。 */
function verifyExactSelectorRulePositionGuard() {
  const find = (css, selector) => findExactSelectorRulePosition(collectSelectorRules(css), selector);

  assert(find('.foo_suffix {}', '.foo') === -1, 'exact selector 不得命中更长 class');
  assert(find('.foo {}', '.foo') === 0, 'exact selector 应命中顶层 rule');
  assert(
    find('@media (min-width: 1px) {\n  .foo {}\n}', '.foo') > 0,
    'exact selector 应命中条件规则中的完整 prelude'
  );
  assert(
    find('.foo[data-density=compact]{}', '.foo[data-density="compact"]') === 0,
    'exact selector 应接受 equality attribute 的 quoted/unquoted 等价序列化'
  );
  assert(
    find('.foo[data-density="compact"]{}', '.foo[data-density=compact]') === 0,
    'exact selector 应对称接受 unquoted/quoted equality attribute'
  );
  assert(
    find('.foo_suffix[data-density=compact]{}', '.foo[data-density="compact"]') === -1,
    'quote 等价不得放宽 class token 边界'
  );
  assert(
    find('.foo[data-density=expanded]{}', '.foo[data-density="compact"]') === -1,
    'quote 等价不得接受不同 attribute value'
  );
  assert(
    find('.foo[data-density~=compact]{}', '.foo[data-density="compact"]') === -1,
    'quote 等价不得接受不同 attribute operator'
  );
  assert(
    find('.foo[data-mode=compact]{}', '.foo[data-density="compact"]') === -1,
    'quote 等价不得接受其他 attribute name'
  );
  assert(
    find('.foo[data-density=compact-mode]{}', '.foo[data-density="compact mode"]') === -1,
    '非法 unquoted attribute value 不得通过去引号归一化'
  );
  assert(
    find('.foo[data-density=compact]{}', '.foo[data-density="com\\70 act"]') === -1,
    'escape attribute value 不得通过 quote 归一化'
  );
  assert(
    find('.foo[data-density=compact i]{}', '.foo[data-density="compact"]') === -1,
    '带 flag 的 attribute selector 不得通过 quote 归一化'
  );
  assert(
    find('.foo[data-density=compact s]{}', '.foo[data-density="compact"]') === -1,
    '带显式 sensitive flag 的 attribute selector 不得通过 quote 归一化'
  );
  assert(
    find('.foo[ns|data-density=compact]{}', '.foo[data-density="compact"]') === -1,
    '带 namespace 的 attribute selector 不得通过 quote 归一化'
  );
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
