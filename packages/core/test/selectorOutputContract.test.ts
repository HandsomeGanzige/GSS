import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createTransformer,
  transformCss,
  type AtomicSelectorDescriptor,
  type CssTransformContext,
  type UnsafeSelectorReason
} from '../src/index.js';
import { planSelectorRewrite } from '../src/selector/planSelectorRewrite.js';
import { createTestScope } from './helpers.js';

// @ts-expect-error Atomic key 输入是 Core 内部细节，不应重新出现在 public surface。
type RemovedAtomicKeyInput = import('../src/index.js').AtomicKeyInput;
// @ts-expect-error selector 分析已收口为内部 rewrite plan，不应重新出现在 public surface。
type RemovedSelectorAnalysis = import('../src/index.js').SelectorAnalysis;

const selectorCases = [
  {
    pseudo: '',
    identity: '.__GSS_ANCHOR__',
    identityHash: 'q0dmug',
    key: '{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__","supports":null,"value":"red"}',
    readableClassName: '_selector_q0dmug_color_red',
    hashClassName: '_0190kqgs'
  },
  {
    pseudo: ':hover',
    identity: '.__GSS_ANCHOR__:hover',
    identityHash: 'qf5xvc',
    key: '{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__:hover","supports":null,"value":"red"}',
    readableClassName: '_selector_qf5xvc_color_red',
    hashClassName: '_00o6ut9w'
  },
  {
    pseudo: ':focus',
    identity: '.__GSS_ANCHOR__:focus',
    identityHash: '14ht6n',
    key: '{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__:focus","supports":null,"value":"red"}',
    readableClassName: '_selector_14ht6n_color_red',
    hashClassName: '_00tqff7y'
  },
  {
    pseudo: ':active',
    identity: '.__GSS_ANCHOR__:active',
    identityHash: '1ahwsi',
    key: '{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__:active","supports":null,"value":"red"}',
    readableClassName: '_selector_1ahwsi_color_red',
    hashClassName: '_012ucf90'
  },
  {
    pseudo: ':disabled',
    identity: '.__GSS_ANCHOR__:disabled',
    identityHash: '9t0oge',
    key: '{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__:disabled","supports":null,"value":"red"}',
    readableClassName: '_selector_9t0oge_color_red',
    hashClassName: '_00zf1yj6'
  },
  {
    pseudo: ':focus-visible',
    identity: '.__GSS_ANCHOR__:focus-visible',
    identityHash: '1qzezs',
    key: '{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__:focus-visible","supports":null,"value":"red"}',
    readableClassName: '_selector_1qzezs_color_red',
    hashClassName: '_00ipsc7t'
  }
] as const;

const selectorCss = selectorCases
  .map(({ pseudo }, index) => `.case${index}${pseudo} { color: red; }`)
  .join('\n');

