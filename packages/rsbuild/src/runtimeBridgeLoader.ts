/**
 * Rsbuild/Rspack runtime bridge loader。
 *
 * @remarks
 * 该 loader 通过 Rspack 公开 `importModule` API 执行右侧原生 css-loader，并消费 css-loader 官方
 * 默认 `exportType: "array"` 的结构化 CSS rows 与 `locals`。它不解析生成的 JavaScript，也不实现
 * CSS Modules scoping、ICSS、预处理器或资源解析。
 *
 * @module rsbuild/runtimeBridgeLoader
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import type {
  ClassPreservationReason,
  TransformClassMapping,
  TransformCssOptions,
  TransformCssResult
} from '@semantic-atomic-css/core';
import {
  augmentLocals as augmentSharedLocals,
  collectAmbiguousExportPreserveClassNames as collectSharedAmbiguousExportPreserveClassNames,
  collectAssetPreserveClassNames as collectSharedAssetPreserveClassNames,
  collectAtomicClassByKey as collectSharedAtomicClassByKey,
  collectExportedClassNames as collectSharedExportedClassNames,
  createDevStyleSnapshot as createSharedDevStyleSnapshot,
  mergeClassPreservationEvidence,
  transformCompiledInput as transformSharedCompiledInput,
  validateAndCloneRow as validateSharedAndCloneRow,
  validateLocals as validateSharedLocals
} from '@semantic-atomic-css/css-loader-bridge';
import type { DevStyleSnapshot } from './devStyles.js';

/** css-loader 默认 array export 中的单个结构化 CSS row。 */
export type CssRuntimeRow = [
  id: unknown,
  css: string,
  media?: string,
  sourceMap?: unknown,
  supports?: string,
  layer?: string
];

/** loader 交给 build collector 的 core 输入快照。 */
export type CompiledCssInput = {
  id: string;
  scopedCss: string;
  exportedClassNames: string[];
  preserveClassNames: Record<string, ClassPreservationReason>;
};

/** 单个顶层 CSS Module 经 runtime bridge 转换后的结构化结果。 */
export type RuntimeBridgeResult = {
  resourcePath: string;
  inputs: CompiledCssInput[];
  nativeLocals: Record<string, string>;
  augmentedLocals: Record<string, string>;
  transforms: Array<{ id: string; scopedCss: string; transform: TransformCssResult }>;
  atomicClassByKey: Record<string, string>;
};

/** 从 plugin 经 loader options 注入的受支持配置。 */
export type RuntimeBridgeLoaderOptions = {
  root: string;
  include: string[];
  exclude: string[];
  core: TransformCssOptions;
  isDev: boolean;
  warn: boolean;
  onResult(result: RuntimeBridgeResult): void;
};

const syntheticBaseUri = 'rspack-semantic-atomic-css:///';
const devStylesRuntimePath = fileURLToPath(new URL('./devStyles.js', import.meta.url));

/** Rspack loader context 的最小公开接口，避免依赖内部 compilation 对象。 */
type RuntimeBridgeLoaderContext = {
  resourcePath: string;
  rootContext: string;
  getOptions(): RuntimeBridgeLoaderOptions;
  importModule<T>(request: string, options?: { baseUri?: string }): Promise<T>;
  emitWarning(error: Error): void;
};

/** normal phase 只在非目标文件旁路时使用，原样透传 css-loader JS。 */
export default function runtimeBridgeLoader(source: string): string {
  return source;
}

/**
 * 在 pitch phase 执行原生 css-loader，安全转换 rows 并增强最终 default-export locals。
 *
 * build 只把 preserved CSS 留在原生 chunk，atomic declarations 由 plugin 全局聚合；dev 清空目标 rows，
 * 并把 atomic/preserved 快照登记到浏览器中的单一 shared owner，避免重复 key 改写 cascade 位置。
 */
