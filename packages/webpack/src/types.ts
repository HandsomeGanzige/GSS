/** Webpack adapter 的公开配置类型。 */
import type { TransformCssOptions } from '@semantic-atomic-css/core';
/** 控制可选 build metadata asset 的启用状态与文件名。 */
export type AssetOptions = { enabled?: boolean; filename?: string };
/** 控制 dev report middleware 与浏览器 overlay。 */
export type DevtoolsOptions = { enabled?: boolean; overlay?: boolean; endpoint?: string; pollIntervalMs?: number };
/** 控制 adapter diagnostics；strict 当前仅用于显式拒绝未实现配置。 */
export type DiagnosticsOptions = { warn?: boolean; strict?: boolean };
/** Webpack adapter 的公开配置输入。 */
export type SemanticAtomicCssWebpackOptions = {
  include?: string | string[];
  exclude?: string | string[];
  core?: TransformCssOptions;
  cssFilename?: string;
  manifest?: AssetOptions;
  report?: AssetOptions;
  devtools?: DevtoolsOptions;
  diagnostics?: DiagnosticsOptions;
};
/** plugin 内部使用的已校验、无缺省项配置。 */
export type ResolvedWebpackOptions = {
  include: string[]; exclude: string[]; core: TransformCssOptions; cssFilename: string;
  manifest: Required<AssetOptions>; report: Required<AssetOptions>; devtools: Required<DevtoolsOptions>;
  diagnostics: Required<DiagnosticsOptions>;
};
