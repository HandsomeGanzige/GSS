/**
 * Source selector 到 adapter resolved selector 的转换模块。
 *
 * @module core/selector/scopeSelector
 */
import selectorParser from 'postcss-selector-parser';
import type { ResolveClassNameContext, ScopeStrategy } from '../public/types.js';
import { isInsideGlobal } from './collectClassNames.js';

/**
 * 使用 scope strategy 改写 source class，并展开 `:global(...)`。
 *
 * @param selector - 要转换的 source selector。
 * @param scope - adapter 提供的 class resolver。
 * @param context - resolver 的输入来源与用途。
 * @returns 可直接写入 preserved CSS 的标准 selector。
 * @throws selector 解析失败或 resolver 抛错时透传异常。
 */
export function scopeSelector(selector: string, scope: ScopeStrategy, context: ResolveClassNameContext): string {
  const root = selectorParser().astSync(selector);

  root.walk((node) => {
    if (node.type === 'class' && !isInsideGlobal(node)) {
      node.value = scope.resolveClassName(node.value, context);
      return;
    }

    if (node.type === 'pseudo' && node.value === ':global') {
      unwrapGlobalPseudo(node);
    }
  });

  return root.toString();
}

/**
 * 将 `:global(.foo)` pseudo 原地替换为其内部 selector nodes。
 *
 * @param pseudo - 值为 `:global` 的 selector pseudo node。
 */
function unwrapGlobalPseudo(pseudo: selectorParser.Pseudo): void {
  if (pseudo.nodes.length === 0) {
    pseudo.remove();
    return;
  }

  const firstSelector = pseudo.nodes[0];
  const replacementNodes = [...firstSelector.nodes].map((node) => node.clone());

  if (replacementNodes.length === 0) {
    pseudo.remove();
    return;
  }

  pseudo.replaceWith(...replacementNodes);
}
