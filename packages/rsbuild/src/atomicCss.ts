/**
 * Rsbuild build/dev 共用的 atomic declaration 排序与渲染。
 *
 * @module rsbuild/atomicCss
 */
import type { AtomicDeclaration } from '@semantic-atomic-css/core';

/** dev runtime 只需要渲染相关字段，不把 source locations 序列化进浏览器 bundle。 */
export type RenderableAtomicDeclaration = Pick<
  AtomicDeclaration,
  'key' | 'className' | 'declaration' | 'context'
>;

/** 基础规则优先，条件规则随后，并保持已验证的简单断点覆盖顺序。 */
export function renderAtomicDeclarations(declarations: RenderableAtomicDeclaration[]): string {
  const base: RenderableAtomicDeclaration[] = [];
  const contextual: Array<{ declaration: RenderableAtomicDeclaration; order: number }> = [];

  for (const [order, declaration] of declarations.entries()) {
    if (declaration.context.media || declaration.context.supports) {
      contextual.push({ declaration, order });
    } else {
      base.push(declaration);
    }
  }

  return [...base, ...orderSimpleWidthBreakpoints(contextual).map(({ declaration }) => declaration)]
    .map(renderAtomicDeclaration)
    .join('\n\n');
}

/** 在原条件槽位内按 max-width 大到小、min-width 小到大排序。 */
function orderSimpleWidthBreakpoints(
  entries: Array<{ declaration: RenderableAtomicDeclaration; order: number }>
): Array<{ declaration: RenderableAtomicDeclaration; order: number }> {
  const maxEntries = entries
    .filter((entry) => readSimpleWidthBreakpoint(entry.declaration.context.media)?.kind === 'max')
    .sort((left, right) => compareSimpleWidthEntries(left, right, 'max'));
  const minEntries = entries
    .filter((entry) => readSimpleWidthBreakpoint(entry.declaration.context.media)?.kind === 'min')
    .sort((left, right) => compareSimpleWidthEntries(left, right, 'min'));
  let maxIndex = 0;
  let minIndex = 0;

  return entries.map((entry) => {
    const breakpoint = readSimpleWidthBreakpoint(entry.declaration.context.media);
    if (breakpoint?.kind === 'max') {
      return maxEntries[maxIndex++] ?? entry;
    }
    if (breakpoint?.kind === 'min') {
      return minEntries[minIndex++] ?? entry;
    }
    return entry;
  });
}

/** 比较同类简单断点并保留同值原始顺序。 */
function compareSimpleWidthEntries(
  left: { declaration: RenderableAtomicDeclaration; order: number },
  right: { declaration: RenderableAtomicDeclaration; order: number },
  kind: 'min' | 'max'
): number {
  const leftPixels = readSimpleWidthBreakpoint(left.declaration.context.media)?.pixels ?? 0;
  const rightPixels = readSimpleWidthBreakpoint(right.declaration.context.media)?.pixels ?? 0;
  const distance = kind === 'max' ? rightPixels - leftPixels : leftPixels - rightPixels;
  return distance || left.order - right.order;
}

/** 只识别单一 px min/max-width；复杂条件保留原相对位置。 */
function readSimpleWidthBreakpoint(media: string | undefined): { kind: 'min' | 'max'; pixels: number } | undefined {
  const match = media?.match(/^\(\s*(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/i);
  if (!match) {
    return undefined;
  }
  return {
    kind: match[1].toLowerCase() as 'min' | 'max',
    pixels: Number(match[2])
  };
}

/** 渲染单条 atomic declaration，并恢复 pseudo/supports/media。 */
function renderAtomicDeclaration(declaration: RenderableAtomicDeclaration): string {
  const selector = `.${declaration.className}${declaration.context.pseudo ?? ''}`;
  let output = [
    `${selector} {`,
    `  ${declaration.declaration.prop}: ${declaration.declaration.value}${declaration.declaration.important ? ' !important' : ''};`,
    '}'
  ].join('\n');

  if (declaration.context.supports) {
    output = `@supports ${declaration.context.supports} {\n${indentCssBlock(output)}\n}`;
  }
  if (declaration.context.media) {
    output = `@media ${declaration.context.media} {\n${indentCssBlock(output)}\n}`;
  }
  return output;
}

/** 条件 wrapper 的稳定两空格缩进。 */
function indentCssBlock(css: string): string {
  return css.split('\n').map((line) => `  ${line}`).join('\n');
}
