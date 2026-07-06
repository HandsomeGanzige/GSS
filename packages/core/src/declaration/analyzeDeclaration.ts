import type { DeclarationAnalysis, DeclarationMeta } from '../public/types.js';

/** 判断 declaration 是否可以安全 atomize，无法证明安全时返回 preserved。 */
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
