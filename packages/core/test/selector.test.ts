import { describe, expect, it } from 'vitest';
import { analyzeSelector } from '../src/selector/analyzeSelector.js';
import { scopeSelector } from '../src/selector/scopeSelector.js';
import { createTestScope } from './helpers.js';

describe('selector analysis', () => {
  it('识别基础 safe selector 和支持的 pseudo class', () => {
    expect(analyzeSelector('.button')).toMatchObject({
      kind: 'safe',
      sourceClassName: 'button'
    });

    for (const pseudo of [':hover', ':focus', ':active', ':disabled', ':focus-visible']) {
      expect(analyzeSelector(`.button${pseudo}`)).toMatchObject({
        kind: 'safe',
        sourceClassName: 'button',
        pseudo
      });
    }
  });

  it('为 selector list 输出 selector-list reason', () => {
    expect(analyzeSelector('.button, .link')).toMatchObject({
      kind: 'unsafe',
      reason: 'selector-list'
    });
  });

  it('识别 combinator 相关 unsafe reason', () => {
    expect(analyzeSelector('.card .button')).toMatchObject({ kind: 'unsafe', reason: 'descendant-selector' });
    expect(analyzeSelector('.card > .button')).toMatchObject({ kind: 'unsafe', reason: 'child-selector' });
    expect(analyzeSelector('.button + .desc')).toMatchObject({ kind: 'unsafe', reason: 'adjacent-selector' });
    expect(analyzeSelector('.button ~ .desc')).toMatchObject({ kind: 'unsafe', reason: 'sibling-selector' });
  });

  it('识别 compound、tag、id、attribute、pseudo element 和 unsupported pseudo', () => {
    expect(analyzeSelector(':hover')).toMatchObject({ kind: 'unsafe', reason: 'missing-source-class' });
    expect(analyzeSelector('.button.primary')).toMatchObject({ kind: 'unsafe', reason: 'compound-class-selector' });
    expect(analyzeSelector('button.button')).toMatchObject({ kind: 'unsafe', reason: 'tag-selector' });
    expect(analyzeSelector('#app.button')).toMatchObject({ kind: 'unsafe', reason: 'id-selector' });
    expect(analyzeSelector('.button[data-state="open"]')).toMatchObject({
      kind: 'unsafe',
      reason: 'attribute-selector'
    });
    expect(analyzeSelector('.button::before')).toMatchObject({ kind: 'unsafe', reason: 'pseudo-element' });
    expect(analyzeSelector('.button:visited')).toMatchObject({ kind: 'unsafe', reason: 'unsupported-pseudo' });
  });

  it('识别 :global 并在 scoping 时展开为标准 selector', () => {
    expect(analyzeSelector(':global(.ant-btn) .button')).toMatchObject({
      kind: 'unsafe',
      reason: 'global-selector',
      sourceClassNames: ['button'],
      globalClassNames: ['ant-btn']
    });
    expect(
      scopeSelector(':global(.ant-btn) .button', createTestScope(), {
        id: 'case.css',
        originalSelector: ':global(.ant-btn) .button',
        usage: 'preserved-rule'
      })
    ).toBe('.ant-btn .s_button');
  });
});
