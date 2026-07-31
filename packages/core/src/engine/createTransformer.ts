/**
 * Core transform pipeline 与 append-only 聚合生命周期实现。
 *
 * @remarks
 * 本模块协调 parse、IR、selector/declaration analysis、registry、fallback、manifest 和 report，
 * 但不引入文件系统或构建工具语义。
 *
 * @module core/engine/createTransformer
 */
import type {
  AtomicDeclaration,
  ClassPreservationReason,
  CssTransformContext,
  DeclarationAnalysis,
  Diagnostic,
  ScopeStrategy,
  TransformCssInput,
  TransformCssOptions,
  TransformCssResult,
  TransformManifest,
  TransformReport,
  Transformer,
  UnsafeSelectorReason
} from '../public/types.js';
import type { CssRuleRecord, PreservedBlock, PreservedRule } from '../ir/types.js';
import { parseCss } from '../ast/parseCss.js';
import { collectIr } from '../ast/collectIr.js';
import { analyzeDeclaration } from '../declaration/analyzeDeclaration.js';
import {
  planSelectorRewrite,
  type EligibleSelectorArmRewrite,
  type EligibleSelectorRewrite,
  type PreservedSelectorRewrite,
  type SelectorRewriteDecision
} from '../selector/planSelectorRewrite.js';
import { collectSourceClassNamesFromCss, scopeCssBlock } from '../selector/scopeCssBlock.js';
import { AtomicRegistry } from '../registry/AtomicRegistry.js';
import { ClassMappingBuilder } from '../registry/ClassMappingBuilder.js';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import {
  preservedClassMessage,
  preservedDeclarationMessage,
  unsafeSelectorMessage
} from '../diagnostics/messages.js';
import {
  planInputClassPreservation,
  type InputClassPreservationReason,
  type InputClassPreservationPlan
} from './planInputClassPreservation.js';
import { renderAtomicCss } from '../output/renderAtomicCss.js';
import { renderPreservedCss } from '../output/renderPreservedCss.js';
import { createManifest } from '../output/createManifest.js';
import { createReport } from '../output/createReport.js';
import { mergeReports } from '../output/mergeReport.js';
import { resolveTransformOptions } from '../policies/defaultOptions.js';
import { byteLength } from '../utils/bytes.js';

/**
 * 创建一次 append-only build 使用的有状态 transformer。
 *
 * @remarks
 * transformer 在多次 `transformCss` 调用之间复用 atomic registry，并聚合 manifest 与 report。
 * 单次返回值始终只描述当前输入；聚合视图必须通过 `getAtomicCss`、`getManifest` 和 `getReport`
 * 获取。当前 interface 不支持同一 id 的更新、删除或失效，因此不得直接作为 dev/HMR 缓存使用。
 *
 * @param options - 在 transformer 生命周期内保持不变的 class name 策略。
 * @returns 可执行转换并读取聚合快照的 {@link Transformer}。
 * @throws 调用方提供的 scope strategy 抛出的异常，以及非 CSS parse error 的意外实现异常。
 *
 * @example
 * ```ts
 * const transformer = createTransformer({
 *   className: { strategy: 'hash', prefix: '_' }
 * });
 *
 * transformer.transformCss(firstInput);
 * transformer.transformCss(secondInput);
 *
 * const css = transformer.getAtomicCss();
 * const report = transformer.getReport();
 * ```
 */
export function createTransformer(options: TransformCssOptions = {}): Transformer {
  const resolvedOptions = resolveTransformOptions(options);
  const registry = new AtomicRegistry(resolvedOptions.className);
  const reports: TransformReport[] = [];
  let latestClassManifest: TransformManifest['classes'] = {};

  return {
    /**
     * 转换并追加一个输入。
     *
     * @param input - 标准 CSS 与 scope evidence。
     * @returns 只描述当前输入的 transform snapshot。
     */
    transformCss(input: TransformCssInput): TransformCssResult {
      const result = runTransform(input, registry);
      reports.push(result.report);
      latestClassManifest = mergeClassManifest(latestClassManifest, result.manifest.classes);
      return result;
    },

    /**
     * 读取聚合 atomic CSS。
     *
     * @returns registry 当前全部 declaration 的 CSS 快照。
     */
    getAtomicCss(): string {
      return renderAtomicCss(registry.list());
    },

    /**
     * 读取聚合 report。
     *
     * @returns 基于当前 reports 和 registry 重新计算的治理快照。
     */
    getReport(): TransformReport {
      const report = mergeReports(reports);
      const atomicCss = renderAtomicCss(registry.list());
      report.summary.atomicDeclarations = registry.list().length;
      report.summary.reusedAtomicDeclarations = registry.getReusedCount();
      report.size.afterAtomicCssBytes = byteLength(atomicCss);
      report.size.estimatedTotalDiffBytes =
        report.size.afterAtomicCssBytes +
        report.size.afterPreservedCssBytes +
        report.size.estimatedClassStringIncreaseBytes -
        report.size.beforeCssBytes;
      return report;
    },

    /**
     * 读取聚合 manifest。
     *
     * @returns atomic registry 与最新 class entries 的防御性快照。
     */
    getManifest(): TransformManifest {
      return {
        atomic: createManifest('', registry.list(), {}).atomic,
        classes: cloneClassManifest(latestClassManifest)
      };
    }
  };
}

