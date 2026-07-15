/**
 * Safe selector 判定与稳定 unsafe reason 分类模块。
 *
 * @remarks
 * 只接受单 source class 和最多一个白名单 pseudo class。解析失败或包含结构关系、global、tag、
 * id、attribute、pseudo element 等结构时返回 unsafe 分支，不尝试猜测等价转换。
 *
 * @module core/selector/analyzeSelector
 */
import selectorParser from 'postcss-selector-parser';
import type { SelectorAnalysis, UnsafeSelectorReason } from '../public/types.js';
import { collectClassNames, isInsideGlobal } from './collectClassNames.js';

const supportedPseudoClasses = new Set([':hover', ':focus', ':active', ':disabled', ':focus-visible']);

/**
 * 分析 selector 是否满足 v1 safe selector 约束。
 *
 * @param selector - 标准 CSS selector 文本。
 * @returns safe 分支中的唯一 source class/pseudo，或带稳定 primary reason 的 unsafe 分支。
 */
export function analyzeSelector(selector: string): SelectorAnalysis {
  let root: selectorParser.Root;

  try {
    root = selectorParser().astSync(selector);
  } catch {
    return createUnsafe(selector, 'unknown-selector');
  }

  const selectors = root.nodes ?? [];

  if (selectors.length !== 1) {
    return createUnsafe(selector, 'selector-list');
  }

  const selectorNode = selectors[0];
  const details = collectUnsafeDetails(selectorNode);
  const classNodes = selectorNode.nodes.filter((node) => node.type === 'class' && !isInsideGlobal(node));

  if (details.includes('global-selector')) {
    return createUnsafe(selector, 'global-selector', details);
  }

  if (classNodes.length === 0) {
    return createUnsafe(selector, 'missing-source-class', details);
  }

  if (classNodes.length > 1) {
    const combinator = firstCombinatorReason(details);
    return createUnsafe(selector, combinator ?? 'compound-class-selector', details);
  }

  if (details.length > 0) {
    return createUnsafe(selector, choosePrimaryReason(details), details);
  }

  const sourceClassName = classNodes[0]?.value;

  if (!sourceClassName) {
    return createUnsafe(selector, 'missing-source-class', details);
  }

  const pseudo = selectorNode.nodes.find((node) => node.type === 'pseudo')?.value;

  return {
    kind: 'safe',
    selector,
    sourceClassName,
    sourceClassNames: [sourceClassName],
    pseudo
  };
}

/**
 * 收集 selector 中所有可证明的 unsafe reason。
 *
 * @param selector - 已解析且唯一的 selector AST。
 * @returns 去重后的 reason 集合，保留 AST 遍历首次发现顺序。
 */
function collectUnsafeDetails(selector: selectorParser.Selector): UnsafeSelectorReason[] {
  const details = new Set<UnsafeSelectorReason>();
  let pseudoClassCount = 0;

  selector.walk((node) => {
    if (node.type === 'pseudo' && node.value === ':global') {
      details.add('global-selector');
      return;
    }

    if (isInsideGlobal(node)) {
      return;
    }

    if (node.type === 'combinator') {
      details.add(combinatorReason(node.value));
      return;
    }

    if (node.type === 'tag' || node.type === 'universal') {
      details.add('tag-selector');
      return;
    }

    if (node.type === 'id') {
      details.add('id-selector');
      return;
    }

    if (node.type === 'attribute') {
      details.add('attribute-selector');
      return;
    }

    if (node.type === 'pseudo') {
      if (node.value.startsWith('::')) {
        details.add('pseudo-element');
        return;
      }

      pseudoClassCount += 1;
      if (!supportedPseudoClasses.has(node.value) || pseudoClassCount > 1 || node.nodes.length > 0) {
        details.add('unsupported-pseudo');
      }
    }
  });

  return [...details];
}

/**
 * 查找应优先展示的 combinator reason。
 *
 * @param details - 当前 selector 的全部 unsafe reasons。
 * @returns 第一个结构关系 reason；不存在时返回 `undefined`。
 */
function firstCombinatorReason(details: UnsafeSelectorReason[]): UnsafeSelectorReason | undefined {
  return details.find((reason) =>
    ['descendant-selector', 'child-selector', 'adjacent-selector', 'sibling-selector'].includes(reason)
  );
}

/**
 * 把 selector combinator 映射为稳定 unsafe reason。
 *
 * @param value - selector parser 提供的 combinator 文本。
 * @returns child、adjacent、sibling 或默认 descendant reason。
 */
function combinatorReason(value: string): UnsafeSelectorReason {
  const trimmed = value.trim();

  if (trimmed === '>') {
    return 'child-selector';
  }

  if (trimmed === '+') {
    return 'adjacent-selector';
  }

  if (trimmed === '~') {
    return 'sibling-selector';
  }

  return 'descendant-selector';
}

/**
 * 按稳定优先级选择 diagnostic 主原因。
 *
 * @param details - selector 的全部 unsafe reasons。
 * @returns 最适合治理聚合的 primary reason；空集合降级为 `unknown-selector`。
 */
function choosePrimaryReason(details: UnsafeSelectorReason[]): UnsafeSelectorReason {
  const priority: UnsafeSelectorReason[] = [
    'descendant-selector',
    'child-selector',
    'adjacent-selector',
    'sibling-selector',
    'tag-selector',
    'id-selector',
    'attribute-selector',
    'pseudo-element',
    'unsupported-pseudo',
    'compound-class-selector',
    'non-exported-class',
    'unknown-selector'
  ];

  return priority.find((reason) => details.includes(reason)) ?? details[0] ?? 'unknown-selector';
}

/**
 * 创建 unsafe selector 分支。
 *
 * @param selector - 原 selector 文本。
 * @param reason - 稳定 primary reason。
 * @param details - 可选的全部 reason 证据。
 * @returns 补齐 source/global class 集合的 unsafe analysis。
 */
function createUnsafe(
  selector: string,
  reason: UnsafeSelectorReason,
  details?: UnsafeSelectorReason[]
): SelectorAnalysis {
  const classNames = safeCollectClassNames(selector);

  return {
    kind: 'unsafe',
    selector,
    sourceClassNames: classNames.sourceClassNames,
    globalClassNames: classNames.globalClassNames,
    reason,
    details
  };
}

/**
 * 在 diagnostic 路径中保守收集 class names。
 *
 * @param selector - 可能无法解析的 selector 文本。
 * @returns 成功时返回分类后的 class names；失败时返回两个空数组。
 */
function safeCollectClassNames(selector: string): { sourceClassNames: string[]; globalClassNames: string[] } {
  try {
    return collectClassNames(selector);
  } catch {
    return {
      sourceClassNames: [],
      globalClassNames: []
    };
  }
}
