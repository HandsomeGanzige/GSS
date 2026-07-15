import type {
  ClassPreservationReason,
  PreservedDeclarationReason,
  UnsafeSelectorReason
} from '../public/types.js';

/** 为 unsafe selector 生成稳定中文诊断文案。 */
export function unsafeSelectorMessage(selector: string, reason: UnsafeSelectorReason): string {
  return `选择器 "${selector}" 无法安全 atomize，已按 ${reason} 保留为 fallback CSS。`;
}

/** 为 preserved declaration 生成稳定中文诊断文案。 */
export function preservedDeclarationMessage(prop: string, reason: PreservedDeclarationReason): string {
  return `声明 "${prop}" 已按 ${reason} 保留为 fallback CSS。`;
}

/** 为 adapter 要求的 class 级保守保留生成稳定中文诊断文案。 */
export function preservedClassMessage(className: string, reason: ClassPreservationReason): string {
  return `Class "${className}" 已按 ${reason} 完整保留为 fallback CSS。`;
}

/** 为 unsupported at-rule 生成稳定中文诊断文案。 */
export function unsupportedAtRuleMessage(name: string): string {
  return `@${name} 暂不参与 core atomize，已按原始 CSS 块保留。`;
}
