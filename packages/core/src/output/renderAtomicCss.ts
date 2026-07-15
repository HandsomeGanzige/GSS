/**
 * Atomic declarations 到标准 CSS 的渲染模块。
 *
 * @module core/output/renderAtomicCss
 */
import type { AtomicDeclaration } from '../public/types.js';
import { renderRule } from './renderRule.js';
import { wrapAtRule } from './wrapAtRule.js';

/**
 * 渲染全部 atomic declarations。
 *
 * @param declarations - 已按调用方要求排序的 declarations。
 * @returns 以空行分隔并恢复 pseudo/media/supports context 的标准 CSS。
 */
export function renderAtomicCss(declarations: AtomicDeclaration[]): string {
  return declarations
    .map((declaration) => {
      const selector = `.${declaration.className}${declaration.context.pseudo ?? ''}`;
      return wrapAtRule(renderRule(selector, [declaration.declaration]), declaration.context);
    })
    .join('\n\n');
}
