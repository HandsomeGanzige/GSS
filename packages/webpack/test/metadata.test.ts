import { describe, expect, it } from 'vitest';
import { metadataFilename, parseMetadata, serializeMetadata } from '../src/metadata.js';

const valid = {
  schemaVersion: 2 as const,
  owner: '/a.module.css',
  inputs: [{
    id: '/a.module.css',
    scopedCss: '.a_hash { color: red; }',
    exportedClassNames: ['a_hash'],
    preserveClassNames: { a_hash: 'asset-reference' as const }
  }],
  atomicClassByKey: { key: 'c123' }
};
describe('cache metadata', () => {
  it('内容寻址且完整 schema 可校验', () => {
    const text = serializeMetadata(valid);
    expect(metadataFilename('/a.css', text)).toMatch(/^__semantic_atomic_css_metadata__\/[a-f0-9]{20}\.json$/);
    expect(parseMetadata(text, 'x')).toEqual(valid);
  });
  it.each([
    ['旧 schema', { ...valid, schemaVersion: 1 }],
    ['顶层未知字段', { ...valid, future: true }],
    ['缺少 owner', { ...valid, owner: undefined }],
    ['inputs 非数组', { ...valid, inputs: {} }],
    ['input id', { ...valid, inputs: [{ ...valid.inputs[0], id: 1 }] }],
    ['input 未知字段', { ...valid, inputs: [{ ...valid.inputs[0], future: true }] }],
    ['input scopedCss', { ...valid, inputs: [{ ...valid.inputs[0], scopedCss: null }] }],
    ['exported class', { ...valid, inputs: [{ ...valid.inputs[0], exportedClassNames: [1] }] }],
    ['preserve map', { ...valid, inputs: [{ ...valid.inputs[0], preserveClassNames: [] }] }],
    ['preserve reason', { ...valid, inputs: [{ ...valid.inputs[0], preserveClassNames: { a_hash: 'unknown' } }] }],
    ['key/class mapping', { ...valid, atomicClassByKey: { key: 1 } }]
  ])('拒绝畸形 %s', (_label, value) => {
    expect(() => parseMetadata(JSON.stringify(value), 'bad')).toThrow(/invalid-webpack-metadata/);
  });
});
