import type { Declaration } from 'postcss';
import type { DeclarationMeta } from '../public/types.js';
import { toSourceLocation } from '../ast/sourceLocation.js';

/** 将 PostCSS declaration 转换为 parser 无关的 DeclarationMeta。 */
export function toDeclarationMeta(id: string, declaration: Declaration): DeclarationMeta {
  return {
    prop: declaration.prop,
    value: declaration.value,
    important: declaration.important,
    source: toSourceLocation(id, declaration)
  };
}
