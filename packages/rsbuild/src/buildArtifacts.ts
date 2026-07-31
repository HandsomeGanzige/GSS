/**
 * Rsbuild build collector、稳定聚合与 manifest/report 生成。
 *
 * @module rsbuild/buildArtifacts
 */
import {
  createTransformer,
  type AtomicDeclaration,
  type SourceLocation,
  type TransformCssOptions,
  type TransformCssResult,
  type TransformManifest,
  type TransformReport
} from '@semantic-atomic-css/core';
import { analyzeBuild, type BuildAnalysis } from '@semantic-atomic-css/analyzer';
import { renderAtomicDeclarations } from './atomicCss.js';
import type { CompiledCssInput, RuntimeBridgeResult } from './runtimeBridgeLoader.js';

/** 单个 Rsbuild environment 独立维护的本轮编译状态。 */
export type EnvironmentBuildState = {
  isDev: boolean;
  inputs: Map<string, CompiledCssInput>;
  bridgeResults: Map<string, RuntimeBridgeResult>;
};

/** 可直接 emit 的一次稳定 build 快照。 */
export type BuildArtifactSnapshot = {
  atomicCss: string;
  outputCss: string;
  manifest: TransformManifest;
  report: TransformReport & { analysis: BuildAnalysis };
  transforms: Array<{ input: CompiledCssInput; transform: TransformCssResult }>;
};

/** 创建空 environment state。 */
export function createEnvironmentBuildState(isDev: boolean): EnvironmentBuildState {
  return {
    isDev,
    inputs: new Map(),
    bridgeResults: new Map()
  };
}

/** 每轮 compilation 前清理结果，避免 watch/dev 复用已移除 module 的 stale state。 */
export function resetEnvironmentBuildState(state: EnvironmentBuildState): void {
  state.inputs.clear();
  state.bridgeResults.clear();
}

/**
 * 合并 loader 回传结果；同一 row 被多个 composes/import 路径观察时合并 export/preserve evidence。
 */
export function recordRuntimeBridgeResult(state: EnvironmentBuildState, result: RuntimeBridgeResult): void {
  state.bridgeResults.set(result.resourcePath, result);

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
    current.preserveClassNames = {
      ...current.preserveClassNames,
      ...input.preserveClassNames
    };
  }
}

/**
 * 按 source id 排序后使用单一 core transformer 聚合，保证跨文件 atomic reuse 和输出顺序可复现。
 */
export function createBuildArtifactSnapshot(
  state: EnvironmentBuildState,
  coreOptions: TransformCssOptions
): BuildArtifactSnapshot {
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
  const atomicCss = renderAtomicDeclarations(collectAtomicDeclarations(transforms.map(({ transform }) => transform)));
  const outputCss = joinCss([atomicCss, ...transforms.map(({ transform }) => transform.css.preserved)]);
  const manifest = stabilizeManifest(transformer.getManifest());
  const baseReport = stabilizeReport(transformer.getReport());
  const modules = transforms.map(({ input, transform }) => ({
    id: input.id,
    sourceCss: input.scopedCss,
    scopedCss: input.scopedCss,
    atomicCss: transform.css.atomic,
    preservedCss: transform.css.preserved,
    diagnostics: transform.diagnostics
  }));
  const report = {
    ...baseReport,
    analysis: analyzeBuild({
      report: baseReport,
      manifest,
      modules,
      outputCss
    })
  };

  return { atomicCss, outputCss, manifest, report, transforms };
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
