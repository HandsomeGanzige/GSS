/**
 * css-loader adapters 共用的 build collector、稳定聚合与 manifest/report 生成。
 *
 * @module css-loader-bridge/buildArtifacts
 */
import {
  createTransformer,
  type AtomicDeclaration,
  type ClassPreservationReason,
  type SourceLocation,
  type TransformCssOptions,
  type TransformCssResult,
  type TransformManifest,
  type TransformReport
} from '@semantic-atomic-css/core';
import { analyzeBuild, type BuildAnalysis } from '@semantic-atomic-css/analyzer';
import { renderAtomicDeclarations } from './atomicCss.js';
import type { CompiledCssInput } from './cssLoaderExport.js';

/** adapter 回传的最小 compiled result；额外字段由具体 adapter 自己持有。 */
export type CssLoaderBridgeResult = {
  resourcePath: string;
  inputs: CompiledCssInput[];
  /** loader 实际追加到 tokens 的 atomic key/class，用于最终 CSS 闭合校验。 */
  atomicClassByKey?: Record<string, string>;
  /** adapter 可以携带本共享 collector 不读取的结构化字段。 */
  [key: string]: unknown;
};

/** 单个 adapter environment 独立维护的本轮编译状态。 */
export type EnvironmentBuildState = {
  isDev: boolean;
  inputs: Map<string, CompiledCssInput>;
  atomicClassByKey: Map<string, string>;
};

/** 可直接 emit 的一次稳定 build 快照。 */
export type BuildArtifactSnapshot = {
  atomicCss: string;
  outputCss: string;
  manifest: TransformManifest;
  report: TransformReport & { analysis: BuildAnalysis };
  transforms: Array<{ input: CompiledCssInput; transform: TransformCssResult }>;
};

/** build 调用方实际需要的 metadata；report 分析会在内部共享 manifest。 */
export type BuildArtifactMetadataSelection = {
  manifest: boolean;
  report: boolean;
};

/** 按配置生成的 build 快照，未请求的 metadata 不会触发 Core finalization。 */
export type SelectedBuildArtifactSnapshot = Omit<
  BuildArtifactSnapshot,
  'manifest' | 'outputCss' | 'report'
> & {
  outputCss?: string;
  manifest?: TransformManifest;
  report?: TransformReport & { analysis: BuildAnalysis };
};

/** 创建空 environment state。 */
export function createEnvironmentBuildState(isDev: boolean): EnvironmentBuildState {
  return {
    isDev,
    inputs: new Map(),
    atomicClassByKey: new Map()
  };
}

/** 每轮 compilation 前清理结果，避免 watch/dev 复用已移除 module 的 stale state。 */
export function resetEnvironmentBuildState(state: EnvironmentBuildState): void {
  state.inputs.clear();
  state.atomicClassByKey.clear();
}

/**
 * 合并 loader 回传结果；同一 row 被多个 composes/import 路径观察时合并 export/preserve evidence。
 */
export function recordRuntimeBridgeResult(state: EnvironmentBuildState, result: CssLoaderBridgeResult): void {
  for (const [key, className] of Object.entries(result.atomicClassByKey ?? {})) {
    const current = state.atomicClassByKey.get(key);
    if (current && current !== className) {
      throw new Error(`[semantic-atomic-css] unstable-loader-atomic-class key=${key} first=${current} next=${className}`);
    }
    state.atomicClassByKey.set(key, className);
  }

  for (const input of result.inputs) {
    const current = state.inputs.get(input.id);
    if (!current) {
      state.inputs.set(input.id, cloneInput(input));
      continue;
    }

    if (current.scopedCss !== input.scopedCss) {
      throw new Error(
        `[semantic-atomic-css] unstable-compiled-css id=${input.id} reason=同一编译内观察到不同 scoped CSS。`
      );
    }

    current.exportedClassNames = [...new Set([...current.exportedClassNames, ...input.exportedClassNames])].sort(
      compareText
    );
    for (const [className, reason] of Object.entries(input.preserveClassNames)) {
      current.preserveClassNames[className] = selectPreservationReason(
        current.preserveClassNames[className],
        reason
      );
    }
  }
}

