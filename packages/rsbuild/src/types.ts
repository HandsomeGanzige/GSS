/**
 * Rsbuild adapter 的公开配置类型。
 *
 * @module rsbuild/types
 */
import type { TransformCssOptions } from '@semantic-atomic-css/core';

/** manifest asset 输出配置。 */
export type ManifestOptions = {
  /** 是否输出 manifest，默认 `false`。 */
  enabled?: boolean;
  /** 输出文件名，默认 `semantic-atomic-manifest.json`。 */
  filename?: string;
};
/** report asset 输出配置。 */
export type ReportOptions = {
  /** 是否输出 report，默认 `false`。 */
  enabled?: boolean;
  /** 输出文件名，默认 `semantic-atomic-report.json`。 */
  filename?: string;
};

/** 控制仅在 Rsbuild dev server 生效的 report API 与 browser overlay。 */
export type DevtoolsOptions = {
  /** 是否启用 dev report API；显式开启 overlay 时会隐式启用，默认 `false`。 */
  enabled?: boolean;
  /** 是否向 dev HTML 注入 Shadow DOM overlay；启用 devtools 时默认 `true`。 */
  overlay?: boolean;
  /** 同源 report API pathname，默认 `/__semantic-atomic-css/report`。 */
  endpoint?: string;
  /** overlay report 轮询间隔，默认 1500ms，最小 250ms。 */
  pollIntervalMs?: number;
};

/** warning 与保护模式配置。 */
export type DiagnosticsOptions = {
  /** 是否把 core diagnostics 交给 Rspack warning，默认 `true`。 */
  warn?: boolean;
  /** 保留的保护开关；当前 `true` 会 fail fast。 */
  strict?: boolean;
};

/** `@semantic-atomic-css/rsbuild` 的公开配置。 */
export type SemanticAtomicCssRsbuildOptions = {
  /** 处理范围，默认 `.module.css/.module.scss/.module.less`。 */
  include?: string | string[];
  /** 排除范围，默认 `node_modules`。 */
  exclude?: string | string[];
  /** 传递给 core 的 safe transform 配置。 */
  core?: TransformCssOptions;
  /** build atomic CSS 文件名。 */
  cssFilename?: string;
  /** manifest 输出配置。 */
  manifest?: ManifestOptions;
  /** report 输出配置。 */
  report?: ReportOptions;
  /** dev report API 与 browser overlay；默认关闭且不影响 build。 */
  devtools?: DevtoolsOptions;
  /** diagnostics 与尚未支持能力的保护配置。 */
  diagnostics?: DiagnosticsOptions;
};

/** adapter 内部补齐后的稳定配置。 */
export type ResolvedSemanticAtomicCssRsbuildOptions = {
  include: string[];
  exclude: string[];
  core: TransformCssOptions;
  cssFilename: string;
  manifest: Required<ManifestOptions>;
  report: Required<ReportOptions>;
  devtools: Required<DevtoolsOptions>;
  diagnostics: Required<DiagnosticsOptions>;
};
