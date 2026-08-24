/**
 * Selector 能力判定、证据收集与 clone-based 改写的唯一内部入口。
 *
 * @remarks
 * 该模块故意不导出到 core 包入口。engine 只消费 eligible/preserved 决策，
 * 不再自行解析 selector 或处理 `:global(...)`。
 *
 * @module core/selector/planSelectorRewrite
 */
import selectorParser from 'postcss-selector-parser';
import type {
  ResolveClassNameContext,
  ScopeStrategy,
  UnsafeSelectorReason
} from '../public/types.js';

const supportedPseudoClasses = new Set([':hover', ':focus', ':active', ':disabled', ':focus-visible']);
const supportedPseudoElements = new Map<string, 'before' | 'after'>([
  ['::before', 'before'],
  [':before', 'before'],
  ['::after', 'after'],
  [':after', 'after']
]);
const identityAnchor = '__GSS_ANCHOR__';

/** eligible selector 参与 same-class cascade guard 的最小结构证据。 */
export type SelectorCascadeGuard =
  | {
      readonly kind: 'base';
    }
  | {
      readonly kind: 'pseudo';
      readonly name: string;
    }
  | {
      readonly kind: 'pseudo-element';
      /** legacy/modern spelling 归一后的 generated box，用于阻止 alias occurrence 重排。 */
      readonly name: 'before' | 'after';
    }
  | {
      readonly kind: 'attribute';
      /** parser 解码后的 exact attribute name；保留大小写作为 overlap evidence。 */
      readonly name: string;
      readonly operator: 'presence' | '=';
      /** equality 的 parser 解码值；presence 不携带该字段。 */
      readonly value?: string;
    };

/** selector rewrite 两个分支共享的不可变证据与 fallback 渲染能力。 */
export type SelectorRewriteCommon = {
  readonly sourceClassNames: readonly string[];
  readonly globalClassNames: readonly string[];
  /** selector 是否已完整解析并可用于 class preservation evidence。 */
  readonly evidenceComplete: boolean;
  /** 从内部 AST clone 生成已完成 class scoping 的 preserved selector。 */
  renderPreservedSelector(scope: ScopeStrategy, context: ResolveClassNameContext): string;
};

/** 单个 eligible selector arm 的 anchor、identity、renderer 与 cascade evidence。 */
export type EligibleSelectorArmRewrite = {
  readonly anchorClassName: string;
  readonly identity: string;
  /** 只供 registry mutation 前的 same-class cascade preflight 使用。 */
  readonly cascadeGuard: SelectorCascadeGuard;
  /** 从内部 AST clone 仅替换唯一 anchor class。 */
  renderAtomicSelector(className: string): string;
};

/** 通过当前 capability policy、可进入 safe rule 路径的 selector 决策。 */
export type EligibleSelectorRewrite = SelectorRewriteCommon & {
  readonly kind: 'eligible';
  /** 按原 selector-list 顺序保存；单 selector 也统一表示为长度为 1 的数组。 */
  readonly arms: readonly EligibleSelectorArmRewrite[];
};

/** 未通过当前 capability policy、必须保留 fallback CSS 的 selector 决策。 */
export type PreservedSelectorRewrite = SelectorRewriteCommon & {
  readonly kind: 'preserved';
  readonly reason: UnsafeSelectorReason;
  readonly details?: readonly UnsafeSelectorReason[];
};

/** selector 深模块的唯一决策类型。 */
export type SelectorRewriteDecision = EligibleSelectorRewrite | PreservedSelectorRewrite;

type ClassEvidence = {
  sourceClassNames: readonly string[];
  globalClassNames: readonly string[];
};

type SelectorArmDecision =
  | {
      readonly kind: 'eligible';
      readonly arm: EligibleSelectorArmRewrite;
    }
  | {
      readonly kind: 'preserved';
      readonly reason: UnsafeSelectorReason;
      readonly details: readonly UnsafeSelectorReason[];
    };

/**
 * 解析一次 selector，收集结构证据并应用当前 capability policy。
 *
 * @param selector - 标准 CSS selector 文本。
 * @returns 可 atomize 的 eligible plan，或携带稳定 reason 的 preserved plan。
 */
