const encoder = new TextEncoder();

/** 计算 UTF-8 字节数，用于 size report 的稳定估算。 */
export function byteLength(value: string): number {
  return encoder.encode(value).length;
}
