/** Webpack 静态 RuleSet 递归探测与内部 bridge 安装。 */
import path from 'node:path';
import type { RuleSetRule, RuleSetUseItem } from 'webpack';
import { resolveCoreOptions, unsupported } from './options.js';
import type { ResolvedWebpackOptions } from './types.js';

export type PipelineMode = 'dev' | 'build';
export type SelectedLoaderRequest = {
  packageName: 'css-loader' | 'style-loader' | 'mini-css-extract-plugin';
  request: string;
};
export type InstallResult = {
  installed: number;
  modes: Set<PipelineMode>;
  loaderRequests: SelectedLoaderRequest[];
};
type InstalledPipeline = { id: string; extensions: Set<string> };
type MatchState = 'matched' | 'disjoint' | 'unknown';
const moduleSamples = ['A.module.css', 'A.module.scss', 'A.module.less'] as const;

/** 只修改公开静态 rule/use 结构；无法证明的 condition 保守失败。 */
export function installBridgeLoader(
  rules: RuleSetRule[],
  bridgePath: string,
  devRuntimePath: string,
  root: string,
  options: ResolvedWebpackOptions,
  implicitSourceMap = false,
  publicPath?: string
): InstallResult {
  const result: InstallResult = { installed: 0, modes: new Set(), loaderRequests: [] };
  const observedPipelines: InstalledPipeline[] = [];
  walkRules(rules, (rule, id) => {
    if (typeof rule.type === 'string' && rule.type.startsWith('css')) {
      throw unsupported('webpack.builtin-css', id, 'Rspack/Webpack builtin CSS module type 不在当前 css-loader contract 内。');
    }
    if (rule.loader && isLoader(rule.loader as RuleSetUseItem, 'css-loader')) {
      throw unsupported('webpack.rule-loader-shorthand', id, 'css-loader 的 rule.loader/options shorthand 无法表达可验证的 owner 顺序；请改用 rule.use。');
    }
    if (!rule.use) return;
    if (typeof rule.use === 'function') throw unsupported('webpack.rule.use-function', id, '函数型 use 无法静态验证 loader 顺序。');
    const uses = (Array.isArray(rule.use) ? [...rule.use] : [rule.use]) as RuleSetUseItem[];
    if (uses.some((use) => typeof use === 'function')) {
      throw unsupported('webpack.rule.use-function', id, 'use 数组中的函数项无法静态验证 loader 顺序。');
    }
    const cssIndices = uses.flatMap((use, index) => isLoader(use, 'css-loader') ? [index] : []);
    if (cssIndices.length === 0) return;
    if (cssIndices.length !== 1) throw unsupported('webpack.css-loader-count', id, '目标 rule 必须恰好包含一个 css-loader。');

    const extensions = readMatchedModuleExtensions(rule, id, root);
    if (extensions.size > 0) observedPipelines.push({ id, extensions });

    const cssIndex = cssIndices[0]!;
    const cssUse = uses[cssIndex]!;
    // 普通 CSS pipeline 不安装 bridge，但仍必须进入上面的 overlap 分析。
    if (!isCssModulesUse(cssUse) || extensions.size === 0) return;

    validateCssOptions(cssUse, id, implicitSourceMap);
    const styleIndices = uses.flatMap((use, index) => isLoader(use, 'style-loader') ? [index] : []);
    const extractIndices = uses.flatMap((use, index) => isLoader(use, 'mini-css-extract-plugin') ? [index] : []);
    if (styleIndices.length + extractIndices.length !== 1) {
      throw unsupported('webpack.css-owner', id, '必须恰好使用 style-loader 或 MiniCssExtractPlugin loader。');
    }
    const mode: PipelineMode = styleIndices.length === 1 ? 'dev' : 'build';
    const ownerIndex = (mode === 'dev' ? styleIndices : extractIndices)[0]!;
    if (ownerIndex > cssIndex) throw unsupported('webpack.loader-order', id, 'CSS owner 必须位于 css-loader 左侧。');
    if (uses.some((use) => loaderName(use) === bridgePath)) throw unsupported('webpack.duplicate-bridge', id, '内部 bridge 已安装。');

    const ownerPackage = mode === 'dev' ? 'style-loader' : 'mini-css-extract-plugin';
    result.loaderRequests.push(
      { packageName: 'css-loader', request: loaderName(cssUse)! },
      { packageName: ownerPackage, request: loaderName(uses[ownerIndex]!)! }
    );
    uses.splice(cssIndex, 0, {
      loader: bridgePath,
      options: {
        root,
        include: options.include,
        exclude: options.exclude,
        core: resolveCoreOptions(options.core, mode === 'dev'),
        isDev: mode === 'dev',
        warn: options.diagnostics.warn,
        devRuntimePath,
        publicPath
      }
    });
    rule.use = uses;
    result.installed += 1;
    result.modes.add(mode);
  });
  validatePipelineOverlap(observedPipelines);
  if (result.installed === 0) throw unsupported('webpack.css-loader-pipeline', 'module.rules', '未找到可验证的标准 css-loader rule。');
  if (result.modes.size !== 1) throw unsupported('webpack.mixed-css-owner', 'module.rules', '单个 compiler 不能混用 style-loader 与 extraction owner。');
  return result;
}

