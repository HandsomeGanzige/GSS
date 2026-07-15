/**
 * 将 PostCSS AST 收集为 parser 无关的 core IR。
 *
 * @remarks
 * 本模块只把已验证的 `@media` 和 `@supports` 递归为可分析上下文；其他 at-rule 与 nested rule
 * 保留原始 CSS 和顺序证据，交给后续 fallback pipeline。
 *
 * @module core/ast/collectIr
 */
import type { AtRule, ChildNode, Container, Root, Rule } from 'postcss';
import type { CssTransformContext, Diagnostic } from '../public/types.js';
import type { CssIr, CssRuleRecord, PreservedBlock } from '../ir/types.js';
import { toDeclarationMeta } from '../declaration/toDeclarationMeta.js';
import { toSourceLocation } from './sourceLocation.js';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import { unsupportedAtRuleMessage } from '../diagnostics/messages.js';

/**
 * 从 PostCSS AST 收集 core 自有 IR。
 *
 * @param id - 当前输入的稳定来源标识。
 * @param root - 已成功解析的 PostCSS root。
 * @returns parser 无关的 IR，以及收集阶段产生的 unsupported at-rule diagnostics。
 */
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

/**
 * 递归遍历 root 或 at-rule 容器。
 *
 * @param id - 当前输入 id。
 * @param container - 当前 PostCSS 容器。
 * @param context - 从父级继承的条件上下文。
 * @param rules - 按源码顺序写入的 rule IR 集合。
 * @param preservedBlocks - 无法结构化转换的 CSS block 集合。
 * @param diagnostics - 收集阶段的可变 diagnostic 集合。
 * @param order - 跨 rule/block 共享的单调递增源码顺序。
 */
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

/**
 * 处理单个 at-rule。
 *
 * @remarks
 * `@media` 与 `@supports` 进入递归上下文；其他 at-rule 整块保留并产生 info diagnostic，
 * 避免未建模语义被部分转换。
 *
 * @param id - 当前输入 id。
 * @param atRule - 当前 PostCSS at-rule。
 * @param context - 父级条件上下文。
 * @param rules - 可分析 rule 输出集合。
 * @param preservedBlocks - fallback block 输出集合。
 * @param diagnostics - diagnostic 输出集合。
 * @param order - 共享源码顺序计数器。
 */
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

/**
 * 构造一条 rule IR。
 *
 * @param id - 当前输入 id。
 * @param rule - PostCSS rule。
 * @param context - rule 所处条件上下文。
 * @param order - rule 的稳定源码顺序。
 * @returns 包含结构化 declarations、原始 CSS、位置和 nested 标记的 rule record。
 */
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

/**
 * 合并嵌套的条件上下文。
 *
 * @param context - 已存在的父级上下文。
 * @param name - 当前已支持 at-rule 名称。
 * @param params - 当前 at-rule 参数。
 * @returns 新上下文；嵌套条件使用显式 `and` 组合并参与 atomic key。
 */
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
