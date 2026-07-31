/** Rsbuild adapter 公开配置的默认值与归一化。 */
import type {
  ResolvedSemanticAtomicCssRsbuildOptions,
  SemanticAtomicCssRsbuildOptions
} from './types.js';
import { isValidDevReportEndpoint } from '@semantic-atomic-css/devtools';

/**
 * 补齐 adapter 选项；不复制 Rsbuild `output.cssModules`，该配置始终由原生管线继承。
 */
export function resolveOptions(
  options: SemanticAtomicCssRsbuildOptions = {}
): ResolvedSemanticAtomicCssRsbuildOptions {
  const devtoolsEnabled = options.devtools?.enabled === true || options.devtools?.overlay === true;
  const devtoolsEndpoint = options.devtools?.endpoint ?? '/__semantic-atomic-css/report';

  if (!isValidDevReportEndpoint(devtoolsEndpoint)) {
    throw new Error(`[semantic-atomic-css] invalid-dev-report-endpoint endpoint=${devtoolsEndpoint}`);
  }

  return {
    include: toArray(options.include ?? ['**/*.module.css', '**/*.module.scss', '**/*.module.less']),
    exclude: toArray(options.exclude ?? '**/node_modules/**'),
    core: {
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
    devtools: {
      enabled: devtoolsEnabled,
      overlay: devtoolsEnabled && (options.devtools?.overlay ?? true),
      endpoint: devtoolsEndpoint,
      pollIntervalMs: resolvePollInterval(options.devtools?.pollIntervalMs)
    },
    diagnostics: {
      warn: options.diagnostics?.warn ?? true,
      strict: options.diagnostics?.strict ?? false
    }
  };
}

/** 把 overlay 轮询间隔归一化为安全下限，拒绝 NaN/Infinity/非正数造成忙轮询。 */
function resolvePollInterval(value: number | undefined): number {
  const interval = value ?? 1_500;
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error(`[semantic-atomic-css] invalid-overlay-poll-interval value=${String(interval)}`);
  }
  return Math.max(250, Math.floor(interval));
}
/** 把单值和数组配置统一为防御性复制的数组。 */
function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? [...value] : [value];
}
