/**
 * GSS 构建结果的纯内存风险、收益和体积分析模块。
 *
 * @remarks
 * analyzer 只消费 core manifest/report 与 adapter 提供的构建快照，不读取文件、不依赖 Vite，
 * 也不会在缺少 usage evidence 时猜测不同 DOM class 的共现关系。分析结果用于 report 和 Pilot
 * 决策，不会改写 CSS。
 *
 * @packageDocumentation
 */
import { brotliCompressSync, gzipSync } from 'node:zlib';
import type {
  CssTransformContext,
  Diagnostic,
  TransformManifest,
  TransformReport
} from '@semantic-atomic-css/core';

/**
 * 单个 CSS Module 提供给 analyzer 的构建期快照。
 *
 * @remarks
 * 体积基线使用 Vite 原生管线生成的 `scopedCss`，而不是可能包含 Sass/Less 语法的 `sourceCss`。
 * `sourceCss` 当前作为 adapter 构建证据保留，不参与体积计算。
 */
export type AnalyzerModuleInput = {
  id: string;
  sourceCss: string;
  scopedCss: string;
  atomicCss: string;
  preservedCss: string;
  diagnostics: Diagnostic[];
};

/**
 * analyzer 的完整构建后输入。
 *
 * @remarks
 * 调用方应保证 report、manifest、modules 和 outputCss 来自同一次稳定构建快照，否则风险和体积
 * 指标没有可比性。modules 顺序不应承担语义；需要稳定输出的分析会在内部排序。
 */
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

/**
 * analyzer 输出的完整结构化分析结果。
 *
 * @remarks
 * `health` 是试用决策摘要，`risk` 保留可追踪证据，`benefit` 描述 atomic 复用，`size` 同时提供
 * raw、gzip、brotli 和 class string 估算。消费者应优先读取结构化字段，不解析 reasons 文案。
 */
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
  selectorIdentity: string;
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

/**
 * 分析一次稳定构建的风险、收益、体积和可证明 declaration 冲突。
 *
 * @remarks
 * 函数是无状态的，不读取文件也不写入产物。同属性和 shorthand/longhand 冲突只在同一 semantic
 * class、相同 selector identity/media/supports 和 important 层级内报告；缺少 usage evidence 时不会推断跨 class
 * 冲突。gzip 与 brotli 指标使用 Node.js 同步压缩 API，适合构建结束阶段调用。
 *
 * @param input - 同一次构建产生的 core report/manifest、模块快照、最终 CSS 和可选保护失败项。
 * @returns 可序列化的 {@link BuildAnalysis}，输入对象不会被修改。
 */
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

/**
 * 从 manifest 提取可证明的 class 内属性冲突。
 *
 * @param manifest - 与当前构建 report 对应的 core manifest。
 * @returns 按文件与 source class 稳定排序的 declaration conflicts。
 */
