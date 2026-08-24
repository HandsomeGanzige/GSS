/**
 * Attribute same-class guard 使用的 declaration property 关系判定。
 *
 * @module core/declaration/classifyPropertyCompetition
 */

/** 两个 declaration property 对同一 computed property slot 的关系。 */
export type PropertyCompetition = 'same-property' | 'shorthand-longhand' | 'disjoint' | 'unknown';

/**
 * 判断两个 property 是否可能竞争。
 *
 * @remarks
 * custom property 使用区分大小写的独立命名空间。普通属性只对已登记的 shorthand、longhand
 * 与独立属性给出证明；未知属性不猜测其是否为 shorthand，由调用方保守 fallback。
 */
export function classifyPropertyCompetition(left: string, right: string): PropertyCompetition {
  const normalizedLeft = normalizeProperty(left);
  const normalizedRight = normalizeProperty(right);

  if (!normalizedLeft || !normalizedRight) {
    return 'unknown';
  }

  if (normalizedLeft === normalizedRight) {
    return 'same-property';
  }

  if (isCustomProperty(normalizedLeft) || isCustomProperty(normalizedRight)) {
    return 'disjoint';
  }

  const leftSlots = propertySlots[normalizedLeft];
  const rightSlots = propertySlots[normalizedRight];

  if (leftSlots && rightSlots) {
    return intersects(leftSlots, rightSlots) ? 'shorthand-longhand' : 'disjoint';
  }

  if (
    (leftSlots && independentProperties.has(normalizedRight)) ||
    (rightSlots && independentProperties.has(normalizedLeft)) ||
    (independentProperties.has(normalizedLeft) && independentProperties.has(normalizedRight))
  ) {
    return 'disjoint';
  }

  return 'unknown';
}

/** 常用 shorthand 展开的最终 property slots；相交即存在覆盖关系。 */
const propertySlots: Readonly<Record<string, readonly string[]>> = {
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  'margin-top': ['margin-top'],
  'margin-right': ['margin-right'],
  'margin-bottom': ['margin-bottom'],
  'margin-left': ['margin-left'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  'padding-top': ['padding-top'],
  'padding-right': ['padding-right'],
  'padding-bottom': ['padding-bottom'],
  'padding-left': ['padding-left'],
  border: [
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'border-top-style',
    'border-right-style',
    'border-bottom-style',
    'border-left-style',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color'
  ],
  'border-top': ['border-top-width', 'border-top-style', 'border-top-color'],
  'border-right': ['border-right-width', 'border-right-style', 'border-right-color'],
  'border-bottom': ['border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
  'border-left': ['border-left-width', 'border-left-style', 'border-left-color'],
  'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
  'border-style': ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
  'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  'border-top-width': ['border-top-width'],
  'border-right-width': ['border-right-width'],
  'border-bottom-width': ['border-bottom-width'],
  'border-left-width': ['border-left-width'],
  'border-top-style': ['border-top-style'],
  'border-right-style': ['border-right-style'],
  'border-bottom-style': ['border-bottom-style'],
  'border-left-style': ['border-left-style'],
  'border-top-color': ['border-top-color'],
  'border-right-color': ['border-right-color'],
  'border-bottom-color': ['border-bottom-color'],
  'border-left-color': ['border-left-color'],
  background: [
    'background-color',
    'background-image',
    'background-position',
    'background-size',
    'background-repeat',
    'background-origin',
    'background-clip',
    'background-attachment'
  ],
  'background-color': ['background-color'],
  'background-image': ['background-image'],
  'background-position': ['background-position'],
  'background-size': ['background-size'],
  'background-repeat': ['background-repeat'],
  'background-origin': ['background-origin'],
  'background-clip': ['background-clip'],
  'background-attachment': ['background-attachment'],
  font: [
    'font-family',
    'font-size',
    'font-style',
    'font-variant',
    'font-weight',
    'font-stretch',
    'line-height'
  ],
  'font-family': ['font-family'],
  'font-size': ['font-size'],
  'font-style': ['font-style'],
  'font-variant': ['font-variant'],
  'font-weight': ['font-weight'],
  'font-stretch': ['font-stretch'],
  'line-height': ['line-height'],
  outline: ['outline-color', 'outline-style', 'outline-width'],
  'outline-color': ['outline-color'],
  'outline-style': ['outline-style'],
  'outline-width': ['outline-width'],
  inset: ['top', 'right', 'bottom', 'left'],
  top: ['top'],
  right: ['right'],
  bottom: ['bottom'],
  left: ['left'],
  gap: ['row-gap', 'column-gap'],
  'row-gap': ['row-gap'],
  'column-gap': ['column-gap']
};

/** 可证明不是 shorthand 的常用独立 property。 */
const independentProperties = new Set([
  'align-content',
  'align-items',
  'align-self',
  'aspect-ratio',
  'box-sizing',
  'border-radius',
  'clear',
  'color',
  'content',
  'cursor',
  'direction',
  'display',
  'fill',
  'filter',
  'float',
  'height',
  'justify-content',
  'justify-items',
  'justify-self',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'object-fit',
  'object-position',
  'opacity',
  'order',
  'pointer-events',
  'position',
  'stroke',
  'text-align',
  'transform',
  'transform-origin',
  'visibility',
  'white-space',
  'width',
  'z-index'
]);

/** 普通 property ASCII-insensitive；custom property 必须保留大小写。 */
function normalizeProperty(property: string): string {
  const trimmed = property.trim();
  return isCustomProperty(trimmed) ? trimmed : trimmed.toLowerCase();
}

function isCustomProperty(property: string): boolean {
  return property.startsWith('--');
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return left.some((property) => rightSet.has(property));
}
