/** Rsbuild adapter 公开配置的默认值与归一化。 */
import type {
  ResolvedSemanticAtomicCssRsbuildOptions,
  SemanticAtomicCssRsbuildOptions
} from './types.js';

/**
 * 补齐 adapter 选项；不复制 Rsbuild `output.cssModules`，该配置始终由原生管线继承。
 */
export function resolveOptions(
  options: SemanticAtomicCssRsbuildOptions = {}
): ResolvedSemanticAtomicCssRsbuildOptions {
  return {
    include: toArray(options.include ?? ['**/*.module.css', '**/*.module.scss', '**/*.module.less']),
    exclude: toArray(options.exclude ?? '**/node_modules/**'),
    core: {
      preserveResolvedClass: options.core?.preserveResolvedClass ?? true,
      className: options.core?.className
    },
    cssFilename: options.cssFilename ?? 'static/css/semantic-atomic.css',
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
/** 把单值和数组配置统一为防御性复制的数组。 */
function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? [...value] : [value];
}
