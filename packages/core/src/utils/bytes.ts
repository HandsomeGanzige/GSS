/**
 * 与运行平台无关的 UTF-8 字节计数工具。
 *
 * @module core/utils/bytes
 */
const encoder = new TextEncoder();

/**
 * 计算文本的 UTF-8 字节数。
 *
 * @param value - 要测量的字符串。
 * @returns TextEncoder 编码后的字节长度。
 */
export function byteLength(value: string): number {
  return encoder.encode(value).length;
}
