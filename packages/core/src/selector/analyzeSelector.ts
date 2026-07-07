import selectorParser from 'postcss-selector-parser';
import type { SelectorAnalysis, UnsafeSelectorReason } from '../public/types.js';
import { collectClassNames, isInsideGlobal } from './collectClassNames.js';

const supportedPseudoClasses = new Set([':hover', ':focus', ':active', ':disabled', ':focus-visible']);

/** 分析 selector 是否满足 v1 safe selector 约束。 */
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

/** 收集 selector 中所有明确 unsafe reason，供 primary reason 和 details 使用。 */
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

/** 当多 class selector 同时包含 combinator 时，优先输出结构关系 reason。 */
function firstCombinatorReason(details: UnsafeSelectorReason[]): UnsafeSelectorReason | undefined {
  return details.find((reason) =>
    ['descendant-selector', 'child-selector', 'adjacent-selector', 'sibling-selector'].includes(reason)
  );
}

/** 把 combinator 映射为更具体的 unsafe reason。 */
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

/** 选择最适合作为 diagnostic 主原因的 reason。 */
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

/** 创建 unsafe selector 分支，并补齐 class name 收集结果。 */
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

/** 在 selector 解析失败时返回空 class name 集合，避免 diagnostic 过程二次抛错。 */
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
