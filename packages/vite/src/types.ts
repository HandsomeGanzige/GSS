/**
 * Vite adapter 的公开配置与内部 resolved 配置类型。
 *
 * @module vite/types
 */
import type { TransformCssOptions } from '@semantic-atomic-css/core';

/**
 * adapter 可交给 Vite 原生 CSS Modules 管线的 tokens key 转换策略。
 *
 * @remarks
 * `asIs` 表示删除继承的 localsConvention 并恢复原始 key；其余值沿用 Vite 6 对应语义。
 */
export type LocalsConvention = 'asIs' | 'camelCase' | 'camelCaseOnly' | 'dashes' | 'dashesOnly';

/**
 * 控制 adapter 如何配置 Vite 原生 CSS Modules 管线。
 *
 * @remarks
 * 未提供 `modules` 时继承 Vite `css.modules`；显式提供后由 GSS 配置覆盖当前支持项。
 * `namedExports: true` 当前会显式失败，避免生成无法安全增强的 export。
 */
export type CssModulesOptions = {
  /** Vite tokens export key 转换策略。 */
  localsConvention?: LocalsConvention;
  /** 交给 Vite 原生管线的 scoped class name 生成策略。 */
  generateScopedName?: string | ((name: string, filename: string, css: string) => string);
  /** 保留的保护配置；当前 `true` 会 fail fast。 */
  namedExports?: boolean;
};

/** 控制 manifest asset 输出的配置。 */
export type ManifestOptions = {
  /** 是否 emit manifest，默认 `false`。 */
  enabled?: boolean;
  /** 输出文件名，默认 `semantic-atomic-manifest.json`。 */
  filename?: string;
};

/** 控制 report asset 输出的配置。 */
export type ReportOptions = {
  /** 是否 emit report，默认 `false`。 */
  enabled?: boolean;
  /** 输出文件名，默认 `semantic-atomic-report.json`。 */
  filename?: string;
};

/** 控制仅在 dev server 生效的 report API 与 browser overlay。 */
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

/**
 * 控制 Vite warning 和保护模式。
 *
 * @remarks
 * `strict: true` 是保留的产品边界，当前版本会显式失败而不是静默忽略；它不代表 strict mode
 * 已经实现。
 */
export type DiagnosticsOptions = {
  /** 是否把 core diagnostics 交给 Vite warning，默认 `true`。 */
  warn?: boolean;
  /** 保留的保护配置；当前 `true` 会 fail fast。 */
  strict?: boolean;
};

/**
 * Vite adapter 的公开配置入口。
 *
 * @remarks
 * include/exclude 当前只承诺 adapter 已验证的 `*` 与 `**` 匹配能力。core 选项只影响安全转换和
 * class name，不会放宽 selector/at-rule 范围。manifest/report 默认关闭，避免无意新增构建产物。
 */
export type SemanticAtomicCssOptions = {
  /** 要处理的 CSS Modules glob，默认覆盖 CSS、SCSS 和 Less Modules。 */
  include?: string | string[];
  /** 要排除的 glob，默认排除 `node_modules`。 */
  exclude?: string | string[];
  /** Vite 原生 CSS Modules 配置继承或覆盖策略。 */
  modules?: CssModulesOptions;
  /** 传递给 core safe transform 的选项。 */
  core?: TransformCssOptions;
  /** manifest JSON asset 配置。 */
  manifest?: ManifestOptions;
  /** report JSON asset 配置；开启后同时附带 analyzer analysis。 */
  report?: ReportOptions;
  /** dev report API 与 browser overlay；默认关闭且不影响 build。 */
  devtools?: DevtoolsOptions;
  /** warning 与尚未实现能力的保护配置。 */
  diagnostics?: DiagnosticsOptions;
};

/**
 * adapter 内部使用的已补齐配置。
 *
 * @internal
 */
export type ResolvedSemanticAtomicCssOptions = {
  include: string[];
  exclude: string[];
  modules: {
    localsConvention?: LocalsConvention;
    hasLocalsConvention: boolean;
    generateScopedName?: CssModulesOptions['generateScopedName'];
    hasGenerateScopedName: boolean;
    namedExports: boolean;
    configured: boolean;
  };
  core: TransformCssOptions;
  manifest: Required<ManifestOptions>;
  report: Required<ReportOptions>;
  devtools: Required<DevtoolsOptions>;
  diagnostics: Required<DiagnosticsOptions>;
};
