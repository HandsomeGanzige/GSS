import { describe, expect, it } from 'vitest';
import { createTransformer } from '../src/index.js';
import { createAtomicClassName } from '../src/atomizer/createAtomicClassName.js';
import { createAtomicKey } from '../src/atomizer/createAtomicKey.js';
import { AtomicRegistry } from '../src/registry/AtomicRegistry.js';
import { createTestScope } from './helpers.js';

describe('atomizer and registry', () => {
  const baseSelectorIdentity = '.__GSS_ANCHOR__';

  it('把 selector identity、important、media 和 supports 纳入 atomic key', () => {
    const base = createAtomicKey({
      declaration: { prop: 'color', value: 'red', important: false },
      selectorIdentity: baseSelectorIdentity,
      context: {}
    });
    const important = createAtomicKey({
      declaration: { prop: 'color', value: 'red', important: true },
      selectorIdentity: baseSelectorIdentity,
      context: {}
    });
    const hover = createAtomicKey({
      declaration: { prop: 'color', value: 'red', important: false },
      selectorIdentity: '.__GSS_ANCHOR__:hover',
      context: {}
    });
    const media = createAtomicKey({
      declaration: { prop: 'color', value: 'red', important: false },
      selectorIdentity: baseSelectorIdentity,
      context: { media: '(min-width: 768px)' }
    });
    const supports = createAtomicKey({
      declaration: { prop: 'color', value: 'red', important: false },
      selectorIdentity: baseSelectorIdentity,
      context: { supports: '(display: grid)' }
    });

    expect(new Set([base, important, hover, media, supports]).size).toBe(5);
    expect(JSON.parse(base)).toEqual({
      important: false,
      media: null,
      prop: 'color',
      selectorIdentity: baseSelectorIdentity,
      supports: null,
      value: 'red'
    });
  });

  it('生成 readable 和 hash atomic class name', () => {
    const input = {
      declaration: { prop: 'background-color', value: 'rgb(0, 0, 0)', important: true },
      selectorIdentity: '.__GSS_ANCHOR__:hover',
      context: {}
    };

    expect(createAtomicClassName(input, { strategy: 'readable', prefix: '_' })).toBe(
      '_selector_qf5xvc_background-color_rgb_0_0_0_important'
    );
    expect(createAtomicClassName(input, { strategy: 'hash', prefix: '_' })).toMatch(/^_[a-z0-9]{8}$/);
  });

  it('在 readable class name 碰撞时追加稳定 suffix', () => {
    const registry = new AtomicRegistry({ strategy: 'readable', prefix: '_' });
    const first = registry.register(
      {
        declaration: { prop: 'margin', value: 'a/b', important: false },
        selectorIdentity: baseSelectorIdentity,
        context: {}
      },
      (className) => `.${className}`
    );
    const second = registry.register(
      {
        declaration: { prop: 'margin', value: 'a b', important: false },
        selectorIdentity: baseSelectorIdentity,
        context: {}
      },
      (className) => `.${className}`
    );

    expect(first.className).toBe('_selector_q0dmug_margin_a_b');
    expect(second.className).toMatch(/^_selector_q0dmug_margin_a_b_[a-z0-9]{5}$/);
    expect(registry.list()).toHaveLength(2);
  });

  it('复用同一 key 时校验 selector renderer 的 CSS 一致性', () => {
    const registry = new AtomicRegistry({ strategy: 'readable', prefix: '_' });
    const input = {
      declaration: { prop: 'color', value: 'red', important: false },
      selectorIdentity: '.__GSS_ANCHOR__:hover',
      context: {}
    };

    registry.register(input, (className) => `.${className}:hover`, {
      id: 'first.css',
      line: 1,
      column: 1
    });
    const storedBeforeMismatch = registry.list();

    expect(() =>
      registry.register(input, (className) => `.${className}:focus`, {
        id: 'second.css',
        line: 2,
        column: 3
      })
    ).toThrow('Atomic selector renderer produced inconsistent CSS');
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()).toEqual(storedBeforeMismatch);
    expect(registry.list()[0]).toMatchObject({
      selector: {
        identity: '.__GSS_ANCHOR__:hover',
        css: '._selector_qf5xvc_color_red:hover'
      },
      declaration: {
        prop: 'color',
        value: 'red',
        important: false
      },
      sources: [{ id: 'first.css', line: 1, column: 1 }]
    });
    expect(registry.getReusedCount()).toBe(0);
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

    expect(first.classes.button.atomicClassNames).toEqual([
      '_selector_q0dmug_color_red',
      '_selector_q0dmug_font-size_16px'
    ]);
    expect(second.classes.link.atomicClassNames).toEqual(['_selector_q0dmug_color_red']);
    expect(transformer.getAtomicCss()).toContain('._selector_q0dmug_color_red');
    expect(transformer.getAtomicCss().indexOf('._selector_q0dmug_color_red')).toBeLessThan(
      transformer.getAtomicCss().indexOf('._selector_q0dmug_font-size_16px')
    );
    expect(transformer.getReport().summary.atomicDeclarations).toBe(2);
    expect(transformer.getReport().summary.reusedAtomicDeclarations).toBe(1);
  });
});
