/**
 * 单次 input 的 class-wide fallback 证据预检。
 *
 * @remarks
 * 本模块只读取 IR 和 selector AST，不执行 scoping，也不接触 atomic registry。完整预检必须发生在
 * 第一次 `registry.register` 之前，避免后续发现 unsafe class 时无法回滚 append-only registry。
 *
 * @module core/engine/planInputClassPreservation
 */
import postcss from 'postcss';
import { classifyPropertyCompetition } from '../declaration/classifyPropertyCompetition.js';
import type { CssIr, CssRuleRecord, InputPreservationReason } from '../ir/types.js';
import type {
  ClassPreservationReason,
  CssTransformContext,
  DeclarationMeta,
  ResolveClassNameContext,
  ScopeStrategy,
  TransformCssInput,
  UnsafeSelectorReason
} from '../public/types.js';
import {
  planSelectorRewrite,
  type EligibleSelectorArmRewrite,
  type SelectorCascadeGuard,
  type SelectorRewriteDecision
} from '../selector/planSelectorRewrite.js';

/** selector、adapter 与 export evidence 汇合后的内部 class-wide reason。 */
export type InputClassPreservationReason = InputPreservationReason | ClassPreservationReason;

/** 当前 input 在 registry mutation 前得到的只读 preservation plan。 */
export type InputClassPreservationPlan = {
  preserveSourceClassNames: ReadonlyMap<string, InputClassPreservationReason>;
  /** 只记录真正触发 selector cascade guard 的 rule arm，避免 class-wide 传播伪造 public reason。 */
  selectorCascadeReasonsByRuleOrder: ReadonlyMap<
    number,
    ReadonlyMap<number, SelectorCascadeReason>
  >;
};

type SelectorCascadeReason = Extract<
  UnsafeSelectorReason,
  'attribute-cascade-order' | 'pseudo-element'
>;

type InputClassPreservationOptions = {
  readonly scope?: ScopeStrategy;
  readonly preserveClassNames?: TransformCssInput['preserveClassNames'];
};

/**
 * 汇总普通 rules、nested rule CSS 与 unsupported preserved blocks 的完整 class evidence。
 *
 * @param ir - AST collection 产生的当前 input IR。
 * @returns 按首次出现顺序保存原因的 class map。
 * @throws selector evidence 不完整、nested/block CSS 无法解析时透传原始异常。
 */
export function planInputClassPreservation(
  ir: CssIr,
  options: InputClassPreservationOptions = {}
): InputClassPreservationPlan {
  const preserveSourceClassNames = new Map<string, InputClassPreservationReason>();
  const cascadeRulesByClassName = new Map<string, CascadeRuleEvidence[]>();
  const selectorCascadeReasonsByRuleOrder = new Map<
    number,
    Map<number, SelectorCascadeReason>
  >();
  const selectorListClassGroups: string[][] = [];

  const recordClasses = (classNames: readonly string[], reason: InputClassPreservationReason): void => {
    for (const className of classNames) {
      if (!preserveSourceClassNames.has(className)) {
        preserveSourceClassNames.set(className, reason);
      }
    }
  };

  for (const [className, reason] of Object.entries(options.preserveClassNames ?? {})) {
    if (reason) {
      recordClasses([className], reason);
    }
  }

  const collectCssEvidence = (css: string, reason: InputPreservationReason): void => {
    const root = postcss.parse(css);

    root.walkRules((rule) => {
      const rewrite = planSelectorRewrite(rule.selector);
      assertCompleteSelectorEvidence(rewrite, ir.id, rule.selector);
      recordClasses(rewrite.sourceClassNames, reason);
    });
  };

  const orderedItems = [
    ...ir.rules.map((rule) => ({ kind: 'rule' as const, order: rule.order, value: rule })),
    ...ir.preservedBlocks.map((block) => ({ kind: 'block' as const, order: block.order, value: block }))
  ].sort((left, right) => left.order - right.order);

  for (const item of orderedItems) {
    if (item.kind === 'block') {
      collectCssEvidence(item.value.css, item.value.reason);
      continue;
    }

    const rule = item.value;
    const rewrite = planSelectorRewrite(rule.selector);

    assertCompleteSelectorEvidence(rewrite, rule.id, rule.selector);

    if (rule.hasNestedNodes) {
      collectCssEvidence(rule.css, 'nested-rule');
      continue;
    }

    if (rewrite.kind === 'preserved') {
      recordClasses(rewrite.sourceClassNames, rewrite.reason);
      continue;
    }

    const uniqueArmClassNames = [...new Set(rewrite.arms.map((arm) => arm.anchorClassName))];

    if (rewrite.arms.length > 1 && uniqueArmClassNames.length > 1) {
      selectorListClassGroups.push(uniqueArmClassNames);
    }

    for (let armIndex = 0; armIndex < rewrite.arms.length; armIndex += 1) {
      const arm = rewrite.arms[armIndex];

      if (!arm) {
        continue;
      }

      if (
        options.scope?.shouldExportClassName?.(arm.anchorClassName, {
          id: rule.id,
          originalSelector: rule.selector,
          usage: 'safe-rule'
        }) === false
      ) {
        recordClasses([arm.anchorClassName], 'non-exported-class');
      }

      if (arm.cascadeGuard.kind !== 'base') {
        const evidence = cascadeRulesByClassName.get(arm.anchorClassName) ?? [];
        evidence.push(createCascadeRuleEvidence(rule, arm, armIndex));
        cascadeRulesByClassName.set(arm.anchorClassName, evidence);
      }
    }
  }

  for (const [className, cascadeRules] of cascadeRulesByClassName) {
    const unsafeCascadeRules = findUnsafeSelectorCascadeRules(cascadeRules);

    if (!preserveSourceClassNames.has(className) && unsafeCascadeRules.size > 0) {
      const firstReason = unsafeCascadeRules.values().next().value;
      if (firstReason) {
        preserveSourceClassNames.set(className, firstReason);
      }
    }

    for (const [evidence, reason] of unsafeCascadeRules) {
      const reasonsByArm = selectorCascadeReasonsByRuleOrder.get(evidence.order) ?? new Map();
      reasonsByArm.set(evidence.armIndex, reason);
      selectorCascadeReasonsByRuleOrder.set(evidence.order, reasonsByArm);
    }
  }

  propagateSelectorListPreservation(selectorListClassGroups, preserveSourceClassNames);

  return {
    preserveSourceClassNames,
    selectorCascadeReasonsByRuleOrder
  };
}

