/**
 * Declaration 的 safe atomization 判定模块。
 *
 * @module core/declaration/analyzeDeclaration
 */
import type { DeclarationAnalysis, DeclarationMeta } from '../public/types.js';

/**
 * 判断 declaration 是否可以安全 atomize。
 *
 * @param declaration - parser 无关的 declaration metadata。
 * @returns 普通有效属性返回 atomizable；custom property 或空属性/值返回带原因的 preserved。
 */
export function analyzeDeclaration(declaration: DeclarationMeta): DeclarationAnalysis {
  const prop = declaration.prop.trim();
  const value = declaration.value.trim();

  if (prop.length === 0 || value.length === 0) {
    return {
      kind: 'preserved',
      declaration,
      reason: 'invalid-declaration'
    };
  }

  if (prop.startsWith('--')) {
    return {
      kind: 'preserved',
      declaration,
      reason: 'custom-property-declaration'
    };
  }

  return {
    kind: 'atomizable',
    declaration
  };
}
