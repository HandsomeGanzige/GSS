import type { Diagnostic } from '../public/types.js';

/** 聚合 pipeline 产生的 diagnostics，避免 pass 之间散落可变数组。 */
export class DiagnosticCollector {
  private readonly diagnostics: Diagnostic[] = [];

  /** 记录一条 diagnostic。 */
  add(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  /** 批量记录 diagnostics。 */
  addMany(diagnostics: Diagnostic[]): void {
    for (const diagnostic of diagnostics) {
      this.add(diagnostic);
    }
  }

  /** 返回当前 diagnostics 的稳定快照。 */
  list(): Diagnostic[] {
    return [...this.diagnostics];
  }
}
