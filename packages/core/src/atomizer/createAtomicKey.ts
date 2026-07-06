import type { AtomicKeyInput } from '../public/types.js';
import { stableStringify } from '../utils/stableStringify.js';

/** 基于 declaration 和上下文生成 atomic key，key 是复用判断的唯一依据。 */
export function createAtomicKey(input: AtomicKeyInput): string {
  return stableStringify({
    prop: input.declaration.prop.trim().toLowerCase(),
    value: input.declaration.value.trim(),
    important: input.declaration.important,
    pseudo: input.context.pseudo,
    media: input.context.media,
    supports: input.context.supports
  });
}
