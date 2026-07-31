import { describe, expect, it } from 'vitest';
import { analyzeBuild, type AnalyzeBuildInput } from '../src/index.js';

describe('analyzeBuild', () => {
  it('聚合 unsafe 分布、体积和 risky 健康度', () => {
    const analysis = analyzeBuild(createInput());

    expect(analysis.risk.unsafeReasonDistribution).toEqual({
      'attribute-selector': 1
    });
    expect(analysis.risk.highRiskFiles[0]).toMatchObject({
      id: '/project/src/Button.module.css',
      unsafeRules: 1
    });
    expect(analysis.benefit).toMatchObject({
      sourceClasses: 1,
      atomicDeclarations: 1,
      reusedAtomicDeclarations: 1,
      reuseRatio: 0.5
    });
    expect(analysis.size.beforeRawCssBytes).toBeGreaterThan(0);
    expect(analysis.size.afterGzipCssBytes).toBeGreaterThan(0);
    expect(analysis.health.status).toBe('risky');
  });

  it('把 attribute cascade order 作为通用 unsafe reason 聚合到 report 与 module', () => {
    const input = createInput();
    input.report.diagnostics[0]!.reason = 'attribute-cascade-order';
    input.modules[0]!.diagnostics[0]!.reason = 'attribute-cascade-order';

    const analysis = analyzeBuild(input);

    expect(input.report.summary.unsafeRules).toBe(1);
    expect(analysis.risk.unsafeReasonDistribution).toEqual({
      'attribute-cascade-order': 1
    });
    expect(analysis.risk.highRiskFiles[0]).toMatchObject({
      id: '/project/src/Button.module.css',
      unsafeRules: 1,
      unsafeReasons: {
        'attribute-cascade-order': 1
      }
    });
    expect(analysis.health.status).toBe('risky');
    expect(analysis.health.reasons).toContain('存在 unsafe selector fallback');
    expect(analysis.health.reasons.some((reason) => reason.includes('attribute-cascade-order'))).toBe(false);
  });

  it('安全 selector list 不产生风险，unsafe mixed list 仍按 selector-list 聚合', () => {
    const unsafeInput = createInput();
    unsafeInput.report.diagnostics[0]!.reason = 'selector-list';
    unsafeInput.report.diagnostics[0]!.selector = '.button, .parent .link';
    unsafeInput.modules[0]!.diagnostics[0]!.reason = 'selector-list';
    unsafeInput.modules[0]!.diagnostics[0]!.selector = '.x_button, .x_parent .x_link';

    expect(analyzeBuild(unsafeInput).risk.unsafeReasonDistribution).toEqual({
      'selector-list': 1
    });

    const safeInput = createInput();
    safeInput.report.summary.unsafeRules = 0;
    safeInput.report.summary.preservedRules = 0;
    safeInput.report.summary.preservedDeclarations = 0;
    safeInput.report.diagnostics = [];
    safeInput.modules[0]!.diagnostics = [];
    safeInput.modules[0]!.preservedCss = '';
    safeInput.outputCss = safeInput.modules[0]!.atomicCss;

    const safeAnalysis = analyzeBuild(safeInput);

    expect(safeAnalysis.risk.unsafeReasonDistribution).toEqual({});
    expect(safeAnalysis.risk.highRiskFiles).toEqual([]);
    expect(safeAnalysis.health.reasons).not.toContain('存在 unsafe selector fallback');
  });

  it('存在 unsupported feature 时输出 blocked', () => {
    const analysis = analyzeBuild({
      ...createInput(),
      unsupportedFeatures: [
        {
          feature: 'modules.namedExports',
          id: '/project/vite.config.ts',
          reason: '当前未实现 named exports'
        }
      ]
    });

    expect(analysis.health.status).toBe('blocked');
    expect(analysis.risk.unsupportedFeatures[0]?.feature).toBe('modules.namedExports');
  });

  it('使用 scoped transform input 而不是预处理器源码计算 before size', () => {
    const input = createInput();
    input.modules[0]!.sourceCss = '$color: red; .button { color: $color; }';
    input.modules[0]!.scopedCss = '.x_button { color: red; }';

    const analysis = analyzeBuild(input);

    expect(analysis.size.beforeRawCssBytes).toBe(Buffer.byteLength(input.modules[0]!.scopedCss));
    expect(analysis.size.beforeRawCssBytes).not.toBe(Buffer.byteLength(input.modules[0]!.sourceCss));
  });

  it('报告同一 semantic class 内的同属性和 shorthand longhand 冲突', () => {
    const input = createInput();
    input.manifest = createConflictManifest();

    const analysis = analyzeBuild(input);

    expect(analysis.risk.declarationConflictSummary).toEqual({
      total: 2,
      sameProperty: 1,
      shorthandLonghand: 1,
      affectedFiles: 1,
      affectedClasses: 1
    });
    expect(analysis.risk.declarationConflicts).toEqual([
      {
        id: '/project/src/Button.module.css',
        sourceClassName: 'button',
        kind: 'same-property',
        selectorIdentity: '.__GSS_ANCHOR__',
        context: {},
        important: false,
        properties: ['color'],
        declarations: [
          {
            atomicClassName: '_color_red',
            property: 'color',
            value: 'red'
          },
          {
            atomicClassName: '_color_blue',
            property: 'color',
            value: 'blue'
          }
        ]
      },
      {
        id: '/project/src/Button.module.css',
        sourceClassName: 'button',
        kind: 'shorthand-longhand',
        selectorIdentity: '.__GSS_ANCHOR__',
        context: {},
        important: false,
        properties: ['border', 'border-color'],
        declarations: [
          {
            atomicClassName: '_border_base',
            property: 'border',
            value: '1px solid transparent'
          },
          {
            atomicClassName: '_border_color',
            property: 'border-color',
            value: 'red'
          }
        ]
      }
    ]);
    expect(analysis.health.reasons).toContain('存在同一 semantic class 的 declaration 顺序冲突');
  });

  it('不把不同 selector identity、media、supports、important 或 semantic class 的声明当作冲突', () => {
    const input = createInput();
    input.manifest = createIsolatedManifest();

    const analysis = analyzeBuild(input);

    expect(analysis.risk.declarationConflictSummary.total).toBe(0);
    expect(analysis.risk.declarationConflicts).toEqual([]);
  });

  it('相同 attribute selector identity 正向成组，另一个 exact identity 不并入', () => {
    const input = createInput();
    input.manifest = {
      atomic: {
        _state_open_red: createAtomicEntry('_state_open_red', 'color', 'red', {
          selectorIdentity: ".__GSS_ANCHOR__[data-state='open']",
          selectorCss: "._state_open_red[data-state='open']"
        }),
        _state_open_blue: createAtomicEntry('_state_open_blue', 'color', 'blue', {
          selectorIdentity: ".__GSS_ANCHOR__[data-state='open']",
          selectorCss: "._state_open_blue[data-state='open']"
        }),
        _state_closed_green: createAtomicEntry('_state_closed_green', 'color', 'green', {
          selectorIdentity: ".__GSS_ANCHOR__[data-state='closed']",
          selectorCss: "._state_closed_green[data-state='closed']"
        })
      },
      classes: {
        '/project/src/Button.module.css::button': {
          id: '/project/src/Button.module.css',
          sourceClassName: 'button',
          resolvedClassName: 'x_button',
          atomicClassNames: ['_state_open_red', '_state_open_blue', '_state_closed_green'],
          suggestedClassName: 'x_button _state_open_red _state_open_blue _state_closed_green'
        }
      }
    };

    const analysis = analyzeBuild(input);

    expect(analysis.risk.declarationConflictSummary.total).toBe(1);
    expect(analysis.risk.declarationConflicts).toEqual([
      expect.objectContaining({
        kind: 'same-property',
        selectorIdentity: ".__GSS_ANCHOR__[data-state='open']",
        declarations: [
          expect.objectContaining({
            atomicClassName: '_state_open_red',
            value: 'red'
          }),
          expect.objectContaining({
            atomicClassName: '_state_open_blue',
            value: 'blue'
          })
        ]
      })
    ]);
  });

  it('同一 selector identity 下使用各自 class-specific selector CSS 仍归入同一组', () => {
    const input = createInput();
    input.manifest = {
      atomic: {
        _color_blue: createAtomicEntry('_color_blue', 'color', 'blue', {
          selectorCss: '._color_blue'
        }),
        _color_red: createAtomicEntry('_color_red', 'color', 'red', {
          selectorCss: '._color_red'
        })
      },
      classes: {
        '/project/src/Button.module.css::button': {
          id: '/project/src/Button.module.css',
          sourceClassName: 'button',
          resolvedClassName: 'x_button',
          atomicClassNames: ['_color_blue', '_color_red'],
          suggestedClassName: 'x_button _color_blue _color_red'
        }
      }
    };

    const conflicts = analyzeBuild(input).risk.declarationConflicts;

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      selectorIdentity: '.__GSS_ANCHOR__',
      declarations: [
        { atomicClassName: '_color_blue', value: 'blue' },
        { atomicClassName: '_color_red', value: 'red' }
      ]
    });
  });

  it('按文件与 semantic class 稳定排序 conflict，并保留 class token 内的 declaration 顺序', () => {
    const input = createInput();
    input.manifest = {
      atomic: {
        _z_red: createAtomicEntry('_z_red', 'color', 'red'),
        _z_blue: createAtomicEntry('_z_blue', 'color', 'blue'),
        _a_black: createAtomicEntry('_a_black', 'color', 'black'),
        _a_white: createAtomicEntry('_a_white', 'color', 'white')
      },
      classes: {
        '/project/src/Button.module.css::zeta': {
          id: '/project/src/Button.module.css',
          sourceClassName: 'zeta',
          resolvedClassName: 'x_zeta',
          atomicClassNames: ['_z_blue', '_z_red'],
          suggestedClassName: 'x_zeta _z_blue _z_red'
        },
        '/project/src/Button.module.css::alpha': {
          id: '/project/src/Button.module.css',
          sourceClassName: 'alpha',
          resolvedClassName: 'x_alpha',
          atomicClassNames: ['_a_white', '_a_black'],
          suggestedClassName: 'x_alpha _a_white _a_black'
        }
      }
    };

    const conflicts = analyzeBuild(input).risk.declarationConflicts;

    expect(conflicts.map(({ sourceClassName, declarations }) => ({
      sourceClassName,
      tokens: declarations.map(({ atomicClassName }) => atomicClassName)
    }))).toEqual([
      { sourceClassName: 'alpha', tokens: ['_a_white', '_a_black'] },
      { sourceClassName: 'zeta', tokens: ['_z_blue', '_z_red'] }
    ]);
  });
});

