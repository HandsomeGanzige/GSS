import type { PreservedBlock, PreservedRule } from '../ir/types.js';
import { renderRule } from './renderRule.js';
import { wrapAtRule } from './wrapAtRule.js';

/** 渲染 preserved CSS，包含 unsafe rule、mixed declaration 和 unsupported at-rule。 */
export function renderPreservedCss(rules: PreservedRule[], blocks: PreservedBlock[]): string {
  const renderedItems = [
    ...rules.map((rule) => ({
      order: rule.order,
      css: wrapAtRule(renderRule(rule.scopedSelector, rule.declarations), rule.context)
    })),
    ...blocks.map((block) => ({
      order: block.order,
      css: wrapAtRule(block.css, block.context)
    }))
  ].sort((left, right) => left.order - right.order);

  return renderedItems.map((item) => item.css).join('\n\n');
}