function createDeclarationConflicts(manifest: TransformManifest): DeclarationConflict[] {
  const atomicByClassName = new Map(Object.values(manifest.atomic).map((entry) => [entry.className, entry]));
  const conflicts: DeclarationConflict[] = [];
  const classes = Object.values(manifest.classes).sort(compareManifestClass);

  for (const classEntry of classes) {
    const declarationsByContext = new Map<
      string,
      Array<{
        atomicClassName: string;
        property: string;
        value: string;
        selectorIdentity: string;
        important: boolean;
        context: CssTransformContext;
      }>
    >();

    for (const atomicClassName of classEntry.atomicClassNames) {
      const atomic = atomicByClassName.get(atomicClassName);

      if (!atomic) {
        continue;
      }

      const property = atomic.declaration.prop.trim().toLowerCase();
      const context = { ...atomic.context };
      const selectorIdentity = atomic.selector.identity;
      const important = atomic.declaration.important;
      const contextKey = createConflictContextKey(selectorIdentity, context, important);
      const declarations = declarationsByContext.get(contextKey) ?? [];
      declarations.push({
        atomicClassName,
        property,
        value: atomic.declaration.value,
        selectorIdentity,
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
          selectorIdentity: first.selectorIdentity,
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

/**
 * 把两两属性竞争合并为无向图连通分量。
 *
 * @param declarations - 同一 class、context 和 important 层级内的 declarations。
 * @returns 至少包含一条冲突边的 declaration groups；孤立 declaration 不输出。
 */
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

/**
 * 判断两个属性是否会竞争同一 CSS 属性位。
 *
 * @param left - 已归一化的小写属性名。
 * @param right - 已归一化的小写属性名。
 * @returns 同属性或已登记 shorthand/longhand 关系返回 `true`；未知关系保守返回 `false`。
 */
function propertiesConflict(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  return shorthandLonghands[left]?.includes(right) === true || shorthandLonghands[right]?.includes(left) === true;
}

/**
 * 生成 declaration conflict 分组 key。
 *
 * @param selectorIdentity - source class 无关的 selector 身份。
 * @param context - media/supports cascade 上下文。
 * @param important - declaration 是否位于 important 层级。
 * @returns 不依赖对象属性插入顺序的稳定文本 key。
 */
function createConflictContextKey(
  selectorIdentity: string,
  context: CssTransformContext,
  important: boolean
): string {
  return [selectorIdentity, context.media ?? '', context.supports ?? '', important ? 'important' : 'normal'].join(
    '\0'
  );
}

/**
 * 汇总 declaration conflict 规模。
 *
 * @param conflicts - 已去重的 conflict records。
 * @returns 按 kind、文件和 source class 统计的摘要。
 */
function createDeclarationConflictSummary(conflicts: DeclarationConflict[]): DeclarationConflictSummary {
  return {
    total: conflicts.length,
    sameProperty: conflicts.filter((conflict) => conflict.kind === 'same-property').length,
    shorthandLonghand: conflicts.filter((conflict) => conflict.kind === 'shorthand-longhand').length,
    affectedFiles: new Set(conflicts.map((conflict) => conflict.id)).size,
    affectedClasses: new Set(conflicts.map((conflict) => `${conflict.id}\0${conflict.sourceClassName}`)).size
  };
}

/**
 * 比较 manifest class entries。
 *
 * @param left - 左侧 class entry。
 * @param right - 右侧 class entry。
 * @returns 先按 id、再按 source class 的稳定字典序。
 */
function compareManifestClass(
  left: TransformManifest['classes'][string],
  right: TransformManifest['classes'][string]
): number {
  return compareText(left.id, right.id) || compareText(left.sourceClassName, right.sourceClassName);
}

/**
 * 使用不依赖运行环境 locale 的字典序比较文本。
 *
 * @param left - 左侧文本。
 * @param right - 右侧文本。
 * @returns 标准负数、零或正数 comparator 结果。
 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * 统计 unsafe selector reason 分布。
 *
 * @param diagnostics - core diagnostics。
 * @returns reason 到出现次数的 record；忽略非 unsafe 或缺失 reason 的项。
 */
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

/**
 * 创建高风险文件摘要。
 *
 * @param modules - 当前构建的模块快照。
 * @returns 最多十个存在 unsafe/preserved 信号的模块，优先 unsafe 数量再按 preserved bytes 排序。
 */
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

/**
 * 计算 atomic declaration 复用率。
 *
 * @param report - core 聚合 report。
 * @returns 四位小数比例；没有 declaration 时返回 0。
 */
function createReuseRatio(report: TransformReport): number {
  const total = report.summary.atomicDeclarations + report.summary.reusedAtomicDeclarations;
  return total === 0 ? 0 : roundRatio(report.summary.reusedAtomicDeclarations / total);
}

/**
 * 创建真实项目试用健康度摘要。
 *
 * @param input - unsupported、fallback、体积和 conflict 风险信号。
 * @returns unsupported 存在时 blocked；其他风险存在时 risky；否则 ready。
 */
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

/**
 * 计算 UTF-8 字节数。
 *
 * @param value - 要测量的 CSS 文本。
 * @returns Node Buffer 计算的 UTF-8 字节长度。
 */
function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/**
 * 计算 CSS 压缩后字节数。
 *
 * @param value - 要压缩的 CSS 文本。
 * @param format - gzip 或 brotli。
 * @returns Node 同步压缩结果字节长度。
 */
function compressedLength(value: string, format: 'gzip' | 'brotli'): number {
  return format === 'gzip' ? gzipSync(value).byteLength : brotliCompressSync(value).byteLength;
}

/**
 * 把比例稳定到四位小数。
 *
 * @param value - 原始浮点比例。
 * @returns 四位小数精度的数值。
 */
function roundRatio(value: number): number {
  return Math.round(value * 10000) / 10000;
}
