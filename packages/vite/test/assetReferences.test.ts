import { describe, expect, it } from 'vitest';
import { collectAssetPreserveClassNames } from '../src/assetReferences.js';

describe('assetReferences', () => {
  it('收集所有 url() class 并扩展原生 composes token 闭包', () => {
    const preserved = collectAssetPreserveClassNames(
      [
        '.x_hero { background: url("data:image/svg+xml;base64,PHN2Zy8+"); color: red; }',
        '.x_remote { background-image: url(https://example.com/hero.png); }',
        '.x_composed { border-radius: 8px; }',
        '.x_safe { color: blue; }'
      ].join('\n'),
      {
        hero: 'x_hero',
        remote: 'x_remote',
        composed: 'x_composed x_hero',
        safe: 'x_safe'
      }
    );

    expect(preserved).toEqual({
      x_composed: 'asset-reference',
      x_hero: 'asset-reference',
      x_remote: 'asset-reference'
    });
  });

  it('不把字符串中的 url 文本当作 CSS 函数', () => {
    const preserved = collectAssetPreserveClassNames('.label { content: "url(fake.svg)"; }', {
      label: 'x_label'
    });

    expect(preserved).toEqual({});
  });
});
