import path from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import type { CSSModulesOptions, ResolvedConfig } from 'vite';
import type { ScopeStrategy, TransformClassMapping } from '@semantic-atomic-css/core';
import type { LocalsConvention, ResolvedSemanticAtomicCssOptions } from './types.js';

/** CSS Modules default export tokens 的稳定结构。 */
export type CssModuleTokens = Record<string, string>;

/** 创建 Route A 使用的 identity ScopeStrategy，只允许 Vite tokens 可命中的 class 参与转换。 */
export function createCssModulesScopeStrategy(exportedClassNames: Set<string>): ScopeStrategy {
  return {
    resolveClassName(className): string {
      return className;
    },

    shouldExportClassName(className): boolean {
      return exportedClassNames.has(className);
    }
  };
}

/** 从 Vite 原生 CSS Modules tokens 与 scoped CSS 中提取可能会出现在 DOM class string 中的 class name。 */
export function collectExportedClassNames(tokens: CssModuleTokens, scopedCss = ''): Set<string> {
  const classNames = new Set<string>();
  const scopedClassNames = collectClassNamesFromCss(scopedCss);

  for (const value of Object.values(tokens)) {
    for (const segment of splitClassString(value)) {
      if (isPotentialClassName(segment) && (scopedClassNames.size === 0 || scopedClassNames.has(segment))) {
        classNames.add(segment);
      }
    }
  }

  return classNames;
}

/** 从 Vite 已生成的 scoped CSS 中粗略收集 class selector 名称，用于过滤非 class export。 */
function collectClassNamesFromCss(css: string): Set<string> {
  const classNames = new Set<string>();

  if (css.trim().length === 0) {
    return classNames;
  }

  try {
    const root = postcss.parse(css);
    root.walkRules((rule) => {
      collectClassNamesFromSelector(rule.selector, classNames);
    });
  } catch {
    return classNames;
  }

  return classNames;
}

/** 从单个 selector 中收集 class selector 名称。 */
function collectClassNamesFromSelector(selector: string, classNames: Set<string>): void {
  try {
    const root = selectorParser().astSync(selector);
    root.walkClasses((node) => {
      classNames.add(node.value);
    });
  } catch {
    return;
  }
}

/** 在 Vite 原生 tokens 基础上追加 core 生成的 atomic class，非 class export 保持原值。 */
export function augmentCssModuleTokens(
  tokens: CssModuleTokens,
  classes: Record<string, TransformClassMapping>
): CssModuleTokens {
  const nextTokens: CssModuleTokens = {};

  for (const [exportName, value] of Object.entries(tokens)) {
    const segments = splitClassString(value);
    const classNames = new Set(segments);
    let hasClassMapping = false;

    for (const segment of segments) {
      const mapping = classes[segment];

      if (!mapping) {
        continue;
      }

      hasClassMapping = true;

      for (const atomicClassName of mapping.atomicClassNames) {
        classNames.add(atomicClassName);
      }
    }

    nextTokens[exportName] = hasClassMapping ? [...classNames].join(' ') : value;
  }

  return nextTokens;
}

/** 根据 GSS 与 Vite 配置创建传给 preprocessCSS 的 CSS Modules 配置。 */
export function createPreprocessCssModulesOptions(
  viteModules: ResolvedConfig['css']['modules'],
  options: ResolvedSemanticAtomicCssOptions
): CSSModulesOptions | false | undefined {
  if (viteModules === false && !options.modules.configured) {
    return false;
  }

  const modules: CSSModulesOptions =
    !options.modules.configured && typeof viteModules === 'object' && viteModules !== null ? { ...viteModules } : {};

  if (options.modules.hasLocalsConvention) {
    applyLocalsConventionOverride(modules, options.modules.localsConvention);
  }

  if (options.modules.hasGenerateScopedName) {
    modules.generateScopedName = options.modules.generateScopedName;
  }

  return modules;
}

/** 判断给定文件是否是第一版支持的 CSS Modules 输入。 */
export function isCssModuleFile(id: string, root: string, options: ResolvedSemanticAtomicCssOptions): boolean {
  const normalized = normalizePath(id);

  if (!normalized.endsWith('.module.css')) {
    return false;
  }

  return matchesAny(normalized, root, options.include) && !matchesAny(normalized, root, options.exclude);
}

/** 移除 Vite id 上的 query/hash，得到真实文件路径。 */
export function cleanRequestId(id: string): string {
  return id.split('?')[0]?.split('#')[0] ?? id;
}

/** 把路径统一成 POSIX 风格，方便匹配和生成稳定路径。 */
export function normalizePath(id: string): string {
  return id.replace(/\\/g, '/');
}

/** 应用 GSS localsConvention 覆盖；asIs 通过删除 Vite 配置恢复原始 key。 */
function applyLocalsConventionOverride(modules: CSSModulesOptions, localsConvention: LocalsConvention | undefined): void {
  if (!localsConvention || localsConvention === 'asIs') {
    delete modules.localsConvention;
    return;
  }

  modules.localsConvention = localsConvention;
}

/** 按空白拆分 class string，并排除空片段。 */
function splitClassString(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .filter((segment) => segment.length > 0);
}

/** 判断片段是否像 CSS class name，避免把颜色值或数字类 export 当成 class token。 */
function isPotentialClassName(value: string): boolean {
  return /^-?[_a-zA-Z][-_a-zA-Z0-9]*$/.test(value);
}

/** 判断文件是否命中任意 include/exclude 简易 glob。 */
function matchesAny(id: string, root: string, patterns: string[]): boolean {
  const relative = relativeId(id, root);
  return patterns.some((pattern) => matchesPattern(relative, pattern) || matchesPattern(id, pattern));
}

/** 生成相对 root 的稳定 id，用于 include/exclude 匹配。 */
function relativeId(id: string, root: string): string {
  const relative = path.relative(root, id);
  return normalizePath(relative.startsWith('..') ? id : relative);
}

/** 支持第一版需要的 * 和 ** 简易 glob 匹配。 */
function matchesPattern(value: string, pattern: string): boolean {
  const normalizedPattern = normalizePath(pattern);
  const escaped = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__GSS_GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__GSS_GLOBSTAR__/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}
