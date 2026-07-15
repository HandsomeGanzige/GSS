/**
 * Core diagnostics 的中文展示文案模块。
 *
 * @remarks
 * 调用方应依赖 diagnostic code/reason 而不是解析这些自然语言文本。
 *
 * @module core/diagnostics/messages
 */
import type {
  ClassPreservationReason,
  PreservedDeclarationReason,
  UnsafeSelectorReason
} from '../public/types.js';

/**
 * 生成为 unsafe selector 保留 fallback 的文案。
 *
 * @param selector - 原 selector。
 * @param reason - 稳定 unsafe reason。
 * @returns 面向开发者的中文说明。
 */
export function unsafeSelectorMessage(selector: string, reason: UnsafeSelectorReason): string {
  return `选择器 "${selector}" 无法安全 atomize，已按 ${reason} 保留为 fallback CSS。`;
}

/**
 * 生成为 declaration 保留 fallback 的文案。
 *
 * @param prop - declaration 属性名。
 * @param reason - preserved reason。
 * @returns 面向开发者的中文说明。
 */
export function preservedDeclarationMessage(prop: string, reason: PreservedDeclarationReason): string {
  return `声明 "${prop}" 已按 ${reason} 保留为 fallback CSS。`;
}

/**
 * 生成 adapter class 级保留文案。
 *
 * @param className - 被完整保留的 source class。
 * @param reason - adapter 提供的稳定原因。
 * @returns 面向开发者的中文说明。
 */
export function preservedClassMessage(className: string, reason: ClassPreservationReason): string {
  return `Class "${className}" 已按 ${reason} 完整保留为 fallback CSS。`;
}

/**
 * 生成 unsupported at-rule 保留文案。
 *
 * @param name - 不含 `@` 的 at-rule 名称。
 * @returns 面向开发者的中文说明。
 */
export function unsupportedAtRuleMessage(name: string): string {
  return `@${name} 暂不参与 core atomize，已按原始 CSS 块保留。`;
}
