import type { CssTransformContext } from '../public/types.js';

/** 按 context 包裹 @media/@supports，输出稳定缩进格式。 */
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

/** 给多行 CSS 块增加 2 空格缩进。 */
function indentBlock(css: string): string {
  return css
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}