/**
 * 执行单次 transform pipeline。
 *
 * @param input - 当前标准 CSS 输入。
 * @param registry - transformer 生命周期共享的 atomic registry。
 * @returns 当前输入的完整 transform snapshot。
 */
function runTransform(input: TransformCssInput, registry: AtomicRegistry): TransformCssResult {
  const parsed = parseCss(input.id, input.css);

  if (!parsed.root) {
    return createEmptyResult(input, parsed.diagnostics);
  }

  const collected = collectIr(input.id, parsed.root);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics, ...collected.diagnostics];
  const preservationPlan = planInputClassPreservation(collected.ir, {
    scope: input.scope,
    preserveClassNames: input.preserveClassNames
  });
  const classMappings = new ClassMappingBuilder(input.id, input.scope);
  const preservedRules: PreservedRule[] = [];
  const preservedBlocks = collected.ir.preservedBlocks.map((block) =>
    scopePreservedBlock(block, input.scope, classMappings)
  );
  const currentAtomicByKey = new Map<string, AtomicDeclaration>();
  const stats = {
    unsafeRules: 0,
    preservedDeclarations: 0,
    reusedAtomicDeclarations: 0
  };

  for (const rule of collected.ir.rules) {
    processRule(
      rule,
      input.scope,
      registry,
      classMappings,
      preservedRules,
      preservedBlocks,
      currentAtomicByKey,
      diagnostics,
      stats,
      input.preserveClassNames,
      preservationPlan
    );
  }

  const atomic = [...currentAtomicByKey.values()];
  const classes = classMappings.build();
  const atomicCss = renderAtomicCss(atomic);
  const preservedCss = renderPreservedCss(preservedRules, preservedBlocks);
  const manifest = createManifest(input.id, atomic, classes);
  const report = createReport({
    beforeCss: input.css,
    atomicCss,
    preservedCss,
    classes,
    diagnostics,
    atomicDeclarations: atomic.length,
    reusedAtomicDeclarations: stats.reusedAtomicDeclarations,
    unsafeRules: stats.unsafeRules,
    preservedRules: preservedRules.length + preservedBlocks.length,
    preservedDeclarations: stats.preservedDeclarations
  });

  return {
    id: input.id,
    css: {
      atomic: atomicCss,
      preserved: preservedCss
    },
    classes,
    atomic,
    diagnostics,
    manifest,
    report
  };
}

/**
 * 处理单条 rule，并选择 atomize 或 preserved 路径。
 *
 * @param rule - 当前 rule IR。
 * @param scope - adapter class scope strategy。
 * @param registry - 共享 atomic registry。
 * @param classMappings - 当前输入 mapping builder。
 * @param preservedRules - 当前输入 fallback rules。
 * @param preservedBlocks - 当前输入 fallback blocks。
 * @param currentAtomicByKey - 当前输入使用到的 atomic snapshot。
 * @param diagnostics - 当前输入 diagnostics。
 * @param stats - 当前输入可变统计。
 * @param preserveClassNames - adapter 提供的 class 级保留证据。
 * @param preservationPlan - registry mutation 前完成的当前 input class evidence。
 */
function processRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  registry: AtomicRegistry,
  classMappings: ClassMappingBuilder,
  preservedRules: PreservedRule[],
  preservedBlocks: PreservedBlock[],
  currentAtomicByKey: Map<string, AtomicDeclaration>,
  diagnostics: Diagnostic[],
  stats: { unsafeRules: number; preservedDeclarations: number; reusedAtomicDeclarations: number },
  preserveClassNames: TransformCssInput['preserveClassNames'],
  preservationPlan: InputClassPreservationPlan
): void {
  const selectorRewrite = planSelectorRewrite(rule.selector);

  if (rule.hasNestedNodes) {
    preserveNestedRule(
      rule,
      scope,
      classMappings,
      preservedBlocks,
      diagnostics,
      stats,
      selectorRewrite
    );
    return;
  }

  if (selectorRewrite.kind === 'preserved') {
    preserveUnsafeRule(rule, scope, classMappings, preservedRules, diagnostics, stats, selectorRewrite);
    return;
  }

  const configuredArms = selectorRewrite.arms.flatMap((arm) => {
    const reason = preserveClassNames?.[arm.anchorClassName];
    return reason ? [{ arm, reason }] : [];
  });

  if (configuredArms.length > 0) {
    preserveConfiguredSafeRule(
      rule,
      scope,
      classMappings,
      preservedRules,
      diagnostics,
      stats,
      selectorRewrite,
      configuredArms
    );
    return;
  }

  const nonExportedClassNames = [
    ...new Set(
      selectorRewrite.arms
        .filter((arm) => !shouldTransformSafeClass(rule, scope, arm.anchorClassName))
        .map((arm) => arm.anchorClassName)
    )
  ];

  if (nonExportedClassNames.length > 0) {
    preserveNonExportedSafeRule(
      rule,
      scope,
      classMappings,
      preservedRules,
      diagnostics,
      stats,
      selectorRewrite,
      nonExportedClassNames
    );
    return;
  }

  const evidenceEntries = selectorRewrite.arms.flatMap((arm) => {
    const reason = preservationPlan.preserveSourceClassNames.get(arm.anchorClassName);
    return reason ? [{ arm, reason }] : [];
  });
  const evidenceReason = evidenceEntries[0]?.reason;

  if (evidenceReason) {
    const cascadeReasonsByArm = preservationPlan.selectorCascadeReasonsByRuleOrder.get(rule.order);
    const selectorCascadeRiskArms = selectorRewrite.arms.flatMap((arm, armIndex) => {
      const classReason = preservationPlan.preserveSourceClassNames.get(arm.anchorClassName);
      const reason = cascadeReasonsByArm?.get(armIndex);
      const classUsesCascadeSeed =
        classReason === 'attribute-cascade-order' || classReason === 'pseudo-element';
      return reason && classUsesCascadeSeed ? [{ arm, reason }] : [];
    });

    if (selectorCascadeRiskArms.length > 0) {
      preserveSelectorCascadeOrderRule(
        rule,
        scope,
        classMappings,
        preservedRules,
        diagnostics,
        stats,
        selectorRewrite,
        selectorCascadeRiskArms
      );
      return;
    }

    preserveEvidenceBoundSafeRule(
      rule,
      scope,
      classMappings,
      preservedRules,
      diagnostics,
      stats,
      selectorRewrite,
      evidenceReason
    );
    return;
  }

  processSafeRule(
    rule,
    scope,
    registry,
    classMappings,
    preservedRules,
    diagnostics,
    stats,
    currentAtomicByKey,
    selectorRewrite
  );
}

/**
 * 保留 grammar 已支持但 same-class occurrence order 无法证明安全的 selector rule。
 *
 * @remarks
 * preflight 已在任何 registry mutation 前把整个 class 标记为 preserved；这里只根据具体 rule arm
 * evidence 为 attribute 输出 `attribute-cascade-order`、为 pseudo-element alias 输出既有
 * `pseudo-element`，并保持 class-wide 传播不产生新的 public reason。
 */
function preserveSelectorCascadeOrderRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  classMappings: ClassMappingBuilder,
  preservedRules: PreservedRule[],
  diagnostics: Diagnostic[],
  stats: { unsafeRules: number; preservedDeclarations: number },
  selectorRewrite: EligibleSelectorRewrite,
  selectorCascadeRiskArms: readonly {
    arm: EligibleSelectorArmRewrite;
    reason: Extract<UnsafeSelectorReason, 'attribute-cascade-order' | 'pseudo-element'>;
  }[]
): void {
  const reason = selectorCascadeRiskArms[0]?.reason;
  if (!reason) {
    throw new Error('Selector cascade fallback requires at least one direct risk arm.');
  }
  const scopedSelector = selectorRewrite.renderPreservedSelector(scope, {
    id: rule.id,
    originalSelector: rule.selector,
    usage: 'preserved-rule'
  });

  ensureEligibleArms(classMappings, selectorRewrite, rule.selector);
  const sourceClassNames = [...new Set(selectorCascadeRiskArms.map(({ arm }) => arm.anchorClassName))];
  for (const { arm, reason: armReason } of selectorCascadeRiskArms) {
    classMappings.addUnsafeReason(arm.anchorClassName, rule.selector, armReason);
  }
  stats.unsafeRules += 1;
  stats.preservedDeclarations += rule.declarations.length;
  preservedRules.push({
    id: rule.id,
    order: rule.order,
    selector: rule.selector,
    scopedSelector,
    declarations: rule.declarations,
    context: rule.context,
    reason,
    source: rule.source
  });
  diagnostics.push(
    createDiagnostic({
      code: 'unsafe-selector',
      level: 'warning',
      message: unsafeSelectorMessage(rule.selector, reason),
      id: rule.id,
      selector: rule.selector,
      sourceClassName: sourceClassNames.length === 1 ? sourceClassNames[0] : undefined,
      reason,
      source: rule.source
    })
  );
}

/**
 * 保留受当前 input selector/block evidence 影响的 eligible rule。
 *
 * @remarks
 * 该原因只用于 pipeline 内部稳定输出，不额外写入 public `unsafeReasons`；
 * 真正的 unsafe rule 会继续产生原有 diagnostic 和 class mapping evidence。
 *
 * @param rule - 当前 eligible rule。
 * @param scope - class resolver。
 * @param classMappings - 当前 input mapping builder。
 * @param preservedRules - fallback 输出集合。
 * @param diagnostics - 当前 input diagnostics。
 * @param stats - preserved declaration 计数。
 * @param selectorRewrite - eligible selector rewrite plan。
 * @param reason - 只在 pipeline 内部使用的 class-wide preservation reason。
 */
function preserveEvidenceBoundSafeRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  classMappings: ClassMappingBuilder,
  preservedRules: PreservedRule[],
  diagnostics: Diagnostic[],
  stats: { preservedDeclarations: number },
  selectorRewrite: EligibleSelectorRewrite,
  reason: InputClassPreservationReason
): void {
  ensureEligibleArms(classMappings, selectorRewrite, rule.selector);
  const scopedSelector = selectorRewrite.renderPreservedSelector(scope, {
    id: rule.id,
    originalSelector: rule.selector,
    usage: 'preserved-rule'
  });

  stats.preservedDeclarations += rule.declarations.length;
  for (const declaration of rule.declarations) {
    const declarationAnalysis = analyzeDeclaration(declaration);

    if (declarationAnalysis.kind === 'preserved') {
      addPreservedDeclarationDiagnostic(
        rule,
        diagnostics,
        declarationAnalysis,
        getSingleEligibleSourceClassName(selectorRewrite)
      );
    }
  }

  preservedRules.push({
    id: rule.id,
    order: rule.order,
    selector: rule.selector,
    scopedSelector,
    declarations: rule.declarations,
    context: rule.context,
    reason,
    source: rule.source
  });
}

/**
 * 完整保留 adapter 标记的 safe class。
 *
 * @param rule - 当前 safe rule。
 * @param scope - class resolver。
 * @param classMappings - 当前 mapping builder。
 * @param preservedRules - fallback 输出集合。
 * @param diagnostics - diagnostic 输出集合。
 * @param stats - preserved declaration 计数。
 * @param selectorRewrite - eligible selector rewrite plan。
 * @param reason - adapter 提供的 class preservation reason。
 */
function preserveConfiguredSafeRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  classMappings: ClassMappingBuilder,
  preservedRules: PreservedRule[],
  diagnostics: Diagnostic[],
  stats: { preservedDeclarations: number },
  selectorRewrite: EligibleSelectorRewrite,
  configuredArms: readonly {
    readonly arm: EligibleSelectorArmRewrite;
    readonly reason: ClassPreservationReason;
  }[]
): void {
  ensureEligibleArms(classMappings, selectorRewrite, rule.selector);
  const scopedSelector = selectorRewrite.renderPreservedSelector(scope, {
    id: rule.id,
    originalSelector: rule.selector,
    usage: 'preserved-rule'
  });

  stats.preservedDeclarations += rule.declarations.length;
  preservedRules.push({
    id: rule.id,
    order: rule.order,
    selector: rule.selector,
    scopedSelector,
    declarations: rule.declarations,
    context: rule.context,
    reason: configuredArms[0]?.reason ?? 'asset-reference',
    source: rule.source
  });
  const reasonsByClassName = new Map<string, ClassPreservationReason>();
  for (const { arm, reason } of configuredArms) {
    if (!reasonsByClassName.has(arm.anchorClassName)) {
      reasonsByClassName.set(arm.anchorClassName, reason);
    }
  }

  for (const [sourceClassName, reason] of reasonsByClassName) {
    diagnostics.push(
      createDiagnostic({
        code: 'preserved-class',
        level: 'warning',
        message: preservedClassMessage(sourceClassName, reason),
        id: rule.id,
        selector: rule.selector,
        sourceClassName,
        reason,
        source: rule.source
      })
    );
  }
}

/**
 * 处理可导出的 safe rule。
 *
 * @remarks
 * 同一 rule 内 atomizable declaration 进入 registry；custom property 等 declaration 仍按原位置证据
 * 进入 preserved output，class mapping 保持 declaration 首次出现顺序。
 *
 * @param rule - 当前 safe rule。
 * @param scope - class resolver/export evidence。
 * @param registry - 共享 atomic registry。
 * @param classMappings - 当前 mapping builder。
 * @param preservedRules - fallback 输出集合。
 * @param diagnostics - diagnostic 输出集合。
 * @param stats - 当前输入统计。
 * @param currentAtomicByKey - 当前输入 atomic snapshot。
 * @param selectorRewrite - eligible selector rewrite plan。
 */
function processSafeRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  registry: AtomicRegistry,
  classMappings: ClassMappingBuilder,
  preservedRules: PreservedRule[],
  diagnostics: Diagnostic[],
  stats: { unsafeRules: number; preservedDeclarations: number; reusedAtomicDeclarations: number },
  currentAtomicByKey: Map<string, AtomicDeclaration>,
  selectorRewrite: EligibleSelectorRewrite
): void {
  ensureEligibleArms(classMappings, selectorRewrite, rule.selector);

  for (const declaration of rule.declarations) {
    const declarationAnalysis = analyzeDeclaration(declaration);

    if (declarationAnalysis.kind === 'atomizable') {
      for (const arm of selectorRewrite.arms) {
        const context: CssTransformContext = { ...rule.context };
        const registered = registry.register(
          {
            declaration: declarationAnalysis.declaration,
            selectorIdentity: arm.identity,
            context
          },
          arm.renderAtomicSelector,
          declarationAnalysis.declaration.source ?? rule.source
        );

        if (registered.reused) {
          stats.reusedAtomicDeclarations += 1;
        }

        addCurrentAtomic(currentAtomicByKey, {
          key: registered.key,
          className: registered.className,
          selector: registered.selector,
          declaration: declarationAnalysis.declaration,
          context,
          source: declarationAnalysis.declaration.source ?? rule.source
        });
        classMappings.addAtomic(arm.anchorClassName, rule.selector, registered.className);
      }
      continue;
    }

    preserveDeclaration(rule, scope, preservedRules, diagnostics, stats, declarationAnalysis, selectorRewrite);
  }
}

/** 确保 eligible list 中所有可导出 anchor 都进入稳定 class mapping。 */
function ensureEligibleArms(
  classMappings: ClassMappingBuilder,
  selectorRewrite: EligibleSelectorRewrite,
  originalSelector: string
): void {
  for (const sourceClassName of new Set(selectorRewrite.arms.map((arm) => arm.anchorClassName))) {
    classMappings.ensure(sourceClassName, originalSelector);
  }
}

/** 单 anchor rule 返回 diagnostic source class；多 anchor list 不虚构唯一归属。 */
function getSingleEligibleSourceClassName(
  selectorRewrite: EligibleSelectorRewrite
): string | undefined {
  const sourceClassNames = [...new Set(selectorRewrite.arms.map((arm) => arm.anchorClassName))];
  return sourceClassNames.length === 1 ? sourceClassNames[0] : undefined;
}

/**
 * 判断 safe class 是否能进入真实 DOM class string。
 *
 * @param rule - 当前 rule，用于构造 export evidence context。
 * @param scope - adapter scope strategy。
 * @param sourceClassName - 唯一 source class。
 * @returns adapter 未提供判断时默认 `true`。
 */
