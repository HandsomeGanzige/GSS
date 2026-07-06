import postcss, { type Root } from 'postcss';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../public/types.js';

/** 解析标准 CSS 字符串，并把 parse error 转换为 diagnostic 而不是抛给调用方。 */
export function parseCss(id: string, css: string): { root?: Root; diagnostics: Diagnostic[] } {
  try {
    return {
      root: postcss.parse(css, { from: id }),
      diagnostics: []
    };
  } catch (error) {
    const syntaxError = error as { message?: string; line?: number; column?: number };

    return {
      diagnostics: [
        createDiagnostic({
          code: 'parse-error',
          level: 'error',
          message: syntaxError.message ?? 'CSS 解析失败。',
          id,
          source: {
            id,
            line: syntaxError.line,
            column: syntaxError.column
          }
        })
      ]
    };
  }
}
