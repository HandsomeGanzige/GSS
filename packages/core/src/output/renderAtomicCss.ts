import type { AtomicDeclaration } from '../public/types.js';
import { renderRule } from './renderRule.js';
import { wrapAtRule } from './wrapAtRule.js';

/** 渲染全部 atomic CSS，顺序来自 AtomicRegistry 的首次注册顺序。 */
export function renderAtomicCss(declarations: AtomicDeclaration[]): string {
  return declarations
    .map((declaration) => {
      const selector = `.${declaration.className}${declaration.context.pseudo ?? ''}`;
      return wrapAtRule(renderRule(selector, [declaration.declaration]), declaration.context);
    })
    .join('\n\n');
}
