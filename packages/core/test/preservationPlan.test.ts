import postcss from 'postcss';
import { describe, expect, it } from 'vitest';
import { planInputClassPreservation } from '../src/engine/planInputClassPreservation.js';
import type { CssIr } from '../src/ir/types.js';
import { planSelectorRewrite } from '../src/selector/planSelectorRewrite.js';
import { createTestScope } from './helpers.js';

describe('input class preservation preflight', () => {
  it('在 registry mutation 前标记 attribute/pseudo declaration 竞争', () => {
    const plan = planInputClassPreservation(
      createRuleIr([
        {
          selector: '.button[data-state]',
          declarations: [{ prop: 'color', value: 'red', important: false }]
        },
        {
          selector: '.button:hover',
          declarations: [{ prop: 'color', value: 'blue', important: false }]
        }
      ])
    );

    expect([...plan.preserveSourceClassNames]).toEqual([
      ['button', 'attribute-cascade-order']
    ]);
    expect([...plan.selectorCascadeReasonsByRuleOrder]).toEqual([
      [0, new Map([[0, 'attribute-cascade-order']])]
    ]);
  });

  it('pseudo alias 竞争记录具体 rule/arm 的 pseudo-element reason', () => {
    const plan = planInputClassPreservation(
      createRuleIr([
        {
          selector: '.icon:before',
          declarations: [{ prop: 'color', value: 'red', important: false }]
        },
        {
          selector: '.icon::before',
          declarations: [{ prop: 'color', value: 'blue', important: false }]
        },
        {
          selector: '.icon',
          declarations: [{ prop: 'padding', value: '4px', important: false }]
        }
      ])
    );

    expect(plan.preserveSourceClassNames.get('icon')).toBe('pseudo-element');
    expect([...plan.selectorCascadeReasonsByRuleOrder]).toEqual([
      [0, new Map([[0, 'pseudo-element']])],
      [1, new Map([[0, 'pseudo-element']])]
    ]);
    expect(plan.selectorCascadeReasonsByRuleOrder.has(2)).toBe(false);
  });

  it.each([
    {
      declarations: [
        { prop: 'color', value: 'red', important: false },
        { prop: 'color', value: 'blue', important: false },
        { prop: 'color', value: 'red', important: false }
      ]
    },
    {
      declarations: [
        { prop: 'margin', value: '0', important: false },
        { prop: 'margin-left', value: '8px', important: false },
        { prop: 'margin', value: '0', important: false }
      ]
    }
  ])('在 registry mutation 前标记 attribute 单 rule 内的 competing occurrences', ({ declarations }) => {
    const plan = planInputClassPreservation(
      createRuleIr([
        {
          selector: '.x[data]',
          declarations
        }
      ])
    );

    expect(plan.preserveSourceClassNames.get('x')).toBe('attribute-cascade-order');
  });

  it('mixed-case attribute names 不作为 data-* 互斥证明', () => {
    const plan = planInputClassPreservation(
      createRuleIr([
        {
          selector: '.x[data-State=open]',
          declarations: [{ prop: 'color', value: 'red', important: false }]
        },
        {
          selector: '.x[data-state=closed]',
          declarations: [{ prop: 'color', value: 'blue', important: false }]
        }
      ])
    );

    expect(plan.preserveSourceClassNames.get('x')).toBe('attribute-cascade-order');
  });

  it('不把不竞争 property 或确定互斥的 data-* equality 标记为 fallback', () => {
    const disjoint = planInputClassPreservation(
      createRuleIr([
        {
          selector: '.button[data-state]',
          declarations: [{ prop: 'border-color', value: 'red', important: false }]
        },
        {
          selector: '.button:hover',
          declarations: [{ prop: 'background', value: 'blue', important: false }]
        }
      ])
    );
    const exclusive = planInputClassPreservation(
      createRuleIr([
        {
          selector: '.button[data-state=open]',
          declarations: [{ prop: 'color', value: 'red', important: false }]
        },
        {
          selector: '.button[data-state=closed]',
          declarations: [{ prop: 'color', value: 'blue', important: false }]
        }
      ])
    );

    expect([...disjoint.preserveSourceClassNames]).toEqual([]);
    expect([...exclusive.preserveSourceClassNames]).toEqual([]);
  });

  it('同 class 另有 unsafe evidence 时保留原有 primary reason', () => {
    const plan = planInputClassPreservation(
      createRuleIr([
        {
          selector: '.button[data-state]',
          declarations: [{ prop: 'color', value: 'red', important: false }]
        },
        {
          selector: '.button:hover',
          declarations: [{ prop: 'color', value: 'blue', important: false }]
        },
        {
          selector: '.parent .button',
          declarations: [{ prop: 'color', value: 'green', important: false }]
        }
      ])
    );

    expect(plan.preserveSourceClassNames.get('button')).toBe('descendant-selector');
    expect(plan.preserveSourceClassNames.get('parent')).toBe('descendant-selector');
  });

  it.each([
    createInvalidSelectorIr('normal'),
    createInvalidSelectorIr('nested'),
    createInvalidSelectorIr('block')
  ])('在 $id 证据中透传 selector planner 的原始异常', (ir) => {
    const rewrite = planSelectorRewrite('.broken|');
    const expectedError = captureError(() =>
      rewrite.renderPreservedSelector(createTestScope(), {
        id: ir.id,
        originalSelector: '.broken|',
        usage: 'preserved-rule'
      })
    );
    const actualError = captureError(() => planInputClassPreservation(ir));

    expect(actualError.constructor).toBe(expectedError.constructor);
    expect(actualError.message).toBe(expectedError.message);
  });

  it.each([
    createInvalidCssIr('nested-postcss'),
    createInvalidCssIr('block-postcss')
  ])('在 $id 证据中透传 PostCSS 的原始异常', (ir) => {
    const css = ir.rules[0]?.css ?? ir.preservedBlocks[0]?.css ?? '';
    const expectedError = captureError(() => postcss.parse(css));
    const actualError = captureError(() => planInputClassPreservation(ir));

    expect(actualError.constructor).toBe(expectedError.constructor);
    expect(actualError.message).toBe(expectedError.message);
  });
});

