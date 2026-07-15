/**
 * Core 对外 transform interface、结构化结果与稳定 diagnostic taxonomy。
 *
 * @remarks
 * 这些类型是 adapter 与 core 之间的正式 seam，不暴露 PostCSS AST、文件系统或构建工具类型。
 *
 * @module core/public/types
 */

/**
 * 表示 core 输入来源中的稳定位置。
 *
 * @remarks
 * `id` 由调用方定义，core 不假设它一定是文件系统路径。行列均采用 PostCSS 提供的 1-based 位置。
 * 该结构用于 diagnostics、manifest 和 report 反查，不参与 atomic key。
 */
export type SourceLocation = {
  id: string;
  line?: number;
  column?: number;
};

/**
 * 描述 class resolver 被调用时的最小上下文。
 *
 * @remarks
 * 该 interface 刻意不暴露 PostCSS AST，使 adapter 只依赖稳定的调用原因和原 selector。
 */
export type ResolveClassNameContext = {
  id: string;
  originalSelector: string;
  usage: 'safe-rule' | 'preserved-rule' | 'class-mapping';
};

/**
 * 由 adapter 提供的 class name 解析策略。
 *
 * @remarks
 * core 不实现 CSS Modules scoping，只消费 adapter 已经确定的 class name。resolver 对相同输入必须
 * 返回稳定结果；返回空字符串或抛出异常会破坏 preserved fallback。可选的 export 判断用于阻止
 * 无法进入真实 DOM class string 的 class 被错误 atomize。
 */
export type ScopeStrategy = {
  /**
   * 解析 source class 在当前使用位置对应的最终 class name。
   *
   * @param className - selector 中未经 adapter 解析的 source class name。
   * @param context - 当前输入 id、原 selector 和解析用途。
   * @returns preserved selector 和 class mapping 应使用的稳定 class name。
   */
  resolveClassName(className: string, context: ResolveClassNameContext): string;
  /**
   * 判断 source class 是否会通过 adapter 的 tokens 进入真实 DOM。
   *
   * @param className - selector 中未经 adapter 解析的 source class name。
   * @param context - 当前输入 id、原 selector 和导出判断上下文。
   * @returns `true` 时允许 atomize；`false` 时整条 rule 进入保守 fallback。省略时默认为 `true`。
   */
  shouldExportClassName?(className: string, context: ResolveClassNameContext): boolean;
};

/** atomic class name 的生成模式。 */
export type AtomicClassNameStrategy = 'readable' | 'hash';

/** 控制 atomic class name 生成的稳定选项。 */
export type AtomicClassNameOptions = {
  strategy?: AtomicClassNameStrategy;
  prefix?: string;
};

/**
 * core transform 的运行选项。
 *
 * @remarks
 * v1 只暴露 safe transform 能力。该 interface 不包含 selector 放宽、aggressive atomization、
 * 文件匹配或构建工具配置。
 */
export type TransformCssOptions = {
  /** 是否在建议的 class string 中保留 resolver 返回的 semantic class，默认 `true`。 */
  preserveResolvedClass?: boolean;
  /** atomic class name 的稳定生成策略。 */
  className?: AtomicClassNameOptions;
};

/**
 * core 的单次 CSS 输入。
 *
 * @remarks
 * 调用方负责先把 Sass、Less 等输入编译为标准 CSS。`preserveClassNames` 是 adapter 提供的
 * class 级保守证据；被标记 class 的基础、pseudo 和条件规则都会完整保留，避免部分转换改变 cascade。
 */
export type TransformCssInput = {
  /** 用于 diagnostics、manifest 和 report 的稳定来源标识。 */
  id: string;
  /** 已完成预处理的标准 CSS 字符串。 */
  css: string;
  /** adapter 提供的 class scope 与 export evidence。 */
  scope: ScopeStrategy;
  /** 要整类保留的 source class 及稳定原因。 */
  preserveClassNames?: Readonly<Record<string, ClassPreservationReason>>;
};

/** adapter 要求 core 保守保留整个 class 的稳定原因。 */
export type ClassPreservationReason = 'asset-reference';

/**
 * CSS rule 所处的安全转换上下文。
 *
 * @remarks
 * 所有字段都参与 atomic key。当前只建模已验证的 pseudo、`@media` 和 `@supports`，
 * 未建模的 at-rule 必须走 preserved fallback。
 */
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

/**
 * core 输出的事件级结构化诊断。
 *
 * @remarks
 * core 不打印、去重或决定是否终止构建；warning 展示和 fail-fast 策略由 integration layer 负责。
 * 调用方应依赖稳定的 `code` 和 `reason`，不要解析可能调整的自然语言 `message`。
 */
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

/**
 * registry 中保存的 atomic declaration。
 *
 * @remarks
 * declaration 默认按首次注册顺序输出；`sources` 会记录跨输入复用位置，但不会影响 key 或 class name。
 */
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

/**
 * core 输出的机器可读索引。
 *
 * @remarks
 * `atomic` 以 atomic key 为键，`classes` 以 `id::sourceClassName` 为键。adapter 在持久化前可以
 * 规范化对象键和 source 顺序，但不得改变 declaration、context 或 class mapping 语义。
 */
export type TransformManifest = {
  atomic: Record<string, AtomicManifestEntry>;
  classes: Record<string, ClassManifestEntry>;
};

/**
 * core 输出的转换治理数据。
 *
 * @remarks
 * `transformCss` 返回当前输入的 report；有状态 transformer 的 `getReport` 返回整个 append-only
 * 生命周期的聚合值。体积字段是 UTF-8 字节估算，不等同于最终构建产物的 gzip/brotli 大小。
 */
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

/**
 * 单次 CSS transform 的完整结构化输出。
 *
 * @remarks
 * 即使由有状态 transformer 产生，`css`、`classes`、`atomic`、`diagnostics`、`manifest` 和 `report`
 * 仍只描述当前输入。跨文件聚合结果必须从 {@link Transformer} 的 getter 获取。
 */
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

/**
 * append-only build 使用的有状态 transformer interface。
 *
 * @remarks
 * 该 interface 不支持更新、删除或失效已经转换的 id。调用方不得把它直接复用于 dev/HMR；
 * build 开始时应创建新实例，build 结束后丢弃。
 */
export type Transformer = {
  /**
   * 转换一个输入，并把结果追加到当前聚合生命周期。
   *
   * @param input - 标准 CSS、source id、scope strategy 与转换选项。
   * @returns 当前输入的 atomic/preserved CSS、class mapping、diagnostics 与快照。
   */
  transformCss(input: TransformCssInput): TransformCssResult;
  /**
   * 读取当前 registry 中全部去重 atomic declaration 的 CSS 快照。
   *
   * @returns 按稳定 registry 顺序生成的 atomic CSS。
   */
  getAtomicCss(): string;
  /**
   * 读取当前生命周期的聚合 report 快照。
   *
   * @returns 包含转换统计与 diagnostics 的防御性快照。
   */
  getReport(): TransformReport;
  /**
   * 读取当前生命周期的聚合 manifest。
   *
   * @returns class 与 atomic source 映射的防御性副本。
   */
  getManifest(): TransformManifest;
};
