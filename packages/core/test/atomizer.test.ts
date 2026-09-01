import { describe, expect, it } from 'vitest';
import { createTransformer } from '../src/index.js';
import { createAtomicClassName } from '../src/atomizer/createAtomicClassName.js';
import { createAtomicKey } from '../src/atomizer/createAtomicKey.js';
import {
  AtomicRegistry,
  findAvailableAtomicClassName
} from '../src/registry/AtomicRegistry.js';
import { resolveTransformOptions } from '../src/policies/defaultOptions.js';
import {
  compactHashString,
  encodeCompactFingerprint,
  fingerprintString32,
  hashString,
  keyedHashString
} from '../src/utils/hash.js';
import { byteLength } from '../src/utils/bytes.js';
import { createManifest } from '../src/output/createManifest.js';
import { measureAtomicCssBytes, renderAtomicCss } from '../src/output/renderAtomicCss.js';
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

  it('生成 readable、hash 和 compact atomic class name，并保持旧 hash 精确输出', () => {
    const input = {
      declaration: { prop: 'background-color', value: 'rgb(0, 0, 0)', important: true },
      selectorIdentity: '.__GSS_ANCHOR__:hover',
      context: {}
    };

    expect(createAtomicClassName(input, { strategy: 'readable', prefix: '_' })).toBe(
      '_selector_qf5xvc_background-color_rgb_0_0_0_important'
    );
    expect(createAtomicClassName(input, { strategy: 'readable-keyed', prefix: '_' })).toBe(
      '_selector_qf5xvc_background-color_rgb_0_0_0_important_1935xh73h2oipzebxdk5ts3u9'
    );
    expect(createAtomicClassName(input, { strategy: 'hash', prefix: '_' })).toBe('_011ty7h5');
    expect(createAtomicClassName(input, { strategy: 'compact', prefix: '' })).toBe('b1ty7h5');
    expect(createAtomicClassName(input, { strategy: 'compact-keyed', prefix: '' })).toBe(
      'c1935xh73h2oipzebxdk5ts3u9'
    );
  });

  it('固定 readable-keyed 128-bit 与 compact 32-bit 向量及 Unicode 遍历语义', () => {
    expect(keyedHashString('')).toBe('6ezv16m7wweombnkd3ldlii6l');
    expect(keyedHashString('hello')).toBe('dholeermirnvocip7hfyr0cdv');
    expect(keyedHashString('原子😀')).toBe('0d6oeqnf8pii3dfwfv5p5rx87');
    expect(fingerprintString32('')).toBe(0x811c9dc5);
    expect(compactHashString('')).toBe('aztntfp');
    expect(compactHashString('hello')).toBe('am3bicr');
    expect(compactHashString('原子😀')).toBe('amtidhb');
    expect(encodeCompactFingerprint(0)).toBe('a000000');
    expect(encodeCompactFingerprint(36 ** 6 - 1)).toBe('azzzzzz');
    expect(encodeCompactFingerprint(36 ** 6)).toBe('b000000');
    expect(encodeCompactFingerprint(0xffffffff)).toBe('bz141z3');

    for (const value of ['', 'hello', '原子😀', createAtomicKey({
      declaration: { prop: 'color', value: 'red', important: false },
      selectorIdentity: baseSelectorIdentity,
      context: {}
    })]) {
      expect(compactHashString(value)).toMatch(/^[ab][0-9a-z]{6}$/);
      expect(compactHashString(value)).toHaveLength(7);
    }
  });

  it('compact-keyed 消除独立 registry 无法协调的 32-bit compact 碰撞', () => {
    const input = (value: string) => ({
      declaration: { prop: 'width', value, important: false },
      selectorIdentity: baseSelectorIdentity,
      context: {}
    });
    const first = input('calc(204705096px + 29%)');
    const second = input('calc(3791420266px + 35%)');

    expect(createAtomicClassName(first, { strategy: 'compact', prefix: '' }))
      .toBe(createAtomicClassName(second, { strategy: 'compact', prefix: '' }));
    expect(createAtomicClassName(first, { strategy: 'compact-keyed', prefix: '' }))
      .not.toBe(createAtomicClassName(second, { strategy: 'compact-keyed', prefix: '' }));
  });

  it('readable-keyed 消除既有 5 字符 calc 摘要碰撞复现', () => {
    const input = (value: string) => ({
      declaration: { prop: 'width', value, important: false },
      selectorIdentity: baseSelectorIdentity,
      context: {}
    });
    const first = input('calc(1559px + 1%)');
    const second = input('calc(4151px + 1%)');

    expect(hashString(createAtomicKey(first), 5)).toBe(hashString(createAtomicKey(second), 5));
    expect(createAtomicClassName(first, { strategy: 'readable-keyed', prefix: '_' }))
      .not.toBe(createAtomicClassName(second, { strategy: 'readable-keyed', prefix: '_' }));
  });

  it.each([
    [{}, { strategy: 'readable', prefix: '_' }],
    [{ className: { strategy: 'readable' as const } }, { strategy: 'readable', prefix: '_' }],
    [{ className: { strategy: 'readable-keyed' as const } }, { strategy: 'readable-keyed', prefix: '_' }],
    [{ className: { strategy: 'hash' as const } }, { strategy: 'hash', prefix: '_' }],
    [{ className: { strategy: 'compact' as const } }, { strategy: 'compact', prefix: '' }],
    [{ className: { strategy: 'compact-keyed' as const } }, { strategy: 'compact-keyed', prefix: '' }],
    [{ className: { prefix: 'P' } }, { strategy: 'readable', prefix: 'P' }],
    [{ className: { strategy: 'compact' as const, prefix: 'P' } }, { strategy: 'compact', prefix: 'P' }],
    [{ className: { strategy: 'compact' as const, prefix: '' } }, { strategy: 'compact', prefix: '' }],
    [{ className: { strategy: 'hash' as const, prefix: '' } }, { strategy: 'hash', prefix: '' }]
  ])('按 strategy 解析未显式 prefix，并保留显式空串/自定义值：%j', (options, expected) => {
    expect(resolveTransformOptions(options).className).toEqual(expected);
  });

  it('所有策略都保留自定义与数字开头 prefix 的既有修复语义', () => {
    const input = {
      declaration: { prop: 'color', value: 'red', important: false },
      selectorIdentity: baseSelectorIdentity,
      context: {}
    };

    expect(createAtomicClassName(input, { strategy: 'readable', prefix: '' })).toBe(
      'selector_q0dmug_color_red'
    );
    expect(createAtomicClassName(input, { strategy: 'hash', prefix: '' })).toBe('_0190kqgs');
    expect(createAtomicClassName(input, { strategy: 'compact', prefix: 'P' })).toBe('Pb90kqgs');
    expect(createAtomicClassName(input, { strategy: 'compact', prefix: '1' })).toBe('_1b90kqgs');
    expect(createAtomicClassName(input, { strategy: 'compact-keyed', prefix: 'P' })).toMatch(/^Pc[0-9a-z]{25}$/);
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

  it('compact 基名碰撞与 suffix 二次碰撞继续使用既有稳定探测', () => {
    const base = 'baaaaaa';
    const key = 'compact-key';
    const firstSuffix = `${base}_${hashString(`${key}:1`, 5)}`;
    const secondSuffix = `${base}_${hashString(`${key}:2`, 5)}`;

    expect(findAvailableAtomicClassName(base, key, new Map([[base, key]]))).toBe(base);
    expect(findAvailableAtomicClassName(base, key, new Map([
      [base, 'other-key'],
      [firstSuffix, 'another-key']
    ]))).toBe(secondSuffix);
  });

  it('compact 输出在 selector、mapping、manifest 与 report bytes 中保持自洽', () => {
    const result = createTransformer({ className: { strategy: 'compact' } }).transformCss({
      id: 'compact.css',
      css: '.button { color: red; color: red !important; }',
      scope: createTestScope()
    });
    const classNames = result.classes.button.atomicClassNames;

    expect(classNames).toHaveLength(2);
    expect(classNames.every((className) => /^[ab][0-9a-z]{6}$/.test(className))).toBe(true);
    expect(result.classes.button.suggestedClassName).toBe(`s_button ${classNames.join(' ')}`);
    for (const className of classNames) {
      expect(result.css.atomic).toContain(`.${className} {`);
      expect(result.manifest.atomic[className]).toMatchObject({ className });
    }
    expect(result.report.size.afterAtomicCssBytes).toBe(byteLength(result.css.atomic));
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

  it('borrowed visitor 保持 list 顺序，byte sink 在空、Unicode 与条件上等于完整 CSS bytes', () => {
    const registry = new AtomicRegistry({ strategy: 'readable', prefix: '_' });

    expect(measureAtomicCssBytes(registry)).toBe(byteLength(renderAtomicCss(registry)));
    registry.register(
      {
        declaration: { prop: 'content', value: '"原子😀"', important: false },
        selectorIdentity: baseSelectorIdentity,
        context: {}
      },
      (className) => `.${className}`,
      { id: 'unicode.css', line: 1, column: 1 }
    );
    registry.register(
      {
        declaration: { prop: 'display', value: 'grid', important: false },
        selectorIdentity: baseSelectorIdentity,
        context: { media: '(min-width: 768px)', supports: '(display: grid)' }
      },
      (className) => `.${className}`,
      { id: 'context.css', line: 2, column: 3 }
    );

    expect(measureAtomicCssBytes(registry)).toBe(byteLength(renderAtomicCss(registry)));
    expect(Object.values(createManifest('', registry, {}).atomic).map(({ key }) => key)).toEqual(
      registry.list().map(({ key }) => key)
    );
  });

  it('list 继续对 selector、declaration source、context 和 sources 提供深防御性副本', () => {
    const registry = new AtomicRegistry({ strategy: 'readable', prefix: '_' });
    registry.register(
      {
        declaration: {
          prop: 'color',
          value: 'red',
          important: false,
          source: { id: 'declaration.css', line: 1, column: 2 }
        },
        selectorIdentity: baseSelectorIdentity,
        context: { media: '(min-width: 1px)' }
      },
      (className) => `.${className}`,
      { id: 'source.css', line: 3, column: 4 }
    );
    const first = registry.list();

    first[0]!.selector.css = '.mutated';
    first[0]!.declaration.source!.id = 'mutated.css';
    first[0]!.context.media = 'mutated';
    first[0]!.sources[0]!.id = 'mutated.css';

    expect(registry.list()[0]).toMatchObject({
      selector: { css: '._media_1836y2_selector_q0dmug_color_red' },
      declaration: { source: { id: 'declaration.css', line: 1, column: 2 } },
      context: { media: '(min-width: 1px)' },
      sources: [{ id: 'source.css', line: 3, column: 4 }]
    });
  });
});
