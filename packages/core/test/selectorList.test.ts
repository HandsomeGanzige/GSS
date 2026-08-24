import { describe, expect, it } from 'vitest';
import { createTransformer, transformCss } from '../src/index.js';
import { createTestScope } from './helpers.js';

describe('SEL-03 selector-list transform', () => {
  it('三臂与重复 arm 按 declaration×arm 注册并复用同 identity token', () => {
    const result = transformCss({
      id: 'three-arms.css',
      css: '.a, .b, .a { color: red; background: blue; }',
      scope: createTestScope()
    });

    expect(result.atomic).toHaveLength(2);
    expect(result.report.summary.reusedAtomicDeclarations).toBe(4);
    expect(result.classes.a.atomicClassNames).toHaveLength(2);
    expect(result.classes.b.atomicClassNames).toEqual(result.classes.a.atomicClassNames);
    expect(result.atomic.every(({ selector }) => !selector.css.includes(','))).toBe(true);
    expect(result.css.preserved).toBe('');
  });

  it('按 arm 顺序保留 base、pseudo 与 attribute 的独立 identity/renderer', () => {
    const result = transformCss({
      id: 'mixed-arms.css',
      css: `.a, .b:hover, [data-state='open'].c { color: red; }`,
      scope: createTestScope()
    });

    expect(result.atomic.map(({ selector }) => selector)).toEqual([
      { identity: '.__GSS_ANCHOR__', css: expect.stringMatching(/^\.[^\s,:]+$/u) },
      {
        identity: '.__GSS_ANCHOR__:hover',
        css: expect.stringMatching(/^\.[^\s,:]+:hover$/u)
      },
      {
        identity: `[data-state='open'].__GSS_ANCHOR__`,
        css: expect.stringMatching(/^\[data-state='open'\]\.[^\s,:]+$/u)
      }
    ]);
    expect(result.classes.a.atomicClassNames).toHaveLength(1);
    expect(result.classes.b.atomicClassNames).toHaveLength(1);
    expect(result.classes.c.atomicClassNames).toHaveLength(1);
  });

  it('eligible list 的 preserved declaration 只保留完整 list 一次', () => {
    const result = transformCss({
      id: 'partial-list.css',
      css: '.a, .b { --tone: red; color: var(--tone); }',
      scope: createTestScope()
    });

    expect(result.atomic).toHaveLength(1);
    expect(result.report.summary.reusedAtomicDeclarations).toBe(1);
    expect(result.report.summary.preservedDeclarations).toBe(1);
    expect(result.css.preserved).toBe('.s_a, .s_b {\n  --tone: red;\n}');
    expect(result.css.preserved.match(/--tone:/gu)).toHaveLength(1);
  });

  it('unsafe arm 使完整 list 与关联 class 在 registry mutation 前 fallback', () => {
    const transformer = createTransformer();
    const result = transformer.transformCss({
      id: 'mixed-unsafe-list.css',
      css: '.a, .parent .b { color: red; } .a { padding: 4px; } .b { margin: 8px; }',
      scope: createTestScope()
    });

    expect(result.classes.a.atomicClassNames).toEqual([]);
    expect(result.classes.b.atomicClassNames).toEqual([]);
    expect(result.classes.parent.atomicClassNames).toEqual([]);
    expect(result.classes.a.unsafeReasons).toEqual(['selector-list']);
    expect(result.atomic).toEqual([]);
    expect(transformer.getManifest().atomic).toEqual({});
    expect(result.css.preserved).toContain('.s_a, .s_parent .s_b');
  });

  it('selector-list class 连接按固定点传播 class-wide evidence', () => {
    const result = transformCss({
      id: 'list-connection.css',
      css: [
        '.a, .b { color: red; }',
        '.b, .c { background: blue; }',
        '.a::marker { content: "x"; }',
        '.c { padding: 4px; }',
        '.independent { margin: 8px; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.classes.a.atomicClassNames).toEqual([]);
    expect(result.classes.b.atomicClassNames).toEqual([]);
    expect(result.classes.c.atomicClassNames).toEqual([]);
    expect(result.classes.independent.atomicClassNames).toHaveLength(1);
    expect(result.css.atomic).not.toMatch(/color: red|background: blue|padding: 4px/u);
  });

  it('adapter preserveClassNames 通过 selector-list 连接传播但不伪造 unsafe reason', () => {
    const result = transformCss({
      id: 'configured-list.css',
      css: '.a, .b { color: red; } .b { padding: 4px; }',
      scope: createTestScope(),
      preserveClassNames: { a: 'asset-reference' }
    });

    expect(result.atomic).toEqual([]);
    expect(result.classes.a.atomicClassNames).toEqual([]);
    expect(result.classes.b.atomicClassNames).toEqual([]);
    expect(result.classes.a.unsafeReasons).toBeUndefined();
    expect(result.classes.b.unsafeReasons).toBeUndefined();
    expect(result.diagnostics.filter(({ code }) => code === 'preserved-class')).toHaveLength(1);
  });

  it('任一 non-exported arm 使完整连接分量 fallback 且无部分 registry 污染', () => {
    const transformer = createTransformer();
    const result = transformer.transformCss({
      id: 'non-exported-list.css',
      css: '.private, .public { color: red; } .public { padding: 4px; }',
      scope: {
        resolveClassName(className) {
          return `s_${className}`;
        },
        shouldExportClassName(className) {
          return className !== 'private';
        }
      }
    });

    expect(result.classes.private).toBeUndefined();
    expect(result.classes.public.atomicClassNames).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ reason: 'non-exported-class', sourceClassName: 'private' })
    );
    expect(result.atomic).toEqual([]);
    expect(transformer.getManifest().atomic).toEqual({});
  });

  it('list attribute arm 继续参与 same-class attribute/pseudo cascade guard', () => {
    const result = transformCss({
      id: 'attribute-list-cascade.css',
      css: [
        '.a[data-state], .b { color: red; }',
        '.a:hover { color: blue; }',
        '.b { padding: 4px; }'
      ].join('\n'),
      scope: createTestScope()
    });

    expect(result.atomic).toEqual([]);
    expect(result.classes.a).toMatchObject({
      atomicClassNames: [],
      unsafeReasons: ['attribute-cascade-order']
    });
    expect(result.classes.b.atomicClassNames).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ reason: 'attribute-cascade-order', sourceClassName: 'a' })
    );
  });
});
