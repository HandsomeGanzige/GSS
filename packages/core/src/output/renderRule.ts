import type { DeclarationMeta } from '../public/types.js';

/** 渲染一个普通 CSS rule，使用稳定的 2 空格缩进。 */
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
