/**
 * PostCSS declaration 到 core IR declaration 的适配模块。
 *
 * @module core/declaration/toDeclarationMeta
 */
import type { Declaration } from 'postcss';
import type { DeclarationMeta } from '../public/types.js';
import { toSourceLocation } from '../ast/sourceLocation.js';

/**
 * 将 PostCSS declaration 转换为 parser 无关的 metadata。
 *
 * @param id - 当前输入的稳定来源标识。
 * @param declaration - PostCSS declaration node。
 * @returns 保留 prop、value、important 与 source location 的 declaration metadata。
 */
export function toDeclarationMeta(id: string, declaration: Declaration): DeclarationMeta {
  return {
    prop: declaration.prop,
    value: declaration.value,
    important: declaration.important,
    source: toSourceLocation(id, declaration)
  };
}