/**
 * 创建同一 semantic class 同时含有重复属性和 shorthand/longhand 的 manifest。
 *
 * @returns 可触发 analyzer declaration conflict 聚合的最小 manifest。
 */
function createConflictManifest(): AnalyzeBuildInput['manifest'] {
  return {
    atomic: {
      _color_red: createAtomicEntry('_color_red', 'color', 'red'),
      _color_blue: createAtomicEntry('_color_blue', 'color', 'blue'),
      _border_base: createAtomicEntry('_border_base', 'border', '1px solid transparent'),
      _border_color: createAtomicEntry('_border_color', 'border-color', 'red')
    },
    classes: {
      '/project/src/Button.module.css::button': {
        id: '/project/src/Button.module.css',
        sourceClassName: 'button',
        resolvedClassName: 'x_button',
        atomicClassNames: ['_color_red', '_color_blue', '_border_base', '_border_color'],
        suggestedClassName: 'x_button _color_red _color_blue _border_base _border_color'
      }
    }
  };
}

/**
 * 创建声明值不同、但 cascade 上下文或 semantic class 相互隔离的 manifest。
 *
 * @returns 用于证明 analyzer 不会跨隔离边界误报冲突的 manifest。
 */
function createIsolatedManifest(): AnalyzeBuildInput['manifest'] {
  return {
    atomic: {
      _color_red: createAtomicEntry('_color_red', 'color', 'red'),
      _color_blue_hover: createAtomicEntry('_color_blue_hover', 'color', 'blue', {
        selectorIdentity: '.__GSS_ANCHOR__:hover',
        selectorCss: '._color_blue_hover:hover'
      }),
      _color_green_media: createAtomicEntry('_color_green_media', 'color', 'green', {
        context: { media: '(min-width: 768px)' }
      }),
      _color_white_supports: createAtomicEntry('_color_white_supports', 'color', 'white', {
        context: { supports: '(display: grid)' }
      }),
      _color_purple_important: createAtomicEntry('_color_purple_important', 'color', 'purple', {
        important: true
      }),
      _color_black: createAtomicEntry('_color_black', 'color', 'black')
    },
    classes: {
      '/project/src/Button.module.css::button': {
        id: '/project/src/Button.module.css',
        sourceClassName: 'button',
        resolvedClassName: 'x_button',
        atomicClassNames: [
          '_color_red',
          '_color_blue_hover',
          '_color_green_media',
          '_color_white_supports',
          '_color_purple_important'
        ],
        suggestedClassName:
          'x_button _color_red _color_blue_hover _color_green_media _color_white_supports _color_purple_important'
      },
      '/project/src/Button.module.css::label': {
        id: '/project/src/Button.module.css',
        sourceClassName: 'label',
        resolvedClassName: 'x_label',
        atomicClassNames: ['_color_black'],
        suggestedClassName: 'x_label _color_black'
      }
    }
  };
}

