import path from 'node:path';
import { createHash } from 'node:crypto';
import type { ScopeStrategy, TransformClassMapping } from '@semantic-atomic-css/core';
import type { LocalsConvention, ResolvedSemanticAtomicCssOptions } from './types.js';

/** 创建 CSS Modules 场景传给 core 的通用 ScopeStrategy。 */
export function createCssModulesScopeStrategy(input: {
  id: string;
  css: string;
  root: string;
  options: ResolvedSemanticAtomicCssOptions;
}): ScopeStrategy {
  const cache = new Map<string, string>();

  return {
    resolveClassName(className): string {
      const cached = cache.get(className);

      if (cached) {
        return cached;
      }

      const scopedName = createScopedClassName({
        localName: className,
        id: input.id,
        css: input.css,
        root: input.root,
        generateScopedName: input.options.modules.generateScopedName
      });
      cache.set(className, scopedName);
      return scopedName;
    },

    shouldExportClassName(): boolean {
      return true;
    }
  };
}

/** 根据 core 输出的 class mapping 生成 CSS Modules default export tokens。 */
export function createCssModuleTokens(
  classes: Record<string, TransformClassMapping>,
  localsConvention: LocalsConvention
): Record<string, string> {
  const tokens: Record<string, string> = {};
  const mappings = Object.values(classes);

  if (shouldExportOriginalKey(localsConvention)) {
    for (const mapping of mappings) {
      tokens[mapping.sourceClassName] = mapping.suggestedClassName;
    }
  }

  for (const mapping of mappings) {
    for (const exportName of resolveAliasExportNames(mapping.sourceClassName, localsConvention)) {
      if (exportName in tokens) {
        continue;
      }

      tokens[exportName] = mapping.suggestedClassName;
    }
  }

  return tokens;
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

/** 把路径统一成 POSIX 风格，方便匹配和生成稳定 hash。 */
export function normalizePath(id: string): string {
  return id.replace(/\\/g, '/');
}

/** 根据 local class、文件和用户配置生成稳定 scoped class。 */
function createScopedClassName(input: {
  localName: string;
  id: string;
  css: string;
  root: string;
  generateScopedName?: string | ((name: string, filename: string, css: string) => string);
}): string {
  if (typeof input.generateScopedName === 'function') {
    return ensureValidClassName(input.generateScopedName(input.localName, input.id, input.css));
  }

  const name = createFileNamePart(input.id);
  const local = sanitizeClassNamePart(input.localName);
  const hash = createStableHash(`${relativeId(input.id, input.root)}\0${input.localName}`);

  if (typeof input.generateScopedName === 'string') {
    return ensureValidClassName(
      input.generateScopedName
        .replace(/\[name\]/g, name)
        .replace(/\[local\]/g, local)
        .replace(/\[hash(?::[a-z0-9]+)?(?::\d+)?\]/gi, hash)
    );
  }

  return ensureValidClassName(`${name}_${local}__${hash}`);
}

/** 判断当前策略是否保留原始 source class key。 */
function shouldExportOriginalKey(localsConvention: LocalsConvention): boolean {
  return localsConvention === 'asIs' || localsConvention === 'camelCase' || localsConvention === 'dashes';
}

/** 根据 localsConvention 生成额外 alias key，冲突由调用方按稳定规则处理。 */
function resolveAliasExportNames(sourceClassName: string, localsConvention: LocalsConvention): string[] {
  if (localsConvention === 'asIs') {
    return [];
  }

  const alias = camelCaseClassName(sourceClassName);

  if (localsConvention === 'camelCaseOnly' || localsConvention === 'dashesOnly') {
    return [alias];
  }

  return alias === sourceClassName ? [] : [alias];
}

/** 把 dashed class 名转换为 camelCase key。 */
function camelCaseClassName(value: string): string {
  return value.replace(/-+([a-zA-Z0-9])/g, (_, character: string) => character.toUpperCase());
}

/** 生成参与 scoped class 的文件名片段。 */
function createFileNamePart(id: string): string {
  const filename = path.basename(id).replace(/\.module\.css$/i, '');
  return sanitizeClassNamePart(filename);
}

/** 生成相对 root 的稳定 id，用于 scoped class hash。 */
function relativeId(id: string, root: string): string {
  const relative = path.relative(root, id);
  return normalizePath(relative.startsWith('..') ? id : relative);
}

/** 使用 Node crypto 生成短 hash，adapter 可以依赖 Node 环境。 */
function createStableHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 6);
}

/** 把任意片段转成 class name 中可安全使用的片段。 */
function sanitizeClassNamePart(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized.length > 0 ? normalized : 'value';
}

/** 确保最终 class name 不以数字或连字符数字开头。 */
function ensureValidClassName(value: string): string {
  if (/^-?\d/.test(value)) {
    return `_${value}`;
  }

  return value;
}

/** 判断文件是否命中任意 include/exclude 简易 glob。 */
function matchesAny(id: string, root: string, patterns: string[]): boolean {
  const relative = relativeId(id, root);
  return patterns.some((pattern) => matchesPattern(relative, pattern) || matchesPattern(id, pattern));
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
