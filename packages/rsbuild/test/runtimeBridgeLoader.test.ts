import { describe, expect, it } from 'vitest';
import {
  augmentLocals,
  collectAmbiguousExportPreserveClassNames,
  createDevStyleSnapshot,
  isTargetCssModule,
  normalizeSyntheticAssetUrls,
  transformCompiledInput
} from '../src/runtimeBridgeLoader.js';

describe('runtime bridge helpers', () => {
  it('只匹配允许的 CSS Modules 输入并尊重 exclude', () => {
    const options = {
      root: '/project',
      include: ['**/*.module.css', '**/*.module.scss', '**/*.module.less'],
      exclude: ['**/node_modules/**']
    };

    expect(isTargetCssModule('/project/src/Button.module.css', options)).toBe(true);
    expect(isTargetCssModule('/project/src/Button.module.scss', options)).toBe(true);
    expect(isTargetCssModule('/project/src/Button.module.less', options)).toBe(true);
    expect(isTargetCssModule('/project/src/global.css', options)).toBe(false);
    expect(isTargetCssModule('/project/node_modules/pkg/X.module.css', options)).toBe(false);
  });

  it('在 native token 后追加去重 atomic classes，并保留非 class export', () => {
    const locals = {
      button: 'Button_button__hash Shared_shared__hash',
      value: '#146ef5'
    };
    const result = augmentLocals(locals, {
      Button_button__hash: {
        sourceClassName: 'Button_button__hash',
        resolvedClassName: 'Button_button__hash',
        atomicClassNames: ['_color_red', '_padding_8px'],
        suggestedClassName: 'Button_button__hash _color_red _padding_8px'
      },
      Shared_shared__hash: {
        sourceClassName: 'Shared_shared__hash',
        resolvedClassName: 'Shared_shared__hash',
        atomicClassNames: ['_color_red'],
        suggestedClassName: 'Shared_shared__hash _color_red'
      }
    });

    expect(result).toEqual({
      button: 'Button_button__hash Shared_shared__hash _color_red _padding_8px',
      value: '#146ef5'
    });
    expect(locals.button).toBe('Button_button__hash Shared_shared__hash');
  });

  it('class 与 ICSS value 同值时保留整类并让两个 export 都保持原值', () => {
    const locals = {
      collision: 'Icss_collision__hash',
      collisionLabel: 'Icss_collision__hash',
      other: 'Icss_other__hash'
    };
    const preserveClassNames = collectAmbiguousExportPreserveClassNames(
      locals,
      new Set(['Icss_collision__hash', 'Icss_other__hash'])
    );
    const transform = transformCompiledInput(
      {
        id: '/project/src/Icss.module.css',
        scopedCss: '.Icss_collision__hash { color: red; padding: 14px; } .Icss_other__hash { color: blue; }',
        exportedClassNames: ['Icss_collision__hash', 'Icss_other__hash'],
        preserveClassNames
      },
      { className: { strategy: 'readable' } }
    );

    expect(preserveClassNames).toEqual({ Icss_collision__hash: 'ambiguous-export-value' });
    expect(transform.classes.Icss_collision__hash.atomicClassNames).toEqual([]);
    expect(transform.classes.Icss_other__hash.atomicClassNames).toEqual(['_selector_q0dmug_color_blue']);
    expect(transform.css.preserved).toContain('.Icss_collision__hash');
    expect(augmentLocals(locals, transform.classes)).toEqual({
      collision: 'Icss_collision__hash',
      collisionLabel: 'Icss_collision__hash',
      other: 'Icss_other__hash _selector_q0dmug_color_blue'
    });
  });

  it('browser snapshot 只输出当前 sources 对象并复制 selector descriptor', () => {
    const transform = transformCompiledInput(
      {
        id: '/project/src/Button.module.css',
        scopedCss: [
          '.Button_button__hash { color: red; }',
          '.Button_button__hash:hover { color: red; }'
        ].join('\n'),
        exportedClassNames: ['Button_button__hash'],
        preserveClassNames: {}
      },
      { className: { strategy: 'readable' } }
    );

    const snapshot = createDevStyleSnapshot([
      { id: '/project/src/Button.module.css', scopedCss: '', transform }
    ]);

    expect(snapshot).toMatchObject({
      sources: [
        {
          id: '/project/src/Button.module.css',
          atomic: [
            {
              className: '_selector_q0dmug_color_red',
              selector: {
                identity: '.__GSS_ANCHOR__',
                css: '._selector_q0dmug_color_red'
              },
              context: {}
            },
            {
              className: '_selector_qf5xvc_color_red',
              selector: {
                identity: '.__GSS_ANCHOR__:hover',
                css: '._selector_qf5xvc_color_red:hover'
              },
              context: {}
            }
          ]
        }
      ]
    });
    expect(snapshot).not.toHaveProperty('schemaVersion');
    expect(Array.isArray(snapshot)).toBe(false);
    expect(snapshot.sources[0]?.atomic.every((entry) => !('pseudo' in entry.context))).toBe(true);
  });

  it('将 presence/exact/node-order attribute token 追加到 locals 并原样复制到 dev snapshot', () => {
    const nativeLocals = {
      presence: 'Attribute_presence__hash',
      exact: 'Attribute_exact__hash',
      before: 'Attribute_before__hash',
      orderRisk: 'Attribute_orderRisk__hash'
    };
    const transform = transformCompiledInput(
      {
        id: '/project/src/Attribute.module.css',
        scopedCss: [
          '.Attribute_presence__hash[data-ready] { border-color: red; }',
          '.Attribute_exact__hash[data-state=open] { color: green; }',
          '[data-tone=warm].Attribute_before__hash { background: gold; }',
          '.Attribute_orderRisk__hash[data-state] { color: red; }',
          '.Attribute_orderRisk__hash:hover { color: blue; }'
        ].join('\n'),
        exportedClassNames: Object.values(nativeLocals),
        preserveClassNames: {}
      },
      { className: { strategy: 'readable' } }
    );
    const augmented = augmentLocals(nativeLocals, transform.classes);
    const snapshot = createDevStyleSnapshot([
      { id: '/project/src/Attribute.module.css', scopedCss: '', transform }
    ]);

    expect(augmented).toEqual({
      presence: 'Attribute_presence__hash _selector_jyr83m_border-color_red',
      exact: 'Attribute_exact__hash _selector_7vq563_color_green',
      before: 'Attribute_before__hash _selector_tvzsrj_background_gold',
      orderRisk: 'Attribute_orderRisk__hash'
    });
    expect(snapshot.sources[0]?.atomic).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          className: '_selector_jyr83m_border-color_red',
          selector: {
            identity: '.__GSS_ANCHOR__[data-ready]',
            css: '._selector_jyr83m_border-color_red[data-ready]'
          }
        }),
        expect.objectContaining({
          className: '_selector_7vq563_color_green',
          selector: {
            identity: '.__GSS_ANCHOR__[data-state=open]',
            css: '._selector_7vq563_color_green[data-state=open]'
          }
        }),
        expect.objectContaining({
          className: '_selector_tvzsrj_background_gold',
          selector: {
            identity: '[data-tone=warm].__GSS_ANCHOR__',
            css: '[data-tone=warm]._selector_tvzsrj_background_gold'
          }
        })
      ])
    );
    expect(snapshot.sources[0]?.atomic).toHaveLength(3);
    expect(snapshot.sources[0]?.preservedCss).toContain('.Attribute_orderRisk__hash[data-state]');
    expect(snapshot.sources[0]?.preservedCss).toContain('.Attribute_orderRisk__hash:hover');
    expect(transform.classes.Attribute_orderRisk__hash).toMatchObject({
      atomicClassNames: [],
      unsafeReasons: ['attribute-cascade-order']
    });
    expect(transform.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'unsafe-selector',
        reason: 'attribute-cascade-order',
        sourceClassName: 'Attribute_orderRisk__hash'
      })
    );
  });

  it('保守 preservation 会保留 semantic rule，不把资源 declaration 写入 atomic key', () => {
    const result = transformCompiledInput(
      {
        id: '/project/src/Button.module.css',
        scopedCss: '.Button_button__hash { color: red; background: url(/mark.svg); }',
        exportedClassNames: ['Button_button__hash'],
        preserveClassNames: { Button_button__hash: 'asset-reference' }
      },
      { className: { strategy: 'hash' } }
    );

    expect(result.css.atomic).toBe('');
    expect(result.css.preserved).toContain('.Button_button__hash');
    expect(result.diagnostics.map((item) => item.code)).toContain('preserved-class');
  });

  it('只去除 importModule synthetic base URI，保留 query/hash 与绝对 CDN URL', () => {
    expect(
      normalizeSyntheticAssetUrls(
        '.asset { background: url("rspack-semantic-atomic-css:///static/mark.svg?x=1#icon"); mask: url(https://cdn.test/mask.svg); }'
      )
    ).toBe(
      '.asset { background: url("/static/mark.svg?x=1#icon"); mask: url(https://cdn.test/mask.svg); }'
    );
  });
});
