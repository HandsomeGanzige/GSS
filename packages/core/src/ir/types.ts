/**
 * Core AST collection 与 transform pipeline 之间的内部 IR 类型。
 *
 * @remarks
 * IR 隔离 PostCSS node，保留源码顺序、位置、原 CSS 和 fallback reason，避免后续 pass 依赖 parser。
 *
 * @module core/ir/types
 */
import type {
  ClassPreservationReason,
  CssTransformContext,
  DeclarationMeta,
  PreservedDeclarationReason,
  SourceLocation,
  UnsafeSelectorReason
} from '../public/types.js';

/**
 * pipeline 内部用于 class-wide fallback 的原因。
 *
 * @remarks
 * unsupported block 不属于 public selector taxonomy，因此该 union 不得写入
 * class mapping 的 `unsafeReasons` 或公开 diagnostic reason 枚举。
 */
export type InputPreservationReason = UnsafeSelectorReason | PreservedBlock['reason'];

/** 从 CSS AST 收集出的 rule 记录，是 selector/declaration pass 的输入。 */
export type CssRuleRecord = {
  id: string;
  order: number;
  selector: string;
  css: string;
  declarations: DeclarationMeta[];
  context: CssTransformContext;
  source?: SourceLocation;
  hasNestedNodes: boolean;
};

/** 无法结构化转换的 CSS 块，render 阶段按稳定格式保留。 */
export type PreservedBlock = {
  id: string;
  order: number;
  css: string;
  context: CssTransformContext;
  reason: 'unsupported-at-rule' | 'nested-rule' | 'unknown';
  source?: SourceLocation;
};

/** preserved rule 的结构化表示，包含已经 scoped 的 selector。 */
export type PreservedRule = {
  id: string;
  order: number;
  selector: string;
  scopedSelector: string;
  declarations: DeclarationMeta[];
  context: CssTransformContext;
  reason: PreservedDeclarationReason | ClassPreservationReason | InputPreservationReason;
  source?: SourceLocation;
};

/** AST 收集 pass 的输出结果。 */
export type CssIr = {
  id: string;
  rules: CssRuleRecord[];
  preservedBlocks: PreservedBlock[];
};
