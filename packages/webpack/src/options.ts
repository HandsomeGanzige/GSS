/** Webpack adapter 选项归一化与公共保护。 */
import path from 'node:path';
import { resolveCssLoaderCoreOptions } from '@semantic-atomic-css/css-loader-bridge';
import { isValidDevReportEndpoint } from '@semantic-atomic-css/devtools';
import type { ResolvedWebpackOptions, SemanticAtomicCssWebpackOptions } from './types.js';
/**
 * 校验并补齐 Webpack adapter 的公开配置。
 * @param options - 用户传入的可选配置。
 * @returns plugin 内部使用的完整稳定配置。
 */
export function resolveOptions(options: SemanticAtomicCssWebpackOptions = {}): ResolvedWebpackOptions {
  const enabled = options.devtools?.enabled === true || options.devtools?.overlay === true;
  const endpoint = options.devtools?.endpoint ?? '/__semantic-atomic-css/report';
  if (!isValidDevReportEndpoint(endpoint)) throw new Error(`[semantic-atomic-css] invalid-dev-report-endpoint endpoint=${endpoint}`);
  if (options.diagnostics?.strict) throw unsupported('diagnostics.strict', 'plugin.diagnostics.strict', 'strict mode 尚未实现。');
  const result: ResolvedWebpackOptions = {
    include: array(options.include ?? ['**/*.module.css','**/*.module.scss','**/*.module.less']),
    exclude: array(options.exclude ?? '**/node_modules/**'),
    core: { className: options.core?.className },
    cssFilename: options.cssFilename ?? 'static/css/semantic-atomic.css',
    manifest: { enabled: options.manifest?.enabled ?? false, filename: options.manifest?.filename ?? 'semantic-atomic-manifest.json' },
    report: { enabled: options.report?.enabled ?? false, filename: options.report?.filename ?? 'semantic-atomic-report.json' },
    devtools: { enabled, overlay: enabled && (options.devtools?.overlay ?? true), endpoint, pollIntervalMs: poll(options.devtools?.pollIntervalMs) },
    diagnostics: { warn: options.diagnostics?.warn ?? true, strict: false }
  };
  for (const filename of [result.cssFilename,result.manifest.filename,result.report.filename]) {
    if (path.posix.isAbsolute(filename) || filename.split('/').includes('..')) throw new Error(`[semantic-atomic-css] invalid-asset-filename filename=${filename}`);
  }
  return result;
}
/**
 * 按 dev/build 环境补齐 css-loader bridge 使用的 Core 命名策略。
 * @param core - 用户显式 Core 配置。
 * @param isDev - 当前 pipeline 是否为 dev owner。
 * @returns 保留显式值并补齐环境默认的 Core 配置。
 */
export function resolveCoreOptions(core: ResolvedWebpackOptions['core'], isDev: boolean) {
  return resolveCssLoaderCoreOptions(core, isDev);
}
/**
 * 创建具有稳定 feature/id/reason 字段的 unsupported-feature 错误。
 * @param feature - 不受支持能力的稳定机器标识。
 * @param id - 命中配置或资源的位置。
 * @param reason - 面向用户的中文失败原因。
 * @returns 可直接抛出的结构化错误。
 */
export function unsupported(feature:string,id:string,reason:string): Error {
  return new Error(`[semantic-atomic-css] unsupported-feature feature=${feature} id=${id} reason=${reason}`);
}
function array(value:string|string[]):string[]{ return Array.isArray(value)?[...value]:[value]; }
function poll(value:number|undefined):number { const n=value??1500; if(!Number.isFinite(n)||n<=0) throw new Error(`[semantic-atomic-css] invalid-overlay-poll-interval value=${String(n)}`); return Math.max(250,Math.floor(n)); }
