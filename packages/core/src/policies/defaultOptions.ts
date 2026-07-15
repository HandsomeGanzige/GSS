/**
 * Core transform 默认策略与用户选项归一化模块。
 *
 * @module core/policies/defaultOptions
 */
import type { AtomicClassNameOptions, TransformCssOptions } from '../public/types.js';

/** pipeline 内部使用的已补齐 transform options。 */
export type ResolvedTransformOptions = {
  preserveResolvedClass: boolean;
  className: Required<AtomicClassNameOptions>;
};

/** core 默认 class name 配置，优先保持开发态可读性。 */
export const defaultClassNameOptions: Required<AtomicClassNameOptions> = {
  strategy: 'readable',
  prefix: '_'
};

/**
 * 把可选用户配置解析为完整内部策略。
 *
 * @param options - core public transform options。
 * @returns 不含可选字段的 resolved options。
 */
export function resolveTransformOptions(options: TransformCssOptions = {}): ResolvedTransformOptions {
  return {
    preserveResolvedClass: options.preserveResolvedClass ?? true,
    className: {
      strategy: options.className?.strategy ?? defaultClassNameOptions.strategy,
      prefix: options.className?.prefix ?? defaultClassNameOptions.prefix
    }
  };
}
