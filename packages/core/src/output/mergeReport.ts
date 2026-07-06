import type { TransformReport } from '../public/types.js';

/** 合并多个 report，用于有状态 transformer 输出聚合治理数据。 */
export function mergeReports(reports: TransformReport[]): TransformReport {
  const summary = reports.reduce(
    (current, report) => {
      current.files += report.summary.files;
      current.sourceClasses += report.summary.sourceClasses;
      current.atomicDeclarations = Math.max(current.atomicDeclarations, report.summary.atomicDeclarations);
      current.reusedAtomicDeclarations = Math.max(
        current.reusedAtomicDeclarations,
        report.summary.reusedAtomicDeclarations
      );
      current.unsafeRules += report.summary.unsafeRules;
      current.preservedRules += report.summary.preservedRules;
      current.preservedDeclarations += report.summary.preservedDeclarations;
      return current;
    },
    {
      files: 0,
      sourceClasses: 0,
      atomicDeclarations: 0,
      reusedAtomicDeclarations: 0,
      unsafeRules: 0,
      preservedRules: 0,
      preservedDeclarations: 0
    }
  );

  const size = reports.reduce(
    (current, report) => {
      current.beforeCssBytes += report.size.beforeCssBytes;
      current.afterAtomicCssBytes = Math.max(current.afterAtomicCssBytes, report.size.afterAtomicCssBytes);
      current.afterPreservedCssBytes += report.size.afterPreservedCssBytes;
      current.estimatedClassStringIncreaseBytes += report.size.estimatedClassStringIncreaseBytes;
      current.estimatedTotalDiffBytes += report.size.estimatedTotalDiffBytes;
      return current;
    },
    {
      beforeCssBytes: 0,
      afterAtomicCssBytes: 0,
      afterPreservedCssBytes: 0,
      estimatedClassStringIncreaseBytes: 0,
      estimatedTotalDiffBytes: 0
    }
  );

  return {
    summary,
    size,
    diagnostics: reports.flatMap((report) => report.diagnostics)
  };
}
