import { describe, expect, it } from 'vitest';
import { createTransformer } from '../src/index.js';
import { createAtomicClassName } from '../src/atomizer/createAtomicClassName.js';
import { createAtomicKey } from '../src/atomizer/createAtomicKey.js';
import { AtomicRegistry } from '../src/registry/AtomicRegistry.js';
import { createTestScope } from './helpers.js';

describe('atomizer and registry', () => {
  it('把 important、pseudo、media 和 supports 纳入 atomic key', () => {
    const base = createAtomicKey({
      declaration: { prop: 'color', value: 'red', important: false },
      context: {}
    });
    const important = createAtomicKey({
      declaration: { prop: 'color', value: 'red', important: true },
      context: {}
    });
    const pseudo = createAtomicKey({
      declaration: { prop: 'color', value: 'red', important: false },
      context: { pseudo: ':hover' }
    });
    const media = createAtomicKey({
      declaration: { prop: 'color', value: 'red', important: false },
      context: { media: '(min-width: 768px)' }
    });
    const supports = createAtomicKey({
      declaration: { prop: 'color', value: 'red', important: false },
      context: { supports: '(display: grid)' }
    });

    expect(new Set([base, important, pseudo, media, supports]).size).toBe(5);
  });

  it('生成 readable 和 hash atomic class name', () => {
    const input = {
      declaration: { prop: 'background-color', value: 'rgb(0, 0, 0)', important: true },
      context: { pseudo: ':hover' }
    };

    expect(createAtomicClassName(input, { strategy: 'readable', prefix: '_' })).toBe(
      '_hover_background-color_rgb_0_0_0_important'
    );
    expect(createAtomicClassName(input, { strategy: 'hash', prefix: '_' })).toMatch(/^_[a-z0-9]{8}$/);
  });

  it('在 readable class name 碰撞时追加稳定 suffix', () => {
    const registry = new AtomicRegistry({ strategy: 'readable', prefix: '_' });
    const first = registry.register({
      declaration: { prop: 'margin', value: 'a/b', important: false },
      context: {}
    });
    const second = registry.register({
      declaration: { prop: 'margin', value: 'a b', important: false },
      context: {}
    });

    expect(first.className).toBe('_margin_a_b');
    expect(second.className).toMatch(/^_margin_a_b_[a-z0-9]{5}$/);
    expect(registry.list()).toHaveLength(2);
  });

  it('跨文件复用 atomic declaration，并保持首次注册顺序', () => {
    const transformer = createTransformer();
    const first = transformer.transformCss({
      id: 'first.css',
      css: '.button { color: red; font-size: 16px; }',
      scope: createTestScope()
    });
    const second = transformer.transformCss({
      id: 'second.css',
      css: '.link { color: red; }',
      scope: createTestScope()
    });

    expect(first.classes.button.atomicClassNames).toEqual(['_color_red', '_font-size_16px']);
    expect(second.classes.link.atomicClassNames).toEqual(['_color_red']);
    expect(transformer.getAtomicCss()).toContain('._color_red');
    expect(transformer.getAtomicCss().indexOf('._color_red')).toBeLessThan(
      transformer.getAtomicCss().indexOf('._font-size_16px')
    );
    expect(transformer.getReport().summary.atomicDeclarations).toBe(2);
    expect(transformer.getReport().summary.reusedAtomicDeclarations).toBe(1);
  });
});
