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
      atomicClassNames: ['_color_red', '_font-size_16px'],
      suggestedClassName: 's_button _color_red _font-size_16px'
    });
    expect(result.css.atomic).toContain('._color_red {\n  color: red;\n}');
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

    expect(result.css.atomic).toContain('._hover_color_blue:hover');
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

    expect(result.css.atomic).toContain('._color_var_--button-color');
    expect(result.css.preserved).toBe('.s_button {\n  --button-color: red;\n}');
    expect(result.diagnostics).toHaveLength(0);
    expect(result.report.summary.preservedDeclarations).toBe(1);
  });

  it('让 preserved CSS 保持在 atomic CSS 之后由调用方拼接使用', () => {
    const result = transformCss({
      id: 'mixed.css',
      css: '.button { color: red; } .card .button { color: blue; }',
      scope: createTestScope()
    });
    const combinedCss = [result.css.atomic, result.css.preserved].filter(Boolean).join('\n\n');

    expect(combinedCss.indexOf('._color_red')).toBeLessThan(combinedCss.indexOf('.s_card .s_button'));
  });

  it('生成 manifest 和 report 基础数据', () => {
    const result = transformCss({
      id: 'report.css',
      css: '.button { color: red; } .button:hover { color: blue; } .card .button { color: green; }',
      scope: createTestScope()
    });

    expect(result.manifest.classes['report.css::button']).toMatchObject({
      sourceClassName: 'button',
      resolvedClassName: 's_button'
    });
    expect(result.manifest.atomic._color_red).toMatchObject({
      className: '_color_red'
    });
    expect(result.report.summary).toMatchObject({
      files: 1,
      sourceClasses: 2,
      atomicDeclarations: 2,
      unsafeRules: 1,
      preservedRules: 1
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

  it('stateful transformer 的单次 result 只包含当前输入 atomic 快照', () => {
    const transformer = createTransformer();
    const first = transformer.transformCss({
      id: 'first.css',
      css: '.button { color: red; }',
      scope: createTestScope()
    });
    const firstManifestSources = first.manifest.atomic._color_red.sources.length;
    const second = transformer.transformCss({
      id: 'second.css',
      css: '.link { font-size: 16px; }',
      scope: createTestScope()
    });

    expect(second.css.atomic).not.toContain('._color_red');
    expect(second.css.atomic).toContain('._font-size_16px');
    expect(Object.keys(second.manifest.atomic)).toEqual(['_font-size_16px']);
    expect(first.manifest.atomic._color_red.sources).toHaveLength(firstManifestSources);
    expect(transformer.getAtomicCss()).toContain('._color_red');
    expect(transformer.getAtomicCss()).toContain('._font-size_16px');
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

    expect(manifest.atomic._color_red.sources.map((source) => source.id)).toEqual(['first.css', 'second.css']);
    expect(manifest.classes['first.css::button']).toMatchObject({
      suggestedClassName: 's_button _color_red'
    });
    expect(manifest.classes['second.css::link']).toMatchObject({
      suggestedClassName: 's_link _color_red'
    });
  });
});
