import postcss from 'postcss';
import type { ResolveClassNameContext, ScopeStrategy } from '../public/types.js';
import { collectClassNames } from './collectClassNames.js';
import { scopeSelector } from './scopeSelector.js';

/** 对 preserved CSS 块中的所有 rule selector 执行 source class scoping。 */
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

/** 从 preserved CSS 块中收集所有 source class，用于 nested fallback 的 class mapping。 */
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
