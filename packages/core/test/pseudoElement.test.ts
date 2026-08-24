import { describe, expect, it } from 'vitest';
import { createTransformer, transformCss } from '../src/index.js';
import { planSelectorRewrite } from '../src/selector/planSelectorRewrite.js';
import { createTestScope } from './helpers.js';

describe('SEL-01 pseudo element selector', () => {
  it('现代与 legacy before/after 保留各自 spelling，并生成四个独立 identity/token', () => {
    const selectors = ['.modernBefore::before', '.legacyBefore:before', '.modernAfter::after', '.legacyAfter:after'];
    const resolverSelectors: string[] = [];
    const result = transformCss({
      id: 'pseudo-elements.css',
      css: selectors.map((selector) => `${selector} { content: ""; color: red; }`).join('\n'),
      scope: {
        resolveClassName(className, context) {
          resolverSelectors.push(context.originalSelector);
          return `s_${className}`;
        }
      }
    });

    expect(result.atomic).toHaveLength(8);
    expect(result.atomic.map(({ selector }) => selector.identity)).toEqual([
      '.__GSS_ANCHOR__::before',
      '.__GSS_ANCHOR__::before',
      '.__GSS_ANCHOR__:before',
      '.__GSS_ANCHOR__:before',
      '.__GSS_ANCHOR__::after',
      '.__GSS_ANCHOR__::after',
      '.__GSS_ANCHOR__:after',
      '.__GSS_ANCHOR__:after'
    ]);
    expect(result.atomic.map(({ selector }) => selector.css)).toEqual(
      result.atomic.map(({ className }, index) => {
        const spelling = index < 2 ? '::before' : index < 4 ? ':before' : index < 6 ? '::after' : ':after';
        return `.${className}${spelling}`;
      })
    );
    expect(new Set(result.atomic.map(({ className }) => className)).size).toBe(8);
    expect(result.atomic.every(({ selector }) => !selector.css.includes(','))).toBe(true);
    expect(new Set(resolverSelectors)).toEqual(new Set(selectors));
  });

  it.each([
    '.button::marker',
    '.button:before:hover',
    '.button:hover::before',
    '.button::before::after',
    '.button:before:after',
    'button.button::before',
    '#app.button::before',
    '.parent .button::before',
    '.button.extra::before',
    '.button[data-state]::before',
    '::before.button'
  ])('保守拒绝 pseudo-element near miss：%s', (selector) => {
    expect(planSelectorRewrite(selector)).toMatchObject({ kind: 'preserved' });
  });

  it('legacy/modern alias 归一到同一 box，并在 registry mutation 前整类 fallback', () => {
    const transformer = createTransformer();
    const result = transformer.transformCss({
      id: 'alias-cascade.css',
      css: [
        '.icon:before { color: red; }',
        '.icon::before { color: blue; }',
        '.independent::after { margin: 1px; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.icon).toMatchObject({
      atomicClassNames: [],
      unsafeReasons: ['pseudo-element']
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: '.icon:before', reason: 'pseudo-element' }),
        expect.objectContaining({ selector: '.icon::before', reason: 'pseudo-element' })
      ])
    );
    expect(result.diagnostics.some(({ reason }) => reason === 'attribute-cascade-order')).toBe(false);
    expect(result.css.preserved).toContain('.s_icon:before');
    expect(result.css.preserved).toContain('.s_icon::before');
    expect(result.atomic.every(({ selector }) => selector.identity.endsWith('::after'))).toBe(true);
    expect(transformer.getAtomicCss()).not.toContain('before');
  });

  it.each([
    {
      name: 'A-B-A 重复属性',
      css: '.icon::before { color: red; color: blue; color: red; }'
    },
    {
      name: 'shorthand/longhand',
      css: '.icon::before { margin: 1px; margin-left: 2px; }'
    },
    {
      name: 'media/supports alias overlap',
      css: [
        '@media (min-width: 1px) { .icon:after { color: red; } }',
        '@supports (display: grid) { .icon::after { color: blue; } }'
      ].join('\n')
    }
  ])('$name 使用既有 pseudo-element fallback reason', ({ css }) => {
    const result = transformCss({ id: 'pseudo-cascade.css', css, scope: createTestScope() });

    expect(result.classes.icon).toMatchObject({
      atomicClassNames: [],
      unsafeReasons: ['pseudo-element']
    });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'pseudo-element' })])
    );
    expect(result.diagnostics.some(({ reason }) => reason === 'attribute-cascade-order')).toBe(false);
    expect(result.css.atomic).toBe('');
    expect(result.css.preserved).not.toBe('');
  });

  it('同 class 的 pseudo alias 与 attribute 风险保留各自 public reason，传播 rule 不伪造 reason', () => {
    const transformer = createTransformer();
    const result = transformer.transformCss({
      id: 'mixed-cascade-reasons.css',
      css: [
        '.icon:before { color: red; }',
        '.icon::before { color: blue; }',
        '.icon[data-state] { background: red; }',
        '.icon:hover { background: blue; }',
        '.icon { padding: 4px; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.icon).toMatchObject({
      atomicClassNames: [],
      unsafeReasons: ['pseudo-element', 'attribute-cascade-order']
    });
    expect(result.diagnostics.filter(({ reason }) => reason === 'pseudo-element')).toHaveLength(2);
    expect(result.diagnostics.filter(({ reason }) => reason === 'attribute-cascade-order')).toHaveLength(1);
    expect(result.diagnostics.some(({ selector }) => selector === '.icon:hover')).toBe(false);
    expect(result.diagnostics.some(({ selector }) => selector === '.icon')).toBe(false);
    expect(result.atomic).toEqual([]);
    expect(transformer.getManifest().atomic).toEqual({});
    expect(transformer.getAtomicCss()).toBe('');
  });

  it('before 与 after 是独立 generated box，不因同属性竞争互相阻断', () => {
    const result = transformCss({
      id: 'separate-boxes.css',
      css: '.icon::before { color: red; }\n.icon:after { color: blue; }',
      scope: createTestScope()
    });

    expect(result.classes.icon.unsafeReasons ?? []).toEqual([]);
    expect(result.classes.icon.atomicClassNames).toHaveLength(2);
    expect(result.atomic.map(({ selector }) => selector.identity)).toEqual([
      '.__GSS_ANCHOR__::before',
      '.__GSS_ANCHOR__:after'
    ]);
  });

  it.each([
    '.a::before, .b { color: red; }',
    '.a, .b:after { color: red; }',
    '.a::before, .b:before { color: red; }'
  ])('任何含 pseudo-element arm 的 selector list 完整 fallback：%s', (css) => {
    const transformer = createTransformer();
    const result = transformer.transformCss({ id: 'pseudo-list.css', css, scope: createTestScope() });

    expect(result.atomic).toEqual([]);
    expect(transformer.getAtomicCss()).toBe('');
    expect(Object.values(result.classes).every(({ atomicClassNames }) => atomicClassNames.length === 0)).toBe(true);
    expect(
      Object.values(result.classes).every(({ unsafeReasons }) =>
        unsafeReasons?.includes('selector-list')
      )
    ).toBe(true);
    expect(result.css.preserved).toContain(',');
  });

  it('non-exported、adapter config、unsafe 与 nested evidence 均阻止同 class 部分注册', () => {
    const nonExported = transformCss({
      id: 'non-exported.css',
      css: '.private::before { color: red; }',
      scope: {
        ...createTestScope(),
        shouldExportClassName: () => false
      }
    });
    const configured = transformCss({
      id: 'configured.css',
      css: '.asset:before { color: red; }',
      scope: createTestScope(),
      preserveClassNames: { asset: 'asset-reference' }
    });
    const unsafeEvidence = transformCss({
      id: 'unsafe-evidence.css',
      css: '.icon::marker { color: blue; }\n.icon::before { color: red; }',
      scope: createTestScope()
    });
    const nestedEvidence = transformCss({
      id: 'nested-evidence.css',
      css: '.nested::before { color: red; & span { color: blue; } }',
      scope: createTestScope()
    });

    expect(nonExported.atomic).toEqual([]);
    expect(nonExported.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'non-exported-class' })])
    );
    expect(configured.atomic).toEqual([]);
    expect(configured.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'asset-reference' })])
    );
    expect(unsafeEvidence.atomic).toEqual([]);
    expect(unsafeEvidence.classes.icon.unsafeReasons).toContain('pseudo-element');
    expect(nestedEvidence.atomic).toEqual([]);
    expect(nestedEvidence.classes.nested.unsafeReasons).toContain('nested-rule');
  });
});
