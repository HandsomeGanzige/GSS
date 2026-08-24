/**
 * Atomic declaration 语义 identity 生成模块。
 *
 * @module core/atomizer/createAtomicKey
 */
import type { CssTransformContext, DeclarationMeta } from '../public/types.js';
import { stableStringify } from '../utils/stableStringify.js';

/** registry 与 class name 生成共享的 atomic 身份输入。 */
export type AtomicKeyInput = {
  declaration: DeclarationMeta;
  selectorIdentity: string;
  context: CssTransformContext;
};

/**
 * 基于 declaration 和上下文生成 atomic key。
 *
 * @param input - declaration、selector identity 与条件上下文。
 * @returns 稳定序列化 key；它是 registry 复用判断的唯一依据。
 */
export function createAtomicKey(input: AtomicKeyInput): string {
  return stableStringify({
    prop: input.declaration.prop.trim().toLowerCase(),
    value: input.declaration.value.trim(),
    important: input.declaration.important === true,
    selectorIdentity: input.selectorIdentity,
    media: input.context.media ?? null,
    supports: input.context.supports ?? null
  });
}
