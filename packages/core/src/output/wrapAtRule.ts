/**
 * Atomic/preserved rule 的条件 at-rule 包装模块。
 *
 * @module core/output/wrapAtRule
 */
import type { CssTransformContext } from '../public/types.js';

/**
 * 按 context 包裹支持的条件 at-rule。
 *
 * @param css - 已渲染的 rule 或 block。
 * @param context - 可能包含 media/supports 的转换上下文。
 * @returns 先 supports、后 media 包装并稳定缩进的 CSS。
 */
export function wrapAtRule(css: string, context: CssTransformContext): string {
  let output = css;

  if (context.supports) {
    output = `@supports ${context.supports} {\n${indentBlock(output)}\n}`;
  }

  if (context.media) {
    output = `@media ${context.media} {\n${indentBlock(output)}\n}`;
  }

  return output;
}

/**
 * 给多行 CSS block 增加两空格缩进。
 *
 * @param css - 任意多行 CSS。
 * @returns 每行前置两个空格的文本。
 */
function indentBlock(css: string): string {
  return css
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