function walkRules(rules: RuleSetRule[], visit: (rule: RuleSetRule, id: string) => void, prefix = 'rules'): void {
  rules.forEach((rule, index) => {
    if (!rule || typeof rule !== 'object') throw unsupported('webpack.dynamic-rule', `${prefix}[${index}]`, '字符串/false rule 不在静态探测范围。');
    const id = `${prefix}[${index}]`;
    visit(rule, id);
    if (Array.isArray(rule.oneOf)) walkRules(rule.oneOf as RuleSetRule[], visit, `${id}.oneOf`);
    if (Array.isArray(rule.rules)) walkRules(rule.rules as RuleSetRule[], visit, `${id}.rules`);
  });
}
function loaderName(use: RuleSetUseItem): string | undefined {
  return typeof use === 'string' ? use : use && typeof use === 'object' && 'loader' in use ? String(use.loader) : undefined;
}
function isLoader(use: RuleSetUseItem, packageName: string): boolean {
  const name = loaderName(use)?.replace(/\\/g, '/').split('?')[0];
  return !!name && (name === packageName || name.includes(`/node_modules/${packageName}/`) || name.includes(`/.pnpm/${packageName}@`) || name.includes(`/${packageName}/dist/`));
}
function readCssOptions(use: RuleSetUseItem): Record<string, any> {
  const value = typeof use === 'object' && use && 'options' in use ? use.options : undefined;
  return (value && typeof value === 'object' ? value : {}) as Record<string, any>;
}
/** 仅 `modules: false` 明确旁路；缺省配置稍后由保护逻辑拒绝。 */
function isCssModulesUse(use: RuleSetUseItem): boolean {
  return readCssOptions(use).modules !== false;
}

/** 校验目标 css-loader 的 array/default-locals 与 source-map 契约。 */
function validateCssOptions(use: RuleSetUseItem, id: string, implicitSourceMap: boolean): void {
  const options = readCssOptions(use);
  if (options.exportType !== undefined && options.exportType !== 'array') throw unsupported('css-loader.exportType', id, `仅支持 array，实际为 ${String(options.exportType)}。`);
  if (options.sourceMap === true || (options.sourceMap === undefined && implicitSourceMap)) {
    throw unsupported('webpack.css-source-map', id, '当前 adapter 不承诺转换后完整 CSS source map；请对目标 css-loader 设置 sourceMap=false 或关闭 source-map devtool。');
  }
  if (options.modules === undefined) {
    throw unsupported('css-loader.modules-auto', id, 'css-loader 7 缺省 modules 会自动处理 .module.*；请显式配置 modules.namedExport=false。');
  }
  if (!options.modules || typeof options.modules !== 'object' || options.modules.namedExport !== false) throw unsupported('css-loader.modules.namedExport', id, 'css-loader 7 必须显式配置 modules.namedExport=false。');
  const auto = options.modules.auto;
  if (!(auto instanceof RegExp) || !matchesExpectedModulesAuto(auto)) {
    throw unsupported('css-loader.modules-auto', id, 'modules.auto 必须与 .module.css/.module.scss/.module.less contract 完全一致。');
  }
}
function matchesExpectedModulesAuto(auto: RegExp): boolean {
  return moduleSamples.every((sample) => testRegExp(auto, sample)) &&
    ['A.css', 'A.module.styl', 'A.component.css'].every((sample) => !testRegExp(auto, sample));
}

/** 按 compiler.context 与静态字符串目录建立 witness；没有证据时不得静默当作不匹配。 */
function readMatchedModuleExtensions(rule: RuleSetRule, id: string, root: string): Set<string> {
  for (const condition of [rule.test, rule.resource, rule.include, rule.exclude]) validateConditionTree(condition, id);
  const candidates = createCandidateResources(rule, root);
  const matched = new Set<string>();
  for (const sample of moduleSamples) {
    const extension = pathExtension(sample);
    const state = classifyRuleForExtension(rule, candidates.map((directory) => path.join(directory, sample)), candidates);
    if (state === 'unknown') {
      throw unsupported('webpack.rule-condition-evidence', id, `无法静态证明 .module.${extension} condition 是否命中。`);
    }
    if (state === 'matched') matched.add(extension);
  }
  return matched;
}

