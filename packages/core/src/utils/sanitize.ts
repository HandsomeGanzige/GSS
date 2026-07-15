/**
 * Readable atomic class name 的 CSS 文本清理工具。
 *
 * @module core/utils/sanitize
 */

/**
 * 把任意 CSS 片段转换为可读 class name 片段。
 *
 * @param value - 属性、值或 pseudo 文本。
 * @returns 小写、去重下划线且不为空的可读片段。
 */
export function sanitizeClassNamePart(value: string): string {
  const normalized = value
    .trim()
    .replace(/!important/g, 'important')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  return normalized.length > 0 ? normalized : 'value';
}

/**
 * 修复非法的 CSS class 起始字符。
 *
 * @param value - atomic class name 候选值。
 * @returns 数字或负数字开头时增加下划线，否则原样返回。
 */
export function ensureValidClassName(value: string): string {
  if (/^-?\d/.test(value)) {
    return `_${value}`;
  }

  return value;
}