/**
 * 按 source id 的 canonical 全局顺序使用单一 core transformer 聚合。
 * 跨模块同权重冲突遵循该 atomic 顺序，不继承业务 CSS 的偶然 import 顺序。
 */
export function createBuildArtifactSnapshot(
  state: EnvironmentBuildState,
  coreOptions: TransformCssOptions
): BuildArtifactSnapshot;
export function createBuildArtifactSnapshot(
  state: EnvironmentBuildState,
  coreOptions: TransformCssOptions,
  metadata: BuildArtifactMetadataSelection
): SelectedBuildArtifactSnapshot;
export function createBuildArtifactSnapshot(
  state: EnvironmentBuildState,
  coreOptions: TransformCssOptions,
  metadata?: BuildArtifactMetadataSelection
): BuildArtifactSnapshot | SelectedBuildArtifactSnapshot {
  const transformer = createTransformer(coreOptions);
  const inputs = [...state.inputs.values()].sort((left, right) => compareText(left.id, right.id));
  const transforms = inputs.map((input) => ({
    input,
    transform: transformer.transformCss({
      id: input.id,
      css: input.scopedCss,
      scope: {
        resolveClassName: (className) => className,
        shouldExportClassName: (className) => input.exportedClassNames.includes(className)
      },
      preserveClassNames: input.preserveClassNames
    })
  }));
  validateAtomicTokenClosure(state.atomicClassByKey, transforms.map(({ transform }) => transform));
  const atomicCss = renderAtomicDeclarations(collectAtomicDeclarations(transforms.map(({ transform }) => transform)));
  const includeManifest = metadata?.manifest ?? true;
  const includeReport = metadata?.report ?? true;
  const outputCss = includeReport
    ? joinCss([atomicCss, ...transforms.map(({ transform }) => transform.css.preserved)])
    : undefined;
  const finalizedManifest = includeManifest || includeReport
    ? stabilizeManifest(transformer.getManifest())
    : undefined;
  const report = includeReport && finalizedManifest && outputCss !== undefined
    ? createAnalyzedReport(transformer.getReport(), finalizedManifest, transforms, outputCss)
    : undefined;

  return {
    atomicCss,
    transforms,
    ...(outputCss !== undefined ? { outputCss } : {}),
    ...(includeManifest && finalizedManifest ? { manifest: finalizedManifest } : {}),
    ...(report ? { report } : {})
  };
}

/** 只在 report 被请求时稳定 Core report 并运行 Analyzer。 */
function createAnalyzedReport(
  report: TransformReport,
  manifest: TransformManifest,
  transforms: Array<{ input: CompiledCssInput; transform: TransformCssResult }>,
  outputCss: string
): TransformReport & { analysis: BuildAnalysis } {
  const baseReport = stabilizeReport(report);
  const modules = transforms.map(({ input, transform }) => ({
    id: input.id,
    sourceCss: input.scopedCss,
    scopedCss: input.scopedCss,
    atomicCss: transform.css.atomic,
    preservedCss: transform.css.preserved,
    diagnostics: transform.diagnostics
  }));

  return {
    ...baseReport,
    analysis: analyzeBuild({
      report: baseReport,
      manifest,
      modules,
      outputCss
    })
  };
}

/** 确保 loader 已追加的每个 token class 与最终全局 registry 完全一致。 */
function validateAtomicTokenClosure(
  selected: ReadonlyMap<string, string>,
  transforms: TransformCssResult[]
): void {
  const finalByKey = new Map<string, string>();
  const keyByClass = new Map<string, string>();
  for (const transform of transforms) {
    for (const declaration of transform.atomic) {
      finalByKey.set(declaration.key, declaration.className);
      const currentKey = keyByClass.get(declaration.className);
      if (currentKey && currentKey !== declaration.key) {
        throw new Error(`[semantic-atomic-css] atomic-class-key-collision class=${declaration.className}`);
      }
      keyByClass.set(declaration.className, declaration.key);
    }
  }
  for (const [key, className] of selected) {
    const finalClassName = finalByKey.get(key);
    if (finalClassName !== className) {
      throw new Error(`[semantic-atomic-css] atomic-token-css-closure key=${key} token=${className} css=${finalClassName ?? 'missing'}`);
    }
  }
}

