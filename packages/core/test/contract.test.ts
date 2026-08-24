import { describe, expect, it } from 'vitest';
import * as core from '../src/index.js';
import { createTransformer, transformCss, type ScopeStrategy } from '../src/index.js';
import { createTestScope } from './helpers.js';

describe('core behavior contract', () => {
  it('runtime public API 只暴露两个稳定入口', () => {
    expect(Object.keys(core).sort()).toEqual(['createTransformer', 'transformCss']);
  });

  it('!important 会生成独立 atomic class，并保留 declaration 原始顺序', () => {
    const result = transformCss({
      id: 'important.css',
      css: '.button { color: red; color: red !important; }',
      scope: createTestScope()
    });

    expect(result.classes.button.atomicClassNames).toEqual([
      '_selector_q0dmug_color_red',
      '_selector_q0dmug_color_red_important'
    ]);
    expect(result.css.atomic.indexOf('._selector_q0dmug_color_red {')).toBeLessThan(
      result.css.atomic.indexOf('._selector_q0dmug_color_red_important {')
    );
    expect(result.css.atomic).toContain('color: red !important;');
  });

  it('shorthand 与 longhand 不展开，按 declaration 原始顺序追加 atomic class', () => {
    const result = transformCss({
      id: 'order.css',
      css: '.box { margin: 0; margin-left: 8px; margin: 4px; }',
      scope: createTestScope()
    });

    expect(result.classes.box.atomicClassNames).toEqual([
      '_selector_q0dmug_margin_0',
      '_selector_q0dmug_margin-left_8px',
      '_selector_q0dmug_margin_4px'
    ]);
    expect(result.css.atomic.indexOf('._selector_q0dmug_margin_0')).toBeLessThan(
      result.css.atomic.indexOf('._selector_q0dmug_margin-left_8px')
    );
    expect(result.css.atomic.indexOf('._selector_q0dmug_margin-left_8px')).toBeLessThan(
      result.css.atomic.indexOf('._selector_q0dmug_margin_4px')
    );
  });

  it('scope strategy 决定 resolved class、preserved selector 和 class export', () => {
    const scope: ScopeStrategy = {
      /**
       * 为测试输入生成稳定的 resolved class。
       *
       * @param className - core 当前处理的 source class。
       * @returns 带 `resolved_` 前缀的测试 class。
       */
      resolveClassName(className) {
        return `resolved_${className}`;
      },
      /**
       * 限制测试导出边界，使 private class 只参与 CSS 转换而不进入 class exports。
       *
       * @param className - core 当前判断的 source class。
       * @returns class 是否应进入 tokens 与 manifest 的导出边界。
       */
      shouldExportClassName(className) {
        return className !== 'private';
      }
    };
    const result = transformCss({
      id: 'scope.css',
      css: '.button { color: red; } .card .button { color: blue; } .private { color: green; }',
      scope
    });

    expect(result.classes.button).toMatchObject({
      resolvedClassName: 'resolved_button',
      atomicClassNames: [],
      suggestedClassName: 'resolved_button',
      unsafeReasons: ['descendant-selector']
    });
    expect(result.classes.card).toMatchObject({
      resolvedClassName: 'resolved_card',
      suggestedClassName: 'resolved_card',
      unsafeReasons: ['descendant-selector']
    });
    expect(result.classes.private).toBeUndefined();
    expect(result.css.preserved).toContain('.resolved_card .resolved_button');
  });

  it('拒绝已删除的 preserveResolvedClass runtime 选项', () => {
    expect(() => createTransformer({ preserveResolvedClass: false } as never)).toThrow(
      'Unsupported transform option "preserveResolvedClass"'
    );
  });

  it('transformCss 是单次 helper，createTransformer 是 append-only 聚合器', () => {
    const single = transformCss({
      id: 'single.css',
      css: '.button { color: red; }',
      scope: createTestScope()
    });
    const transformer = createTransformer();
    transformer.transformCss({
      id: 'a.css',
      css: '.a { color: red; }',
      scope: createTestScope()
    });
    transformer.transformCss({
      id: 'b.css',
      css: '.b { color: red; }',
      scope: createTestScope()
    });

    expect(single.report.summary.files).toBe(1);
    expect(transformer.getReport().summary.files).toBe(2);
    expect(
      transformer.getManifest().atomic._selector_q0dmug_color_red.sources.map((source) => source.id)
    ).toEqual(['a.css', 'b.css']);
  });
});
