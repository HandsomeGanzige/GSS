/**
 * Vite compiled CSS 中资源 class 的保守识别与 build URL 还原模块。
 *
 * @remarks
 * 资源引用涉及 Vite 延迟占位符和最终文件名，无法安全进入稳定 atomic key，因此相关 class 及
 * composes 闭包必须整类保留。
 *
 * @module vite/assetReferences
 */
import path from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';
import type { ClassPreservationReason } from '@semantic-atomic-css/core';
import type { ResolvedConfig } from 'vite';
import { collectExportedClassNames, type CssModuleTokens } from './cssModules.js';

const viteAssetReferencePattern = /__VITE_ASSET__([\w$]+)__(?:\$_(.*?)__)?/g;
const vitePublicAssetReferencePattern = /__VITE_PUBLIC_ASSET__([a-z\d]{8})__/g;

/**
 * 找出包含 url() 的 selector class，并通过原生 tokens 扩展 composes 闭包。
 * 这里宁可降低 atomization rate，也不让 dev/build 的资源内联差异进入 atomic key。
 *
 * @param css - Vite compiled scoped CSS。
 * @param tokens - Vite 原生 CSS Modules tokens。
 * @returns source class 到 `asset-reference` reason 的稳定只读 record。
 */
export function collectAssetPreserveClassNames(
  css: string,
  tokens: CssModuleTokens
): Readonly<Record<string, ClassPreservationReason>> {
  const assetClassNames = new Set<string>();
  const exportedClassNames = collectExportedClassNames(tokens, css);

  try {
    const root = postcss.parse(css);

    root.walkRules((rule) => {
      const hasAssetReference = rule.nodes.some((node) => {
        return node.type === 'decl' && containsUrlFunction(node.value);
      });

      if (!hasAssetReference) {
        return;
      }

      collectSelectorClassNames(rule.selector, assetClassNames);
    });
  } catch {
    return {};
  }

  expandComposedClassClosure(assetClassNames, exportedClassNames, tokens);

  return Object.fromEntries(
    [...assetClassNames]
      .filter((className) => exportedClassNames.has(className))
      .sort(compareText)
      .map((className) => [className, 'asset-reference' as const])
  );
}

/**
 * 解析聚合 CSS 中的 Vite build asset placeholders。
 *
 * @param css - generateBundle 阶段的聚合 CSS。
 * @param config - Vite resolved config，用于 base/renderBuiltUrl 保护。
 * @param cssFileName - 聚合 CSS 的最终输出路径。
 * @param getFileName - Rollup reference id 到 emitted file name 的 resolver。
 * @returns 所有本地 placeholder 已转换为最终 URL 的 CSS。
 * @throws publicDir placeholder、自定义 renderBuiltUrl 或残留 placeholder 无法安全还原时抛错。
 */
export function resolveBuildAssetReferences(
  css: string,
  config: ResolvedConfig,
  cssFileName: string,
  getFileName: (referenceId: string) => string
): string {
  vitePublicAssetReferencePattern.lastIndex = 0;
  const publicReference = vitePublicAssetReferencePattern.exec(css);

  if (publicReference) {
    throw createAssetError(
      'vite.public-asset-url',
      `聚合 CSS 包含无法通过 Vite 公开 API 还原的 publicDir 资源引用 ${publicReference[0]}。`
    );
  }

  viteAssetReferencePattern.lastIndex = 0;
  const hasLocalAssetReference = viteAssetReferencePattern.test(css);

  if (hasLocalAssetReference && config.experimental.renderBuiltUrl) {
    throw createAssetError(
      'vite.experimental.renderBuiltUrl',
      '聚合 CSS 暂不支持自定义 experimental.renderBuiltUrl，已停止构建以避免资源 URL 语义偏差。'
    );
  }

  viteAssetReferencePattern.lastIndex = 0;
  const resolvedCss = css.replace(
    viteAssetReferencePattern,
    (_full, referenceId: string, postfix = '') => {
      const emittedFileName = `${getFileName(referenceId)}${postfix}`;
      return encodeURI(createOutputAssetUrl(emittedFileName, cssFileName, config.base));
    }
  );

  viteAssetReferencePattern.lastIndex = 0;
  vitePublicAssetReferencePattern.lastIndex = 0;

  if (viteAssetReferencePattern.test(resolvedCss) || vitePublicAssetReferencePattern.test(resolvedCss)) {
    throw createAssetError('vite.asset-url', '聚合 CSS 仍包含未解析的 Vite 资源引用。');
  }

  return resolvedCss;
}

/**
 * 判断 declaration value 是否包含结构化 `url()`。
 *
 * @param value - declaration value。
 * @returns value parser 找到 url function 时为 `true`。
 */
function containsUrlFunction(value: string): boolean {
  let found = false;

  valueParser(value).walk((node) => {
    if (node.type === 'function' && node.value.toLowerCase() === 'url') {
      found = true;
      return false;
    }

    return undefined;
  });

  return found;
}

/**
 * 从 selector AST 收集 class names。
 *
 * @param selector - 当前 rule selector。
 * @param classNames - 写入目标集合。
 */
function collectSelectorClassNames(selector: string, classNames: Set<string>): void {
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
 * 扩展资源 class 的 composes 传递闭包。
 *
 * @param assetClassNames - 原地扩展的资源 class 集合。
 * @param exportedClassNames - 已确认会进入 DOM 的 class 集合。
 * @param tokens - Vite tokens，单个 value 中的 classes 被视为共现。
 */
function expandComposedClassClosure(
  assetClassNames: Set<string>,
  exportedClassNames: Set<string>,
  tokens: CssModuleTokens
): void {
  let changed = true;

  while (changed) {
    changed = false;

    for (const value of Object.values(tokens)) {
      const classNames = value
        .trim()
        .split(/\s+/)
        .filter((className) => exportedClassNames.has(className));

      if (!classNames.some((className) => assetClassNames.has(className))) {
        continue;
      }

      for (const className of classNames) {
        if (!assetClassNames.has(className)) {
          assetClassNames.add(className);
          changed = true;
        }
      }
    }
  }
}

/**
 * 按 Vite base 规则生成聚合 CSS 中的资源 URL。
 *
 * @param assetFileName - Rollup emitted asset 路径。
 * @param cssFileName - 聚合 CSS asset 路径。
 * @param base - Vite resolved base。
 * @returns 相对或 base-prefixed URL。
 */
function createOutputAssetUrl(assetFileName: string, cssFileName: string, base: string): string {
  if (base === '' || base === './') {
    const relative = path.posix.relative(path.posix.dirname(cssFileName), assetFileName);
    return relative.startsWith('.') ? relative : `./${relative}`;
  }

  return `${base.endsWith('/') ? base : `${base}/`}${assetFileName.replace(/^\/+/, '')}`;
}

/**
 * 创建结构化文本格式的资源边界错误。
 *
 * @param feature - 稳定 unsupported feature id。
 * @param reason - 面向维护者的失败原因。
 * @returns 带统一前缀、feature 和 id 的 Error。
 */
function createAssetError(feature: string, reason: string): Error {
  return new Error(`[semantic-atomic-css] unsupported-feature feature=${feature} id=semantic-atomic.css reason=${reason}`);
}

/**
 * 使用不依赖 locale 的字典序比较文本。
 *
 * @param left - 左侧文本。
 * @param right - 右侧文本。
 * @returns 标准 comparator 结果。
 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
