import { brotliCompressSync, gzipSync } from 'node:zlib';
import type {
  CssTransformContext,
  Diagnostic,
  TransformManifest,
  TransformReport
} from '@semantic-atomic-css/core';

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
    declarationConflictSummary: DeclarationConflictSummary;
    declarationConflicts: DeclarationConflict[];
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

/** analyzer 能从单个 semantic class 中确定的 declaration 冲突类型。 */
export type DeclarationConflictKind = 'same-property' | 'shorthand-longhand';

/** declaration 冲突中的单个 atomic 声明，数组顺序与 class token 中顺序一致。 */
export type DeclarationConflictEntry = {
  atomicClassName: string;
  property: string;
  value: string;
};

/** 同一 semantic class 内可能受全局 atomic 顺序影响的确定属性竞争。 */
export type DeclarationConflict = {
  id: string;
  sourceClassName: string;
  kind: DeclarationConflictKind;
  context: CssTransformContext;
  important: boolean;
  properties: string[];
  declarations: DeclarationConflictEntry[];
};

/** declaration 冲突摘要，用于 CI 或 report 首屏快速判断风险规模。 */
export type DeclarationConflictSummary = {
  total: number;
  sameProperty: number;
  shorthandLonghand: number;
  affectedFiles: number;
  affectedClasses: number;
};

/** 第一批保守 shorthand 展开表，只纳入语义明确且 Pilot 已观测的常用属性。 */
const shorthandLonghands: Readonly<Record<string, readonly string[]>> = {
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  border: [
    'border-top',
    'border-right',
    'border-bottom',
    'border-left',
    'border-width',
    'border-style',
    'border-color',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-top-style',
    'border-right-style',
    'border-bottom-style',
    'border-left-style',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color'
  ],
  background: [
    'background-color',
    'background-image',
    'background-position',
    'background-size',
    'background-repeat',
    'background-origin',
    'background-clip',
    'background-attachment'
  ],
  font: ['font-family', 'font-size', 'font-style', 'font-variant', 'font-weight', 'font-stretch', 'line-height'],
  outline: ['outline-color', 'outline-style', 'outline-width'],
  inset: ['top', 'right', 'bottom', 'left'],
  gap: ['row-gap', 'column-gap']
};

/** 构建转换效果分析入口，不读取文件也不写入产物。 */
export function analyzeBuild(input: AnalyzeBuildInput): BuildAnalysis {
  const sourceCss = input.modules.map((module) => module.scopedCss).join('\n\n');
  const unsafeReasonDistribution = countUnsafeReasons(input.report.diagnostics);
  const highRiskFiles = createHighRiskFiles(input.modules);
  const beforeRawCssBytes = byteLength(sourceCss);
  const afterRawCssBytes = byteLength(input.outputCss);
  const preservedCssBytes = input.modules.reduce((total, module) => total + byteLength(module.preservedCss), 0);
  const preservedCssRatio = afterRawCssBytes === 0 ? 0 : roundRatio(preservedCssBytes / afterRawCssBytes);
  const unsupportedFeatures = input.unsupportedFeatures ?? [];
  const declarationConflicts = createDeclarationConflicts(input.manifest);
  const declarationConflictSummary = createDeclarationConflictSummary(declarationConflicts);
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
      estimatedTotalDiffBytes: size.estimatedTotalDiffBytes,
      declarationConflicts: declarationConflictSummary.total
    }),
    risk: {
      unsafeReasonDistribution,
      preservedCssRatio,
      highRiskFiles,
      unsupportedFeatures,
      declarationConflictSummary,
      declarationConflicts
    },
    benefit,
    size
  };
}