function classifyRuleForExtension(
  rule: RuleSetRule,
  resources: string[],
  candidateDirectories: string[]
): MatchState {
  if (resources.some((resource) => ruleMatchesResource(rule, resource))) return 'matched';
  const allExtensionResources = moduleSamples.flatMap((name) => candidateDirectories.map((directory) => path.join(directory, name)));
  for (const condition of [rule.test, rule.resource, rule.include]) {
    if (condition === undefined || resources.some((resource) => matchesCondition(condition, resource, false))) continue;
    // 条件能命中其他受支持后缀时，当前后缀可独立证明 disjoint；完全没有 witness 则保持 unknown。
    return allExtensionResources.some((resource) => matchesCondition(condition, resource, false))
      ? 'disjoint'
      : 'unknown';
  }
  // 多个正向条件各自有 witness 但没有共同 witness 时，有限样本不能证明它们不在其他路径相交。
  // 只有 exclude 覆盖全部代表路径，或静态字符串 include 被 exclude 前缀完整覆盖，才可判为 disjoint。
  if (rule.exclude !== undefined && resources.every((resource) => matchesCondition(rule.exclude, resource, false))) {
    return 'disjoint';
  }
  if (isStringConditionCovered(rule.include, rule.exclude)) return 'disjoint';
  return 'unknown';
}

function createCandidateResources(rule: RuleSetRule, root: string): string[] {
  const directories = new Set<string>([
    path.resolve(root),
    path.resolve(root, 'src'),
    path.resolve(root, 'node_modules', '__semantic_atomic_css_probe__'),
    path.resolve(root, '..', '__semantic_atomic_css_external__')
  ]);
  for (const condition of [rule.test, rule.resource, rule.include, rule.exclude]) {
    collectStringConditionDirectories(condition, directories);
  }
  return [...directories];
}
function collectStringConditionDirectories(condition: unknown, target: Set<string>): void {
  if (typeof condition === 'string' && path.isAbsolute(condition)) {
    target.add(condition);
    return;
  }
  if (Array.isArray(condition)) {
    for (const entry of condition) collectStringConditionDirectories(entry, target);
  }
}
/** 先完整验证 condition tree，避免数组 OR 短路隐藏函数或复合动态节点。 */
function validateConditionTree(condition: unknown, id: string): void {
  if (condition === undefined || typeof condition === 'string' || condition instanceof RegExp) return;
  if (Array.isArray(condition)) {
    for (const entry of condition) validateConditionTree(entry, id);
    return;
  }
  throw unsupported('webpack.rule-condition', id, '函数或复合 RuleSet condition 无法静态证明 pipeline 互斥。');
}
/** 证明绝对字符串 include 的全部资源必然也被字符串 exclude 覆盖。 */
function isStringConditionCovered(include: unknown, exclude: unknown): boolean {
  const includes = collectConditionStrings(include);
  const excludes = collectConditionStrings(exclude);
  return includes.length > 0 && excludes.length > 0 &&
    includes.every((included) => excludes.some((excluded) => included.startsWith(excluded)));
}
function collectConditionStrings(condition: unknown): string[] {
  if (typeof condition === 'string' && path.isAbsolute(condition)) return [condition];
  if (Array.isArray(condition)) return condition.flatMap(collectConditionStrings);
  return [];
}
function ruleMatchesResource(rule: RuleSetRule, resource: string): boolean {
  return matchesCondition(rule.test, resource) &&
    matchesCondition(rule.resource, resource) &&
    matchesCondition(rule.include, resource) &&
    !matchesCondition(rule.exclude, resource, false);
}
/** 只解释公开、可静态执行的字符串/RegExp/数组 condition。 */
function matchesCondition(condition: unknown, value: string, empty = true): boolean {
  if (condition === undefined) return empty;
  if (typeof condition === 'string') return value.startsWith(condition);
  if (condition instanceof RegExp) return testRegExp(condition, value);
  if (Array.isArray(condition)) return condition.some((entry) => matchesCondition(entry, value, false));
  throw unsupported('webpack.rule-condition', 'module.rules', '函数或复合 RuleSet condition 无法静态证明 pipeline 互斥。');
}
function testRegExp(pattern: RegExp, value: string): boolean { pattern.lastIndex = 0; return pattern.test(value); }
function pathExtension(sample: string): string { return sample.slice(sample.lastIndexOf('.') + 1); }

/** oneOf 分支天然互斥；其他 pipeline 若能处理同一后缀则必须 fail fast。 */
function validatePipelineOverlap(pipelines: InstalledPipeline[]): void {
  for (let leftIndex = 0; leftIndex < pipelines.length; leftIndex++) for (let rightIndex = leftIndex + 1; rightIndex < pipelines.length; rightIndex++) {
    const left = pipelines[leftIndex]!;
    const right = pipelines[rightIndex]!;
    if (areExclusiveOneOfBranches(left.id, right.id)) continue;
    const overlap = [...left.extensions].filter((extension) => right.extensions.has(extension));
    if (overlap.length) throw unsupported('webpack.overlapping-css-pipelines', `${left.id},${right.id}`, `多个 rule 可同时处理 .module.${overlap.join('/')}。`);
  }
}
function areExclusiveOneOfBranches(left: string, right: string): boolean {
  const branches = (id: string) => [...id.matchAll(/(.*?\.oneOf)\[(\d+)\]/g)].map((match) => [match[1], match[2]] as const);
  return branches(left).some(([prefix, index]) => branches(right).some(([otherPrefix, otherIndex]) => prefix === otherPrefix && index !== otherIndex));
}
