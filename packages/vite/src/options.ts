/**
 * Vite adapter public options 的默认值与内部归一化模块。
 *
 * @module vite/options
 */
import type { ResolvedSemanticAtomicCssOptions, SemanticAtomicCssOptions } from './types.js';

/**
 * 把用户配置补齐为 adapter 内部稳定配置。
 *
 * @param options - 用户传入的公开配置。
 * @returns 所有默认值和“是否显式配置”证据均已补齐的内部配置。
 */
export function resolveOptions(options: SemanticAtomicCssOptions = {}): ResolvedSemanticAtomicCssOptions {
  return {
    include: toArray(
      options.include ?? ['**/*.module.css', '**/*.module.scss', '**/*.module.less']
    ),
    exclude: toArray(options.exclude ?? '**/node_modules/**'),
    modules: {
      localsConvention: options.modules?.localsConvention,
      hasLocalsConvention: options.modules?.localsConvention !== undefined,
      generateScopedName: options.modules?.generateScopedName,
      hasGenerateScopedName: options.modules?.generateScopedName !== undefined,
      namedExports: options.modules?.namedExports ?? false,
      configured: options.modules !== undefined
    },
    core: {
      preserveResolvedClass: options.core?.preserveResolvedClass ?? true,
      className: options.core?.className
    },
    manifest: {
      enabled: options.manifest?.enabled ?? false,
      filename: options.manifest?.filename ?? 'semantic-atomic-manifest.json'
    },
    report: {
      enabled: options.report?.enabled ?? false,
      filename: options.report?.filename ?? 'semantic-atomic-report.json'
    },
    diagnostics: {
      warn: options.diagnostics?.warn ?? true,
      strict: options.diagnostics?.strict ?? false
    }
  };
}

/**
 * 把单值或数组配置统一为新数组。
 *
 * @param value - 单个 glob 或 glob 数组。
 * @returns 不共享调用方数组引用的字符串数组。
 */
function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}
