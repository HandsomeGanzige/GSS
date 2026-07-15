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

/** 在 Rollup 已分配最终文件名后，解析 Vite 留在聚合 CSS 中的本地资源引用。 */
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

/** 判断 declaration value 是否包含结构化 url() 函数。 */
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

/** 从 selector AST 收集 class；解析失败的 rule 仍由 core unsafe fallback 保留。 */
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

/** 同一 token string 中的 class 会同时出现在 DOM，因此资源保留必须做传递闭包。 */
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

/** 按 Vite 默认 base 规则生成聚合 CSS 中的资源 URL。 */
function createOutputAssetUrl(assetFileName: string, cssFileName: string, base: string): string {
  if (base === '' || base === './') {
    const relative = path.posix.relative(path.posix.dirname(cssFileName), assetFileName);
    return relative.startsWith('.') ? relative : `./${relative}`;
  }

  return `${base.endsWith('/') ? base : `${base}/`}${assetFileName.replace(/^\/+/, '')}`;
}

/** 创建可在 CI 中稳定识别的资源边界错误。 */
function createAssetError(feature: string, reason: string): Error {
  return new Error(`[semantic-atomic-css] unsupported-feature feature=${feature} id=semantic-atomic.css reason=${reason}`);
}

/** 使用不依赖 locale 的字典序比较文本。 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
