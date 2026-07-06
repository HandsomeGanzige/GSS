import type { ChildNode } from 'postcss';
import type { SourceLocation } from '../public/types.js';

/** 从 PostCSS node 中提取 core 稳定 source location。 */
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
