/**
 * 与构建工具无关的安全 CSS 转换引擎。
 *
 * @remarks
 * 本包只接收标准 CSS 字符串和调用方提供的 class scope strategy，负责生成 atomic CSS、
 * preserved fallback、class mapping、manifest 与 report。文件读取、CSS Modules tokens、
 * HMR 和 asset emit 均属于 adapter 职责。
 *
 * `transformCss` 用于单次无状态转换；`createTransformer` 用于一次 append-only build 中的
 * 跨文件 atomic declaration 复用。无法证明安全的 selector 或 declaration 会被保留，
 * 不会为了提高 atomization rate 改变 CSS 语义。
 *
 * @packageDocumentation
 */
export { createTransformer } from './engine/createTransformer.js';
export { transformCss } from './engine/transformCss.js';
export type {
  AtomicClassNameOptions,
  AtomicClassNameStrategy,
  AtomicDeclaration,
  AtomicKeyInput,
  AtomicManifestEntry,
  ClassPreservationReason,
  ClassManifestEntry,
  CssTransformContext,
  DeclarationAnalysis,
  DeclarationMeta,
  Diagnostic,
  DiagnosticCode,
  DiagnosticLevel,
  PreservedDeclarationReason,
  ResolveClassNameContext,
  ScopeStrategy,
  SelectorAnalysis,
  SourceLocation,
  TransformClassMapping,
  TransformCssInput,
  TransformCssOptions,
  TransformCssResult,
  TransformManifest,
  TransformReport,
  Transformer,
  UnsafeSelectorReason
} from './public/types.js';
