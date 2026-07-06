import type { Diagnostic, DiagnosticCode, DiagnosticLevel, SourceLocation } from '../public/types.js';

/** 创建结构化 diagnostic，统一补齐 id、级别和来源位置。 */
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
