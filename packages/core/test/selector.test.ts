import { describe, expect, it } from 'vitest';
import { planSelectorRewrite } from '../src/selector/planSelectorRewrite.js';
import { createTestScope } from './helpers.js';

const preservedContext = {
  id: 'case.css',
  originalSelector: '.button',
  usage: 'preserved-rule' as const
};

/** 从单 selector eligible plan 中读取唯一 arm。 */
function getOnlyArm(rewrite: ReturnType<typeof planSelectorRewrite>) {
  if (rewrite.kind !== 'eligible' || rewrite.arms.length !== 1 || !rewrite.arms[0]) {
    throw new Error('Expected exactly one eligible selector arm.');
  }

  return rewrite.arms[0];
}

describe('selector rewrite plan', () => {
  it('为基础 selector 和支持的 pseudo class 生成 eligible plan', () => {
    const base = planSelectorRewrite('.button');

    if (base.kind !== 'eligible') {
      throw new Error('Expected .button to be eligible.');
    }

    expect(base).toMatchObject({
      sourceClassNames: ['button'],
      globalClassNames: [],
      arms: [{ anchorClassName: 'button', identity: '.__GSS_ANCHOR__' }]
    });
    expect(getOnlyArm(base).renderAtomicSelector('_color_red')).toBe('._color_red');
    expect(base.renderPreservedSelector(createTestScope(), preservedContext)).toBe('.s_button');

    for (const pseudo of [':hover', ':focus', ':active', ':disabled', ':focus-visible']) {
      const rewrite = planSelectorRewrite(`.button${pseudo}`);

      expect(rewrite).toMatchObject({
        kind: 'eligible',
        arms: [{ anchorClassName: 'button', identity: `.__GSS_ANCHOR__${pseudo}` }]
      });

      if (rewrite.kind === 'eligible') {
        expect(getOnlyArm(rewrite).renderAtomicSelector('_atomic')).toBe(`._atomic${pseudo}`);
      }
    }
  });

  it('使 identity 与 source class 无关，且不把它泄漏到渲染结果', () => {
    const button = planSelectorRewrite('.button:hover');
    const link = planSelectorRewrite('.link:hover');

    if (button.kind !== 'eligible' || link.kind !== 'eligible') {
      throw new Error('Expected both selectors to be eligible.');
    }

    const buttonArm = getOnlyArm(button);
    const linkArm = getOnlyArm(link);
    expect(buttonArm.identity).toBe(linkArm.identity);
    expect(buttonArm.identity).toBe('.__GSS_ANCHOR__:hover');
    expect(buttonArm.renderAtomicSelector('_hover_color_blue')).toBe('._hover_color_blue:hover');
    expect(buttonArm.renderAtomicSelector('_hover_color_blue')).not.toContain('__GSS_ANCHOR__');
  });

  it('将 escaped source class 规范化为与普通 source class 相同的 selector 身份', () => {
    const escaped = planSelectorRewrite('.button\\:primary:hover');
    const plain = planSelectorRewrite('.button:hover');

    if (escaped.kind !== 'eligible' || plain.kind !== 'eligible') {
      throw new Error('Expected escaped and plain source classes to be eligible.');
    }

    expect(escaped.sourceClassNames).toEqual(['button:primary']);
    const escapedArm = getOnlyArm(escaped);
    const plainArm = getOnlyArm(plain);
    expect(escapedArm.identity).toBe('.__GSS_ANCHOR__:hover');
    expect(escapedArm.identity).toBe(plainArm.identity);
    expect(escapedArm.renderAtomicSelector('_atomic')).toBe('._atomic:hover');
    expect(escapedArm.renderAtomicSelector('_atomic')).toBe(plainArm.renderAtomicSelector('_atomic'));
    expect(escapedArm.renderAtomicSelector('_atomic')).not.toContain('__GSS_ANCHOR__');
    expect(escapedArm.renderAtomicSelector('_atomic')).not.toContain('button');
  });

  it('每次从 AST clone 渲染，不在调用间共享 mutation', () => {
    const rewrite = planSelectorRewrite('.button:hover');

    if (rewrite.kind !== 'eligible') {
      throw new Error('Expected selector to be eligible.');
    }

    const arm = getOnlyArm(rewrite);
    expect(arm.renderAtomicSelector('_first')).toBe('._first:hover');
    expect(arm.renderAtomicSelector('_second')).toBe('._second:hover');
    expect(rewrite.renderPreservedSelector(createTestScope(), preservedContext)).toBe('.s_button:hover');
    expect(arm.renderAtomicSelector('_first')).toBe('._first:hover');
    expect(Object.isFrozen(rewrite.sourceClassNames)).toBe(true);
    expect(Object.isFrozen(rewrite.globalClassNames)).toBe(true);
  });

  it.each([
    {
      selector: '.button[data-state]',
      identity: '.__GSS_ANCHOR__[data-state]',
      rendered: '._atomic[data-state]',
      guard: { kind: 'attribute', name: 'data-state', operator: 'presence' }
    },
    {
      selector: '.button[data-state=open]',
      identity: '.__GSS_ANCHOR__[data-state=open]',
      rendered: '._atomic[data-state=open]',
      guard: { kind: 'attribute', name: 'data-state', operator: '=', value: 'open' }
    },
    {
      selector: `.button[ data-state = 'open' ]`,
      identity: `.__GSS_ANCHOR__[ data-state = 'open' ]`,
      rendered: `._atomic[ data-state = 'open' ]`,
      guard: { kind: 'attribute', name: 'data-state', operator: '=', value: 'open' }
    },
    {
      selector: '[data-state="open"].button',
      identity: '[data-state="open"].__GSS_ANCHOR__',
      rendered: '[data-state="open"]._atomic',
      guard: { kind: 'attribute', name: 'data-state', operator: '=', value: 'open' }
    },
    {
      selector: '.button[d\\61 ta-state=op\\65 n]',
      identity: '.__GSS_ANCHOR__[d\\61 ta-state=op\\65 n]',
      rendered: '._atomic[d\\61 ta-state=op\\65 n]',
      guard: { kind: 'attribute', name: 'data-state', operator: '=', value: 'open' }
    }
  ])('保留 attribute AST spelling 与 node order：$selector', ({ selector, identity, rendered, guard }) => {
    const rewrite = planSelectorRewrite(selector);

    expect(rewrite).toMatchObject({
      kind: 'eligible',
      arms: [{ anchorClassName: 'button', identity, cascadeGuard: guard }]
    });

    if (rewrite.kind !== 'eligible') {
      throw new Error(`Expected ${selector} to be eligible.`);
    }

    const arm = getOnlyArm(rewrite);
    expect(arm.renderAtomicSelector('_atomic')).toBe(rendered);
    expect(arm.renderAtomicSelector('_second')).toBe(rendered.replace('_atomic', '_second'));
    expect(rewrite.renderPreservedSelector(createTestScope(), preservedContext)).toBe(
      selector.replace('.button', '.s_button')
    );
    expect(arm.renderAtomicSelector('_atomic')).toBe(rendered);
  });

  it('attribute identity 只移除 escaped source class，不归并 attribute quote 或 escape', () => {
    const escapedClass = planSelectorRewrite('.button\\:primary[data-state="open"]');
    const singleQuoted = planSelectorRewrite(".button[data-state='open']");
    const escapedValue = planSelectorRewrite('.button[data-state=op\\65 n]');

    if (
      escapedClass.kind !== 'eligible' ||
      singleQuoted.kind !== 'eligible' ||
      escapedValue.kind !== 'eligible'
    ) {
      throw new Error('Expected exact attribute selectors to be eligible.');
    }

    expect(escapedClass.sourceClassNames).toEqual(['button:primary']);
    const escapedClassArm = getOnlyArm(escapedClass);
    const singleQuotedArm = getOnlyArm(singleQuoted);
    const escapedValueArm = getOnlyArm(escapedValue);
    expect(escapedClassArm.identity).toBe('.__GSS_ANCHOR__[data-state="open"]');
    expect(singleQuotedArm.identity).not.toBe(escapedClassArm.identity);
    expect(escapedValueArm.identity).not.toBe(escapedClassArm.identity);
    expect(escapedValueArm.cascadeGuard).toEqual({
      kind: 'attribute',
      name: 'data-state',
      operator: '=',
      value: 'open'
    });
  });

  it('cascade guard 保留 parser-decoded attribute name 的 exact case', () => {
    const rewrite = planSelectorRewrite('.button[data-State=open]');

    expect(rewrite).toMatchObject({
      kind: 'eligible',
      arms: [{
        cascadeGuard: {
          kind: 'attribute',
          name: 'data-State',
          operator: '=',
          value: 'open'
        }
      }]
    });
  });

  it('为 selector list 保留 selector-list reason 和全部 class 证据', () => {
    expect(planSelectorRewrite('.button, :global(.link)')).toMatchObject({
      kind: 'preserved',
      reason: 'selector-list',
      sourceClassNames: ['button'],
      globalClassNames: ['link']
    });
  });

  it('保持 combinator 相关 unsafe reason', () => {
    expect(planSelectorRewrite('.card .button')).toMatchObject({
      kind: 'preserved',
      reason: 'descendant-selector'
    });
    expect(planSelectorRewrite('.card > .button')).toMatchObject({ kind: 'preserved', reason: 'child-selector' });
    expect(planSelectorRewrite('.button + .desc')).toMatchObject({
      kind: 'preserved',
      reason: 'adjacent-selector'
    });
    expect(planSelectorRewrite('.button ~ .desc')).toMatchObject({ kind: 'preserved', reason: 'sibling-selector' });
  });

  it('保持 compound、tag、id、attribute near-miss、pseudo element 和 unsupported pseudo reason', () => {
    expect(planSelectorRewrite(':hover')).toMatchObject({ kind: 'preserved', reason: 'missing-source-class' });
    expect(planSelectorRewrite('.button.primary')).toMatchObject({
      kind: 'preserved',
      reason: 'compound-class-selector'
    });
    expect(planSelectorRewrite('button.button')).toMatchObject({ kind: 'preserved', reason: 'tag-selector' });
    expect(planSelectorRewrite('#app.button')).toMatchObject({ kind: 'preserved', reason: 'id-selector' });
    expect(planSelectorRewrite('.button[data-state~="open"]')).toMatchObject({
      kind: 'preserved',
      reason: 'attribute-selector'
    });
    expect(planSelectorRewrite('.button::marker')).toMatchObject({ kind: 'preserved', reason: 'pseudo-element' });
    expect(planSelectorRewrite('.button:visited')).toMatchObject({
      kind: 'preserved',
      reason: 'unsupported-pseudo'
    });
  });

  it.each([
    '.button[class]',
    '.button[CLASS=open]',
    '.button[cl\\61 ss=open]',
    '.button[ns|data-state=open]',
    '.button[data-state=open i]',
    '.button[data-state=open s]',
    '.button[data-state~=open]',
    '.button[data-state|=open]',
    '.button[data-state^=open]',
    '.button[data-state$=open]',
    '.button[data-state*=open]',
    '.button[data-state][data-kind]',
    '.button[data-state]:hover',
    'button.button[data-state]',
    '#app.button[data-state]',
    '.parent .button[data-state]',
    '.button[data-state], .parent .link',
    ':global(.button)[data-state]',
    '.button.primary[data-state]'
  ])('attribute near-miss 继续使用既有结构原因：%s', (selector) => {
    const rewrite = planSelectorRewrite(selector);

    expect(rewrite.kind).toBe('preserved');
    if (rewrite.kind === 'eligible') {
      throw new Error(`Expected ${selector} to be preserved.`);
    }

    expect(rewrite.reason).not.toBe('attribute-cascade-order');
  });

  it('attribute near-miss 保持 selector list 与 combinator 的既有 primary reason', () => {
    expect(planSelectorRewrite('.parent .button[data-state]')).toMatchObject({
      kind: 'preserved',
      reason: 'descendant-selector'
    });
    expect(planSelectorRewrite('.button[data-state], .parent .link')).toMatchObject({
      kind: 'preserved',
      reason: 'selector-list'
    });
  });

  it('仅在全部 arm eligible 时生成有序 selector-list rewrite plan', () => {
    const rewrite = planSelectorRewrite(
      `.button, .link:hover, [data-state='open'].card`
    );

    expect(rewrite).toMatchObject({
      kind: 'eligible',
      sourceClassNames: ['button', 'link', 'card'],
      arms: [
        { anchorClassName: 'button', identity: '.__GSS_ANCHOR__' },
        { anchorClassName: 'link', identity: '.__GSS_ANCHOR__:hover' },
        {
          anchorClassName: 'card',
          identity: `[data-state='open'].__GSS_ANCHOR__`,
          cascadeGuard: { kind: 'attribute', name: 'data-state', operator: '=', value: 'open' }
        }
      ]
    });

    if (rewrite.kind !== 'eligible') {
      throw new Error('Expected all selector-list arms to be eligible.');
    }

    expect(rewrite.arms.map((arm) => arm.renderAtomicSelector('_atomic'))).toEqual([
      '._atomic',
      '._atomic:hover',
      `[data-state='open']._atomic`
    ]);
    expect(rewrite.renderPreservedSelector(createTestScope(), preservedContext)).toBe(
      `.s_button, .s_link:hover, [data-state='open'].s_card`
    );
    expect(Object.isFrozen(rewrite.arms)).toBe(true);
  });

  it('任一 arm unsafe 时完整 list 保留 selector-list primary reason 和 arm details', () => {
    expect(planSelectorRewrite('.button, .parent .link, .card:visited')).toMatchObject({
      kind: 'preserved',
      reason: 'selector-list',
      details: ['selector-list', 'descendant-selector', 'unsupported-pseudo'],
      sourceClassNames: ['button', 'parent', 'link', 'card']
    });
  });

  it('识别 :global，跳过 global class resolver 并展开为标准 selector', () => {
    const rewrite = planSelectorRewrite(':global(.ant-btn) .button');
    const resolvedClassNames: string[] = [];

    expect(rewrite).toMatchObject({
      kind: 'preserved',
      reason: 'global-selector',
      sourceClassNames: ['button'],
      globalClassNames: ['ant-btn']
    });
    expect(
      rewrite.renderPreservedSelector(
        {
          resolveClassName(className) {
            resolvedClassNames.push(className);
            return `s_${className}`;
          }
        },
        {
          ...preservedContext,
          originalSelector: ':global(.ant-btn) .button'
        }
      )
    ).toBe('.ant-btn .s_button');
    expect(resolvedClassNames).toEqual(['button']);
  });

  it('保持 invalid selector 在 fallback scoping 阶段抛出 parser error 的边界', () => {
    const rewrite = planSelectorRewrite('.button[');

    expect(rewrite).toMatchObject({
      kind: 'preserved',
      reason: 'unknown-selector',
      sourceClassNames: [],
      globalClassNames: [],
      evidenceComplete: false
    });
    expect(() => rewrite.renderPreservedSelector(createTestScope(), preservedContext)).toThrow();
  });

  it('保持 resolver error 透传，不返回未 scoped CSS', () => {
    const rewrite = planSelectorRewrite('.button::before');

    expect(() =>
      rewrite.renderPreservedSelector(
        {
          resolveClassName() {
            throw new Error('resolver failed');
          }
        },
        preservedContext
      )
    ).toThrow('resolver failed');
  });
});
