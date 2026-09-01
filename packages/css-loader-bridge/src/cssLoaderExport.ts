/**
 * css-loader 默认 array/default locals 的构建工具无关消费模块。
 *
 * @remarks
 * 调用方必须先通过自己的公开 loader seam 取得 native export；本模块只处理结构化 rows/locals，
 * 不感知 Webpack、Rspack、loader request 或 compilation 生命周期。
 */
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';
import {
  transformCss,
  type ClassPreservationReason,
  type TransformClassMapping,
  type TransformCssOptions,
  type TransformCssResult
} from '@semantic-atomic-css/core';
import type { DevStyleSnapshot } from './devStyles.js';

/** css-loader `exportType: "array"` 的结构化 row。 */
export type CssRuntimeRow = [unknown, string, string?, unknown?, string?, string?];

/** 交给稳定 build collector 的 compiled scoped CSS 输入。 */
export type CompiledCssInput = {
  id: string;
  scopedCss: string;
  exportedClassNames: string[];
  preserveClassNames: Record<string, ClassPreservationReason>;
};

/** 单个 compiled source 的转换结果。 */
export type CompiledTransform = { id: string; scopedCss: string; transform: TransformCssResult };

/** 校验并防御性复制 css-loader row。 */
export function validateAndCloneRow(row: unknown, resourcePath: string): CssRuntimeRow {
  if (!Array.isArray(row) || typeof row[1] !== 'string') {
    throw createBridgeError('css-loader.array-row', resourcePath, '原生 css-loader array row 结构不受支持。');
  }
  return [...row] as CssRuntimeRow;
}

/** 校验 default-export locals，缺失或非字符串值时保守失败。 */
export function validateLocals(value: unknown, resourcePath: string): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createBridgeError('css-loader.default-locals', resourcePath, '未取得 CSS Modules default-export locals。');
  }
  const locals: Record<string, string> = {};
  for (const [key, token] of Object.entries(value)) {
    if (typeof token !== 'string') {
      throw createBridgeError('css-loader.locals-value', resourcePath, `token ${key} 不是字符串。`);
    }
    locals[key] = token;
  }
  return locals;
}

/** 从 native locals 收集可能进入 DOM 的 scoped class evidence。 */
export function collectExportedClassNames(locals: Record<string, string>): Set<string> {
  const names = new Set<string>();
  for (const value of Object.values(locals)) {
    for (const segment of splitClassString(value)) {
      if (/^-?[_a-zA-Z][-_a-zA-Z0-9]*$/.test(segment)) names.add(segment);
    }
  }
  return names;
}

/** class export 与 ICSS value 完整同值时整类保留，避免污染非 class token。 */
export function collectAmbiguousExportPreserveClassNames(
  locals: Record<string, string>,
  exportedClassNames: ReadonlySet<string>
): Record<string, ClassPreservationReason> {
  const byValue = new Map<string, string[]>();
  for (const [name, value] of Object.entries(locals)) byValue.set(value, [...(byValue.get(value) ?? []), name]);
  const ambiguous = new Set<string>();
  for (const [value, names] of byValue) {
    if (names.length < 2) continue;
    for (const className of splitClassString(value)) {
      if (exportedClassNames.has(className)) ambiguous.add(className);
    }
  }
  return Object.fromEntries([...ambiguous].sort(compareText).map((name) => [name, 'ambiguous-export-value' as const]));
}

/**
 * 以稳定优先级合并 class 级保留 evidence。
 *
 * 资源引用直接关系 CSS 资源正确性，因此优先于 export 类型歧义；输入对象与属性遍历顺序不得改变结果。
 */
export function mergeClassPreservationEvidence(
  ...evidence: ReadonlyArray<Readonly<Record<string, ClassPreservationReason>>>
): Record<string, ClassPreservationReason> {
  const merged: Record<string, ClassPreservationReason> = {};
  for (const record of evidence) {
    for (const [className, reason] of Object.entries(record)) {
      const current = merged[className];
      merged[className] = current === 'asset-reference' || reason === 'asset-reference'
        ? 'asset-reference'
        : reason;
    }
  }
  return merged;
}

