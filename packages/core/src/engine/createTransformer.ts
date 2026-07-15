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
  SelectorAnalysis,
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
import { analyzeSelector } from '../selector/analyzeSelector.js';
import { analyzeDeclaration } from '../declaration/analyzeDeclaration.js';
import { scopeSelector } from '../selector/scopeSelector.js';
import { collectSourceClassNamesFromCss, scopeCssBlock } from '../selector/scopeCssBlock.js';
import { AtomicRegistry } from '../registry/AtomicRegistry.js';
import { ClassMappingBuilder } from '../registry/ClassMappingBuilder.js';
import { createDiagnostic } from '../diagnostics/createDiagnostic.js';
import {
  preservedClassMessage,
  preservedDeclarationMessage,
  unsafeSelectorMessage
} from '../diagnostics/messages.js';
import { renderAtomicCss } from '../output/renderAtomicCss.js';
import { renderPreservedCss } from '../output/renderPreservedCss.js';
import { createManifest } from '../output/createManifest.js';
import { createReport } from '../output/createReport.js';
import { mergeReports } from '../output/mergeReport.js';
import { resolveTransformOptions, type ResolvedTransformOptions } from '../policies/defaultOptions.js';
import { byteLength } from '../utils/bytes.js';

/**
 * 创建一次 append-only build 使用的有状态 transformer。
 *
 * @remarks
 * transformer 在多次 `transformCss` 调用之间复用 atomic registry，并聚合 manifest 与 report。
 * 单次返回值始终只描述当前输入；聚合视图必须通过 `getAtomicCss`、`getManifest` 和 `getReport`
 * 获取。当前 interface 不支持同一 id 的更新、删除或失效，因此不得直接作为 dev/HMR 缓存使用。
 *
 * @param options - 在 transformer 生命周期内保持不变的 class name 与 semantic class 保留策略。
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
      const result = runTransform(input, registry, resolvedOptions);
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
 * @param options - 已补齐且固定的 transform 策略。
 * @returns 当前输入的完整 transform snapshot。
 */
function runTransform(
  input: TransformCssInput,
  registry: AtomicRegistry,
  options: ResolvedTransformOptions
): TransformCssResult {
  const parsed = parseCss(input.id, input.css);

  if (!parsed.root) {
    return createEmptyResult(input, parsed.diagnostics);
  }

  const collected = collectIr(input.id, parsed.root);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics, ...collected.diagnostics];
  const classMappings = new ClassMappingBuilder(input.id, input.scope, options.preserveResolvedClass);
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
      input.preserveClassNames
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
  preserveClassNames: TransformCssInput['preserveClassNames']
): void {
  const selectorAnalysis = analyzeSelector(rule.selector);

  if (rule.hasNestedNodes) {
    preserveNestedRule(rule, scope, classMappings, preservedBlocks, diagnostics, stats, selectorAnalysis);
    return;
  }

  if (selectorAnalysis.kind === 'unsafe') {
    preserveUnsafeRule(rule, scope, classMappings, preservedRules, diagnostics, stats, selectorAnalysis.reason, selectorAnalysis);
    return;
  }

  const preservationReason = preserveClassNames?.[selectorAnalysis.sourceClassName];

  if (preservationReason) {
    preserveConfiguredSafeRule(rule, scope, classMappings, preservedRules, diagnostics, stats, selectorAnalysis, preservationReason);
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
    selectorAnalysis
  );
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
 * @param selectorAnalysis - safe selector evidence。
 * @param reason - adapter 提供的 class preservation reason。
 */
function preserveConfiguredSafeRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  classMappings: ClassMappingBuilder,
  preservedRules: PreservedRule[],
  diagnostics: Diagnostic[],
  stats: { preservedDeclarations: number },
  selectorAnalysis: Extract<SelectorAnalysis, { kind: 'safe' }>,
  reason: ClassPreservationReason
): void {
  classMappings.ensure(selectorAnalysis.sourceClassName, rule.selector);
  const scopedSelector = scopeSelector(rule.selector, scope, {
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
    reason,
    source: rule.source
  });
  diagnostics.push(
    createDiagnostic({
      code: 'preserved-class',
      level: 'warning',
      message: preservedClassMessage(selectorAnalysis.sourceClassName, reason),
      id: rule.id,
      selector: rule.selector,
      sourceClassName: selectorAnalysis.sourceClassName,
      reason,
      source: rule.source
    })
  );
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
 * @param selectorAnalysis - safe selector evidence。
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
  selectorAnalysis: Extract<SelectorAnalysis, { kind: 'safe' }>
): void {
  if (!shouldTransformSafeClass(rule, scope, selectorAnalysis.sourceClassName)) {
    preserveNonExportedSafeRule(rule, scope, preservedRules, diagnostics, stats, selectorAnalysis);
    return;
  }

  classMappings.ensure(selectorAnalysis.sourceClassName, rule.selector);

  for (const declaration of rule.declarations) {
    const declarationAnalysis = analyzeDeclaration(declaration);

    if (declarationAnalysis.kind === 'atomizable') {
      const context: CssTransformContext = {
        ...rule.context,
        pseudo: selectorAnalysis.pseudo
      };
      const registered = registry.register(
        {
          declaration: declarationAnalysis.declaration,
          context
        },
        declarationAnalysis.declaration.source ?? rule.source
      );

      if (registered.reused) {
        stats.reusedAtomicDeclarations += 1;
      }

      addCurrentAtomic(currentAtomicByKey, {
        key: registered.key,
        className: registered.className,
        declaration: declarationAnalysis.declaration,
        context,
        source: declarationAnalysis.declaration.source ?? rule.source
      });
      classMappings.addAtomic(selectorAnalysis.sourceClassName, rule.selector, registered.className);
      continue;
    }

    preserveDeclaration(rule, scope, preservedRules, diagnostics, stats, declarationAnalysis, selectorAnalysis);
  }
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
 * @param selectorAnalysis - safe selector evidence。
 */
function preserveNonExportedSafeRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  preservedRules: PreservedRule[],
  diagnostics: Diagnostic[],
  stats: { unsafeRules: number; preservedDeclarations: number },
  selectorAnalysis: Extract<SelectorAnalysis, { kind: 'safe' }>
): void {
  const reason: UnsafeSelectorReason = 'non-exported-class';
  const scopedSelector = scopeSelector(rule.selector, scope, {
    id: rule.id,
    originalSelector: rule.selector,
    usage: 'preserved-rule'
  });

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
      sourceClassName: selectorAnalysis.sourceClassName,
      reason,
      source: rule.source
    })
  );
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
 * @param selectorAnalysis - safe selector evidence。
 */