/**
 * 创建 analyzer conflict fixture 使用的最小 atomic manifest entry。
 *
 * @param className - atomic class 名称。
 * @param property - CSS declaration 属性名。
 * @param value - CSS declaration 值。
 * @param options - selector identity/CSS、条件上下文与 `!important` 语义。
 * @returns 可直接写入 manifest.atomic 的条目。
 */
function createAtomicEntry(
  className: string,
  property: string,
  value: string,
  options: {
    selectorIdentity?: string;
    selectorCss?: string;
    context?: AnalyzeBuildInput['manifest']['atomic'][string]['context'];
    important?: boolean;
  } = {}
): AnalyzeBuildInput['manifest']['atomic'][string] {
  const source = {
    id: '/project/src/Button.module.css',
    line: 1,
    column: 1
  };

  const selectorIdentity = options.selectorIdentity ?? '.__GSS_ANCHOR__';
  const selectorCss = options.selectorCss ?? `.${className}`;
  const context = options.context ?? {};
  const important = options.important ?? false;

  return {
    key: JSON.stringify({ selectorIdentity, property, value, important, context }),
    className,
    selector: {
      identity: selectorIdentity,
      css: selectorCss
    },
    declaration: {
      prop: property,
      value,
      important,
      source
    },
    context,
    sources: [source]
  };
}

