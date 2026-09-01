/** Webpack filesystem cache 可重放的内部 metadata schema。 */
import { createHash } from 'node:crypto';
import type { CompiledCssInput } from '@semantic-atomic-css/css-loader-bridge';
/** 内部 metadata asset 的保留前缀，同轮消费后必须从 compilation 删除。 */
export const metadataPrefix = '__semantic_atomic_css_metadata__/';
/** filesystem cache 可重放的 loader 输入与实际 atomic key/class 映射。 */
export type WebpackBridgeMetadata = {
  schemaVersion: 2;
  owner: string;
  inputs: CompiledCssInput[];
  atomicClassByKey: Record<string, string>;
};
/**
 * 根据 owner 与序列化内容生成稳定且低冲突的内部 asset 文件名。
 * @param owner - 产生 metadata 的顶层 CSS Module 绝对路径。
 * @param content - 将写入 asset 的完整序列化内容。
 * @returns 位于内部 metadata 前缀下的稳定 JSON 文件名。
 */
export function metadataFilename(owner: string, content: string): string {
  const hash = createHash('sha256').update(owner).update('\0').update(content).digest('hex').slice(0, 20);
  return `${metadataPrefix}${hash}.json`;
}
/** 把 metadata 序列化为稳定的单行 JSON。 */
export function serializeMetadata(value: WebpackBridgeMetadata): string { return `${JSON.stringify(value)}\n`; }
/**
 * 解析并完整校验 cache replay metadata；任何未知或畸形字段都不得进入 collector。
 */
export function parseMetadata(source: string, name: string): WebpackBridgeMetadata {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw invalidMetadata(name);
  }
  if (!isRecord(value) || !hasExactKeys(value, ['schemaVersion', 'owner', 'inputs', 'atomicClassByKey']) ||
    value.schemaVersion !== 2 || typeof value.owner !== 'string' || !Array.isArray(value.inputs)) {
    throw invalidMetadata(name);
  }
  if (!isStringRecord(value.atomicClassByKey)) throw invalidMetadata(name);
  const inputs: CompiledCssInput[] = value.inputs.map((input) => parseInput(input, name));
  return {
    schemaVersion: 2,
    owner: value.owner,
    inputs,
    atomicClassByKey: { ...value.atomicClassByKey }
  };
}

function parseInput(value: unknown, name: string): CompiledCssInput {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'scopedCss', 'exportedClassNames', 'preserveClassNames']) ||
    typeof value.id !== 'string' || typeof value.scopedCss !== 'string') throw invalidMetadata(name);
  if (!Array.isArray(value.exportedClassNames) || value.exportedClassNames.some((item) => typeof item !== 'string')) {
    throw invalidMetadata(name);
  }
  if (!isRecord(value.preserveClassNames)) throw invalidMetadata(name);
  const preserveClassNames: CompiledCssInput['preserveClassNames'] = {};
  for (const [className, reason] of Object.entries(value.preserveClassNames)) {
    if (reason !== 'asset-reference' && reason !== 'ambiguous-export-value') throw invalidMetadata(name);
    preserveClassNames[className] = reason;
  }
  return {
    id: value.id,
    scopedCss: value.scopedCss,
    exportedClassNames: [...value.exportedClassNames],
    preserveClassNames
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}
function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}
function invalidMetadata(name: string): Error {
  return new Error(`[semantic-atomic-css] invalid-webpack-metadata asset=${name}`);
}