function shouldTransformSafeClass(rule: CssRuleRecord, scope: ScopeStrategy, sourceClassName: string): boolean {
  return (
    scope.shouldExportClassName?.(sourceClassName, {
      id: rule.id,
      originalSelector: rule.selector,
      usage: 'safe-rule'
    }) ?? true
  );
}

/**
 * 保留无法导出到 tokens 的 safe rule。
 *
 * @param rule - 当前 rule。
 * @param scope - class resolver。
 * @param preservedRules - fallback 输出集合。
 * @param diagnostics - diagnostic 输出集合。
 * @param stats - unsafe/preserved 计数。
 * @param selectorRewrite - eligible selector rewrite plan。
 */
function preserveNonExportedSafeRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  classMappings: ClassMappingBuilder,
  preservedRules: PreservedRule[],
  diagnostics: Diagnostic[],
  stats: { unsafeRules: number; preservedDeclarations: number },
  selectorRewrite: EligibleSelectorRewrite,
  nonExportedClassNames: readonly string[]
): void {
  const reason: UnsafeSelectorReason = 'non-exported-class';
  const scopedSelector = selectorRewrite.renderPreservedSelector(scope, {
    id: rule.id,
    originalSelector: rule.selector,
    usage: 'preserved-rule'
  });

  ensureEligibleArms(classMappings, selectorRewrite, rule.selector);

  stats.unsafeRules += 1;
  stats.preservedDeclarations += rule.declarations.length;
  preservedRules.push({
    id: rule.id,
    order: rule.order,
    selector: rule.selector,
    scopedSelector,
    declarations: rule.declarations,
    context: rule.context,
    reason,
    source: rule.source
  });
  for (const sourceClassName of nonExportedClassNames) {
    diagnostics.push(
      createDiagnostic({
        code: 'unsafe-selector',
        level: 'warning',
        message: unsafeSelectorMessage(rule.selector, reason),
        id: rule.id,
        selector: rule.selector,
        sourceClassName,
        reason,
        source: rule.source
      })
    );
  }
}

/**
 * 保留 safe rule 中无法 atomize 的单条 declaration。
 *
 * @param rule - declaration 所属 rule。
 * @param scope - class resolver。
 * @param preservedRules - fallback 输出集合。
 * @param diagnostics - diagnostic 输出集合。
 * @param stats - preserved declaration 计数。
 * @param declarationAnalysis - preserved declaration 与原因。
 * @param selectorRewrite - eligible selector rewrite plan。
 */
function preserveDeclaration(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  preservedRules: PreservedRule[],
  diagnostics: Diagnostic[],
  stats: { preservedDeclarations: number },
  declarationAnalysis: Extract<DeclarationAnalysis, { kind: 'preserved' }>,
  selectorRewrite: EligibleSelectorRewrite
): void {
  stats.preservedDeclarations += 1;
  const scopedSelector = selectorRewrite.renderPreservedSelector(scope, {
    id: rule.id,
    originalSelector: rule.selector,
    usage: 'safe-rule'
  });

  preservedRules.push({
    id: rule.id,
    order: rule.order,
    selector: rule.selector,
    scopedSelector,
    declarations: [declarationAnalysis.declaration],
    context: rule.context,
    reason: declarationAnalysis.reason,
    source: declarationAnalysis.declaration.source ?? rule.source
  });

  addPreservedDeclarationDiagnostic(
    rule,
    diagnostics,
    declarationAnalysis,
    getSingleEligibleSourceClassName(selectorRewrite)
  );
}

/**
 * 恢复 preserved declaration 的原有 warning 契约，不参与 CSS 输出或计数。
 *
 * @remarks
 * class-wide fallback 会一次性输出整条 rule，但仍需要逐 declaration 只读分析，
 * 否则 invalid/unsupported declaration 的治理信号会被 selector evidence 降级吞掉。
 * custom property 继续按既有契约不输出 warning。
 *
 * @param rule - declaration 所属 rule。
 * @param diagnostics - 当前 input diagnostics。
 * @param declarationAnalysis - preserved declaration 及原因。
 * @param sourceClassName - diagnostic 对应的 source class。
 */
