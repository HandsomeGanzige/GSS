/**
 * Atomic declaration 的全局复用、顺序、来源和 class collision registry。
 *
 * @module core/registry/AtomicRegistry
 */
import type {
  AtomicClassNameOptions,
  AtomicDeclaration,
  AtomicSelectorDescriptor,
  DeclarationMeta,
  SourceLocation
} from '../public/types.js';
import { createAtomicClassName } from '../atomizer/createAtomicClassName.js';
import { createAtomicKey, type AtomicKeyInput } from '../atomizer/createAtomicKey.js';
import { hashString } from '../utils/hash.js';

/**
 * registry 在同步 visitor 内借出的深只读 declaration view。
 *
 * @remarks
 * 该类型只存在 Core 内部模块，不从 package root 导出。consumer 不得保存 view、
 * iterator 或任何嵌套引用；真正的所有权始终属于 registry。
 */
export type BorrowedAtomicDeclaration = {
  readonly key: string;
  readonly className: string;
  readonly selector: Readonly<AtomicDeclaration['selector']>;
  readonly declaration: Omit<Readonly<DeclarationMeta>, 'source'> & {
    readonly source?: Readonly<SourceLocation>;
  };
  readonly context: Readonly<AtomicDeclaration['context']>;
  readonly sources: readonly Readonly<SourceLocation>[];
};

/** Core 内部的同步 borrowed declaration reader。 */
export interface AtomicDeclarationReader {
  readonly declarationCount: number;
  visitBorrowed(visitor: (declaration: BorrowedAtomicDeclaration) => void): void;
}

/**
 * 维护一次 transformer 生命周期中的 atomic declaration registry。
 *
 * @remarks
 * Map 插入顺序就是默认输出顺序。registry 不支持删除或失效，且所有 getter 都返回防御性副本。
 */
export class AtomicRegistry implements AtomicDeclarationReader {
  private readonly declarationsByKey = new Map<string, AtomicDeclaration>();
  private readonly keyByClassName = new Map<string, string>();
  private totalRegisterCount = 0;

  /**
   * 创建空 registry。
   *
   * @param classNameOptions - 生命周期内固定且已补齐的 class name 生成选项。
   */
  constructor(private readonly classNameOptions: Required<AtomicClassNameOptions>) {}

  /**
   * 注册或复用一条 atomic declaration。
   *
   * @param input - declaration 与完整 atomic context。
   * @param renderAtomicSelector - 使用 registry 选定的 class name 渲染完整 selector。
   * @param source - 当前使用位置；存在时追加到 declaration sources。
   * @returns 稳定 key/class name，以及本次是否命中已有 declaration。
   */
  register(
    input: AtomicKeyInput,
    renderAtomicSelector: (className: string) => string,
    source?: SourceLocation
  ): { key: string; className: string; selector: AtomicSelectorDescriptor; reused: boolean } {
    const key = createAtomicKey(input);
    const existing = this.declarationsByKey.get(key);

    if (existing) {
      const renderedCss = renderAtomicSelector(existing.className);

      if (existing.selector.identity !== input.selectorIdentity || existing.selector.css !== renderedCss) {
        throw new Error(
          `Atomic selector renderer produced inconsistent CSS for identity "${input.selectorIdentity}" and key "${key}".`
        );
      }

      if (source) {
        existing.sources.push(source);
      }
      this.totalRegisterCount += 1;

      return {
        key,
        className: existing.className,
        selector: { ...existing.selector },
        reused: true
      };
    }

    const className = findAvailableAtomicClassName(
      createAtomicClassName(input, this.classNameOptions),
      key,
      this.keyByClassName
    );
    const selector: AtomicSelectorDescriptor = {
      identity: input.selectorIdentity,
      css: renderAtomicSelector(className)
    };
    const declaration: AtomicDeclaration = {
      key,
      className,
      selector,
      declaration: {
        ...input.declaration,
        source: input.declaration.source && { ...input.declaration.source }
      },
      context: { ...input.context },
      sources: source ? [source] : []
    };

    this.declarationsByKey.set(key, declaration);
    this.keyByClassName.set(className, key);
    this.totalRegisterCount += 1;

    return {
      key,
      className,
      selector: { ...selector },
      reused: false
    };
  }

  /**
   * 读取全部 atomic declarations。
   *
   * @returns 按首次注册顺序排列的防御性副本。
   */
  list(): AtomicDeclaration[] {
    return [...this.declarationsByKey.values()].map((declaration) => cloneAtomicDeclaration(declaration));
  }

  /** 读取当前唯一 atomic declaration 数，不创建快照。 */
  get declarationCount(): number {
    return this.declarationsByKey.size;
  }

  /**
   * 按 Map 插入顺序同步借出 declaration。
   *
   * @remarks
   * visitor 只能在回调期间读取数据，不得 capture declaration 或嵌套引用。返回后
   * registry 仍是这些对象图的唯一所有者。
   *
   * @param visitor - 在当前同步调用栈内消费只读 view 的回调。
   */
  visitBorrowed(visitor: (declaration: BorrowedAtomicDeclaration) => void): void {
    for (const declaration of this.declarationsByKey.values()) {
      visitor(declaration);
    }
  }

  /**
   * 计算 registry 级别的复用次数。
   *
   * @returns 总注册次数减去唯一 key 数量。
   */
  getReusedCount(): number {
    return this.totalRegisterCount - this.declarationsByKey.size;
  }
}

/**
 * 在已有 class 占用表中寻找当前 key 可用的稳定名称。
 *
 * @remarks
 * 该包内 helper 让测试无需暴力搜索 32-bit 碰撞即可覆盖 compact 的 suffix 与二次碰撞分支；
 * suffix 格式保持 readable/hash 的既有 registry 兼容语义。
 *
 * @param baseClassName - class strategy 生成的候选基名。
 * @param key - 当前 atomic canonical key。
 * @param keyByClassName - 已登记 class 到 key 的占用表。
 * @returns 未占用或已由同 key 占用的名称。
 */
export function findAvailableAtomicClassName(
  baseClassName: string,
  key: string,
  keyByClassName: ReadonlyMap<string, string>
): string {
  let candidate = baseClassName;
  let collisionIndex = 1;

  while (keyByClassName.has(candidate) && keyByClassName.get(candidate) !== key) {
    candidate = `${baseClassName}_${hashString(`${key}:${collisionIndex}`, 5)}`;
    collisionIndex += 1;
  }

  return candidate;
}

/**
 * 深度克隆 atomic declaration 的可变结构。
 *
 * @param declaration - registry 内部 declaration。
 * @returns 不共享 declaration、context 或 sources 引用的副本。
 */
function cloneAtomicDeclaration(declaration: AtomicDeclaration): AtomicDeclaration {
  return {
    key: declaration.key,
    className: declaration.className,
    selector: { ...declaration.selector },
    declaration: { ...declaration.declaration, source: declaration.declaration.source && { ...declaration.declaration.source } },
    context: { ...declaration.context },
    sources: declaration.sources.map((source) => ({ ...source }))
  };
}
