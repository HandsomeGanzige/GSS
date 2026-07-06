/** 使用 FNV-1a 生成稳定短 hash，避免 core 依赖 Node crypto 或浏览器 API。 */
export function hashString(input: string, length = 8): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36).padStart(length, '0').slice(0, length);
}
