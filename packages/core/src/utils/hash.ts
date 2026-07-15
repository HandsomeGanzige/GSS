/**
 * 无 Node crypto 依赖的稳定短 hash 工具。
 *
 * @module core/utils/hash
 */

/**
 * 使用 FNV-1a 生成稳定短 hash。
 *
 * @param input - 要 hash 的文本。
 * @param length - 输出字符上限，默认 8。
 * @returns base-36、左侧补零并截断后的稳定字符串。
 */
export function hashString(input: string, length = 8): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36).padStart(length, '0').slice(0, length);
}