function addPreservedDeclarationDiagnostic(
  rule: CssRuleRecord,
  diagnostics: Diagnostic[],
  declarationAnalysis: Extract<DeclarationAnalysis, { kind: 'preserved' }>,
  sourceClassName?: string
): void {
  if (declarationAnalysis.reason === 'custom-property-declaration') {
    return;
  }

  diagnostics.push(
    createDiagnostic({
      code: 'preserved-declaration',
      level: 'warning',
      message: preservedDeclarationMessage(declarationAnalysis.declaration.prop, declarationAnalysis.reason),
      id: rule.id,
      selector: rule.selector,
      sourceClassName,
      reason: declarationAnalysis.reason,
      source: declarationAnalysis.declaration.source ?? rule.source
    })
  );
}

/**
 * 保留 unsafe rule 并记录 class evidence。
 *
 * @param rule - 当前 unsafe rule。
 * @param scope - class resolver。
 * @param classMappings - 当前 mapping builder。
 * @param preservedRules - fallback 输出集合。
 * @param diagnostics - diagnostic 输出集合。
 * @param stats - unsafe/preserved 计数。
 * @param selectorRewrite - 完整 preserved selector evidence 与 renderer。
 */
function preserveUnsafeRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  classMappings: ClassMappingBuilder,
  preservedRules: PreservedRule[],
  diagnostics: Diagnostic[],
  stats: { unsafeRules: number; preservedDeclarations: number },
  selectorRewrite: PreservedSelectorRewrite
): void {
  const scopedSelector = selectorRewrite.renderPreservedSelector(scope, {
    id: rule.id,
    originalSelector: rule.selector,
    usage: 'preserved-rule'
  });

  for (const sourceClassName of selectorRewrite.sourceClassNames) {
    classMappings.addUnsafeReason(sourceClassName, rule.selector, selectorRewrite.reason);
  }

  stats.unsafeRules += 1;
  stats.preservedDeclarations += rule.declarations.length;
  preservedRules.push({
    id: rule.id,
    order: rule.order,
    selector: rule.selector,
    scopedSelector,
    declarations: rule.declarations,
    context: rule.context,
    reason: selectorRewrite.reason,
    source: rule.source
  });
  diagnostics.push(
    createDiagnostic({
      code: 'unsafe-selector',
      level: 'warning',
      message: unsafeSelectorMessage(rule.selector, selectorRewrite.reason),
      id: rule.id,
      selector: rule.selector,
      reason: selectorRewrite.reason,
      source: rule.source
    })
  );
}

/**
 * 完整保留包含 nested node 的 rule。
 *
 * @param rule - 包含 nested node 的 rule IR。
 * @param scope - class resolver。
 * @param classMappings - 当前 mapping builder。
 * @param preservedBlocks - fallback block 输出集合。
 * @param diagnostics - diagnostic 输出集合。
 * @param stats - unsafe/preserved 计数。
 * @param selectorRewrite - 外层 selector evidence。
 */
function preserveNestedRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  classMappings: ClassMappingBuilder,
  preservedBlocks: PreservedBlock[],
  diagnostics: Diagnostic[],
  stats: { unsafeRules: number; preservedDeclarations: number },
  selectorRewrite: SelectorRewriteDecision
): void {
  const sourceClassNames = collectNestedSourceClassNames(rule, selectorRewrite);

  for (const sourceClassName of sourceClassNames) {
    classMappings.addUnsafeReason(sourceClassName, rule.selector, 'nested-rule');
  }

  stats.unsafeRules += 1;
  stats.preservedDeclarations += rule.declarations.length;
  preservedBlocks.push({
    id: rule.id,
    order: rule.order,
    css: scopeCssBlock(rule.css, scope, {
      id: rule.id,
      originalSelector: rule.selector,
      usage: 'preserved-rule'
    }),
    context: rule.context,
    reason: 'nested-rule',
    source: rule.source
  });
  diagnostics.push(
    createDiagnostic({
      code: 'unsafe-selector',
      level: 'warning',
      message: unsafeSelectorMessage(rule.selector, 'nested-rule'),
      id: rule.id,
      selector: rule.selector,
      reason: 'nested-rule',
      source: rule.source
    })
  );
}

/**
 * 记录当前输入使用到的 atomic declaration。
 *
 * @param currentAtomicByKey - 当前输入 key 到 declaration 的快照。
 * @param input - registry 返回值、declaration、context 和当前 source。
 */