/** 结构化识别含 `url()` 的 class，并沿 composed token 共现关系扩展保守闭包。 */
export function collectAssetPreserveClassNames(
  rows: CssRuntimeRow[],
  locals: Record<string, string>
): Record<string, ClassPreservationReason> {
  const assetClasses = new Set<string>();
  const exported = collectExportedClassNames(locals);
  for (const row of rows) {
    try {
      const root = postcss.parse(row[1]);
      root.walkRules((rule) => {
        const hasUrl = rule.nodes.some((node) => node.type === 'decl' && declarationContainsUrl(node.value));
        if (hasUrl) collectSelectorClassNames(rule.selector, assetClasses);
      });
    } catch {
      continue;
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const value of Object.values(locals)) {
      const classes = splitClassString(value).filter((name) => exported.has(name));
      if (!classes.some((name) => assetClasses.has(name))) continue;
      for (const name of classes) {
        if (!assetClasses.has(name)) {
          assetClasses.add(name);
          changed = true;
        }
      }
    }
  }
  return Object.fromEntries(
    [...assetClasses].filter((name) => exported.has(name)).sort(compareText)
      .map((name) => [name, 'asset-reference' as const])
  );
}

/** 对 compiled scoped CSS 调用 Core identity scope。 */
export function transformCompiledInput(input: CompiledCssInput, core: TransformCssOptions): TransformCssResult {
  const exported = new Set(input.exportedClassNames);
  return transformCss({
    id: input.id,
    css: input.scopedCss,
    scope: {
      resolveClassName: (className) => className,
      shouldExportClassName: (className) => exported.has(className)
    },
    preserveClassNames: input.preserveClassNames
  }, core);
}

/** 在 native token 后按原顺序追加去重 atomic classes。 */
/** 收集 loader 实际选定的 atomic key/class，并拒绝局部结果内部不一致。 */
export function collectAtomicClassByKey(
  transforms: readonly CompiledTransform[]
): Record<string, string> {
  const selected = new Map<string, string>();
  for (const { transform } of transforms) {
    for (const declaration of transform.atomic) {
      const current = selected.get(declaration.key);
      if (current && current !== declaration.className) {
        throw createBridgeError('atomic-class-by-key', declaration.declaration.source?.id ?? 'unknown', '同一 atomic key 生成了不同 class。');
      }
      selected.set(declaration.key, declaration.className);
    }
  }
  return Object.fromEntries([...selected].sort(([left], [right]) => compareText(left, right)));
}

export function augmentLocals(
  locals: Record<string, string>,
  classMappings: Record<string, TransformClassMapping>
): Record<string, string> {
  return Object.fromEntries(Object.entries(locals).map(([name, value]) => {
    const segments = splitClassString(value);
    const classes = new Set(segments);
    for (const segment of segments) {
      for (const atomic of classMappings[segment]?.atomicClassNames ?? []) classes.add(atomic);
    }
    return [name, [...classes].join(' ')];
  }));
}

/** 把 transforms 投影为浏览器共享 style owner 的可序列化快照。 */
export function createDevStyleSnapshot(transforms: CompiledTransform[]): DevStyleSnapshot {
  return { sources: transforms.map(({ id, transform }) => ({
    id,
    atomic: transform.atomic.map((entry) => ({
      key: entry.key,
      className: entry.className,
      selector: { ...entry.selector },
      declaration: {
        prop: entry.declaration.prop,
        value: entry.declaration.value,
        important: entry.declaration.important
      },
      context: { ...entry.context }
    })),
    preservedCss: transform.css.preserved
  })) };
}

/** 统一构建工具 adapter 的 css-loader contract 错误格式。 */
export function createBridgeError(feature: string, id: string, reason: string): Error {
  return new Error(`[semantic-atomic-css] unsupported-feature feature=${feature} id=${id} reason=${reason}`);
}

function declarationContainsUrl(value: string): boolean {
  let found = false;
  valueParser(value).walk((node) => {
    if (node.type === 'function' && node.value.toLowerCase() === 'url') {
      found = true;
      return false;
    }
    return undefined;
  });
  return found;
}

function collectSelectorClassNames(selector: string, target: Set<string>): void {
  try {
    selectorParser().astSync(selector).walkClasses((node) => {
      target.add(node.value);
    });
  } catch {
    return;
  }
}

function splitClassString(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
