/**
 * Vite 原生 CSS Modules tokens 捕获、scope evidence 与配置继承模块。
 *
 * @remarks
 * 本模块不实现 scoping 或 CSS Modules 编译，只消费并增强 Vite 原生结果。
 *
 * @module vite/cssModules
 */
import path from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import type { CSSModulesOptions } from 'vite';
import type { ScopeStrategy, TransformClassMapping } from '@semantic-atomic-css/core';
import type { LocalsConvention, ResolvedSemanticAtomicCssOptions } from './types.js';

/** CSS Modules default export tokens 的稳定结构。 */
export type CssModuleTokens = Record<string, string>;

/**
 * 创建 Route A 使用的 identity scope strategy。
 *
 * @param exportedClassNames - 已由 tokens/scoped CSS 证明可能进入 DOM 的 class 集合。
 * @returns resolved class 保持 identity、export 判断基于集合成员关系的 scope strategy。
 */
export function createCssModulesScopeStrategy(exportedClassNames: Set<string>): ScopeStrategy {
  return {
    /**
     * 返回 Vite 已完成 scoping 的 class name。
     *
     * @param className - compiled scoped CSS 中的 class。
     * @returns 原 class name。
     */
    resolveClassName(className): string {
      return className;
    },

    /**
     * 判断 compiled class 是否可能进入 tokens。
     *
     * @param className - compiled scoped CSS 中的 class。
     * @returns class 存在于 Vite export evidence 集合时为 `true`。
     */
    shouldExportClassName(className): boolean {
      return exportedClassNames.has(className);
    }
  };
}

/**
 * 收集可能通过 CSS Modules tokens 进入 DOM 的 class names。
 *
 * @param tokens - Vite 原生 CSS Modules tokens。
 * @param scopedCss - Vite 已完成 scoping 的 CSS。
 * @returns 同时满足 token 片段和 scoped CSS class 证据的集合。
 */
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

/**
 * 从 scoped CSS AST 收集真实 class names。
 *
 * @param css - Vite compiled scoped CSS。
 * @returns 解析成功时的 class 集合；CSS 为空或解析失败时返回空集合。
 */
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

/**
 * 从单个 selector 收集 class nodes。
 *
 * @param selector - rule selector。
 * @param classNames - 写入目标集合。
 */
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

/**
 * 在 Vite 原生 tokens 基础上追加 atomic classes。
 *
 * @param tokens - Vite 原生 tokens，不会被本函数修改。
 * @param classes - core 以 resolved class 为键的 mappings。
 * @returns 新 tokens；未命中 class mapping 的 export 保持原值。
 */
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

/**
 * 创建写入 Vite 原生管线的 CSS Modules 配置。
 *
 * @param viteModules - 用户原始 Vite modules 配置或 `false`。
 * @param options - GSS resolved options。
 * @param captureTokens - 包装到 `getJSON` 的 tokens 捕获 callback。
 * @returns 保留继承语义并安装捕获 callback 的配置，或保持 `false`。
 */
export function createNativeCssModulesOptions(
  viteModules: CSSModulesOptions | false | undefined,
  options: ResolvedSemanticAtomicCssOptions,
  captureTokens: (id: string, tokens: CssModuleTokens) => void
): CSSModulesOptions | false {
  if (viteModules === false && !options.modules.configured) {
    return false;
  }

  const modules: CSSModulesOptions =
    !options.modules.configured && typeof viteModules === 'object' && viteModules !== null ? { ...viteModules } : {};
  const userGetJson = modules.getJSON;

  if (options.modules.hasLocalsConvention) {
    applyLocalsConventionOverride(modules, options.modules.localsConvention);
  }

  if (options.modules.hasGenerateScopedName) {
    modules.generateScopedName = options.modules.generateScopedName;
  }

  modules.getJSON = (cssFileName, tokens, outputFileName): void => {
    userGetJson?.(cssFileName, tokens, outputFileName);
    captureTokens(cleanRequestId(cssFileName), tokens);
  };

  return modules;
}

/**
 * 判断文件是否命中当前支持的 CSS Modules 输入范围。
 *
 * @param id - 已清理或可规范化的文件 id。
 * @param root - Vite project root。
 * @param options - resolved include/exclude 配置。
 * @returns 扩展名受支持、命中 include 且未命中 exclude 时为 `true`。
 */
export function isCssModuleFile(id: string, root: string, options: ResolvedSemanticAtomicCssOptions): boolean {
  const normalized = normalizePath(id);

  if (!/\.module\.(?:css|scss|less)$/.test(normalized)) {
    return false;
  }

  return matchesAny(normalized, root, options.include) && !matchesAny(normalized, root, options.exclude);
}

/**
 * 移除 Vite request id 的 query/hash。
 *
 * @param id - Vite module id。
 * @returns 用于文件身份与匹配的基础 id。
 */
export function cleanRequestId(id: string): string {
  return id.split('?')[0]?.split('#')[0] ?? id;
}

/**
 * 把路径统一成 POSIX 风格。
 *
 * @param id - 任意系统路径或 module id。
 * @returns 反斜杠替换为正斜杠的文本。
 */
export function normalizePath(id: string): string {
  return id.replace(/\\/g, '/');
}

/**
 * 应用 GSS localsConvention 覆盖。
 *
 * @param modules - 要原地更新的 Vite CSS Modules 配置。
 * @param localsConvention - GSS 显式值；`asIs` 通过删除字段恢复原始 key。
 */
function applyLocalsConventionOverride(modules: CSSModulesOptions, localsConvention: LocalsConvention | undefined): void {
  if (!localsConvention || localsConvention === 'asIs') {
    delete modules.localsConvention;
    return;
  }

  modules.localsConvention = localsConvention;
}

/**
 * 拆分 CSS Modules class string。
 *
 * @param value - tokens export value。
 * @returns 按空白拆分并移除空片段的 class 候选。
 */
function splitClassString(value: string): string[] {
  return value
    .trim()
    .split(/\s+/)
    .filter((segment) => segment.length > 0);
}

/**
 * 判断 token 片段是否符合基础 CSS class name 形态。
 *
 * @param value - export value 片段。
 * @returns 可作为 class evidence 时为 `true`。
 */
function isPotentialClassName(value: string): boolean {
  return /^-?[_a-zA-Z][-_a-zA-Z0-9]*$/.test(value);
}

/**
 * 判断文件是否命中任一简易 glob。
 *
 * @param id - 规范化文件 id。
 * @param root - project root。
 * @param patterns - include 或 exclude patterns。
 * @returns 相对路径或绝对 id 任一命中时为 `true`。
 */
function matchesAny(id: string, root: string, patterns: string[]): boolean {
  const relative = relativeId(id, root);
  return patterns.some((pattern) => matchesPattern(relative, pattern) || matchesPattern(id, pattern));
}

/**
 * 生成用于 glob 匹配的相对 id。
 *
 * @param id - 文件 id。
 * @param root - project root。
 * @returns root 内文件的 POSIX 相对路径；root 外文件保留绝对 id。
 */
function relativeId(id: string, root: string): string {
  const relative = path.relative(root, id);
  return normalizePath(relative.startsWith('..') ? id : relative);
}

/**
 * 执行当前公开承诺的简易 glob 匹配。
 *
 * @param value - POSIX 风格路径。
 * @param pattern - 仅包含普通文本、`*` 或 `**` 的 pattern。
 * @returns 整个路径与转换后正则匹配时为 `true`。
 */
function matchesPattern(value: string, pattern: string): boolean {
  const normalizedPattern = normalizePath(pattern);
  const escaped = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__GSS_GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__GSS_GLOBSTAR__/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}