type CascadeRuleEvidence = {
  readonly order: number;
  readonly armIndex: number;
  readonly guard: Exclude<SelectorCascadeGuard, { kind: 'base' }>;
  readonly declarations: readonly DeclarationMeta[];
  readonly context: CssTransformContext;
};

/**
 * 从 eligible attribute/pseudo rule 提取 preflight 所需证据。
 *
 * @remarks
 * context 被有意视为“可能重叠”，因此不生成互斥结论；rule/declaration 原始数组顺序保留，
 * 以免未来调整判断时丢失 occurrence evidence。
 */
function createCascadeRuleEvidence(
  rule: CssRuleRecord,
  arm: EligibleSelectorArmRewrite,
  armIndex: number
): CascadeRuleEvidence {
  if (arm.cascadeGuard.kind === 'base') {
    throw new Error('Base selector must not enter the equal-specificity attribute cascade guard.');
  }

  return {
    order: rule.order,
    armIndex,
    guard: arm.cascadeGuard,
    declarations: rule.declarations,
    context: rule.context
  };
}

/**
 * 将任一 class 的保留证据传播到同一 eligible selector-list 连接分量。
 *
 * @remarks
 * Map 中已有 reason 永不覆盖；按源码中的 list/arm 顺序迭代到固定点，因此链式 list 的内部
 * fallback 原因可复现。传播只控制 CSS 保留，不生成新的公开 diagnostic 或 unsafe reason。
 */
function propagateSelectorListPreservation(
  classGroups: readonly (readonly string[])[],
  preserveSourceClassNames: Map<string, InputClassPreservationReason>
): void {
  let changed = true;

  while (changed) {
    changed = false;

    for (const classNames of classGroups) {
      const reason = classNames
        .map((className) => preserveSourceClassNames.get(className))
        .find((candidate): candidate is InputClassPreservationReason => candidate !== undefined);

      if (!reason) {
        continue;
      }

      for (const className of classNames) {
        if (!preserveSourceClassNames.has(className)) {
          preserveSourceClassNames.set(className, reason);
          changed = true;
        }
      }
    }
  }
}

/**
 * 判断同 source class 的 attribute/pseudo/pseudo-element occurrences 是否必须 class-wide fallback。
 *
 * @remarks
 * attribute 继续比较可能共现的 `(0,2,0)` occurrences；pseudo element 只比较归一到同一 generated
 * box 的 occurrences。单条 attribute/pseudo-element rule 也检查自身 declaration competition。
 */
function findUnsafeSelectorCascadeRules(
  rules: readonly CascadeRuleEvidence[]
): ReadonlyMap<CascadeRuleEvidence, SelectorCascadeReason> {
  const unsafeRules = new Map<CascadeRuleEvidence, SelectorCascadeReason>();

  for (const rule of rules) {
    if (
      (rule.guard.kind === 'attribute' || rule.guard.kind === 'pseudo-element') &&
      declarationsWithinRuleCanChangeWinner(rule.declarations)
    ) {
      const reason = cascadeReasonForGuard(rule.guard);
      if (reason) {
        unsafeRules.set(rule, reason);
      }
    }
  }

  for (let leftIndex = 0; leftIndex < rules.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rules.length; rightIndex += 1) {
      const left = rules[leftIndex];
      const right = rules[rightIndex];

      if (
        !left ||
        !right ||
        !guardsCanCompete(left.guard, right.guard)
      ) {
        continue;
      }

      if (declarationsCanChangeWinner(left.declarations, right.declarations)) {
        const leftReason = cascadeReasonForGuard(left.guard);
        const rightReason = cascadeReasonForGuard(right.guard);
        if (leftReason) {
          unsafeRules.set(left, leftReason);
        }
        if (rightReason) {
          unsafeRules.set(right, rightReason);
        }
      }
    }
  }

  return unsafeRules;
}

