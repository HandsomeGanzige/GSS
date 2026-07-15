/**
 * 单次输入内 source class 到 resolved/atomic class 的 mapping builder。
 *
 * @module core/registry/ClassMappingBuilder
 */
import type {
  ResolveClassNameContext,
  ScopeStrategy,
  TransformClassMapping,
  UnsafeSelectorReason
} from '../public/types.js';

/**
 * 聚合同一输入内的 class mapping 与 unsafe evidence。
 *
 * @remarks
 * atomic class 和 unsafe reason 都去重并保持首次出现顺序；无法由 adapter 导出的 class 不进入结果。
 */
export class ClassMappingBuilder {
  private readonly records = new Map<
    string,
    {
      sourceClassName: string;
      resolvedClassName: string;
      atomicClassNames: string[];
      atomicClassNameSet: Set<string>;
      unsafeReasons: Set<UnsafeSelectorReason>;
    }
  >();

  /**
   * 创建单输入 mapping builder。
   *
   * @param id - 当前输入 id。
   * @param scope - adapter class resolver 与 export evidence。
   * @param preserveResolvedClass - suggested class string 是否保留 semantic resolved class。
   */
  constructor(
    private readonly id: string,
    private readonly scope: ScopeStrategy,
    private readonly preserveResolvedClass: boolean
  ) {}

  /**
   * 确保可导出的 source class 存在于 builder 中。
   *
   * @param sourceClassName - source selector 中的 class。
   * @param originalSelector - resolver/export evidence 使用的原 selector。
   */
  ensure(sourceClassName: string, originalSelector: string): void {
    if (!this.shouldExport(sourceClassName, originalSelector)) {
      return;
    }

    this.getOrCreate(sourceClassName, originalSelector);
  }

  /**
   * 给 source class 追加 atomic class。
   *
   * @param sourceClassName - mapping 主键。
   * @param originalSelector - 当前 class 来源 selector。
   * @param atomicClassName - registry 返回的 atomic class。
   */
  addAtomic(sourceClassName: string, originalSelector: string, atomicClassName: string): void {
    if (!this.shouldExport(sourceClassName, originalSelector)) {
      return;
    }

    const record = this.getOrCreate(sourceClassName, originalSelector);

    if (!record.atomicClassNameSet.has(atomicClassName)) {
      record.atomicClassNameSet.add(atomicClassName);
      record.atomicClassNames.push(atomicClassName);
    }
  }

  /**
   * 给 source class 追加 unsafe reason。
   *
   * @param sourceClassName - mapping 主键。
   * @param originalSelector - 产生 unsafe evidence 的 selector。
   * @param reason - 稳定 unsafe reason。
   */
  addUnsafeReason(sourceClassName: string, originalSelector: string, reason: UnsafeSelectorReason): void {
    if (!this.shouldExport(sourceClassName, originalSelector)) {
      return;
    }

    this.getOrCreate(sourceClassName, originalSelector).unsafeReasons.add(reason);
  }

  /**
   * 创建公开 class mappings 快照。
   *
   * @returns 以 source class 为键的 mapping；数组与集合均转换为新引用。
   */
  build(): Record<string, TransformClassMapping> {
    const mappings: Record<string, TransformClassMapping> = {};

    for (const record of this.records.values()) {
      const classNames = this.preserveResolvedClass
        ? [record.resolvedClassName, ...record.atomicClassNames]
        : record.atomicClassNames;
      const unsafeReasons = [...record.unsafeReasons];

      mappings[record.sourceClassName] = {
        sourceClassName: record.sourceClassName,
        resolvedClassName: record.resolvedClassName,
        atomicClassNames: [...record.atomicClassNames],
        suggestedClassName: classNames.join(' ').trim(),
        unsafeReasons: unsafeReasons.length > 0 ? unsafeReasons : undefined
      };
    }

    return mappings;
  }

  /**
   * 读取或创建内部 class record。
   *
   * @param sourceClassName - source class 主键。
   * @param originalSelector - 首次解析 resolved class 使用的 selector。
   * @returns builder 内部唯一 record。
   */
  private getOrCreate(sourceClassName: string, originalSelector: string) {
    const existing = this.records.get(sourceClassName);

    if (existing) {
      return existing;
    }

    const resolvedClassName = this.scope.resolveClassName(sourceClassName, this.context(originalSelector));
    const record = {
      sourceClassName,
      resolvedClassName,
      atomicClassNames: [] as string[],
      atomicClassNameSet: new Set<string>(),
      unsafeReasons: new Set<UnsafeSelectorReason>()
    };

    this.records.set(sourceClassName, record);
    return record;
  }

  /**
   * 判断 class 是否有 adapter 证据进入真实 token/DOM。
   *
   * @param sourceClassName - 待判断 class。
   * @param originalSelector - export evidence 上下文。
   * @returns adapter 未提供判断时默认 `true`。
   */
  private shouldExport(sourceClassName: string, originalSelector: string): boolean {
    return this.scope.shouldExportClassName?.(sourceClassName, this.context(originalSelector)) ?? true;
  }

  /**
   * 创建 class-mapping resolver 上下文。
   *
   * @param originalSelector - 当前 mapping 来源 selector。
   * @returns 带当前输入 id 和固定 usage 的 context。
   */
  private context(originalSelector: string): ResolveClassNameContext {
    return {
      id: this.id,
      originalSelector,
      usage: 'class-mapping'
    };
  }
}