export async function pitch(this: RuntimeBridgeLoaderContext, remainingRequest: string): Promise<string | undefined> {
  const options = this.getOptions();

  if (!isTargetCssModule(this.resourcePath, options)) {
    return undefined;
  }

  const request = `${this.resourcePath}.rspack[javascript/auto]!=!!!${remainingRequest}`;
  const moduleExports = await this.importModule<{ __esModule?: boolean; default?: unknown } | unknown>(request, {
    baseUri: syntheticBaseUri
  });
  const cssExport = readDefaultExport(moduleExports);

  if (!Array.isArray(cssExport)) {
    throw createBridgeError(
      'css-loader.exportType',
      this.resourcePath,
      '原生 css-loader default export 不是受支持的 array；请恢复默认 exportType。'
    );
  }

  const rows = cssExport.map((row) => {
    const cloned = validateSharedAndCloneRow(row, this.resourcePath);
    cloned[1] = normalizeSyntheticAssetUrls(cloned[1]);
    return cloned;
  });
  const nativeLocals = validateSharedLocals((cssExport as CssRuntimeRow[] & { locals?: unknown }).locals, this.resourcePath);
  const exportedClassNames = collectSharedExportedClassNames(nativeLocals);
  const preserveClassNames = mergeClassPreservationEvidence(
    collectSharedAssetPreserveClassNames(rows, nativeLocals),
    collectAmbiguousExportPreserveClassNames(nativeLocals, exportedClassNames)
  );
  const classMappings: Record<string, TransformClassMapping> = {};
  const inputs: CompiledCssInput[] = [];
  const transforms: RuntimeBridgeResult['transforms'] = [];

  for (const row of rows) {
    const id = readRowResourceId(row[0], this.resourcePath);

    if (!isTargetCssModule(id, options)) {
      continue;
    }

    const scopedCss = row[1];
    const input: CompiledCssInput = {
      id,
      scopedCss,
      exportedClassNames: [...exportedClassNames].sort(compareText),
      preserveClassNames: { ...preserveClassNames }
    };
    const transform = transformSharedCompiledInput(input, options.core);

    row[1] = options.isDev ? '' : transform.css.preserved;
    row[3] = undefined;
    Object.assign(classMappings, transform.classes);
    inputs.push(input);
    transforms.push({ id, scopedCss, transform });

    if (options.warn) {
      emitDiagnostics(this, transform);
    }
  }

  const augmentedLocals = augmentSharedLocals(nativeLocals, classMappings);
  options.onResult({
    resourcePath: this.resourcePath,
    inputs,
    nativeLocals,
    augmentedLocals,
    transforms,
    atomicClassByKey: collectSharedAtomicClassByKey(transforms)
  });

  const imports = [
    `import nativeCss from ${JSON.stringify(request)};`,
    ...(options.isDev
      ? [`import { registerDevStyles } from ${JSON.stringify(devStylesRuntimePath)};`]
      : [])
  ];
  const devRegistration = options.isDev
    ? [
        `const disposeDevStyles = registerDevStyles(${JSON.stringify(this.resourcePath)}, ${JSON.stringify(createDevStyleSnapshot(transforms))});`,
        'if (module.hot) module.hot.dispose(disposeDevStyles);'
      ]
    : [];

  return [
    ...imports,
    `const transformedRows = ${JSON.stringify(rows)};`,
    'if (!Array.isArray(nativeCss) || nativeCss.length !== transformedRows.length) {',
    `  throw new Error(${JSON.stringify(createBridgeError('css-loader.runtime-rows', this.resourcePath, '运行时原生 CSS rows 与 build-time 快照不一致。').message)});`,
    '}',
    'const css = nativeCss;',
    'for (let index = 0; index < transformedRows.length; index += 1) css[index] = transformedRows[index];',
    `css.locals = ${JSON.stringify(augmentedLocals)};`,
    ...devRegistration,
    'export default css;'
  ].join('\n');
}

/** 把 core 结果缩减为浏览器 shared owner 使用的当前 `{ sources }` 快照。 */
export function createDevStyleSnapshot(
  transforms: RuntimeBridgeResult['transforms']
): DevStyleSnapshot {
  return createSharedDevStyleSnapshot(transforms);
}

/**
 * 去除仅用于 `importModule` 执行上下文的 synthetic base URI。
 *
 * css-loader 已经借助 Rspack public path 解析出最终 asset path；当 public path 是相对或根路径时，
 * URL runtime 会把该 path 挂到 synthetic scheme 下。这里仅用 value AST 还原 scheme 内的
 * pathname/search/hash，不重新解析资源，也不修改绝对 CDN URL。
 */
export function normalizeSyntheticAssetUrls(css: string): string {
  const root = postcss.parse(css);

  root.walkDecls((declaration) => {
    const parsed = valueParser(declaration.value);
    let changed = false;

    parsed.walk((node) => {
      if (node.type !== 'function' || node.value.toLowerCase() !== 'url') {
        return undefined;
      }

      const valueNode = node.nodes.find((child) => child.type === 'word' || child.type === 'string');
      if (!valueNode || !valueNode.value.startsWith(syntheticBaseUri)) {
        return undefined;
      }

      const url = new URL(valueNode.value);
      valueNode.value = `${url.pathname}${url.search}${url.hash}`;
      changed = true;
      return false;
    });

    if (changed) {
      declaration.value = parsed.toString();
    }
  });

  return root.toString();
}