export function planSelectorRewrite(selector: string): SelectorRewriteDecision {
  let root: selectorParser.Root;

  try {
    root = selectorParser().astSync(selector);
  } catch (error) {
    return createUnparseableDecision(error);
  }

  const evidence = collectClassEvidence(root);
  const selectors = root.nodes ?? [];

  if (selectors.length === 0) {
    return createPreservedDecision(root, evidence, 'missing-source-class');
  }

  const armDecisions = selectors.map((selectorNode) => planSelectorArm(selectorNode));
  const preservedArms = armDecisions.filter(
    (decision): decision is Extract<SelectorArmDecision, { kind: 'preserved' }> =>
      decision.kind === 'preserved'
  );

  if (preservedArms.length > 0) {
    if (selectors.length === 1) {
      const preserved = preservedArms[0];
      return createPreservedDecision(root, evidence, preserved.reason, [...preserved.details]);
    }

    return createPreservedDecision(
      root,
      evidence,
      'selector-list',
      collectSelectorListUnsafeDetails(preservedArms)
    );
  }

  const arms = armDecisions.map((decision) => {
    if (decision.kind !== 'eligible') {
      throw new Error('Selector arm decision changed after all-arm eligibility check.');
    }

    return decision.arm;
  });

  if (selectors.length > 1 && arms.some((arm) => arm.cascadeGuard.kind === 'pseudo-element')) {
    return createPreservedDecision(root, evidence, 'selector-list', ['selector-list']);
  }

  return {
    kind: 'eligible',
    ...createCommonDecision(root, evidence),
    arms: Object.freeze(arms)
  };
}

/** 使用既有单 selector policy 规划一个 selector-list arm。 */
function planSelectorArm(selectorNode: selectorParser.Selector): SelectorArmDecision {
  const classNodes = selectorNode.nodes.filter(
    (node): node is selectorParser.ClassName => node.type === 'class' && !isInsideGlobal(node)
  );
  const attributeCandidate = analyzeAttributeCandidate(selectorNode, classNodes);
  const pseudoElementCandidate = analyzePseudoElementCandidate(selectorNode, classNodes);
  const details = collectUnsafeDetails(
    selectorNode,
    attributeCandidate?.node,
    pseudoElementCandidate?.node
  );

  if (details.includes('global-selector')) {
    return createPreservedArmDecision('global-selector', details);
  }

  if (classNodes.length === 0) {
    return createPreservedArmDecision('missing-source-class', details);
  }

  if (classNodes.length > 1) {
    return createPreservedArmDecision(
      firstCombinatorReason(details) ?? 'compound-class-selector',
      details
    );
  }

  if (details.length > 0) {
    return createPreservedArmDecision(choosePrimaryReason(details), details);
  }

  const anchorClassName = classNodes[0]?.value;

  if (!anchorClassName) {
    return createPreservedArmDecision('missing-source-class', details);
  }

  return {
    kind: 'eligible',
    arm: {
      anchorClassName,
      identity: renderArmWithAnchor(selectorNode, identityAnchor),
      cascadeGuard:
        attributeCandidate?.guard ??
        pseudoElementCandidate?.guard ??
        createNonAttributeCascadeGuard(selectorNode),
      renderAtomicSelector(className: string): string {
        return renderArmWithAnchor(selectorNode, className);
      }
    }
  };
}

/** 创建单 arm 的 preserved policy 结果。 */
function createPreservedArmDecision(
  reason: UnsafeSelectorReason,
  details: readonly UnsafeSelectorReason[]
): SelectorArmDecision {
  return {
    kind: 'preserved',
    reason,
    details: Object.freeze([...details])
  };
}

/** 按 arm 顺序聚合 selector-list 的具体失败原因，同时保留稳定 primary reason。 */
function collectSelectorListUnsafeDetails(
  decisions: readonly Extract<SelectorArmDecision, { kind: 'preserved' }>[]
): UnsafeSelectorReason[] {
  const details = new Set<UnsafeSelectorReason>(['selector-list']);

  for (const decision of decisions) {
    details.add(decision.reason);
    for (const reason of decision.details) {
      details.add(reason);
    }
  }

  return [...details];
}

/**
 * 收集 selector 中所有 source/global class，并保留首次出现顺序。
 *
 * @param root - 本次 plan 唯一解析出的 selector AST。
 */
function collectClassEvidence(root: selectorParser.Root): ClassEvidence {
  const sourceClassNames = new Set<string>();
  const globalClassNames = new Set<string>();

  root.walk((node) => {
    if (node.type !== 'class') {
      return;
    }

    if (isInsideGlobal(node)) {
      globalClassNames.add(node.value);
    } else {
      sourceClassNames.add(node.value);
    }
  });

  return {
    sourceClassNames: Object.freeze([...sourceClassNames]),
    globalClassNames: Object.freeze([...globalClassNames])
  };
}

/**
 * 收集唯一 selector AST 中所有可证明的 unsafe reason。
 *
 * @remarks
 * 遍历顺序与 reason 优先级保持稳定，避免内部重构改变 diagnostic 聚合结果。
 */
