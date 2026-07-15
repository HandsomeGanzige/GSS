/**
 * Core diagnostic 结构创建模块。
 *
 * @module core/diagnostics/createDiagnostic
 */
import type { Diagnostic, DiagnosticCode, DiagnosticLevel, SourceLocation } from '../public/types.js';

/**
 * 创建结构化 diagnostic。
 *
 * @param input - 稳定 code/level/id 与可选 selector、class、reason、source 证据。
 * @returns 可直接进入 result/report 的 diagnostic。
 */
export function createDiagnostic(input: {
  code: DiagnosticCode;
  level: DiagnosticLevel;
  message: string;
  id: string;
  selector?: string;
  sourceClassName?: string;
  reason?: string;
  source?: SourceLocation;
}): Diagnostic {
  return {
    code: input.code,
    level: input.level,
    message: input.message,
    id: input.id,
    selector: input.selector,
    sourceClassName: input.sourceClassName,
    reason: input.reason,
    source: input.source
  };
}