/** 对单个 compiled scoped CSS input 调用 core identity scope。 */
export function transformCompiledInput(input: CompiledCssInput, core: TransformCssOptions): TransformCssResult {
  return transformSharedCompiledInput(input, core);
}

/** 读取 ESM namespace 或 CommonJS 直接值的 default export。 */
function readDefaultExport(moduleExports: { __esModule?: boolean; default?: unknown } | unknown): unknown {
  if (
    moduleExports &&
    typeof moduleExports === 'object' &&
    '__esModule' in moduleExports &&
    moduleExports.__esModule
  ) {
    return (moduleExports as { default?: unknown }).default;
  }

  return moduleExports;
}

/**
 * 标记无法从 css-loader default locals 区分的同值 exports。
 *
 * css-loader array contract 只暴露最终字符串，不携带 export 来自 local class 还是 ICSS value 的类型证据。
 * 多个 export 的完整值相同时，任意选择一个追加 atomic class 都可能污染非 class export；因此把值中的
 * 已知 class 整体保留，让所有同值 export 继续使用原生字符串和 scoped fallback CSS。
 */
export function collectAmbiguousExportPreserveClassNames(
  locals: Record<string, string>,
  exportedClassNames: ReadonlySet<string>
): Record<string, ClassPreservationReason> {
  return collectSharedAmbiguousExportPreserveClassNames(locals, exportedClassNames);
}

/** 在 native token 后按原顺序追加去重 atomic classes。 */
export function augmentLocals(
  locals: Record<string, string>,
  classMappings: Record<string, TransformClassMapping>
): Record<string, string> {
  return augmentSharedLocals(locals, classMappings);
}

/** 从结构化 row id 的 loader request 尾部读取真实资源路径。 */
function readRowResourceId(rowId: unknown, resourcePath: string): string {
  if (typeof rowId !== 'string') {
    throw createBridgeError('css-loader.row-id', resourcePath, 'CSS row id 不是可追踪的 loader request。');
  }

  const request = rowId.split('!').at(-1) ?? rowId;
  const id = request.split('?')[0]?.split('#')[0];

  if (!id || !path.isAbsolute(id)) {
    throw createBridgeError('css-loader.row-id', resourcePath, `无法从 CSS row id 取得绝对资源路径：${rowId}`);
  }

  return id;
}

/** 判断文件命中产品扩展名及 include/exclude。 */
export function isTargetCssModule(id: string, options: Pick<RuntimeBridgeLoaderOptions, 'root' | 'include' | 'exclude'>): boolean {
  const normalized = normalizePath(id);
  if (!/\.module\.(?:css|scss|less)$/.test(normalized)) {
    return false;
  }
  return matchesAny(normalized, options.root, options.include) && !matchesAny(normalized, options.root, options.exclude);
}

/** 执行当前公开承诺的普通文本、`*` 与 `**` glob 匹配。 */
function matchesAny(id: string, root: string, patterns: string[]): boolean {
  const relative = path.relative(root, id);
  const relativeId = normalizePath(relative.startsWith('..') ? id : relative);
  return patterns.some((pattern) => matchesPattern(relativeId, pattern) || matchesPattern(id, pattern));
}

/** 把简易 glob 转成全路径匹配正则。 */
function matchesPattern(value: string, pattern: string): boolean {
  const escaped = normalizePath(pattern)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__GSS_GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__GSS_GLOBSTAR__/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

/** 输出 core diagnostics；是否终止由 core/loader exception 决定。 */
function emitDiagnostics(context: RuntimeBridgeLoaderContext, transform: TransformCssResult): void {
  for (const diagnostic of transform.diagnostics) {
    context.emitWarning(
      new Error(
        `[semantic-atomic-css] ${diagnostic.code} id=${diagnostic.id} reason=${diagnostic.reason ?? 'unknown'} selector=${diagnostic.selector ?? ''}`
      )
    );
  }
}

/** 创建统一 fail-fast 错误文本。 */
function createBridgeError(feature: string, id: string, reason: string): Error {
  return new Error(`[semantic-atomic-css] unsupported-feature feature=${feature} id=${id} reason=${reason}`);
}

/** 平台无关路径规范化。 */
function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

/** Unicode code point 稳定文本比较。 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
