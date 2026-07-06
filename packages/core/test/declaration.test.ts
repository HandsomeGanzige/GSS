import { describe, expect, it } from 'vitest';
import { analyzeDeclaration } from '../src/declaration/analyzeDeclaration.js';
import type { DeclarationMeta } from '../src/index.js';

describe('declaration analysis', () => {
  it('默认保留 custom property declaration', () => {
    const declaration: DeclarationMeta = {
      prop: '--button-color',
      value: 'red',
      important: false
    };

    expect(analyzeDeclaration(declaration)).toMatchObject({
      kind: 'preserved',
      reason: 'custom-property-declaration'
    });
  });

  it('允许使用 var(...) 的普通 declaration atomize', () => {
    const declaration: DeclarationMeta = {
      prop: 'color',
      value: 'var(--button-color)',
      important: false
    };

    expect(analyzeDeclaration(declaration)).toMatchObject({
      kind: 'atomizable'
    });
  });

  it('允许 important 和 vendor prefix declaration atomize', () => {
    expect(
      analyzeDeclaration({
        prop: 'color',
        value: 'red',
        important: true
      })
    ).toMatchObject({ kind: 'atomizable' });
    expect(
      analyzeDeclaration({
        prop: '-webkit-line-clamp',
        value: '2',
        important: false
      })
    ).toMatchObject({ kind: 'atomizable' });
  });
});