function preserveDeclaration(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  preservedRules: PreservedRule[],
  diagnostics: Diagnostic[],
  stats: { preservedDeclarations: number },
  declarationAnalysis: Extract<DeclarationAnalysis, { kind: 'preserved' }>,
  selectorAnalysis: Extract<SelectorAnalysis, { kind: 'safe' }>
): void {
  stats.preservedDeclarations += 1;
  const scopedSelector = scopeSelector(rule.selector, scope, {
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

  if (declarationAnalysis.reason !== 'custom-property-declaration') {
    diagnostics.push(
      createDiagnostic({
        code: 'preserved-declaration',
        level: 'warning',
        message: preservedDeclarationMessage(declarationAnalysis.declaration.prop, declarationAnalysis.reason),
        id: rule.id,
        selector: rule.selector,
        sourceClassName: selectorAnalysis.sourceClassName,
        reason: declarationAnalysis.reason,
        source: declarationAnalysis.declaration.source ?? rule.source
      })
    );
  }
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
 * @param reason - primary unsafe reason。
 * @param selectorAnalysis - 可选的完整 unsafe selector evidence。
 */
function preserveUnsafeRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  classMappings: ClassMappingBuilder,
  preservedRules: PreservedRule[],
  diagnostics: Diagnostic[],
  stats: { unsafeRules: number; preservedDeclarations: number },
  reason: UnsafeSelectorReason,
  selectorAnalysis?: Extract<SelectorAnalysis, { kind: 'unsafe' }>
): void {
  const sourceClassNames = selectorAnalysis?.sourceClassNames ?? [];
  const scopedSelector = scopeSelector(rule.selector, scope, {
    id: rule.id,
    originalSelector: rule.selector,
    usage: 'preserved-rule'
  });

  for (const sourceClassName of sourceClassNames) {
    classMappings.addUnsafeReason(sourceClassName, rule.selector, reason);
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
      reason,
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
 * @param selectorAnalysis - 外层 selector evidence。
 */
function preserveNestedRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  classMappings: ClassMappingBuilder,
  preservedBlocks: PreservedBlock[],
  diagnostics: Diagnostic[],
  stats: { unsafeRules: number; preservedDeclarations: number },
  selectorAnalysis: SelectorAnalysis
): void {
  const sourceClassNames = collectNestedSourceClassNames(rule, selectorAnalysis);

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
    declaration: { ...input.declaration, source: input.declaration.source && { ...input.declaration.source } },
    context: { ...input.context },
    sources: input.source ? [{ ...input.source }] : []
  });
}

/**
 * 收集 nested fallback block 中的 source classes。
 *
 * @param rule - nested rule IR。
 * @param selectorAnalysis - 外层 selector evidence。
 * @returns block 解析成功时的全部 source classes；失败或为空时退回外层结果。
 */
function collectNestedSourceClassNames(rule: CssRuleRecord, selectorAnalysis: SelectorAnalysis): string[] {
  try {
    const sourceClassNames = collectSourceClassNamesFromCss(rule.css);

    if (sourceClassNames.length > 0) {
      return sourceClassNames;
    }
  } catch {
    // 保守降级：如果 nested CSS 再解析失败，至少保留外层 selector 的 class mapping。
  }

  return selectorAnalysis.sourceClassNames;
}

/**
 * Scope unsupported at-rule preserved block。
 *
 * @param block - AST 收集阶段保留的 block。
 * @param scope - adapter class resolver。
 * @param classMappings - 当前 mapping builder。
 * @returns scoped block；解析或 scoping 失败时返回保留原 CSS 的副本。
 */
function scopePreservedBlock(
  block: PreservedBlock,
  scope: ScopeStrategy,
  classMappings: ClassMappingBuilder
): PreservedBlock {
  try {
    for (const sourceClassName of collectSourceClassNamesFromCss(block.css)) {
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
