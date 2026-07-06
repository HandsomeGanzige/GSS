import type { AtomicClassNameOptions, AtomicKeyInput } from '../public/types.js';
import { hashString } from '../utils/hash.js';
import { ensureValidClassName, sanitizeClassNamePart } from '../utils/sanitize.js';
import { createAtomicKey } from './createAtomicKey.js';

/** 按配置生成 atomic class name 候选值，collision 由 registry 统一消除。 */
export function createAtomicClassName(input: AtomicKeyInput, options: Required<AtomicClassNameOptions>): string {
  const key = createAtomicKey(input);

  if (options.strategy === 'hash') {
    return ensureValidClassName(`${options.prefix}${hashString(key)}`);
  }

  const parts = [
    input.context.media ? `media_${hashString(input.context.media, 6)}` : undefined,
    input.context.supports ? `supports_${hashString(input.context.supports, 6)}` : undefined,
    input.context.pseudo ? sanitizeClassNamePart(input.context.pseudo.replace(/^:/, '')) : undefined,
    sanitizeClassNamePart(input.declaration.prop),
    sanitizeClassNamePart(input.declaration.value),
    input.declaration.important ? 'important' : undefined
  ].filter(Boolean);

  return ensureValidClassName(`${options.prefix}${parts.join('_')}`);
}
