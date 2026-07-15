/**
 * Atomic key 使用的递归稳定 JSON 序列化工具。
 *
 * @module core/utils/stableStringify
 */

/**
 * 递归稳定序列化 JSON-compatible value。
 *
 * @param value - primitive、数组或普通 record。
 * @returns 对象 key 使用字典序、数组保持原顺序的 JSON 文本。
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

  return `{${entries.join(',')}}`;
}
