/**
 * Atomic class name 候选值生成模块。
 *
 * @remarks
 * 本模块只产生候选值；跨 key collision 由 AtomicRegistry 集中处理。
 *
 * @module core/atomizer/createAtomicClassName
 */
import type { AtomicClassNameOptions } from '../public/types.js';
import type { AtomicKeyInput } from './createAtomicKey.js';
import { compactHashString, hashString, keyedHashString } from '../utils/hash.js';
import { ensureValidClassName, sanitizeClassNamePart } from '../utils/sanitize.js';
import { createAtomicKey } from './createAtomicKey.js';

/**
 * 按配置生成 atomic class name 候选值。
 *
 * @param input - declaration 与完整 atomic context。
 * @param options - 已补齐的 readable/readable-keyed/hash/compact/compact-keyed 策略和 prefix。
 * @returns 符合 CSS class 起始约束的稳定候选值。
 */
export function createAtomicClassName(input: AtomicKeyInput, options: Required<AtomicClassNameOptions>): string {
  const key = createAtomicKey(input);

  if (options.strategy === 'hash') {
    return ensureValidClassName(`${options.prefix}${hashString(key)}`);
  }

  if (options.strategy === 'compact') {
    return ensureValidClassName(`${options.prefix}${compactHashString(key)}`);
  }

  if (options.strategy === 'compact-keyed') {
    // build 中相互隔离的 loader 只能根据 canonical key 独立选名；固定前缀保证摘要始终是合法 class 起始。
    return ensureValidClassName(`${options.prefix}c${keyedHashString(key)}`);
  }

  const parts = [
    input.context.media ? `media_${hashString(input.context.media, 6)}` : undefined,
    input.context.supports ? `supports_${hashString(input.context.supports, 6)}` : undefined,
    `selector_${hashString(input.selectorIdentity, 6)}`,
    sanitizeClassNamePart(input.declaration.prop),
    sanitizeClassNamePart(input.declaration.value),
    input.declaration.important ? 'important' : undefined
  ].filter(Boolean);

  const readableBase = `${options.prefix}${parts.join('_')}`;
  if (options.strategy === 'readable-keyed') {
    // 独立 loader 必须只根据完整 atomic key 生成名称，不能依赖 registry 的注册历史或短摘要碰撞。
    return ensureValidClassName(`${readableBase}_${keyedHashString(key)}`);
  }
  return ensureValidClassName(readableBase);
}