/** 从 manifest class 到 atomic declaration 的映射中提取可证明的 class 内属性冲突。 */
function createDeclarationConflicts(manifest: TransformManifest): DeclarationConflict[] {
  const atomicByClassName = new Map(Object.values(manifest.atomic).map((entry) => [entry.className, entry]));
  const conflicts: DeclarationConflict[] = [];
  const classes = Object.values(manifest.classes).sort(compareManifestClass);

  for (const classEntry of classes) {
    const declarationsByContext = new Map<
      string,
      Array<{ atomicClassName: string; property: string; value: string; important: boolean; context: CssTransformContext }>
    >();

    for (const atomicClassName of classEntry.atomicClassNames) {
      const atomic = atomicByClassName.get(atomicClassName);

      if (!atomic) {
        continue;
      }

      const property = atomic.declaration.prop.trim().toLowerCase();
      const context = { ...atomic.context };
      const important = atomic.declaration.important === true;
      const contextKey = createConflictContextKey(context, important);
      const declarations = declarationsByContext.get(contextKey) ?? [];
      declarations.push({
        atomicClassName,
        property,
        value: atomic.declaration.value,
        important,
        context
      });
      declarationsByContext.set(contextKey, declarations);
    }

    for (const declarations of declarationsByContext.values()) {
      for (const component of collectConflictComponents(declarations)) {
        const first = component[0];

        if (!first) {
          continue;
        }

        const properties = [...new Set(component.map((entry) => entry.property))];
        conflicts.push({
          id: classEntry.id,
          sourceClassName: classEntry.sourceClassName,
          kind: properties.length === 1 ? 'same-property' : 'shorthand-longhand',
          context: { ...first.context },
          important: first.important,
          properties,
          declarations: component.map((entry) => ({
            atomicClassName: entry.atomicClassName,
            property: entry.property,
            value: entry.value
          }))
        });
      }
    }
  }

  return conflicts;
}

/** 用无向图连通分量合并同一组 shorthand / longhand 竞争，避免成对重复报告。 */
function collectConflictComponents<T extends { property: string; value: string }>(declarations: T[]): T[][] {
  const adjacency = declarations.map(() => new Set<number>());

  for (let leftIndex = 0; leftIndex < declarations.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < declarations.length; rightIndex += 1) {
      const left = declarations[leftIndex];
      const right = declarations[rightIndex];

      if (!left || !right || left.value === right.value || !propertiesConflict(left.property, right.property)) {
        continue;
      }

      adjacency[leftIndex]?.add(rightIndex);
      adjacency[rightIndex]?.add(leftIndex);
    }
  }

  const visited = new Set<number>();
  const components: T[][] = [];

  for (let start = 0; start < declarations.length; start += 1) {
    if (visited.has(start) || adjacency[start]?.size === 0) {
      continue;
    }

    const indexes: number[] = [];
    const queue = [start];
    visited.add(start);

    while (queue.length > 0) {
      const current = queue.shift();

      if (current === undefined) {
        continue;
      }

      indexes.push(current);

      for (const next of adjacency[current] ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    components.push(indexes.map((index) => declarations[index]).filter((entry): entry is T => entry !== undefined));
  }

  return components;
}

/** 判断两个属性是否会写入同一 CSS 属性位，未列入关系表时保守地返回 false。 */
function propertiesConflict(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  return shorthandLonghands[left]?.includes(right) === true || shorthandLonghands[right]?.includes(left) === true;
}

/** 为 conflict 分组生成不受对象属性顺序影响的 cascade 上下文 key。 */
function createConflictContextKey(context: CssTransformContext, important: boolean): string {
  return [context.pseudo ?? '', context.media ?? '', context.supports ?? '', important ? 'important' : 'normal'].join('\0');
}

/** 统计 declaration conflict 规模，文件和 class 数量都使用稳定唯一 key 去重。 */
function createDeclarationConflictSummary(conflicts: DeclarationConflict[]): DeclarationConflictSummary {
  return {
    total: conflicts.length,
    sameProperty: conflicts.filter((conflict) => conflict.kind === 'same-property').length,
    shorthandLonghand: conflicts.filter((conflict) => conflict.kind === 'shorthand-longhand').length,
    affectedFiles: new Set(conflicts.map((conflict) => conflict.id)).size,
    affectedClasses: new Set(conflicts.map((conflict) => `${conflict.id}\0${conflict.sourceClassName}`)).size
  };
}

/** 使 standalone analyzer 输入不依赖 adapter 预先排序也能产生稳定结果。 */
function compareManifestClass(
  left: TransformManifest['classes'][string],
  right: TransformManifest['classes'][string]
): number {
  return compareText(left.id, right.id) || compareText(left.sourceClassName, right.sourceClassName);
}

/** 使用不依赖 locale 的字典序比较文本。 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
  declarationConflicts: number;
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

  if (input.declarationConflicts > 0) {
    reasons.push('存在同一 semantic class 的 declaration 顺序冲突');
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