/** 构造只包含普通 rule 的 preflight IR，并保留输入 occurrence 顺序。 */
function createRuleIr(
  rules: Array<{
    selector: string;
    declarations: CssIr['rules'][number]['declarations'];
  }>
): CssIr {
  return {
    id: 'cascade-preflight.css',
    rules: rules.map((rule, order) => ({
      id: 'cascade-preflight.css',
      order,
      selector: rule.selector,
      css: `${rule.selector} {}`,
      declarations: rule.declarations,
      context: {},
      hasNestedNodes: false
    })),
    preservedBlocks: []
  };
}

/** 构造普通、nested 或 preserved block 中的不可解析 selector 证据。 */
function createInvalidSelectorIr(kind: 'normal' | 'nested' | 'block'): CssIr {
  const id = `${kind}-selector`;

  if (kind === 'block') {
    return {
      id,
      rules: [],
      preservedBlocks: [
        {
          id,
          order: 0,
          css: '@container (min-width: 300px) { .broken| { color: blue; } }',
          context: {},
          reason: 'unsupported-at-rule'
        }
      ]
    };
  }

  return {
    id,
    rules: [
      {
        id,
        order: 0,
        selector: kind === 'normal' ? '.broken|' : '.outer',
        css: kind === 'normal' ? '.broken| { color: blue; }' : '.outer { .broken| { color: blue; } }',
        declarations: [],
        context: {},
        hasNestedNodes: kind === 'nested'
      }
    ],
    preservedBlocks: []
  };
}

/** 构造只有 preflight 会读取的非法 nested/block CSS。 */
function createInvalidCssIr(kind: 'nested-postcss' | 'block-postcss'): CssIr {
  const css = '.broken {';

  if (kind === 'block-postcss') {
    return {
      id: kind,
      rules: [],
      preservedBlocks: [
        {
          id: kind,
          order: 0,
          css,
          context: {},
          reason: 'unsupported-at-rule'
        }
      ]
    };
  }

  return {
    id: kind,
    rules: [
      {
        id: kind,
        order: 0,
        selector: '.outer',
        css,
        declarations: [],
        context: {},
        hasNestedNodes: true
      }
    ],
    preservedBlocks: []
  };
}

/** 执行预期抛错的回调并返回原始 Error。 */
function captureError(callback: () => unknown): Error {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw new Error('Expected callback to throw an Error instance.');
  }

  throw new Error('Expected callback to throw.');
}
