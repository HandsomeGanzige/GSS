/**
 * 单次 transform 治理指标与体积估算模块。
 *
 * @module core/output/createReport
 */
import type { Diagnostic, TransformClassMapping, TransformReport } from '../public/types.js';
import { byteLength } from '../utils/bytes.js';

/**
 * 创建单次 transform report。
 *
 * @param input - 转换前后 CSS、class mappings、diagnostics 与 pipeline 计数。
 * @returns 文件数固定为 1 的结构化 report 和 UTF-8 体积估算。
 */
export function createReport(input: {
  beforeCss: string;
  atomicCss: string;
  preservedCss: string;
  classes: Record<string, TransformClassMapping>;
  diagnostics: Diagnostic[];
  atomicDeclarations: number;
  reusedAtomicDeclarations: number;
  unsafeRules: number;
  preservedRules: number;
  preservedDeclarations: number;
}): TransformReport {
  const estimatedClassStringIncreaseBytes = estimateClassStringIncrease(input.classes);
  const beforeCssBytes = byteLength(input.beforeCss);
  const afterAtomicCssBytes = byteLength(input.atomicCss);
  const afterPreservedCssBytes = byteLength(input.preservedCss);

  return {
    summary: {
      files: 1,
      sourceClasses: Object.keys(input.classes).length,
      atomicDeclarations: input.atomicDeclarations,
      reusedAtomicDeclarations: input.reusedAtomicDeclarations,
      unsafeRules: input.unsafeRules,
      preservedRules: input.preservedRules,
      preservedDeclarations: input.preservedDeclarations
    },
    size: {
      beforeCssBytes,
      afterAtomicCssBytes,
      afterPreservedCssBytes,
      estimatedClassStringIncreaseBytes,
      estimatedTotalDiffBytes:
        afterAtomicCssBytes + afterPreservedCssBytes + estimatedClassStringIncreaseBytes - beforeCssBytes
    },
    diagnostics: input.diagnostics
  };
}

/**
 * 估算 class token 增长。
 *
 * @param classes - 当前输入的 class mappings。
 * @returns suggested class string 相对 resolved class 的非负 UTF-8 字节增量总和。
 */
function estimateClassStringIncrease(classes: Record<string, TransformClassMapping>): number {
  return Object.values(classes).reduce((total, mapping) => {
    return total + Math.max(0, byteLength(mapping.suggestedClassName) - byteLength(mapping.resolvedClassName));
  }, 0);
}
