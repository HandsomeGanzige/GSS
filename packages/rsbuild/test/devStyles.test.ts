import { describe, expect, it } from 'vitest';
import { createDevCss, registerDevStyles, type DevStyleSource } from '../src/devStyles.js';
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

    expect(countOccurrences(css, '._selector_q0dmug_color_334155 {')).toBe(1);
    expect(css.indexOf('._selector_q0dmug_color_334155 {')).toBeLessThan(
      css.indexOf('._selector_q0dmug_color_0f172a {')
    );
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

    expect(() => createDevCss([slash, space])).toThrow(
      /dev-atomic-class-collision class=_selector_q0dmug_margin_a_b/
    );
  });

  it('selector-list HMR update/remove 与 stale dispose 不保留旧 arm descriptor 或 CSS', () => {
    const oldSource = createSource(
      '/project/Button.module.css',
      '.Button_button__hash[data-state=open], .Button_peer__hash[data-state=open] { color: #0f766e; }',
      ['Button_button__hash', 'Button_peer__hash']
    );
    const newSource = createSource(
      '/project/Button.module.css',
      '[data-tone=warm].Button_button__hash, [data-tone=warm].Button_peer__hash { color: #7c3aed; }',
      ['Button_button__hash', 'Button_peer__hash']
    );
    const dom = installStyleDocument();
    let disposeOld: (() => void) | undefined;
    let disposeNew: (() => void) | undefined;

    try {
      disposeOld = registerDevStyles('/project/Button.module.css', { sources: [oldSource] });
      expect(dom.css()).toContain('._selector_7vq563_color_0f766e[data-state=open]');

      disposeNew = registerDevStyles('/project/Button.module.css', { sources: [newSource] });
      expect(dom.css()).toContain('[data-tone=warm]._selector_tvzsrj_color_7c3aed');
      expect(dom.css()).not.toContain('_selector_7vq563_color_0f766e');
      expect(dom.css()).not.toContain('[data-state=open]');

      disposeOld();
      expect(dom.css()).toContain('[data-tone=warm]._selector_tvzsrj_color_7c3aed');

      disposeNew();
      expect(dom.css()).toBe('');
    } finally {
      disposeNew?.();
      disposeOld?.();
      dom.restore();
    }
  });

  it('pseudo-element HMR 更新与 stale dispose 清理旧 spelling、token 和 fallback CSS', () => {
    const oldSource = createSource(
      '/project/Pseudo.module.css',
      [
        '.Pseudo_icon__hash::before { content: "old"; color: red; }',
        '.Pseudo_fallback__hash::before, .Pseudo_peer__hash { color: blue; }'
      ].join('\n'),
      ['Pseudo_icon__hash', 'Pseudo_fallback__hash', 'Pseudo_peer__hash']
    );
    const newSource = createSource(
      '/project/Pseudo.module.css',
      '.Pseudo_icon__hash:after { content: "new"; color: green; }',
      ['Pseudo_icon__hash']
    );
    const dom = installStyleDocument();
    let disposeOld: (() => void) | undefined;
    let disposeNew: (() => void) | undefined;

    try {
      disposeOld = registerDevStyles('/project/Pseudo.module.css', { sources: [oldSource] });
      expect(dom.css()).toContain('::before');
      expect(dom.css()).toContain('.Pseudo_fallback__hash::before, .Pseudo_peer__hash');

      disposeNew = registerDevStyles('/project/Pseudo.module.css', { sources: [newSource] });
      expect(dom.css()).toContain(':after');
      expect(dom.css()).toContain('content: "new";');
      expect(dom.css()).not.toContain('::before');
      expect(dom.css()).not.toContain('content: "old";');
      expect(dom.css()).not.toContain('Pseudo_fallback__hash');

      disposeOld();
      expect(dom.css()).toContain(':after');

      disposeNew();
      expect(dom.css()).toBe('');
    } finally {
      disposeNew?.();
      disposeOld?.();
      dom.restore();
    }
  });
});

/** 安装 dev shared owner 所需的最小 document seam。 */
function installStyleDocument(): { css(): string; restore(): void } {
  const originalDocument = globalThis.document;
  let style: {
    textContent: string;
    setAttribute(): void;
    remove(): void;
  } | undefined;
  const document = {
    querySelector: () => style,
    createElement: () => ({
      textContent: '',
      setAttribute() {},
      remove() {
        style = undefined;
      }
    }),
    head: {
      append(node: typeof style) {
        style = node;
      }
    }
  };
  Object.assign(globalThis, { document });

  return {
    css: () => style?.textContent ?? '',
    restore() {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, 'document');
      } else {
        Object.assign(globalThis, { document: originalDocument });
      }
    }
  };
}

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
