import { brotliCompressSync, gzipSync } from 'node:zlib';
import type { Diagnostic, TransformManifest, TransformReport } from '@semantic-atomic-css/core';

/** 单个 CSS Module 提供给 analyzer 的构建期信息。 */
export type AnalyzerModuleInput = {
  id: string;
  sourceCss: string;
  scopedCss: string;
  atomicCss: string;
  preservedCss: string;
  diagnostics: Diagnostic[];
};

/** analyzer 的构建后分析输入。 */
export type AnalyzeBuildInput = {
  report: TransformReport;
  manifest: TransformManifest;
  modules: AnalyzerModuleInput[];
  outputCss: string;
  unsupportedFeatures?: AnalyzerUnsupportedFeature[];
};

/** 构建失败或保护策略命中的 unsupported feature 摘要。 */
export type AnalyzerUnsupportedFeature = {
  feature: string;
  id: string;
  reason: string;
  line?: number;
  column?: number;
};

/** 试用健康度状态，用于快速判断是否适合继续真实项目试用。 */
export type TrialHealthStatus = 'ready' | 'risky' | 'blocked';

/** analyzer 输出的完整结构化分析结果。 */
export type BuildAnalysis = {
  health: {
    status: TrialHealthStatus;
    reasons: string[];
  };
  risk: {
    unsafeReasonDistribution: Record<string, number>;
    preservedCssRatio: number;
    highRiskFiles: HighRiskFile[];
    unsupportedFeatures: AnalyzerUnsupportedFeature[];
  };
  benefit: {
    sourceClasses: number;
    atomicDeclarations: number;
    reusedAtomicDeclarations: number;
    reuseRatio: number;
  };
  size: {
    beforeRawCssBytes: number;
    afterRawCssBytes: number;
    beforeGzipCssBytes: number;
    afterGzipCssBytes: number;
    beforeBrotliCssBytes: number;
    afterBrotliCssBytes: number;
    estimatedClassStringIncreaseBytes: number;
    estimatedTotalDiffBytes: number;
  };
};

/** 高风险文件摘要，按 unsafe 与 preserved CSS 风险排序。 */
export type HighRiskFile = {
  id: string;
  unsafeRules: number;
  preservedCssBytes: number;
  unsafeReasons: Record<string, number>;
};

/** 构建转换效果分析入口，不读取文件也不写入产物。 */
export function analyzeBuild(input: AnalyzeBuildInput): BuildAnalysis {
  const sourceCss = input.modules.map((module) => module.sourceCss).join('\n\n');
  const unsafeReasonDistribution = countUnsafeReasons(input.report.diagnostics);
  const highRiskFiles = createHighRiskFiles(input.modules);
  const beforeRawCssBytes = byteLength(sourceCss);
  const afterRawCssBytes = byteLength(input.outputCss);
  const preservedCssBytes = input.modules.reduce((total, module) => total + byteLength(module.preservedCss), 0);
  const preservedCssRatio = afterRawCssBytes === 0 ? 0 : roundRatio(preservedCssBytes / afterRawCssBytes);
  const unsupportedFeatures = input.unsupportedFeatures ?? [];
  const size = {
    beforeRawCssBytes,
    afterRawCssBytes,
    beforeGzipCssBytes: compressedLength(sourceCss, 'gzip'),
    afterGzipCssBytes: compressedLength(input.outputCss, 'gzip'),
    beforeBrotliCssBytes: compressedLength(sourceCss, 'brotli'),
    afterBrotliCssBytes: compressedLength(input.outputCss, 'brotli'),
    estimatedClassStringIncreaseBytes: input.report.size.estimatedClassStringIncreaseBytes,
    estimatedTotalDiffBytes: afterRawCssBytes + input.report.size.estimatedClassStringIncreaseBytes - beforeRawCssBytes
  };
  const benefit = {
    sourceClasses: input.report.summary.sourceClasses,
    atomicDeclarations: input.report.summary.atomicDeclarations,
    reusedAtomicDeclarations: input.report.summary.reusedAtomicDeclarations,
    reuseRatio: createReuseRatio(input.report)
  };

  return {
    health: createHealth({
      unsupportedFeatures,
      unsafeRules: input.report.summary.unsafeRules,
      preservedCssRatio,
      estimatedTotalDiffBytes: size.estimatedTotalDiffBytes
    }),
    risk: {
      unsafeReasonDistribution,
      preservedCssRatio,
      highRiskFiles,
      unsupportedFeatures
    },
    benefit,
    size
  };
}

