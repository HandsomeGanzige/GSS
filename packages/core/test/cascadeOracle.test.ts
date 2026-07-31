import { describe, expect, it } from 'vitest';
import { createTransformer, transformCss } from '../src/index.js';
import { createTestScope } from './helpers.js';

describe('core cascade static oracle', () => {
  it.each([
    {
      name: 'base 在 attribute 前',
      css: '.button { color: red; }\n.button[data-state] { color: blue; }'
    },
    {
      name: 'attribute 在 base 前',
      css: '.button[data-state] { color: blue; }\n.button { color: red; }'
    }
  ])('base 与更高 specificity attribute 不依赖 source order：$name', ({ css }) => {
    const result = transformCss({
      id: 'base-attribute.css',
      css,
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toHaveLength(2);
    expect(result.classes.button.unsafeReasons).toBeUndefined();
    expect(result.css.preserved).toBe('');
    expect(result.css.atomic).toContain('[data-state]');
  });

  it('attribute 与 pseudo 的 property 不竞争时放行', () => {
    const result = transformCss({
      id: 'attribute-pseudo-disjoint.css',
      css: '.button[data-state=open] { border-color: red; }\n.button:hover { background: blue; }',
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toHaveLength(2);
    expect(result.classes.button.unsafeReasons).toBeUndefined();
    expect(result.css.preserved).toBe('');
    expect(result.css.atomic).toContain('[data-state=open]');
    expect(result.css.atomic).toContain(':hover');
  });

  it.each([
    {
      name: 'same property A→B→A',
      css: '.x[data] { color: red; color: blue; color: red; }'
    },
    {
      name: 'shorthand/longhand A→B→A',
      css: '.x[data] { margin: 0; margin-left: 8px; margin: 0; }'
    }
  ])('attribute 单 rule competing occurrences 在零注册状态下整类 fallback：$name', ({ css }) => {
    const transformer = createTransformer();
    const result = transformer.transformCss({
      id: 'attribute-single-rule-reuse.css',
      css,
      scope: createTestScope()
    });

    expect(result.classes.x).toMatchObject({
      atomicClassNames: [],
      unsafeReasons: ['attribute-cascade-order']
    });
    expect(result.atomic).toEqual([]);
    expect(result.css.atomic).toBe('');
    expect(result.css.preserved).toContain('.s_x[data]');
    expect(transformer.getManifest().atomic).toEqual({});
    expect(transformer.getAtomicCss()).toBe('');
  });

  it('single-rule attribute guard 不顺带改变 base 或 pseudo-only 策略', () => {
    const result = transformCss({
      id: 'non-attribute-single-rule-reuse.css',
      css: [
        '.base { color: red; color: blue; color: red; }',
        '.pseudo:hover { margin: 0; margin-left: 8px; margin: 0; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.base.unsafeReasons).toBeUndefined();
    expect(result.classes.base.atomicClassNames).toHaveLength(2);
    expect(result.classes.pseudo.unsafeReasons).toBeUndefined();
    expect(result.classes.pseudo.atomicClassNames).toHaveLength(2);
  });

  it('mixed-case data-* names 与 A→B→A 不能伪装成互斥 guards', () => {
    const transformer = createTransformer();
    const result = transformer.transformCss({
      id: 'attribute-mixed-case-reuse.css',
      css: [
        '.x[data-State=open] { color: red; }',
        '.x[data-state=closed] { color: blue; }',
        '.x[data-State=open] { color: red; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.x).toMatchObject({
      atomicClassNames: [],
      unsafeReasons: ['attribute-cascade-order']
    });
    expect(result.atomic).toEqual([]);
    expect(transformer.getManifest().atomic).toEqual({});
    expect(result.css.preserved).toContain('.s_x[data-State=open]');
    expect(result.css.preserved).toContain('.s_x[data-state=closed]');
  });

  it('attribute 与 pseudo 的同 importance property 竞争时整类 fallback', () => {
    const result = transformCss({
      id: 'attribute-pseudo-conflict.css',
      css: [
        '.button[data-state] { color: red; }',
        '.button:hover { color: blue; }',
        '.button { padding: 4px; }',
        '.independent { margin: 8px; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.button).toMatchObject({
      atomicClassNames: [],
      unsafeReasons: ['attribute-cascade-order']
    });
    expect(result.classes.independent.atomicClassNames).toHaveLength(1);
    expect(result.css.atomic).not.toMatch(/color:|padding:/);
    expect(result.css.preserved).toContain('.s_button[data-state]');
    expect(result.css.preserved).toContain('.s_button:hover');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsafe-selector',
          selector: '.button[data-state]',
          reason: 'attribute-cascade-order',
          sourceClassName: 'button'
        })
      ])
    );
    expect(result.report.diagnostics).toEqual(result.diagnostics);
    expect(result.report.summary.unsafeRules).toBe(1);
  });

  it('同一 data-* exact equality 的不同 decoded value 可证明互斥', () => {
    const result = transformCss({
      id: 'exclusive-attributes.css',
      css: [
        '.button[data-state=open] { color: red; }',
        '.button[d\\61 ta-state=closed] { color: blue; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toHaveLength(2);
    expect(result.classes.button.unsafeReasons).toBeUndefined();
    expect(result.css.preserved).toBe('');
  });

  it.each([
    {
      name: '不同 attribute names',
      css: '.button[data-a=x] { color: red; }\n.button[data-b=y] { color: blue; }'
    },
    {
      name: 'presence 与 equality',
      css: '.button[data-state] { color: red; }\n.button[data-state=open] { color: blue; }'
    },
    {
      name: '相同 condition 的 quote spelling 不同',
      css: `.button[data-state='open'] { color: red; }\n.button[data-state="open"] { color: blue; }`
    }
  ])('无法证明 attribute guards 互斥时 fallback：$name', ({ css }) => {
    const result = transformCss({
      id: 'overlapping-attributes.css',
      css,
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.button.unsafeReasons).toEqual(['attribute-cascade-order']);
    expect(result.css.atomic).toBe('');
  });

  it('不同 importance 不依赖 occurrence order，可继续 atomize', () => {
    const result = transformCss({
      id: 'attribute-importance.css',
      css: '.button[data-state] { color: red !important; }\n.button:hover { color: blue; }',
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toHaveLength(2);
    expect(result.classes.button.unsafeReasons).toBeUndefined();
    expect(result.css.preserved).toBe('');
  });

  it('同 property 同 value 的重排不改变 computed value，可继续 atomize', () => {
    const result = transformCss({
      id: 'attribute-same-value.css',
      css: '.button[data-state] { color: red; }\n.button:hover { COLOR: red; }',
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toHaveLength(2);
    expect(result.classes.button.unsafeReasons).toBeUndefined();
    expect(result.css.preserved).toBe('');
  });

  it('未知的不同 property 关系不猜测为无竞争', () => {
    const result = transformCss({
      id: 'attribute-unknown-property.css',
      css: '.button[data-state] { future-layout: a; }\n.button:hover { future-layout-part: b; }',
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.button.unsafeReasons).toEqual(['attribute-cascade-order']);
  });

  it('repeated property 与 shorthand/longhand 竞争均触发 fallback', () => {
    const repeated = transformCss({
      id: 'attribute-repeated.css',
      css: '.button[data-state] { color: red; color: red; }\n.button:hover { color: blue; }',
      scope: createTestScope()
    });
    const shorthand = transformCss({
      id: 'attribute-shorthand.css',
      css: '.button[data-state] { margin: 0; }\n.button:hover { margin-left: 8px; }',
      scope: createTestScope()
    });

    expect(repeated.classes.button.unsafeReasons).toEqual(['attribute-cascade-order']);
    expect(repeated.css.preserved.match(/color: red;/g)).toHaveLength(2);
    expect(shorthand.classes.button.unsafeReasons).toEqual(['attribute-cascade-order']);
    expect(shorthand.css.atomic).toBe('');
  });

  it('custom property preserved 与不竞争的 var consumer 保持混合输出', () => {
    const result = transformCss({
      id: 'attribute-custom-property.css',
      css: [
        '.button[data-state] { --tone: red; color: var(--tone); }',
        '.button:hover { background: blue; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.button.unsafeReasons).toBeUndefined();
    expect(result.classes.button.atomicClassNames).toHaveLength(2);
    expect(result.css.atomic).toContain('color: var(--tone);');
    expect(result.css.atomic).toContain('background: blue;');
    expect(result.css.preserved).toContain('.s_button[data-state] {\n  --tone: red;\n}');
  });

  it('media/supports 不作为互斥证明，并覆盖 A→B→A registry reuse 反例', () => {
    const result = transformCss({
      id: 'attribute-context-reuse.css',
      css: [
        '@media (min-width: 600px) { .button[data-state] { color: red; } }',
        '@supports (display: grid) { .button:hover { color: blue; } }',
        '@media (min-width: 900px) { .button[data-state] { color: red; } }',
        '.independent { opacity: 1; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.button.unsafeReasons).toEqual(['attribute-cascade-order']);
    expect(result.classes.independent.atomicClassNames).toHaveLength(1);
    expect(result.atomic).toHaveLength(1);
    expect(result.css.atomic).not.toMatch(/color: red|color: blue/);
    expectSnippetsInOrder(result.css.preserved, [
      '@media (min-width: 600px)',
      '.s_button[data-state]',
      '@supports (display: grid)',
      '.s_button:hover',
      '@media (min-width: 900px)',
      '.s_button[data-state]'
    ]);
  });

  it('另一个 unsafe evidence 优先保留既有原因，attribute candidate 不伪装成 grammar failure', () => {
    const result = transformCss({
      id: 'attribute-unsafe-evidence.css',
      css: [
        '.button[data-state] { color: red; }',
        '.parent .button { color: blue; }',
        '.button:hover { color: green; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.button.unsafeReasons).toEqual(['descendant-selector']);
    expect(result.diagnostics.some(({ reason }) => reason === 'attribute-cascade-order')).toBe(false);
    expect(result.diagnostics.some(({ reason }) => reason === 'attribute-selector')).toBe(false);
  });

  it('不可导出的 exact attribute anchor 继续使用 non-exported-class', () => {
    const result = transformCss({
      id: 'attribute-non-exported.css',
      css: '.private[data-state] { color: red; }\n.private:hover { color: blue; }',
      scope: {
        resolveClassName(className) {
          return `s_${className}`;
        },
        shouldExportClassName() {
          return false;
        }
      }
    });

    expect(result.classes.private).toBeUndefined();
    expect(result.css.atomic).toBe('');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: '.private[data-state]',
          reason: 'non-exported-class'
        })
      ])
    );
    expect(result.diagnostics.some(({ reason }) => reason === 'attribute-cascade-order')).toBe(false);
  });

  it('按原顺序保留 normal、important 与不竞争属性，同时允许无关 class atomize', () => {
    const result = transformCss({
      id: 'importance.css',
      css: [
        '.button, .parent .link { color: blue; }',
        '.button { color: red !important; padding: 4px; }',
        '.button { border-color: black; }',
        '.independent { margin: 8px; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.link.atomicClassNames).toEqual([]);
    expect(result.classes.independent.atomicClassNames).toEqual(['_selector_q0dmug_margin_8px']);
    expect(result.css.atomic).toContain('margin: 8px;');
    expect(result.css.atomic).not.toMatch(/color:|padding:|border-color:/);
    expectSnippetsInOrder(result.css.preserved, [
      '.s_button, .s_parent .s_link {\n  color: blue;\n}',
      '.s_button {\n  color: red !important;\n  padding: 4px;\n}',
      '.s_button {\n  border-color: black;\n}'
    ]);
  });

  it.each([
    {
      name: 'descendant fallback 在 eligible rule 前',
      css: '.parent .button { color: blue; }\n.button { color: red; }',
      orderedRules: ['.s_parent .s_button {\n  color: blue;\n}', '.s_button {\n  color: red;\n}']
    },
    {
      name: 'descendant fallback 在 eligible rule 后',
      css: '.button { color: red; }\n.parent .button { color: blue; }',
      orderedRules: ['.s_button {\n  color: red;\n}', '.s_parent .s_button {\n  color: blue;\n}']
    }
  ])('保持 specificity 相关 rule 的结构与输入顺序：$name', ({ css, orderedRules }) => {
    const result = transformCss({
      id: 'specificity-order.css',
      css: `${css}\n.independent { margin: 1px; }`,
      scope: createTestScope()
    });

    expect(result.classes.button).toMatchObject({
      atomicClassNames: [],
      suggestedClassName: 's_button'
    });
    expect(result.classes.parent).toMatchObject({
      atomicClassNames: [],
      suggestedClassName: 's_parent'
    });
    expect(result.classes.independent.atomicClassNames).toHaveLength(1);
    expect(result.css.atomic).toContain('margin: 1px;');
    expect(result.css.atomic).not.toContain('color:');
    expectSnippetsInOrder(result.css.preserved, orderedRules);
  });

  it('不展开、去重或重排重复属性与 shorthand/longhand occurrence', () => {
    const result = transformCss({
      id: 'declaration-order.css',
      css: [
        '.box::marker { content: "x"; }',
        '.box {',
        '  color: red;',
        '  color: red;',
        '  color: blue;',
        '  margin: 0;',
        '  margin-left: 8px;',
        '  margin: 4px !important;',
        '}'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.box.atomicClassNames).toEqual([]);
    expect(result.css.atomic).toBe('');
    expect(result.css.preserved.match(/color: red;/g)).toHaveLength(2);
    expect(result.css.preserved).toContain(
      [
        '.s_box {',
        '  color: red;',
        '  color: red;',
        '  color: blue;',
        '  margin: 0;',
        '  margin-left: 8px;',
        '  margin: 4px !important;',
        '}'
      ].join('\n')
    );
  });

  it('保留可能重叠的 media wrapper，并让条件内无关 class 继续 atomize', () => {
    const result = transformCss({
      id: 'overlapping-media.css',
      css: [
        '.button, .parent .link { color: black; }',
        '@media (min-width: 600px) {',
        '  .button { color: red; padding: 6px; }',
        '  .independent { display: grid; }',
        '}',
        '@media (min-width: 900px) {',
        '  .button { color: blue; }',
        '}'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.independent.atomicClassNames).toHaveLength(1);
    expect(result.css.atomic).toContain('@media (min-width: 600px)');
    expect(result.css.atomic).toContain('display: grid;');
    expect(result.css.atomic).not.toMatch(/color: red|color: blue|padding: 6px/);
    expectSnippetsInOrder(result.css.preserved, [
      '.s_button, .s_parent .s_link {\n  color: black;\n}',
      '@media (min-width: 600px)',
      '.s_button {\n    color: red;\n    padding: 6px;\n  }',
      '@media (min-width: 900px)',
      '.s_button {\n    color: blue;\n  }'
    ]);
  });

  it('不把 supports 或 media/supports 条件字符串当作互斥证明', () => {
    const result = transformCss({
      id: 'overlapping-conditions.css',
      css: [
        '@supports (display: grid) {',
        '  .button { display: grid; }',
        '}',
        '@supports (display: flex) {',
        '  .button, .parent .link { display: flex; }',
        '}',
        '@media (min-width: 600px) {',
        '  @supports (display: grid) {',
        '    .button { gap: 8px; }',
        '  }',
        '}',
        '.independent { opacity: 1; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.independent.atomicClassNames).toHaveLength(1);
    expect(result.css.atomic).toContain('opacity: 1;');
    expect(result.css.atomic).not.toMatch(/display: grid|display: flex|gap: 8px/);
    expectSnippetsInOrder(result.css.preserved, [
      '@supports (display: grid)',
      '.s_button {\n    display: grid;\n  }',
      '@supports (display: flex)',
      '.s_button, .s_parent .s_link {\n    display: flex;\n  }',
      '@media (min-width: 600px)',
      '@supports (display: grid)',
      '.s_button {\n      gap: 8px;\n    }'
    ]);
  });

  it.each([
    {
      name: ':global selector',
      evidenceCss: ':global(.theme) .button { color: blue; }',
      scopedEvidence: '.theme .s_button'
    },
    {
      name: 'nested rule',
      evidenceCss: '.container { .button { color: blue; } }',
      scopedEvidence: '.s_container { .s_button'
    },
    {
      name: 'unsupported @container block',
      evidenceCss: '@container (min-width: 300px) { .button { color: blue; } }',
      scopedEvidence: '@container (min-width: 300px)'
    }
  ])('在 registry mutation 前收集后置 evidence：$name', ({ evidenceCss, scopedEvidence }) => {
    const result = transformCss({
      id: 'post-evidence.css',
      css: [
        '.button { color: red; }',
        '.independent { margin: 8px; }',
        evidenceCss
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([]);
    expect(result.classes.independent.atomicClassNames).toEqual(['_selector_q0dmug_margin_8px']);
    expect(result.atomic).toHaveLength(1);
    expect(result.css.atomic).toContain('margin: 8px;');
    expect(result.css.atomic).not.toContain('color: red;');
    expect(result.css.preserved).toContain('.s_button {\n  color: red;\n}');
    expect(result.css.preserved).toContain(scopedEvidence);
    expect(result.css.preserved.indexOf('.s_button {\n  color: red;\n}')).toBeLessThan(
      result.css.preserved.indexOf(scopedEvidence)
    );
  });
});

/**
 * 逐段验证 preserved CSS 的相对次序，避免用格式无关的包含断言掩盖 cascade 重排。
 *
 * @param css - Core 输出的 preserved CSS。
 * @param snippets - 按输入先后排列、必须依次出现的 CSS 片段。
 */
function expectSnippetsInOrder(css: string, snippets: readonly string[]): void {
  let previousIndex = -1;

  for (const snippet of snippets) {
    const index = css.indexOf(snippet, previousIndex + 1);

    expect(index, `Expected preserved CSS to contain "${snippet}" after index ${previousIndex}.`).toBeGreaterThan(
      previousIndex
    );
    previousIndex = index;
  }
}
