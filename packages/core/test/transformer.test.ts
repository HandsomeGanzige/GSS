import { describe, expect, it } from 'vitest';
import { createTransformer, transformCss } from '../src/index.js';
import { createTestScope } from './helpers.js';

describe('transformCss fixtures', () => {
  it('转换基础 safe rule，并保留 resolved class', () => {
    const result = transformCss({
      id: 'basic.css',
      css: '.button { color: red; font-size: 16px; }',
      scope: createTestScope()
    });

    expect(result.classes.button).toMatchObject({
      sourceClassName: 'button',
      resolvedClassName: 's_button',
      atomicClassNames: ['_selector_q0dmug_color_red', '_selector_q0dmug_font-size_16px'],
      suggestedClassName: 's_button _selector_q0dmug_color_red _selector_q0dmug_font-size_16px'
    });
    expect(result.css.atomic).toContain('._selector_q0dmug_color_red {\n  color: red;\n}');
    expect(result.css.preserved).toBe('');
  });

  it('转换 pseudo、media 和 supports 上下文', () => {
    const result = transformCss({
      id: 'contexts.css',
      css: `
.button:hover { color: blue; }
@media (min-width: 768px) {
  .button { font-size: 18px; }
}
@supports (display: grid) {
  .layout { display: grid; }
}
`,
      scope: createTestScope()
    });

    expect(result.css.atomic).toContain('._selector_qf5xvc_color_blue:hover');
    expect(result.css.atomic).toContain('@media (min-width: 768px)');
    expect(result.css.atomic).toContain('._media_');
    expect(result.css.atomic).toContain('@supports (display: grid)');
    expect(result.classes.button.atomicClassNames).toHaveLength(2);
    expect(result.classes.layout.atomicClassNames).toHaveLength(1);
  });

  it('保留 unsafe selector 并输出 scoped fallback', () => {
    const result = transformCss({
      id: 'unsafe.css',
      css: '.card .button { font-weight: bold; }',
      scope: createTestScope()
    });

    expect(result.css.atomic).toBe('');
    expect(result.css.preserved).toBe('.s_card .s_button {\n  font-weight: bold;\n}');
    expect(result.diagnostics).toMatchObject([
      {
        code: 'unsafe-selector',
        level: 'warning',
        reason: 'descendant-selector'
      }
    ]);
    expect(result.classes.card.unsafeReasons).toEqual(['descendant-selector']);
    expect(result.classes.button.unsafeReasons).toEqual(['descendant-selector']);
  });

  it('保留 custom property declaration，同时 atomize var(...) declaration', () => {
    const result = transformCss({
      id: 'custom-property.css',
      css: '.button { --button-color: red; color: var(--button-color); }',
      scope: createTestScope()
    });

    expect(result.css.atomic).toContain('._selector_q0dmug_color_var_--button-color');
    expect(result.css.preserved).toBe('.s_button {\n  --button-color: red;\n}');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.report.summary.preservedDeclarations).toBe(1);
  });

  it('adapter 标记的 class 会在所有 safe 上下文中完整保留', () => {
    const result = transformCss({
      id: 'asset.css',
      css: [
        '.hero { color: red; background: url("./hero.svg"); }',
        '.hero:hover { color: blue; }',
        '@media (min-width: 768px) { .hero { padding: 16px; } }',
        '@supports (display: grid) { .hero { display: grid; } }',
        '.label { color: green; }'
      ].join('\n'),
      scope: createTestScope(),
      preserveClassNames: {
        hero: 'asset-reference'
      }
    });

    expect(result.classes.hero).toMatchObject({
      resolvedClassName: 's_hero',
      atomicClassNames: [],
      suggestedClassName: 's_hero'
    });
    expect(result.classes.label.atomicClassNames).toEqual(['_selector_q0dmug_color_green']);
    expect(result.css.atomic).not.toContain('color: red');
    expect(result.css.atomic).toContain('color: green');
    expect(result.css.preserved).toContain('.s_hero:hover');
    expect(result.css.preserved).toContain('@media (min-width: 768px)');
    expect(result.css.preserved).toContain('@supports (display: grid)');
    expect(result.manifest.classes['asset.css::hero'].atomicClassNames).toEqual([]);
    expect(result.report.summary).toMatchObject({
      unsafeRules: 0,
      preservedRules: 4,
      preservedDeclarations: 5
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'preserved-class',
          reason: 'asset-reference',
          sourceClassName: 'hero'
        })
      ])
    );
  });

  it('adapter 无法区分同值 export 时会保留整类并记录稳定原因', () => {
    const result = transformCss({
      id: 'ambiguous-export.css',
      css: '.collision { color: red; padding: 14px; }',
      scope: createTestScope(),
      preserveClassNames: {
        collision: 'ambiguous-export-value'
      }
    });

    expect(result.classes.collision).toMatchObject({
      resolvedClassName: 's_collision',
      atomicClassNames: [],
      suggestedClassName: 's_collision'
    });
    expect(result.css.atomic).toBe('');
    expect(result.css.preserved).toContain('.s_collision');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'preserved-class',
        reason: 'ambiguous-export-value',
        sourceClassName: 'collision'
      })
    ]);
  });

  it('同 source class 同时出现在 unsafe/eligible selector 时整类保留', () => {
    const result = transformCss({
      id: 'mixed.css',
      css: '.button { color: red; } .card .button { color: blue; }',
      scope: createTestScope()
    });

    expect(result.css.atomic).toBe('');
    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.button.suggestedClassName).toBe('s_button');
    expect(result.css.preserved.indexOf('.s_button {')).toBeLessThan(
      result.css.preserved.indexOf('.s_card .s_button')
    );
  });

  it.each([
    {
      name: 'selector list 在前',
      css: '.button, .parent .link { color: blue; } .button { color: red; }',
      firstColor: 'blue',
      secondColor: 'red'
    },
    {
      name: 'eligible rule 在前',
      css: '.button { color: red; } .button, .parent .link { color: blue; }',
      firstColor: 'red',
      secondColor: 'blue'
    }
  ])('修复 selector-list cascade 反转：$name', ({ css, firstColor, secondColor }) => {
    const result = transformCss({
      id: 'selector-list-order.css',
      css: `${css} .independent { padding: 8px; }`,
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.link.atomicClassNames).toEqual([]);
    expect(result.classes.independent.atomicClassNames).toEqual(['_selector_q0dmug_padding_8px']);
    expect(result.css.atomic).toContain('padding: 8px');
    expect(result.css.atomic).not.toContain('color:');
    expect(result.css.preserved.indexOf(`color: ${firstColor}`)).toBeLessThan(
      result.css.preserved.indexOf(`color: ${secondColor}`)
    );
  });

  it.each([
    ['.button.primary', 'compound-class-selector'],
    ['button.button', 'tag-selector'],
    ['.button[data-active~="true"]', 'attribute-selector'],
    ['.button::marker', 'pseudo-element'],
    [':global(.theme) .button', 'global-selector']
  ] as const)('%s 的 evidence 会保留同 source class eligible rules', (unsafeSelector, reason) => {
    const result = transformCss({
      id: 'unsafe-evidence.css',
      css: `${unsafeSelector} { color: blue; } .button { color: red; } .independent { padding: 8px; }`,
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.button.unsafeReasons).toEqual([reason]);
    expect(result.classes.independent.atomicClassNames).toEqual(['_selector_q0dmug_padding_8px']);
    expect(result.css.atomic).not.toContain('color: red');
    expect(result.css.preserved).toContain('.s_button {\n  color: red;\n}');
  });

  it('class-wide evidence 会同时保留 pseudo、media 和 supports 下的 eligible rules', () => {
    const result = transformCss({
      id: 'context-evidence.css',
      css: [
        '.button, .parent .link { color: blue; }',
        '.button:hover { color: red; }',
        '@media (min-width: 768px) { .button { padding: 8px; } }',
        '@supports (display: grid) { .button { display: grid; } }',
        '.independent { margin: 4px; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.independent.atomicClassNames).toEqual(['_selector_q0dmug_margin_4px']);
    expect(result.css.atomic).not.toContain('color: red');
    expect(result.css.atomic).not.toContain('padding: 8px');
    expect(result.css.atomic).not.toContain('display: grid');
    expect(result.css.preserved).toContain('.s_button:hover');
    expect(result.css.preserved).toContain('@media (min-width: 768px)');
    expect(result.css.preserved).toContain('@supports (display: grid)');
  });

  it('class-wide preservation 保留 declaration warning，但不重复输出或计数', () => {
    const result = transformCss({
      id: 'preserved-declaration-evidence.css',
      css: '.button::marker { content: "x"; } .button { color: ; --theme: red; padding: 4px; }',
      scope: createTestScope()
    });

    expect(result.css.atomic).toBe('');
    expect(result.css.preserved.match(/\.s_button \{/g)).toHaveLength(1);
    expect(result.css.preserved).toContain('color: ;');
    expect(result.css.preserved).toContain('--theme: red;');
    expect(result.css.preserved).toContain('padding: 4px;');
    expect(result.report.summary.preservedDeclarations).toBe(4);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === 'preserved-declaration')).toEqual([
      expect.objectContaining({
        reason: 'invalid-declaration',
        selector: '.button',
        sourceClassName: 'button'
      })
    ]);
  });

  it('生成 manifest 和 report 基础数据', () => {
    const result = transformCss({
      id: 'report.css',
      css: '.button { color: red; } .button:hover { color: blue; } .card .button { color: green; } .label { padding: 4px; }',
      scope: createTestScope()
    });

    expect(result.manifest.classes['report.css::button']).toMatchObject({
      sourceClassName: 'button',
      resolvedClassName: 's_button'
    });
    expect(result.manifest.atomic._selector_q0dmug_padding_4px).toMatchObject({
      className: '_selector_q0dmug_padding_4px'
    });
    expect(result.report.summary).toMatchObject({
      files: 1,
      sourceClasses: 3,
      atomicDeclarations: 1,
      unsafeRules: 1,
      preservedRules: 3
    });
  });

  it('parse error 不抛出，返回空 CSS 和 parse-error diagnostic', () => {
    const result = transformCss({
      id: 'broken.css',
      css: '.button { color: red',
      scope: createTestScope()
    });

    expect(result.css).toEqual({
      atomic: '',
      preserved: ''
    });
    expect(result.diagnostics).toMatchObject([
      {
        code: 'parse-error',
        level: 'error'
      }
    ]);
  });

  it('nested rule 会整块 preserved，并记录 source class mapping', () => {
    const result = transformCss({
      id: 'nested.css',
      css: '.card { color: red; .button { color: blue; } }',
      scope: createTestScope()
    });

    expect(result.css.atomic).toBe('');
    expect(result.css.preserved).toContain('.s_card');
    expect(result.css.preserved).toContain('.s_button');
    expect(result.css.preserved).toContain('color: blue');
    expect(result.classes.card.unsafeReasons).toEqual(['nested-rule']);
    expect(result.classes.button.unsafeReasons).toEqual(['nested-rule']);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'unsafe-selector',
      reason: 'nested-rule'
    });
  });

  it('nested block 中的 class evidence 会让同类 eligible rule 完整保留', () => {
    const result = transformCss({
      id: 'nested-evidence.css',
      css: '.card { .button { color: blue; } } .button { color: red; } .label { padding: 4px; }',
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.button.unsafeReasons).toEqual(['nested-rule']);
    expect(result.classes.label.atomicClassNames).toEqual(['_selector_q0dmug_padding_4px']);
    expect(result.css.atomic).not.toContain('color: red');
    expect(result.css.preserved).toContain('.s_button {\n  color: red;\n}');
  });

  it('stateful transformer 的单次 result 只包含当前输入 atomic 快照', () => {
    const transformer = createTransformer();
    const first = transformer.transformCss({
      id: 'first.css',
      css: '.button { color: red; }',
      scope: createTestScope()
    });
    const firstManifestSources = first.manifest.atomic._selector_q0dmug_color_red.sources.length;
    const second = transformer.transformCss({
      id: 'second.css',
      css: '.link { font-size: 16px; }',
      scope: createTestScope()
    });

    expect(second.css.atomic).not.toContain('._selector_q0dmug_color_red');
    expect(second.css.atomic).toContain('._selector_q0dmug_font-size_16px');
    expect(Object.keys(second.manifest.atomic)).toEqual(['_selector_q0dmug_font-size_16px']);
    expect(first.manifest.atomic._selector_q0dmug_color_red.sources).toHaveLength(firstManifestSources);
    expect(transformer.getAtomicCss()).toContain('._selector_q0dmug_color_red');
    expect(transformer.getAtomicCss()).toContain('._selector_q0dmug_font-size_16px');
  });

  it('preserved CSS 按原始顺序交错输出 rule 与 block', () => {
    const result = transformCss({
      id: 'order.css',
      css: '@keyframes spin { to { opacity: 1; } } .card .button { color: red; }',
      scope: createTestScope()
    });

    expect(result.css.preserved.indexOf('@keyframes spin')).toBeLessThan(
      result.css.preserved.indexOf('.s_card .s_button')
    );
  });

  it('unsupported at-rule preserved block 内的 selector 会被 scoped', () => {
    const result = transformCss({
      id: 'container.css',
      css: '@container (min-width: 300px) { .button { color: red; } }',
      scope: createTestScope()
    });

    expect(result.css.atomic).toBe('');
    expect(result.css.preserved).toContain('@container (min-width: 300px)');
    expect(result.css.preserved).toContain('.s_button');
    expect(result.css.preserved).not.toContain('.button {');
    expect(result.classes.button).toMatchObject({
      sourceClassName: 'button',
      resolvedClassName: 's_button',
      suggestedClassName: 's_button'
    });
    expect(result.diagnostics[0]).toMatchObject({
      code: 'unsupported-at-rule',
      level: 'info'
    });
  });

  it('unsupported preserved block 内的 class evidence 会触发整类保留且不污染 public reason', () => {
    const result = transformCss({
      id: 'container-evidence.css',
      css: '@container (min-width: 300px) { .button { color: blue; } } .button { color: red; } .label { padding: 4px; }',
      scope: createTestScope()
    });

    expect(result.classes.button).toMatchObject({
      atomicClassNames: [],
      suggestedClassName: 's_button',
      unsafeReasons: undefined
    });
    expect(result.classes.label.atomicClassNames).toEqual(['_selector_q0dmug_padding_4px']);
    expect(result.css.atomic).not.toContain('color: red');
    expect(result.css.preserved).toContain('@container (min-width: 300px)');
    expect(result.css.preserved).toContain('.s_button {\n  color: red;\n}');
  });

  it('selector evidence 失败时在 registry mutation 前透传 scoping error', () => {
    const transformer = createTransformer();

    expect(() =>
      transformer.transformCss({
        id: 'incomplete-evidence.css',
        css: '.safe { color: red; } .broken| { color: blue; }',
        scope: createTestScope()
      })
    ).toThrow();

    expect(transformer.getAtomicCss()).toBe('');
    expect(transformer.getManifest().atomic).toEqual({});
    expect(transformer.getReport().summary.files).toBe(0);

    const next = transformer.transformCss({
      id: 'next.css',
      css: '.next { color: red; }',
      scope: createTestScope()
    });

    expect(next.classes.next.atomicClassNames).toEqual(['_selector_q0dmug_color_red']);
    expect(transformer.getReport().summary.reusedAtomicDeclarations).toBe(0);
  });

  it('unsupported block 内 selector evidence 失败时不输出未 scoped CSS', () => {
    const transformer = createTransformer();

    expect(() =>
      transformer.transformCss({
        id: 'incomplete-block-evidence.css',
        css: '@container (min-width: 300px) { .broken| { color: blue; } } .safe { color: red; }',
        scope: createTestScope()
      })
    ).toThrow();

    expect(transformer.getAtomicCss()).toBe('');
    expect(transformer.getManifest().atomic).toEqual({});
    expect(transformer.getReport().summary.files).toBe(0);
  });

  it('聚合 report 在 atomic 去重后重新计算 estimatedTotalDiffBytes', () => {
    const transformer = createTransformer();
    transformer.transformCss({
      id: 'first.css',
      css: '.button { color: red; }',
      scope: createTestScope()
    });
    transformer.transformCss({
      id: 'second.css',
      css: '.link { color: red; }',
      scope: createTestScope()
    });

    const report = transformer.getReport();

    expect(report.summary.atomicDeclarations).toBe(1);
    expect(report.summary.reusedAtomicDeclarations).toBe(1);
    expect(report.size.estimatedTotalDiffBytes).toBe(
      report.size.afterAtomicCssBytes +
        report.size.afterPreservedCssBytes +
        report.size.estimatedClassStringIncreaseBytes -
        report.size.beforeCssBytes
    );
  });

  it('聚合 manifest 会保留复用 atomic 的所有 sources', () => {
    const transformer = createTransformer();
    transformer.transformCss({
      id: 'first.css',
      css: '.button { color: red; }',
      scope: createTestScope()
    });
    transformer.transformCss({
      id: 'second.css',
      css: '.link { color: red; }',
      scope: createTestScope()
    });

    const manifest = transformer.getManifest();

    expect(manifest.atomic._selector_q0dmug_color_red.sources.map((source) => source.id)).toEqual([
      'first.css',
      'second.css'
    ]);
    expect(manifest.classes['first.css::button']).toMatchObject({
      suggestedClassName: 's_button _selector_q0dmug_color_red'
    });
    expect(manifest.classes['second.css::link']).toMatchObject({
      suggestedClassName: 's_link _selector_q0dmug_color_red'
    });
  });
});
