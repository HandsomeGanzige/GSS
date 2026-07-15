/**
 * PostCSS 位置到 core 公共位置结构的适配模块。
 *
 * @module core/ast/sourceLocation
 */
import type { ChildNode } from 'postcss';
import type { SourceLocation } from '../public/types.js';

/**
 * 从 PostCSS node 提取稳定 source location。
 *
 * @param id - 调用方提供的来源标识。
 * @param node - 可能携带 PostCSS source 信息的 AST node。
 * @returns 1-based 行列位置；node 没有 source start 时返回 `undefined`。
 */
export function toSourceLocation(id: string, node: ChildNode): SourceLocation | undefined {
  const start = node.source?.start;

  if (!start) {
    return undefined;
  }

  return {
    id,
    line: start.line,
    column: start.column
  };
}
