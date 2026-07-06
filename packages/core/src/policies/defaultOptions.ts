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

/** 合并 transform options，确保每次 pipeline 都有完整默认值。 */
export function resolveTransformOptions(options: TransformCssOptions = {}): ResolvedTransformOptions {
  return {
    preserveResolvedClass: options.preserveResolvedClass ?? true,
    className: {
      strategy: options.className?.strategy ?? defaultClassNameOptions.strategy,
      prefix: options.className?.prefix ?? defaultClassNameOptions.prefix
    }
  };
}