/** 按首次出现的 atomic key 去重多个 module 结果。 */
function collectAtomicDeclarations(transforms: TransformCssResult[]): AtomicDeclaration[] {
  const declarations = new Map<string, AtomicDeclaration>();
  for (const transform of transforms) {
    for (const declaration of transform.atomic) {
      if (!declarations.has(declaration.key)) {
        declarations.set(declaration.key, declaration);
      }
    }
  }
  return [...declarations.values()];
}

/** 规范化 manifest 的对象键、sources 与 unsafe reasons。 */
function stabilizeManifest(manifest: TransformManifest): TransformManifest {
  const atomic = Object.fromEntries(
    Object.entries(manifest.atomic)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => {
        const sources = [...entry.sources].sort(compareSourceLocation);
        return [
          key,
          {
            ...entry,
            selector: { ...entry.selector },
            declaration: {
              ...entry.declaration,
              source: sources[0] ? { ...sources[0] } : entry.declaration.source
            },
            context: { ...entry.context },
            sources: sources.map((source) => ({ ...source }))
          }
        ];
      })
  );
  const classes = Object.fromEntries(
    Object.entries(manifest.classes)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, entry]) => [
        key,
        {
          ...entry,
          atomicClassNames: [...entry.atomicClassNames],
          unsafeReasons: entry.unsafeReasons ? [...entry.unsafeReasons].sort(compareText) : undefined
        }
      ])
  );
  return { atomic, classes };
}

/** 规范化 report diagnostics，避免异步 loader 完成顺序进入 JSON。 */
function stabilizeReport(report: TransformReport): TransformReport {
  return {
    ...report,
    diagnostics: [...report.diagnostics].sort((left, right) => {
      const sourceOrder = compareSourceLocation(left.source ?? { id: left.id }, right.source ?? { id: right.id });
      return (
        sourceOrder ||
        compareText(
          [left.code, left.reason ?? '', left.selector ?? '', left.sourceClassName ?? ''].join('\0'),
          [right.code, right.reason ?? '', right.selector ?? '', right.sourceClassName ?? ''].join('\0')
        )
      );
    })
  };
}

/** 深复制 loader 输入，避免不同 callback 共享可变 evidence。 */
function cloneInput(input: CompiledCssInput): CompiledCssInput {
  return {
    ...input,
    exportedClassNames: [...input.exportedClassNames],
    preserveClassNames: { ...input.preserveClassNames }
  };
}

/**
 * 合并重复 source 的 class 保留原因。
 *
 * 资源引用是直接 CSS 正确性 evidence，优先于 export 类型歧义；该固定优先级避免 loader 完成顺序
 * 改变 preserved-class diagnostic、manifest 或 report。
 */
function selectPreservationReason(
  current: ClassPreservationReason | undefined,
  next: ClassPreservationReason
): ClassPreservationReason {
  if (!current || current === next) return next;
  return current === 'asset-reference' || next === 'asset-reference'
    ? 'asset-reference'
    : 'ambiguous-export-value';
}

/** source location 稳定比较。 */
function compareSourceLocation(left: SourceLocation, right: SourceLocation): number {
  return (
    compareText(left.id, right.id) ||
    (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER) ||
    (left.column ?? Number.MAX_SAFE_INTEGER) - (right.column ?? Number.MAX_SAFE_INTEGER)
  );
}

/** 拼接非空 CSS。 */
function joinCss(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join('\n\n');
}

/** Unicode code point 稳定文本比较。 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
