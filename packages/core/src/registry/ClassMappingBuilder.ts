import type {
  ResolveClassNameContext,
  ScopeStrategy,
  TransformClassMapping,
  UnsafeSelectorReason
} from '../public/types.js';

/** 聚合同一 input 内的 source class 到 atomic classes / unsafe reasons 的映射。 */
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

  constructor(
    private readonly id: string,
    private readonly scope: ScopeStrategy,
    private readonly preserveResolvedClass: boolean
  ) {}

  /** 确保 source class 存在于 builder 中，并按 shouldExportClassName 过滤。 */
  ensure(sourceClassName: string, originalSelector: string): void {
    if (!this.shouldExport(sourceClassName, originalSelector)) {
      return;
    }

    this.getOrCreate(sourceClassName, originalSelector);
  }

  /** 给 source class 追加 atomic class name，同时保持首次出现顺序。 */
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

  /** 给 source class 追加 unsafe reason，用于 manifest/report 反查。 */
  addUnsafeReason(sourceClassName: string, originalSelector: string, reason: UnsafeSelectorReason): void {
    if (!this.shouldExport(sourceClassName, originalSelector)) {
      return;
    }

    this.getOrCreate(sourceClassName, originalSelector).unsafeReasons.add(reason);
  }

  /** 输出 public class mappings。 */
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

  /** 读取或创建内部 class record。 */
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

  /** 判断 class 是否应该进入 result.classes。 */
  private shouldExport(sourceClassName: string, originalSelector: string): boolean {
    return this.scope.shouldExportClassName?.(sourceClassName, this.context(originalSelector)) ?? true;
  }

  /** 创建 class-mapping usage 的 resolver 上下文。 */
  private context(originalSelector: string): ResolveClassNameContext {
    return {
      id: this.id,
      originalSelector,
      usage: 'class-mapping'
    };
  }
}