function addCurrentAtomic(
  currentAtomicByKey: Map<string, AtomicDeclaration>,
  input: {
    key: string;
    className: string;
    selector: AtomicDeclaration['selector'];
    declaration: AtomicDeclaration['declaration'];
    context: CssTransformContext;
    source?: AtomicDeclaration['sources'][number];
  }
): void {
  const existing = currentAtomicByKey.get(input.key);

  if (existing) {
    if (input.source) {
      existing.sources.push({ ...input.source });
    }
    return;
  }

  currentAtomicByKey.set(input.key, {
    key: input.key,
    className: input.className,
    selector: { ...input.selector },
    declaration: { ...input.declaration, source: input.declaration.source && { ...input.declaration.source } },
    context: { ...input.context },
    sources: input.source ? [{ ...input.source }] : []
  });
}

/**
 * 收集 nested fallback block 中的 source classes。
 *
 * @param rule - nested rule IR。
 * @param selectorRewrite - 外层 selector evidence。
 * @returns block 解析成功时的全部 source classes；失败或为空时退回外层结果。
 */
function collectNestedSourceClassNames(rule: CssRuleRecord, selectorRewrite: SelectorRewriteDecision): readonly string[] {
  try {
    const sourceClassNames = collectSourceClassNamesFromCss(rule.css);

    if (sourceClassNames.length > 0) {
      return sourceClassNames;
    }
  } catch {
    // 保守降级：如果 nested CSS 再解析失败，至少保留外层 selector 的 class mapping。
  }

  return selectorRewrite.sourceClassNames;
}

/**
 * Scope unsupported at-rule preserved block。
 *
 * @param block - AST 收集阶段保留的 block。
 * @param scope - adapter class resolver。
 * @param classMappings - 当前 mapping builder。
 * @returns scoped block；普通 scoping fallback 保持既有行为。
 */
function scopePreservedBlock(
  block: PreservedBlock,
  scope: ScopeStrategy,
  classMappings: ClassMappingBuilder
): PreservedBlock {
  const sourceClassNames = collectSourceClassNamesFromCss(block.css);

  try {
    for (const sourceClassName of sourceClassNames) {
      classMappings.ensure(sourceClassName, block.css);
    }

    return {
      ...block,
      css: scopeCssBlock(block.css, scope, {
        id: block.id,
        originalSelector: '',
        usage: 'preserved-rule'
      }),
      source: block.source && { ...block.source }
    };
  } catch {
    return {
      ...block,
      source: block.source && { ...block.source }
    };
  }
}

/**
 * 创建无法进入 transform pipeline 时的空结果。
 *
 * @param input - 原始 CSS 输入。
 * @param diagnostics - parse 等前置阶段 diagnostics。
 * @returns CSS、mapping 和 manifest 为空但 report 保留 before size 的 snapshot。
 */
function createEmptyResult(input: TransformCssInput, diagnostics: Diagnostic[]): TransformCssResult {
  const report = createReport({
    beforeCss: input.css,
    atomicCss: '',
    preservedCss: '',
    classes: {},
    diagnostics,
    atomicDeclarations: 0,
    reusedAtomicDeclarations: 0,
    unsafeRules: 0,
    preservedRules: 0,
    preservedDeclarations: 0
  });

  return {
    id: input.id,
    css: {
      atomic: '',
      preserved: ''
    },
    classes: {},
    atomic: [],
    diagnostics,
    manifest: {
      atomic: {},
      classes: {}
    },
    report
  };
}

/**
 * 合并 class manifest snapshots。
 *
 * @param left - 已聚合 entries。
 * @param right - 当前输入 entries。
 * @returns 后写同 key 覆盖并完成防御性克隆的 manifest classes。
 */
function mergeClassManifest(
  left: TransformManifest['classes'],
  right: TransformManifest['classes']
): TransformManifest['classes'] {
  return cloneClassManifest({
    ...left,
    ...right
  });
}

/**
 * 深度克隆 class manifest 的数组字段。
 *
 * @param classes - 内部 class manifest。
 * @returns 不共享 atomicClassNames/unsafeReasons 数组的副本。
 */
function cloneClassManifest(classes: TransformManifest['classes']): TransformManifest['classes'] {
  const cloned: TransformManifest['classes'] = {};

  for (const [key, entry] of Object.entries(classes)) {
    cloned[key] = {
      ...entry,
      atomicClassNames: [...entry.atomicClassNames],
      unsafeReasons: entry.unsafeReasons ? [...entry.unsafeReasons] : undefined
    };
  }

  return cloned;
}
