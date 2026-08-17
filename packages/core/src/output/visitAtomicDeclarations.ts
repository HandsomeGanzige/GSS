/**
 * Core output consumer 共用的 atomic declaration 遍历边界。
 *
 * @module core/output/visitAtomicDeclarations
 */
import type { AtomicDeclaration } from '../public/types.js';
import type {
  AtomicDeclarationReader,
  BorrowedAtomicDeclaration
} from '../registry/AtomicRegistry.js';

/** 单次防御性数组或 registry 同步 borrowed reader。 */
export type AtomicDeclarationSource = readonly AtomicDeclaration[] | AtomicDeclarationReader;

/**
 * 在同步调用栈内遍历 atomic declaration，不返回或保存 borrowed view。
 *
 * @param declarations - 单次 array snapshot 或 Core 内部 reader。
 * @param visitor - 只读消费 declaration 的同步回调。
 */
export function visitAtomicDeclarations(
  declarations: AtomicDeclarationSource,
  visitor: (declaration: BorrowedAtomicDeclaration) => void
): void {
  if ('visitBorrowed' in declarations) {
    declarations.visitBorrowed(visitor);
    return;
  }

  for (const declaration of declarations) {
    visitor(declaration);
  }
}
