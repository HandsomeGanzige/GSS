/**
 * Atomic class name 候选值生成模块。
 *
 * @remarks
 * 本模块只产生候选值；跨 key collision 由 AtomicRegistry 集中处理。
 *
 * @module core/atomizer/createAtomicClassName
 */
import type { AtomicClassNameOptions, AtomicKeyInput } from '../public/types.js';
import { hashString } from '../utils/hash.js';
import { ensureValidClassName, sanitizeClassNamePart } from '../utils/sanitize.js';
import { createAtomicKey } from './createAtomicKey.js';

/**
 * 按配置生成 atomic class name 候选值。
 *
 * @param input - declaration 与完整 atomic context。
 * @param options - 已补齐的 readable/hash 策略和 prefix。
 * @returns 符合 CSS class 起始约束的稳定候选值。
 */
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