describe('selector output contract', () => {
  it('固定 attribute selector 的 key、descriptor 与 AST serializer spelling', () => {
    const identity = `.__GSS_ANCHOR__[ data-state = 'open' ]`;
    const className = '_selector_1evvry_color_red';
    const key =
      `{"important":false,"media":null,"prop":"color","selectorIdentity":"${identity}",` +
      '"supports":null,"value":"red"}';
    const result = transformCss({
      id: 'attribute-selector.css',
      css: `.button[ data-state = 'open' ] { color: red; }`,
      scope: createTestScope()
    });

    expect(result.atomic).toEqual([
      expect.objectContaining({
        key,
        className,
        selector: {
          identity,
          css: `.${className}[ data-state = 'open' ]`
        },
        declaration: expect.objectContaining({
          prop: 'color',
          value: 'red',
          important: false
        }),
        context: {}
      })
    ]);
    expect(result.css.atomic).toBe(
      `.${className}[ data-state = 'open' ] {\n  color: red;\n}`
    );
    expect(result.manifest.atomic[className]?.selector).toEqual({
      identity,
      css: `.${className}[ data-state = 'open' ]`
    });
    expectTypeOf<'attribute-cascade-order'>().toMatchTypeOf<UnsafeSelectorReason>();
  });

  it('使用与 source class 无关的 canonical selector template 作为 identity', () => {
    expect(
      selectorCases.map(({ pseudo }) => {
        const rewrite = planSelectorRewrite(`.anchor${pseudo}`);

        if (rewrite.kind !== 'eligible') {
          throw new Error(`Expected .anchor${pseudo} to be eligible.`);
        }

        const arm = rewrite.arms[0];

        if (!arm) {
          throw new Error(`Expected .anchor${pseudo} to have one selector arm.`);
        }

        return arm.identity;
      })
    ).toEqual(selectorCases.map(({ identity }) => identity));
  });

  it('固定六种 eligible selector 的 key、readable class、descriptor 与 CSS', () => {
    const result = transformCss({ id: 'selectors.css', css: selectorCss, scope: createTestScope() });

    expect(
      result.atomic.map(({ key, className, selector, declaration, context }) => ({
        key,
        className,
        selector,
        declaration: {
          prop: declaration.prop,
          value: declaration.value,
          important: declaration.important
        },
        context
      }))
    ).toEqual(
      selectorCases.map(({ identity, key, readableClassName, pseudo }) => ({
        key,
        className: readableClassName,
        selector: {
          identity,
          css: `.${readableClassName}${pseudo}`
        },
        declaration: { prop: 'color', value: 'red', important: false },
        context: {}
      }))
    );

    expect(result.css.atomic).toBe(
      selectorCases
        .map(
          ({ pseudo, readableClassName }) =>
            `.${readableClassName}${pseudo} {\n  color: red;\n}`
        )
        .join('\n\n')
    );

    for (const { readableClassName, identity, pseudo } of selectorCases) {
      expect(result.manifest.atomic[readableClassName]).toMatchObject({
        className: readableClassName,
        selector: {
          identity,
          css: `.${readableClassName}${pseudo}`
        },
        declaration: { important: false },
        context: {}
      });
    }
  });

  it('固定六种 eligible selector 的 hash class 与最终 selector CSS', () => {
    const result = transformCss(
      { id: 'selectors.css', css: selectorCss, scope: createTestScope() },
      { className: { strategy: 'hash', prefix: '_' } }
    );

    expect(result.atomic.map(({ key, className, selector }) => ({ key, className, selector }))).toEqual(
      selectorCases.map(({ identity, key, hashClassName, pseudo }) => ({
        key,
        className: hashClassName,
        selector: {
          identity,
          css: `.${hashClassName}${pseudo}`
        }
      }))
    );
  });

  it('使用合法 canonical JSON 表达 media、supports 与 important 身份', () => {
    const css = [
      '@media (min-width: 768px) { .responsive { display: grid; } }',
      '@supports (display: grid) { .supported { display: grid; } }',
      '.urgent { color: blue !important; }'
    ].join('\n');
    const result = transformCss({ id: 'context.css', css, scope: createTestScope() });

    expect(result.atomic.map(({ key, className, selector, declaration, context }) => ({
      key,
      className,
      selector,
      important: declaration.important,
      context
    }))).toEqual([
      {
        key: '{"important":false,"media":"(min-width: 768px)","prop":"display","selectorIdentity":".__GSS_ANCHOR__","supports":null,"value":"grid"}',
        className: '_media_6d102w_selector_q0dmug_display_grid',
        selector: {
          identity: '.__GSS_ANCHOR__',
          css: '._media_6d102w_selector_q0dmug_display_grid'
        },
        important: false,
        context: { media: '(min-width: 768px)' }
      },
      {
        key: '{"important":false,"media":null,"prop":"display","selectorIdentity":".__GSS_ANCHOR__","supports":"(display: grid)","value":"grid"}',
        className: '_supports_1gj8cx_selector_q0dmug_display_grid',
        selector: {
          identity: '.__GSS_ANCHOR__',
          css: '._supports_1gj8cx_selector_q0dmug_display_grid'
        },
        important: false,
        context: { supports: '(display: grid)' }
      },
      {
        key: '{"important":true,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__","supports":null,"value":"blue"}',
        className: '_selector_q0dmug_color_blue_important',
        selector: {
          identity: '.__GSS_ANCHOR__',
          css: '._selector_q0dmug_color_blue_important'
        },
        important: true,
        context: {}
      }
    ]);

    for (const declaration of result.atomic) {
      expect(() => JSON.parse(declaration.key)).not.toThrow();
    }

    const hashResult = transformCss(
      { id: 'context.css', css, scope: createTestScope() },
      { className: { strategy: 'hash', prefix: '_' } }
    );
    expect(hashResult.atomic.map(({ key, className }) => ({ key, className }))).toEqual([
      {
        key: '{"important":false,"media":"(min-width: 768px)","prop":"display","selectorIdentity":".__GSS_ANCHOR__","supports":null,"value":"grid"}',
        className: '_00ug8vfo'
      },
      {
        key: '{"important":false,"media":null,"prop":"display","selectorIdentity":".__GSS_ANCHOR__","supports":"(display: grid)","value":"grid"}',
        className: '_003l26k8'
      },
      {
        key: '{"important":true,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__","supports":null,"value":"blue"}',
        className: '_00w98u86'
      }
    ]);
  });

  it('固定 media 与 supports 组合上下文的 key、class、descriptor 与 at-rule 嵌套', () => {
    const css =
      '@media (min-width: 768px) { @supports (display: grid) { .combined:hover { color: red; } } }';
    const input = { id: 'combined-context.css', css, scope: createTestScope() };
    const key =
      '{"important":false,"media":"(min-width: 768px)","prop":"color","selectorIdentity":".__GSS_ANCHOR__:hover","supports":"(display: grid)","value":"red"}';
    const readableClassName = '_media_6d102w_supports_1gj8cx_selector_qf5xvc_color_red';
    const readable = transformCss(input);

    expect(readable.atomic).toHaveLength(1);
    expect(readable.atomic[0]).toMatchObject({
      key,
      className: readableClassName,
      selector: {
        identity: '.__GSS_ANCHOR__:hover',
        css: `.${readableClassName}:hover`
      },
      declaration: {
        prop: 'color',
        value: 'red',
        important: false
      },
      context: {
        media: '(min-width: 768px)',
        supports: '(display: grid)'
      }
    });
    expect(readable.css.atomic).toBe(
      [
        '@media (min-width: 768px) {',
        '  @supports (display: grid) {',
        `    .${readableClassName}:hover {`,
        '      color: red;',
        '    }',
        '  }',
        '}'
      ].join('\n')
    );

    const hashClassName = '_00wqkncq';
    const hashed = transformCss(input, { className: { strategy: 'hash', prefix: '_' } });

    expect(hashed.atomic[0]).toMatchObject({
      key,
      className: hashClassName,
      selector: {
        identity: '.__GSS_ANCHOR__:hover',
        css: `.${hashClassName}:hover`
      },
      context: {
        media: '(min-width: 768px)',
        supports: '(display: grid)'
      }
    });
    expect(hashed.css.atomic).toBe(
      [
        '@media (min-width: 768px) {',
        '  @supports (display: grid) {',
        `    .${hashClassName}:hover {`,
        '      color: red;',
        '    }',
        '  }',
        '}'
      ].join('\n')
    );
  });

  it('在 readable class 碰撞时使用完整 key 生成稳定 suffix', () => {
    const result = transformCss({
      id: 'collision.css',
      css: '.first { margin: a/b; }\n.second { margin: a b; }',
      scope: createTestScope()
    });

    expect(result.atomic.map(({ key, className }) => ({ key, className }))).toEqual([
      {
        key: '{"important":false,"media":null,"prop":"margin","selectorIdentity":".__GSS_ANCHOR__","supports":null,"value":"a/b"}',
        className: '_selector_q0dmug_margin_a_b'
      },
      {
        key: '{"important":false,"media":null,"prop":"margin","selectorIdentity":".__GSS_ANCHOR__","supports":null,"value":"a b"}',
        className: '_selector_q0dmug_margin_a_b_150yz'
      }
    ]);
  });

  it('向 public result 和 manifest 返回 descriptor 防御性副本', () => {
    const transformer = createTransformer();
    const result = transformer.transformCss({
      id: 'clone.css',
      css: '.button:hover { color: red; }',
      scope: createTestScope()
    });
    const className = result.atomic[0]?.className;

    if (!className) {
      throw new Error('Expected one atomic declaration.');
    }

    result.atomic[0]!.selector.css = '.mutated';
    result.manifest.atomic[className]!.selector.identity = 'mutated';
    const aggregate = transformer.getManifest();

    expect(aggregate.atomic[className]!.selector).toEqual({
      identity: '.__GSS_ANCHOR__:hover',
      css: `.${className}:hover`
    });
    aggregate.atomic[className]!.selector.css = '.also-mutated';
    expect(transformer.getManifest().atomic[className]!.selector.css).toBe(`.${className}:hover`);
  });

  it('公开契约使 descriptor 必填，context 只表达条件 at-rule', () => {
    const descriptor: AtomicSelectorDescriptor = {
      identity: '.__GSS_ANCHOR__',
      css: '._atomic'
    };
    const context: CssTransformContext = {
      media: '(min-width: 768px)',
      supports: '(display: grid)'
    };

    expectTypeOf(descriptor).toMatchTypeOf<AtomicSelectorDescriptor>();
    expectTypeOf(context).toMatchTypeOf<CssTransformContext>();
  });
});
