/**
 * Atomic declarations 到标准 CSS 的渲染模块。
 *
 * @module core/output/renderAtomicCss
 */
import type { BorrowedAtomicDeclaration } from '../registry/AtomicRegistry.js';
import { byteLength } from '../utils/bytes.js';
import { renderRule } from './renderRule.js';
import { wrapAtRule } from './wrapAtRule.js';
import {
  visitAtomicDeclarations,
  type AtomicDeclarationSource
} from './visitAtomicDeclarations.js';

/**
 * 渲染全部 atomic declarations。
 *
 * @param declarations - 已按调用方要求排序的 declarations。
 * @returns 以空行分隔并恢复 media/supports context 的标准 CSS。
 */
export function renderAtomicCss(declarations: AtomicDeclarationSource): string {
  const rules: string[] = [];
  visitAtomicDeclarations(declarations, (declaration) => {
    rules.push(renderAtomicRule(declaration));
  });
  return rules.join('\n\n');
}

/**
 * 使用与完整 renderer 同源的 rule 序列化计算 UTF-8 bytes。
 *
 * @remarks
 * report-only 路径只累加单 rule 与分隔符 bytes，不构造或保留完整 CSS string。
 *
 * @param declarations - 单次 array snapshot 或 Core 内部 borrowed reader。
 * @returns 与 `byteLength(renderAtomicCss(declarations))` 一致的字节数。
 */
export function measureAtomicCssBytes(declarations: AtomicDeclarationSource): number {
  let totalBytes = 0;
  let ruleCount = 0;

  visitAtomicDeclarations(declarations, (declaration) => {
    if (ruleCount > 0) {
      totalBytes += 2;
    }
    totalBytes += byteLength(renderAtomicRule(declaration));
    ruleCount += 1;
  });

  return totalBytes;
}

/** 序列化一条 declaration，不保存 borrowed view。 */
function renderAtomicRule(declaration: BorrowedAtomicDeclaration): string {
  return wrapAtRule(renderRule(declaration.selector.css, [declaration.declaration]), declaration.context);
}
