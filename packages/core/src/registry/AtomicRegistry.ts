import type { AtomicClassNameOptions, AtomicDeclaration, AtomicKeyInput, SourceLocation } from '../public/types.js';
import { createAtomicClassName } from '../atomizer/createAtomicClassName.js';
import { createAtomicKey } from '../atomizer/createAtomicKey.js';
import { hashString } from '../utils/hash.js';

/** 维护 atomic declaration 的复用、顺序、来源和 class name collision。 */
export class AtomicRegistry {
  private readonly declarationsByKey = new Map<string, AtomicDeclaration>();
  private readonly keyByClassName = new Map<string, string>();
  private totalRegisterCount = 0;

  constructor(private readonly classNameOptions: Required<AtomicClassNameOptions>) {}

  /** 注册 declaration，已存在时复用 class name 并补充来源。 */
  register(input: AtomicKeyInput, source?: SourceLocation): { key: string; className: string; reused: boolean } {
    const key = createAtomicKey(input);
    const existing = this.declarationsByKey.get(key);
    this.totalRegisterCount += 1;

    if (existing) {
      if (source) {
        existing.sources.push(source);
      }

      return {
        key,
        className: existing.className,
        reused: true
      };
    }

    const className = this.createAvailableClassName(input, key);
    const declaration: AtomicDeclaration = {
      key,
      className,
      declaration: input.declaration,
      context: input.context,
      sources: source ? [source] : []
    };

    this.declarationsByKey.set(key, declaration);
    this.keyByClassName.set(className, key);

    return {
      key,
      className,
      reused: false
    };
  }

  /** 返回按首次注册顺序排列的 atomic declarations。 */
  list(): AtomicDeclaration[] {
    return [...this.declarationsByKey.values()].map((declaration) => cloneAtomicDeclaration(declaration));
  }

  /** 返回 registry 级别的复用次数。 */
  getReusedCount(): number {
    return this.totalRegisterCount - this.declarationsByKey.size;
  }

  /** 生成未被不同 key 占用的 class name。 */
  private createAvailableClassName(input: AtomicKeyInput, key: string): string {
    const baseClassName = createAtomicClassName(input, this.classNameOptions);
    let candidate = baseClassName;
    let collisionIndex = 1;

    while (this.keyByClassName.has(candidate) && this.keyByClassName.get(candidate) !== key) {
      candidate = `${baseClassName}_${hashString(`${key}:${collisionIndex}`, 5)}`;
      collisionIndex += 1;
    }

    return candidate;
  }
}

/** 克隆 atomic declaration，避免外部持有 registry 内部可变 sources 引用。 */
function cloneAtomicDeclaration(declaration: AtomicDeclaration): AtomicDeclaration {
  return {
    key: declaration.key,
    className: declaration.className,
    declaration: { ...declaration.declaration, source: declaration.declaration.source && { ...declaration.declaration.source } },
    context: { ...declaration.context },
    sources: declaration.sources.map((source) => ({ ...source }))
  };
}
