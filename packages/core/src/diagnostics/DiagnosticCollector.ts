/**
 * Core pipeline pass 之间共享的 diagnostic collector。
 *
 * @module core/diagnostics/DiagnosticCollector
 */
import type { Diagnostic } from '../public/types.js';

/** 聚合 pipeline diagnostics，并只通过快照向外暴露结果。 */
export class DiagnosticCollector {
  private readonly diagnostics: Diagnostic[] = [];

  /**
   * 记录一条 diagnostic。
   *
   * @param diagnostic - 要按当前顺序追加的结构化 diagnostic。
   */
  add(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  /**
   * 批量记录 diagnostics。
   *
   * @param diagnostics - 按给定顺序追加的 diagnostics。
   */
  addMany(diagnostics: Diagnostic[]): void {
    for (const diagnostic of diagnostics) {
      this.add(diagnostic);
    }
  }

  /**
   * 读取当前 diagnostics。
   *
   * @returns 不共享 collector 内部数组的顺序快照。
   */
  list(): Diagnostic[] {
    return [...this.diagnostics];
  }
}
