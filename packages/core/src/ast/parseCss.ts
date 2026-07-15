/**
 * 标准 CSS 的 PostCSS 解析入口。
 *
 * @remarks
 * 语法错误被转换为结构化 diagnostic，使调用方始终通过 `TransformCssResult` 观察失败。
 *
 * @module core/ast/parseCss
 */
import postcss, { type Root } from 'postcss';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import type { Diagnostic } from '../public/types.js';

/**
 * 解析标准 CSS 字符串。
 *
 * @param id - PostCSS source id，也是 diagnostic 的稳定来源标识。
 * @param css - 已完成预处理的标准 CSS。
 * @returns 成功时包含 root；失败时包含单条 `parse-error` diagnostic。
 */
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