/** 将具体 guard 映射到既有 public reason；普通 pseudo 只参与传播，不伪造 order reason。 */
function cascadeReasonForGuard(
  guard: Exclude<SelectorCascadeGuard, { kind: 'base' }>
): SelectorCascadeReason | undefined {
  if (guard.kind === 'attribute') {
    return 'attribute-cascade-order';
  }

  if (guard.kind === 'pseudo-element') {
    return 'pseudo-element';
  }

  return undefined;
}

/**
 * 首批 attribute overlap 只接受一个确定的互斥证明。
 *
 * Parser-decoded exact name 完全相同、且 exact name 以 lowercase `data-` 开头时，不同 decoded
 * equality value 不可同时成立。presence、大小写不同或其他不同 name、attribute/pseudo 以及其他
 * attribute equality 一律视为可能共现。
 */
function guardsCanCompete(
  left: Exclude<SelectorCascadeGuard, { kind: 'base' }>,
  right: Exclude<SelectorCascadeGuard, { kind: 'base' }>
): boolean {
  if (left.kind === 'pseudo-element' || right.kind === 'pseudo-element') {
    return (
      left.kind === 'pseudo-element' &&
      right.kind === 'pseudo-element' &&
      left.name === right.name
    );
  }

  if (left.kind !== 'attribute' && right.kind !== 'attribute') {
    return false;
  }

  if (left.kind !== 'attribute' || right.kind !== 'attribute') {
    return true;
  }

  return !(
    left.name === right.name &&
    left.name.startsWith('data-') &&
    left.operator === '=' &&
    right.operator === '=' &&
    left.value !== right.value
  );
}

/** 判断两条可能共现的 guard 是否包含会被 registry occurrence 重排影响的 declaration。 */
function declarationsCanChangeWinner(
  leftDeclarations: readonly DeclarationMeta[],
  rightDeclarations: readonly DeclarationMeta[]
): boolean {
  for (const left of leftDeclarations) {
    for (const right of rightDeclarations) {
      if (declarationsCompete(left, right)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查单条 attribute rule 内可能被 append-only registry 首次注册顺序折叠的 occurrences。
 *
 * @remarks
 * 即使当前 rule 内只有 A→B，A/B key 也可能已由之前的 input 以相反顺序注册；preflight 不读取
 * registry 历史，因此对同 importance 的竞争 occurrence 必须保守 fallback。该判断刻意不应用于
 * base 或 pseudo-only rule。
 */
function declarationsWithinRuleCanChangeWinner(
  declarations: readonly DeclarationMeta[]
): boolean {
  for (let leftIndex = 0; leftIndex < declarations.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < declarations.length; rightIndex += 1) {
      const left = declarations[leftIndex];
      const right = declarations[rightIndex];

      if (left && right && declarationsCompete(left, right)) {
        return true;
      }
    }
  }

  return false;
}

/** 判断两个 declaration occurrence 的相对顺序是否可能决定 computed winner。 */
function declarationsCompete(left: DeclarationMeta, right: DeclarationMeta): boolean {
  if (left.important !== right.important) {
    return false;
  }

  const competition = classifyPropertyCompetition(left.prop, right.prop);

  if (competition === 'disjoint') {
    return false;
  }

  return !(
    competition === 'same-property' &&
    left.value.trim() === right.value.trim()
  );
}

const identityScope: ScopeStrategy = {
  resolveClassName(className) {
    return className;
  }
};

/**
 * 在 preflight 内透传 selector planner 保存的原始 parser error。
 *
 * @remarks
 * 不完整 decision 的 preserved renderer 是 FOUND-01B 保留原始异常的内部边界。
 * 这里用 identity scope 触发该异常，不产生 CSS、mapping 或 registry mutation。
 *
 * @param rewrite - selector planner 返回的 decision。
 * @param id - 当前 input id。
 * @param selector - 原 selector，仅用于 resolver context。
 */
function assertCompleteSelectorEvidence(
  rewrite: SelectorRewriteDecision,
  id: string,
  selector: string
): void {
  if (rewrite.evidenceComplete) {
    return;
  }

  const context: ResolveClassNameContext = {
    id,
    originalSelector: selector,
    usage: 'preserved-rule'
  };
  rewrite.renderPreservedSelector(identityScope, context);
  throw new Error('Incomplete selector evidence renderer returned without throwing its parser error.');
}