/** 统计 unsafe selector reason 分布。 */
function countUnsafeReasons(diagnostics: Diagnostic[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const diagnostic of diagnostics) {
    if (diagnostic.code !== 'unsafe-selector' || !diagnostic.reason) {
      continue;
    }

    counts[diagnostic.reason] = (counts[diagnostic.reason] ?? 0) + 1;
  }

  return counts;
}

/** 生成高风险文件列表，优先展示 unsafe 多且 preserved CSS 多的模块。 */
function createHighRiskFiles(modules: AnalyzerModuleInput[]): HighRiskFile[] {
  return modules
    .map((module) => {
      const unsafeReasons = countUnsafeReasons(module.diagnostics);
      return {
        id: module.id,
        unsafeRules: Object.values(unsafeReasons).reduce((total, count) => total + count, 0),
        preservedCssBytes: byteLength(module.preservedCss),
        unsafeReasons
      };
    })
    .filter((file) => file.unsafeRules > 0 || file.preservedCssBytes > 0)
    .sort((left, right) => {
      if (right.unsafeRules !== left.unsafeRules) {
        return right.unsafeRules - left.unsafeRules;
      }

      return right.preservedCssBytes - left.preservedCssBytes;
    })
    .slice(0, 10);
}

/** 根据复用数量和 atomic declaration 数量计算复用率。 */
function createReuseRatio(report: TransformReport): number {
  const total = report.summary.atomicDeclarations + report.summary.reusedAtomicDeclarations;
  return total === 0 ? 0 : roundRatio(report.summary.reusedAtomicDeclarations / total);
}

/** 创建真实项目试用健康度摘要。 */
function createHealth(input: {
  unsupportedFeatures: AnalyzerUnsupportedFeature[];
  unsafeRules: number;
  preservedCssRatio: number;
  estimatedTotalDiffBytes: number;
}): BuildAnalysis['health'] {
  const reasons: string[] = [];

  if (input.unsupportedFeatures.length > 0) {
    reasons.push('存在不可继承 CSS Modules feature 或显式保护失败项');
  }

  if (input.unsafeRules > 0) {
    reasons.push('存在 unsafe selector fallback');
  }

  if (input.preservedCssRatio >= 0.3) {
    reasons.push('preserved CSS 占比较高');
  }

  if (input.estimatedTotalDiffBytes > 0) {
    reasons.push('估算总 CSS 与 class string 体积未下降');
  }

  if (input.unsupportedFeatures.length > 0) {
    return {
      status: 'blocked',
      reasons
    };
  }

  if (reasons.length > 0) {
    return {
      status: 'risky',
      reasons
    };
  }

  return {
    status: 'ready',
    reasons: ['当前构建未发现阻塞项或高风险 fallback 信号']
  };
}

/** 使用 UTF-8 计算字符串字节数。 */
function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/** 计算 gzip 或 brotli 后的字节数。 */
function compressedLength(value: string, format: 'gzip' | 'brotli'): number {
  return format === 'gzip' ? gzipSync(value).byteLength : brotliCompressSync(value).byteLength;
}

/** 把比例稳定到四位小数，避免 JSON report 产生无意义浮点噪声。 */
function roundRatio(value: number): number {
  return Math.round(value * 10000) / 10000;
}
