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
  reason: UnsafeSelectorReason | PreservedDeclarationReason | ClassPreservationReason;
  source?: SourceLocation;
};

/** AST 收集 pass 的输出结果。 */
export type CssIr = {
  id: string;
  rules: CssRuleRecord[];
  preservedBlocks: PreservedBlock[];
};