function collectUnsafeDetails(
  selector: selectorParser.Selector,
  supportedAttribute?: selectorParser.Attribute,
  supportedPseudoElement?: selectorParser.Pseudo
): UnsafeSelectorReason[] {
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

    if (node.type === 'attribute' && node !== supportedAttribute) {
      details.add('attribute-selector');
      return;
    }

    if (node.type === 'pseudo') {
      if (node === supportedPseudoElement) {
        return;
      }

      if (node.value.startsWith('::') || supportedPseudoElements.has(node.value)) {
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
 * 识别 SEL-01 允许的 generated pseudo-element arm。
 *
 * @remarks
 * 只接受唯一 local class 后紧跟唯一 `before`/`after` pseudo element。identity 与 renderer 仍使用
 * 输入 AST spelling；guard 只归一 legacy/modern alias，避免两个等价 generated box 被 registry 重排。
 */
function analyzePseudoElementCandidate(
  selector: selectorParser.Selector,
  classNodes: selectorParser.ClassName[]
):
  | {
      node: selectorParser.Pseudo;
      guard: Extract<SelectorCascadeGuard, { kind: 'pseudo-element' }>;
    }
  | undefined {
  if (classNodes.length !== 1 || selector.nodes.length !== 2) {
    return undefined;
  }

  const [anchor, pseudo] = selector.nodes;

  if (anchor !== classNodes[0] || pseudo?.type !== 'pseudo' || pseudo.nodes.length > 0) {
    return undefined;
  }

  const normalizedName = supportedPseudoElements.get(pseudo.value);

  if (!normalizedName) {
    return undefined;
  }

  return {
    node: pseudo,
    guard: {
      kind: 'pseudo-element',
      name: normalizedName
    }
  };
}

/**
 * 识别首批可安全改写的单 attribute compound。
 *
 * @remarks
 * 这里只判定单 selector 的结构等价；attribute 与其他同 specificity selector 的顺序风险由
 * input preflight 独立处理。`[class...]` 必须基于 parser 解码后的 name 排除，因为 GSS 会给
 * DOM 的 class attribute 注入 atomic token。
 */
function analyzeAttributeCandidate(
  selector: selectorParser.Selector,
  classNodes: selectorParser.ClassName[]
):
  | {
      node: selectorParser.Attribute;
      guard: Extract<SelectorCascadeGuard, { kind: 'attribute' }>;
    }
  | undefined {
  if (classNodes.length !== 1 || selector.nodes.length !== 2) {
    return undefined;
  }

  const attributeNodes = selector.nodes.filter(
    (node): node is selectorParser.Attribute => node.type === 'attribute' && !isInsideGlobal(node)
  );

  if (attributeNodes.length !== 1) {
    return undefined;
  }

  const attribute = attributeNodes[0];

  if (
    !attribute ||
    attribute.namespace !== undefined ||
    hasAttributeFlag(attribute) ||
    asciiLowerCase(attribute.attribute) === 'class'
  ) {
    return undefined;
  }

  if (attribute.operator === undefined && attribute.value === undefined) {
    return {
      node: attribute,
      guard: {
        kind: 'attribute',
        name: attribute.attribute,
        operator: 'presence'
      }
    };
  }

  if (attribute.operator !== '=' || attribute.value === undefined) {
    return undefined;
  }

  return {
    node: attribute,
    guard: {
      kind: 'attribute',
      name: attribute.attribute,
      operator: '=',
      value: attribute.value
    }
  };
}

/** 检测 parser 对 `i`/`s` flag 的两种可观察表示。 */
function hasAttributeFlag(attribute: selectorParser.Attribute): boolean {
  const raws = attribute.raws as {
    insensitive?: string;
    insensitiveFlag?: string;
  };

  return (
    attribute.insensitive !== undefined ||
    raws.insensitive !== undefined ||
    raws.insensitiveFlag !== undefined
  );
}

/** 为既有 base/pseudo eligible selector 生成固定 specificity guard。 */
function createNonAttributeCascadeGuard(selector: selectorParser.Selector): SelectorCascadeGuard {
  const pseudo = selector.nodes.find(
    (node): node is selectorParser.Pseudo => node.type === 'pseudo' && !isInsideGlobal(node)
  );

  return pseudo
    ? {
        kind: 'pseudo',
        name: pseudo.value
      }
    : {
        kind: 'base'
      };
}

/** CSS/HTML attribute name 所需的 locale-independent ASCII case fold。 */
function asciiLowerCase(value: string): string {
  let result = '';

  for (const character of value) {
    const code = character.charCodeAt(0);
    result += code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : character;
  }

  return result;
}

/** 创建携带共享证据和 preserved renderer 的决策片段。 */
function createCommonDecision(root: selectorParser.Root, evidence: ClassEvidence): SelectorRewriteCommon {
  return {
    sourceClassNames: evidence.sourceClassNames,
    globalClassNames: evidence.globalClassNames,
    evidenceComplete: true,
    renderPreservedSelector(scope: ScopeStrategy, context: ResolveClassNameContext): string {
      const clonedRoot = root.clone();

      clonedRoot.walk((node) => {
        if (node.type === 'class' && !isInsideGlobal(node)) {
          node.value = scope.resolveClassName(node.value, context);
          return;
        }

        if (node.type === 'pseudo' && node.value === ':global') {
          unwrapGlobalPseudo(node);
        }
      });

      return clonedRoot.toString();
    }
  };
}

/** 创建可解析但未通过当前 policy 的 preserved 决策。 */
function createPreservedDecision(
  root: selectorParser.Root,
  evidence: ClassEvidence,
  reason: UnsafeSelectorReason,
  details?: UnsafeSelectorReason[]
): PreservedSelectorRewrite {
  return {
    kind: 'preserved',
    ...createCommonDecision(root, evidence),
    reason,
    details: details ? Object.freeze([...details]) : undefined
  };
}

/**
 * 创建无法解析的 preserved 决策。
 *
 * @remarks
 * 旧路径会在 analysis 后的 scoping 阶段再次抛出 parser error。此处保留同样的
 * 可观察错误边界，不擅自降级为原样输出。
 */
function createUnparseableDecision(error: unknown): PreservedSelectorRewrite {
  return {
    kind: 'preserved',
    sourceClassNames: Object.freeze([]),
    globalClassNames: Object.freeze([]),
    evidenceComplete: false,
    reason: 'unknown-selector',
    renderPreservedSelector(): string {
      throw error;
    }
  };
}

/** 从单 arm AST clone 中定位唯一 direct anchor class 并替换，避免字符串插值破坏 escaping。 */
function renderArmWithAnchor(selector: selectorParser.Selector, className: string): string {
  const clonedSelector = selector.clone();
  const anchorNode = clonedSelector.nodes.find((node) => node.type === 'class' && !isInsideGlobal(node));

  if (!anchorNode || anchorNode.type !== 'class') {
    throw new Error('Eligible selector rewrite is missing its anchor class.');
  }

  anchorNode.value = className;
  return clonedSelector.toString().trim();
}

/** 判断 selector node 是否位于 `:global(...)` 内部。 */
function isInsideGlobal(node: selectorParser.Node): boolean {
  let current: { type?: string; value?: string; parent?: unknown } | undefined = node.parent as
    | { type?: string; value?: string; parent?: unknown }
    | undefined;

  while (current) {
    if (current.type === 'pseudo' && current.value === ':global') {
      return true;
    }

    current = current.parent as { type?: string; value?: string; parent?: unknown } | undefined;
  }

  return false;
}

/** 将 `:global(.foo)` 原地替换为其内部 selector nodes。 */
function unwrapGlobalPseudo(pseudo: selectorParser.Pseudo): void {
  if (pseudo.nodes.length === 0) {
    pseudo.remove();
    return;
  }

  const firstSelector = pseudo.nodes[0];
  const replacementNodes = [...firstSelector.nodes].map((node) => node.clone());

  if (replacementNodes.length === 0) {
    pseudo.remove();
    return;
  }

  pseudo.replaceWith(...replacementNodes);
}

/** 查找应优先展示的 combinator reason。 */
function firstCombinatorReason(details: UnsafeSelectorReason[]): UnsafeSelectorReason | undefined {
  return details.find((reason) =>
    ['descendant-selector', 'child-selector', 'adjacent-selector', 'sibling-selector'].includes(reason)
  );
}

/** 把 selector combinator 映射为稳定 unsafe reason。 */
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

/** 按稳定优先级选择 diagnostic 主原因。 */
function choosePrimaryReason(details: UnsafeSelectorReason[]): UnsafeSelectorReason {
  const priority: UnsafeSelectorReason[] = [
    'descendant-selector',
    'child-selector',
    'adjacent-selector',
    'sibling-selector',
    'tag-selector',
    'id-selector',
    'attribute-selector',
    'attribute-cascade-order',
    'pseudo-element',
    'unsupported-pseudo',
    'compound-class-selector',
    'non-exported-class',
    'unknown-selector'
  ];

  return priority.find((reason) => details.includes(reason)) ?? details[0] ?? 'unknown-selector';
}
