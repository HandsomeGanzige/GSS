import type {
  AtomicDeclaration,
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
import { preservedDeclarationMessage, unsafeSelectorMessage } from '../diagnostics/messages.js';
import { renderAtomicCss } from '../output/renderAtomicCss.js';
import { renderPreservedCss } from '../output/renderPreservedCss.js';
import { createManifest } from '../output/createManifest.js';
import { createReport } from '../output/createReport.js';
import { mergeReports } from '../output/mergeReport.js';
import { resolveTransformOptions, type ResolvedTransformOptions } from '../policies/defaultOptions.js';
import { byteLength } from '../utils/bytes.js';

/** 创建有状态 transformer，负责跨文件 atomic registry 与聚合 report。 */
export function createTransformer(options: TransformCssOptions = {}): Transformer {
  const resolvedOptions = resolveTransformOptions(options);
  const registry = new AtomicRegistry(resolvedOptions.className);
  const reports: TransformReport[] = [];
  let latestClassManifest: TransformManifest['classes'] = {};

  return {
    transformCss(input: TransformCssInput): TransformCssResult {
      const result = runTransform(input, registry, resolvedOptions);
      reports.push(result.report);
      latestClassManifest = mergeClassManifest(latestClassManifest, result.manifest.classes);
      return result;
    },

    getAtomicCss(): string {
      return renderAtomicCss(registry.list());
    },

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

    getManifest(): TransformManifest {
      return {
        atomic: createManifest('', registry.list(), {}).atomic,
        classes: cloneClassManifest(latestClassManifest)
      };
    }
  };
}

/** 执行单次 transform pipeline。 */
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
      stats
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

/** 处理单条 rule，根据 selector/declaration 分析结果选择 atomize 或 preserved。 */
function processRule(
  rule: CssRuleRecord,
  scope: ScopeStrategy,
  registry: AtomicRegistry,
  classMappings: ClassMappingBuilder,
  preservedRules: PreservedRule[],
  preservedBlocks: PreservedBlock[],
  currentAtomicByKey: Map<string, AtomicDeclaration>,
  diagnostics: Diagnostic[],
  stats: { unsafeRules: number; preservedDeclarations: number; reusedAtomicDeclarations: number }
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

/** 处理 safe rule，允许 atomizable 与 preserved declaration 混合存在。 */
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

/** 判断 safe class 是否能通过 adapter 导出到真实 DOM class string。 */
function shouldTransformSafeClass(rule: CssRuleRecord, scope: ScopeStrategy, sourceClassName: string): boolean {
  return (
    scope.shouldExportClassName?.(sourceClassName, {
      id: rule.id,
      originalSelector: rule.selector,
      usage: 'safe-rule'
    }) ?? true
  );
}

/** 保留无法导出到 tokens 的 safe rule，避免生成不会命中 DOM 的 atomic CSS。 */
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

/** 保留 safe rule 中无法 atomize 的 declaration。 */
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

/** 保留 unsafe rule，并对其中 source class 记录 unsafe reason。 */
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

/** 保留包含 nested node 的整条 rule，避免只保留外层 declaration 导致 fallback 丢失。 */
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

/** 记录当前输入使用到的 atomic declaration 快照，避免单次 result 泄漏全局 registry。 */
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

/** nested fallback 需要记录整块 CSS 里出现的 source class，解析失败时退回外层 selector 结果。 */
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

/** 对 unsupported at-rule preserved block 执行 selector scoping，并补齐 class mapping fallback hook。 */
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

/** 生成 parse error 等无法进入 pipeline 时的空结果。 */
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

/** 合并 class manifest，后写入的 class entry 覆盖同 key 的旧 entry。 */
function mergeClassManifest(
  left: TransformManifest['classes'],
  right: TransformManifest['classes']
): TransformManifest['classes'] {
  return cloneClassManifest({
    ...left,
    ...right
  });
}

/** 克隆 class manifest，避免 getManifest 调用方持有内部引用。 */
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
