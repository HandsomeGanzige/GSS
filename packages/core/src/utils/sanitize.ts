/** 把任意 CSS 片段转换为可读 atomic class 片段。 */
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

/** 确保 class name 不以数字或连字符数字开头，避免生成非法 selector。 */
export function ensureValidClassName(value: string): string {
  if (/^-?\d/.test(value)) {
    return `_${value}`;
  }

  return value;
}
