/** 表示 core 输入来源中的位置，用于 diagnostics、manifest 和 report 反查。 */
export type SourceLocation = {
  id: string;
  line?: number;
  column?: number;
};

/** 描述 resolver 被调用时的最小上下文，避免把内部 AST 泄漏给 adapter。 */
export type ResolveClassNameContext = {
  id: string;
  originalSelector: string;
  usage: 'safe-rule' | 'preserved-rule' | 'class-mapping';
};

/** 由 adapter 提供的 class name 解析策略，core 只消费最终 class name。 */
export type ScopeStrategy = {
  resolveClassName(className: string, context: ResolveClassNameContext): string;
  shouldExportClassName?(className: string, context: ResolveClassNameContext): boolean;
};

/** atomic class name 的生成模式。 */
export type AtomicClassNameStrategy = 'readable' | 'hash';

/** 控制 atomic class name 生成的稳定选项。 */
export type AtomicClassNameOptions = {
  strategy?: AtomicClassNameStrategy;
  prefix?: string;
};

/** core transform 的运行选项，v1 只暴露 safe transform 相关能力。 */
export type TransformCssOptions = {
  preserveResolvedClass?: boolean;
  className?: AtomicClassNameOptions;
};

/** core 的单次 CSS 输入，调用方负责准备标准 CSS 字符串和 scope strategy。 */
export type TransformCssInput = {
  id: string;
  css: string;
  scope: ScopeStrategy;
  preserveClassNames?: Readonly<Record<string, ClassPreservationReason>>;
};

/** adapter 要求 core 保守保留整个 class 的稳定原因。 */
export type ClassPreservationReason = 'asset-reference';

/** CSS rule 所处的安全转换上下文，参与 atomic key 生成。 */
export type CssTransformContext = {
  pseudo?: string;
  media?: string;
  supports?: string;
};

/** 结构化 declaration 元数据，后续 pass 不直接依赖 PostCSS declaration node。 */
export type DeclarationMeta = {
  prop: string;
  value: string;
  important: boolean;
  source?: SourceLocation;
};

/** unsafe selector 的稳定原因枚举，用于治理和 report 聚合。 */
export type UnsafeSelectorReason =
  | 'selector-list'
  | 'missing-source-class'
  | 'non-exported-class'
  | 'compound-class-selector'
  | 'descendant-selector'
  | 'child-selector'
  | 'adjacent-selector'
  | 'sibling-selector'
  | 'tag-selector'
  | 'id-selector'
  | 'attribute-selector'
  | 'pseudo-element'
  | 'unsupported-pseudo'
  | 'global-selector'
  | 'nested-rule'
  | 'unknown-selector';

/** preserved declaration 的稳定原因枚举。 */
export type PreservedDeclarationReason =
  | 'custom-property-declaration'
  | 'unsupported-declaration'
  | 'invalid-declaration';

/** selector 分析结果，safe 分支提供唯一 source class。 */
export type SelectorAnalysis =
  | {
      kind: 'safe';
      selector: string;
      sourceClassName: string;
      sourceClassNames: string[];
      pseudo?: string;
    }
  | {
      kind: 'unsafe';
      selector: string;
      sourceClassNames: string[];
      globalClassNames: string[];
      reason: UnsafeSelectorReason;
      details?: UnsafeSelectorReason[];
    };

/** declaration 分析结果，atomizable 和 preserved 分支都携带结构化 declaration。 */
export type DeclarationAnalysis =
  | {
      kind: 'atomizable';
      declaration: DeclarationMeta;
    }
  | {
      kind: 'preserved';
      declaration: DeclarationMeta;
      reason: PreservedDeclarationReason;
    };

/** diagnostic 的稳定编码，message 可以随文案演进。 */
export type DiagnosticCode =
  | 'unsafe-selector'
  | 'preserved-declaration'
  | 'preserved-class'
  | 'parse-error'
  | 'unsupported-at-rule'
  | 'unknown';

/** diagnostic 严重级别，是否 fail build 由 integration layer 决定。 */
export type DiagnosticLevel = 'info' | 'warning' | 'error';

/** core 输出的事件级诊断，不负责打印或格式化展示。 */
export type Diagnostic = {
  code: DiagnosticCode;
  level: DiagnosticLevel;
  message: string;
  id: string;
  selector?: string;
  sourceClassName?: string;
  reason?: string;
  source?: SourceLocation;
};

/** atomic key 的概念输入，包含 declaration 和当前转换上下文。 */
export type AtomicKeyInput = {
  declaration: DeclarationMeta;
  context: CssTransformContext;
};

/** registry 中保存的 atomic declaration，按首次注册顺序输出。 */
export type AtomicDeclaration = {
  key: string;
  className: string;
  declaration: DeclarationMeta;
  context: CssTransformContext;
  sources: SourceLocation[];
};

/** 单个 source class 的通用 class mapping，不等同于 CSS Modules tokens。 */
export type TransformClassMapping = {
  sourceClassName: string;
  resolvedClassName: string;
  atomicClassNames: string[];
  suggestedClassName: string;
  unsafeReasons?: UnsafeSelectorReason[];
};

/** manifest 中的 atomic declaration 反查记录。 */
export type AtomicManifestEntry = {
  key: string;
  className: string;
  declaration: DeclarationMeta;
  context: CssTransformContext;
  sources: SourceLocation[];
};

/** manifest 中的 source class 反查记录。 */
export type ClassManifestEntry = {
  id: string;
  sourceClassName: string;
  resolvedClassName: string;
  atomicClassNames: string[];
  suggestedClassName: string;
  unsafeReasons?: UnsafeSelectorReason[];
};

/** core 输出的机器可读索引，用于从产物反查来源。 */
export type TransformManifest = {
  atomic: Record<string, AtomicManifestEntry>;
  classes: Record<string, ClassManifestEntry>;
};

/** core 输出的聚合治理数据，用于理解转换效果和风险。 */
export type TransformReport = {
  summary: {
    files: number;
    sourceClasses: number;
    atomicDeclarations: number;
    reusedAtomicDeclarations: number;
    unsafeRules: number;
    preservedRules: number;
    preservedDeclarations: number;
  };
  size: {
    beforeCssBytes: number;
    afterAtomicCssBytes: number;
    afterPreservedCssBytes: number;
    estimatedClassStringIncreaseBytes: number;
    estimatedTotalDiffBytes: number;
  };
  diagnostics: Diagnostic[];
};

/** 单次 CSS transform 的完整结构化输出。 */
export type TransformCssResult = {
  id: string;
  css: {
    atomic: string;
    preserved: string;
  };
  classes: Record<string, TransformClassMapping>;
  atomic: AtomicDeclaration[];
  diagnostics: Diagnostic[];
  manifest: TransformManifest;
  report: TransformReport;
};

/** 有状态 transformer，用于 append-only build 流程中的跨文件复用和聚合 report。 */
export type Transformer = {
  transformCss(input: TransformCssInput): TransformCssResult;
  getAtomicCss(): string;
  getReport(): TransformReport;
  getManifest(): TransformManifest;
};
