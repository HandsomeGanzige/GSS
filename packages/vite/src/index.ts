/**
 * 将 GSS 安全 CSS 转换能力接入 Vite 6 原生 CSS Modules 管线。
 *
 * @remarks
 * adapter 复用 Vite 产生的 scoped CSS、tokens、预处理器结果、资源和 dependency graph，随后增强
 * tokens 并聚合 atomic/preserved CSS。默认只处理 `.module.css`、`.module.scss` 和 `.module.less`；
 * 普通 CSS 保持由 Vite 原生管线管理。
 *
 * @packageDocumentation
 */
export { semanticAtomicCss, semanticAtomicCssPlugin } from './plugin.js';
export type {
  CssModulesOptions,
  DevtoolsOptions,
  DiagnosticsOptions,
  LocalsConvention,
  ManifestOptions,
  ReportOptions,
  SemanticAtomicCssOptions
} from './types.js';
