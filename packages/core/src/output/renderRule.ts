/**
 * 单条标准 CSS rule 的稳定格式化模块。
 *
 * @module core/output/renderRule
 */
import type { DeclarationMeta } from '../public/types.js';

/**
 * 渲染一个普通 CSS rule。
 *
 * @param selector - 已准备好的最终 selector。
 * @param declarations - 按语义顺序输出的 declarations。
 * @param indent - rule 起始缩进空格数，默认 0。
 * @returns 使用两空格 declaration 缩进的标准 CSS。
 */
export function renderRule(selector: string, declarations: DeclarationMeta[], indent = 0): string {
  const baseIndent = ' '.repeat(indent);
  const declarationIndent = ' '.repeat(indent + 2);
  const lines = [`${baseIndent}${selector} {`];

  for (const declaration of declarations) {
    lines.push(
      `${declarationIndent}${declaration.prop}: ${declaration.value}${declaration.important ? ' !important' : ''};`
    );
  }

  lines.push(`${baseIndent}}`);
  return lines.join('\n');
}
