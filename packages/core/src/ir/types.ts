import type {
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
  reason: UnsafeSelectorReason | PreservedDeclarationReason;
  source?: SourceLocation;
};

/** AST 收集 pass 的输出结果。 */
export type CssIr = {
  id: string;
  rules: CssRuleRecord[];
  preservedBlocks: PreservedBlock[];
};
