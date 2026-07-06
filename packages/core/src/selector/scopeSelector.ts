import selectorParser from 'postcss-selector-parser';
import type { ResolveClassNameContext, ScopeStrategy } from '../public/types.js';
import { isInsideGlobal } from './collectClassNames.js';

/** 使用 ScopeStrategy 改写 source class，并把 :global(...) 展开为标准 selector。 */
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

/** 将 :global(.foo) 替换为 .foo，确保 preserved CSS 是标准 selector。 */
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