/**
 * 创建覆盖 analyzer 体积、复用、风险和诊断聚合维度的输入 fixture。
 *
 * @returns 稳定且不依赖文件系统的 analyzer 输入。
 */
function createInput(): AnalyzeBuildInput {
  return {
    report: {
      summary: {
        files: 1,
        sourceClasses: 1,
        atomicDeclarations: 1,
        reusedAtomicDeclarations: 1,
        unsafeRules: 1,
        preservedRules: 1,
        preservedDeclarations: 1
      },
      size: {
        beforeCssBytes: 24,
        afterAtomicCssBytes: 20,
        afterPreservedCssBytes: 18,
        estimatedClassStringIncreaseBytes: 4,
        estimatedTotalDiffBytes: 18
      },
      diagnostics: [
        {
          code: 'unsafe-selector',
          level: 'warning',
          message: 'unsafe',
          id: '/project/src/Button.module.css',
          selector: '.button[data-state="open"]',
          reason: 'attribute-selector'
        }
      ]
    },
    manifest: {
      atomic: {},
      classes: {}
    },
    modules: [
      {
        id: '/project/src/Button.module.css',
        sourceCss: '.button { color: red; }',
        scopedCss: '.x_button { color: red; }',
        atomicCss: '._color_red { color: red; }',
        preservedCss: '.x_button[data-state="open"] { color: blue; }',
        diagnostics: [
          {
            code: 'unsafe-selector',
            level: 'warning',
            message: 'unsafe',
            id: '/project/src/Button.module.css',
            selector: '.x_button[data-state="open"]',
            reason: 'attribute-selector'
          }
        ]
      }
    ],
    outputCss: '._color_red { color: red; }\n.x_button[data-state="open"] { color: blue; }'
  };
}
