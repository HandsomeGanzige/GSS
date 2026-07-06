import type { TransformCssOptions } from '@semantic-atomic-css/core';

/** 第一版支持的 CSS Modules tokens key 转换策略。 */
export type LocalsConvention = 'asIs' | 'camelCaseOnly';

/** 控制 CSS Modules adapter 层的配置。 */
export type CssModulesOptions = {
  localsConvention?: LocalsConvention;
  generateScopedName?: string | ((name: string, filename: string, css: string) => string);
  namedExports?: boolean;
};

/** 控制 manifest asset 输出的配置。 */
export type ManifestOptions = {
  enabled?: boolean;
  filename?: string;
};

/** 控制 report asset 输出的配置。 */
export type ReportOptions = {
  enabled?: boolean;
  filename?: string;
};

/** 控制 Vite warning 与未来 strict mode 的配置。 */
export type DiagnosticsOptions = {
  warn?: boolean;
  strict?: boolean;
};

/** Vite adapter 暴露给用户的配置入口。 */
export type SemanticAtomicCssOptions = {
  include?: string | string[];
  exclude?: string | string[];
  modules?: CssModulesOptions;
  core?: TransformCssOptions;
  manifest?: ManifestOptions;
  report?: ReportOptions;
  diagnostics?: DiagnosticsOptions;
};

/** adapter 内部使用的已补齐配置。 */
export type ResolvedSemanticAtomicCssOptions = {
  include: string[];
  exclude: string[];
  modules: Required<Pick<CssModulesOptions, 'localsConvention' | 'namedExports'>> &
    Pick<CssModulesOptions, 'generateScopedName'>;
  core: TransformCssOptions;
  manifest: Required<ManifestOptions>;
  report: Required<ReportOptions>;
  diagnostics: Required<DiagnosticsOptions>;
};
