/**
 * Core 单输入无状态 helper。
 *
 * @module core/engine/transformCss
 */
import type { TransformCssInput, TransformCssOptions, TransformCssResult } from '../public/types.js';
import { createTransformer } from './createTransformer.js';

/**
 * 对单个标准 CSS 输入执行一次独立的安全转换。
 *
 * @remarks
 * 每次调用都会创建新的 atomic registry，因此不会复用其他输入的 atomic declaration。
 * CSS parse error 会转换为 `parse-error` diagnostic 和空 CSS 结果，不会作为异常抛出。
 * 如需在一次 build 中跨文件复用 declaration，请使用 {@link createTransformer}。
 *
 * @param input - CSS、稳定来源 id 和 class scope strategy。调用方必须先完成预处理器编译。
 * @param options - class name 策略；semantic resolved class 始终保留。
 * @returns 当前输入的 atomic/preserved CSS、class mapping、diagnostics、manifest 与 report 快照。
 * @throws 调用方提供的 scope strategy 抛出的异常，以及非 CSS parse error 的意外实现异常。
 *
 * @example
 * ```ts
 * const result = transformCss({
 *   id: '/src/Button.module.css',
 *   css: '.button { color: red; }',
 *   scope: {
 *     resolveClassName: (className) => `Button_${className}__hash`
 *   }
 * });
 *
 * console.log(result.css.atomic);
 * ```
 */
export function transformCss(input: TransformCssInput, options: TransformCssOptions = {}): TransformCssResult {
  return createTransformer(options).transformCss(input);
}
