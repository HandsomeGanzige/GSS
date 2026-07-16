import { describe, expect, it } from 'vitest';
import { createDevCss, type DevStyleSource } from '../src/devStyles.js';
import { transformCompiledInput } from '../src/runtimeBridgeLoader.js';

describe('Rsbuild dev shared styles owner', () => {
  it('跨模块按 atomic key 去重，后续复用不会移动较早 declaration 的 cascade 位置', () => {
    const owner = createSource(
      '/project/a-owner.module.css',
      '.Owner_base__hash { color: #334155; } .Owner_active__hash { color: #0f172a; }',
      ['Owner_base__hash', 'Owner_active__hash']
    );
    const lateReuse = createSource(
      '/project/z-late.module.css',
      '.Late_value__hash { color: #334155; }',
      ['Late_value__hash']
    );

    const css = createDevCss([owner, lateReuse]);

    expect(countOccurrences(css, '._color_334155 {')).toBe(1);
    expect(css.indexOf('._color_334155 {')).toBeLessThan(css.indexOf('._color_0f172a {'));
  });

  it('不同 atomic key 在独立 module registry 中生成同名 readable class 时 fail fast', () => {
    const slash = createSource(
      '/project/a.module.css',
      '.A_value__hash { margin: a/b; }',
      ['A_value__hash']
    );
    const space = createSource(
      '/project/b.module.css',
      '.B_value__hash { margin: a b; }',
      ['B_value__hash']
    );

    expect(() => createDevCss([slash, space])).toThrow(/dev-atomic-class-collision class=_margin_a_b/);
  });
});

/** 使用真实 core 单输入路径创建 dev source，覆盖独立 registry 的实际行为。 */
function createSource(id: string, scopedCss: string, exportedClassNames: string[]): DevStyleSource {
  const transform = transformCompiledInput(
    {
      id,
      scopedCss,
      exportedClassNames,
      preserveClassNames: {}
    },
    { className: { strategy: 'readable' } }
  );

  return {
    id,
    atomic: transform.atomic,
    preservedCss: transform.css.preserved
  };
}

/** 统计稳定子串出现次数。 */
function countOccurrences(value: string, expected: string): number {
  return value.split(expected).length - 1;
}
