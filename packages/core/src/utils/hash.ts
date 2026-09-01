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
  const hash = fingerprintString32(input);

  return hash.toString(36).padStart(length, '0').slice(0, length);
}

/**
 * 使用 FNV-1a 生成稳定的无符号 32-bit fingerprint。
 *
 * @remarks
 * 按 JavaScript UTF-16 code unit 遍历，并用 `Math.imul` 保留现有 32-bit 溢出语义。
 * `hashString` 与 compact 共用该 fingerprint，避免两套实现随时间漂移。
 *
 * @param input - 要 fingerprint 的文本。
 * @returns 无符号 32-bit fingerprint。
 */
export function fingerprintString32(input: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/**
 * 使用 FNV-1a 生成固定 128-bit fingerprint，并编码为 25 位 lower-base36。
 *
 * @remarks
 * readable-keyed 会在相互隔离的 css-loader registry 中独立选名，不能依赖全局 registry
 * 的碰撞 suffix。128-bit 摘要显著降低短摘要碰撞概率；最终 registry 与 adapter closure
 * 校验仍负责在极端碰撞时 fail fast。
 *
 * @param input - 要 fingerprint 的完整 canonical atomic key。
 * @returns 固定 25 字符 lower-base36 fingerprint。
 */
export function keyedHashString(input: string): string {
  const mask = (1n << 128n) - 1n;
  let hash = 0x6c62272e07bb014262b821756295c58dn;

  for (let index = 0; index < input.length; index++) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * 0x0000000001000000000000000000013bn) & mask;
  }

  return hash.toString(36).padStart(25, '0');
}

/**
 * 把无符号 32-bit fingerprint 编码为固定 7 字符 lower-base36 CSS-safe token。
 *
 * @remarks
 * u32 的 7 位 base36 首位只可能是 `0` 或 `1`；将其可逆映射为 `a` 或 `b`，既完整覆盖
 * 2^32 空间，又让无 prefix 的结果始终是合法 CSS identifier。
 *
 * @param fingerprint - 任意 number；先按无符号 32-bit 归一化。
 * @returns 匹配 `[ab][0-9a-z]{6}` 的固定长度编码。
 */
export function encodeCompactFingerprint(fingerprint: number): string {
  const base36 = (fingerprint >>> 0).toString(36).padStart(7, '0');
  const first = base36[0];

  if (first !== '0' && first !== '1') {
    throw new Error(`Unexpected 32-bit base36 prefix "${first}".`);
  }

  return `${first === '0' ? 'a' : 'b'}${base36.slice(1)}`;
}

/**
 * 生成 atomic compact 策略使用的 32-bit、7 字符稳定 token。
 *
 * @param input - 完整 canonical atomic key。
 * @returns CSS identifier 可直接使用的 compact token。
 */
export function compactHashString(input: string): string {
  return encodeCompactFingerprint(fingerprintString32(input));
}
