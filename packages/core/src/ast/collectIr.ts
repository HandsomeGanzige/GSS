import type { AtRule, ChildNode, Container, Root, Rule } from 'postcss';
import type { CssTransformContext, Diagnostic } from '../public/types.js';
import type { CssIr, CssRuleRecord, PreservedBlock } from '../ir/types.js';
import { toDeclarationMeta } from '../declaration/toDeclarationMeta.js';
import { toSourceLocation } from './sourceLocation.js';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import { unsupportedAtRuleMessage } from '../diagnostics/messages.js';

/** 从 PostCSS AST 收集 core 自有 IR，后续 pass 不再依赖 PostCSS node。 */
export function collectIr(id: string, root: Root): { ir: CssIr; diagnostics: Diagnostic[] } {
  const rules: CssRuleRecord[] = [];
  const preservedBlocks: PreservedBlock[] = [];
  const diagnostics: Diagnostic[] = [];
  const order = { value: 0 };

  collectContainer(id, root, {}, rules, preservedBlocks, diagnostics, order);

  return {
    ir: {
      id,
      rules,
      preservedBlocks
    },
    diagnostics
  };
}

/** 递归遍历 root 或 at-rule 容器，只把 @media/@supports 视为可分析上下文。 */
function collectContainer(
  id: string,
  container: Container,
  context: CssTransformContext,
  rules: CssRuleRecord[],
  preservedBlocks: PreservedBlock[],
  diagnostics: Diagnostic[],
  order: { value: number }
): void {
  for (const node of container.nodes ?? []) {
    if (node.type === 'rule') {
      rules.push(createRuleRecord(id, node, context, order.value));
      order.value += 1;
      continue;
    }

    if (node.type === 'atrule') {
      collectAtRule(id, node, context, rules, preservedBlocks, diagnostics, order);
    }
  }
}

/** 处理 at-rule，上下文类 at-rule 递归，未知 at-rule 整块保留。 */
function collectAtRule(
  id: string,
  atRule: AtRule,
  context: CssTransformContext,
  rules: CssRuleRecord[],
  preservedBlocks: PreservedBlock[],
  diagnostics: Diagnostic[],
  order: { value: number }
): void {
  const name = atRule.name.toLowerCase();

  if ((name === 'media' || name === 'supports') && atRule.nodes) {
    collectContainer(id, atRule, mergeAtRuleContext(context, name, atRule.params), rules, preservedBlocks, diagnostics, order);
    return;
  }

  preservedBlocks.push({
    id,
    order: order.value,
    css: atRule.toString(),
    context,
    reason: 'unsupported-at-rule',
    source: toSourceLocation(id, atRule)
  });
  order.value += 1;
  diagnostics.push(
    createDiagnostic({
      code: 'unsupported-at-rule',
      level: 'info',
      message: unsupportedAtRuleMessage(atRule.name),
      id,
      reason: 'unsupported-at-rule',
      source: toSourceLocation(id, atRule)
    })
  );
}

/** 构造 rule IR，并记录是否存在 nested node 以便后续保守 preserved。 */
function createRuleRecord(id: string, rule: Rule, context: CssTransformContext, order: number): CssRuleRecord {
  const declarations = (rule.nodes ?? [])
    .filter((node): node is ChildNode & { type: 'decl' } => node.type === 'decl')
    .map((declaration) => toDeclarationMeta(id, declaration));

  return {
    id,
    order,
    selector: rule.selector,
    css: rule.toString(),
    declarations,
    context,
    source: toSourceLocation(id, rule),
    hasNestedNodes: (rule.nodes ?? []).some((node) => node.type !== 'decl' && node.type !== 'comment')
  };
}

/** 合并嵌套 @media/@supports，上下文 key 会进入 atomic key。 */
function mergeAtRuleContext(context: CssTransformContext, name: string, params: string): CssTransformContext {
  if (name === 'media') {
    return {
      ...context,
      media: context.media ? `(${context.media}) and (${params})` : params
    };
  }

  return {
    ...context,
    supports: context.supports ? `(${context.supports}) and (${params})` : params
  };
}
