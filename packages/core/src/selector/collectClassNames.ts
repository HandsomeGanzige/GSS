/**
 * Selector AST 中 source/global class 的分类工具。
 *
 * @module core/selector/collectClassNames
 */
import selectorParser from 'postcss-selector-parser';

/**
 * 收集 selector 中的 source/global class。
 *
 * @param selector - 可由 postcss-selector-parser 解析的 selector。
 * @returns 去重后的 source/global class names；`:global` 内 class 不进入 resolver 路径。
 * @throws selector 语法无效时透传 parser error，由上层选择 diagnostic 或 fallback 策略。
 */
export function collectClassNames(selector: string): { sourceClassNames: string[]; globalClassNames: string[] } {
  const sourceClassNames = new Set<string>();
  const globalClassNames = new Set<string>();
  const root = selectorParser().astSync(selector);

  root.walk((node) => {
    if (node.type !== 'class') {
      return;
    }

    if (isInsideGlobal(node)) {
      globalClassNames.add(node.value);
    } else {
      sourceClassNames.add(node.value);
    }
  });

  return {
    sourceClassNames: [...sourceClassNames],
    globalClassNames: [...globalClassNames]
  };
}

/**
 * 判断 selector node 是否位于 `:global(...)` 内。
 *
 * @param node - selector AST 中的任意 node。
 * @returns 任一祖先是 `:global` pseudo 时返回 `true`。
 */
export function isInsideGlobal(node: selectorParser.Node): boolean {
  let current: { type?: string; value?: string; parent?: unknown } | undefined = node.parent as
    | { type?: string; value?: string; parent?: unknown }
    | undefined;

  while (current) {
    if (current.type === 'pseudo' && current.value === ':global') {
      return true;
    }

    current = current.parent as { type?: string; value?: string; parent?: unknown } | undefined;
  }

  return false;
}
