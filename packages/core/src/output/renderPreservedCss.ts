/**
 * Preserved rules/blocks 的稳定顺序渲染模块。
 *
 * @module core/output/renderPreservedCss
 */
import type { PreservedBlock, PreservedRule } from '../ir/types.js';
import { renderRule } from './renderRule.js';
import { wrapAtRule } from './wrapAtRule.js';

/**
 * 渲染 preserved CSS。
 *
 * @param rules - 已完成 selector scoping 的 preserved rules。
 * @param blocks - unsupported at-rule 或 nested rule blocks。
 * @returns 按共享源码 order 交错输出的 fallback CSS。
 */
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
