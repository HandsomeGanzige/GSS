/**
 * Preserved CSS block 的 selector scoping 与 class 证据收集模块。
 *
 * @module core/selector/scopeCssBlock
 */
import postcss from 'postcss';
import type { ResolveClassNameContext, ScopeStrategy } from '../public/types.js';
import { collectClassNames } from './collectClassNames.js';
import { scopeSelector } from './scopeSelector.js';

/**
 * 对 preserved CSS block 中的所有 rule selector 执行 source class scoping。
 *
 * @param css - 要保留的标准 CSS block。
 * @param scope - adapter 提供的 class scope strategy。
 * @param context - preserved-rule resolver 上下文。
 * @returns selector 已完成 scoping 的 CSS 文本。
 * @throws CSS 或 selector 解析失败、resolver 抛错时透传异常，由 transformer 决定保守降级。
 */
export function scopeCssBlock(css: string, scope: ScopeStrategy, context: ResolveClassNameContext): string {
  const root = postcss.parse(css);

  root.walkRules((rule) => {
    rule.selector = scopeSelector(rule.selector, scope, {
      ...context,
      originalSelector: rule.selector
    });
  });

  return root.toString();
}

/**
 * 从 preserved CSS block 收集所有 source class。
 *
 * @param css - 要分析的标准 CSS block。
 * @returns 按首次出现顺序去重的 source class names。
 * @throws CSS 或 selector 无法解析时透传异常，由调用方决定 fallback mapping。
 */
export function collectSourceClassNamesFromCss(css: string): string[] {
  const sourceClassNames = new Set<string>();
  const root = postcss.parse(css);

  root.walkRules((rule) => {
    for (const className of collectClassNames(rule.selector).sourceClassNames) {
      sourceClassNames.add(className);
    }
  });

  return [...sourceClassNames];
}
