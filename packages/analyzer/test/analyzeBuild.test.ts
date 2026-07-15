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

  it('存在 unsupported feature 时输出 blocked', () => {
    const analysis = analyzeBuild({
      ...createInput(),
      unsupportedFeatures: [
        {
          feature: 'modules.namedExports',
          id: '/project/vite.config.ts',
          reason: 'Phase 4 未实现 named exports'
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

  it('不把跨 class、跨 pseudo 或跨 important 层级的声明当作确定冲突', () => {
    const input = createInput();
    input.manifest = createIsolatedManifest();

    const analysis = analyzeBuild(input);

    expect(analysis.risk.declarationConflictSummary.total).toBe(0);
    expect(analysis.risk.declarationConflicts).toEqual([]);
  });
});

/** 创建同一 class 同时含有重复属性和 shorthand / longhand 的 manifest。 */
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

/** 创建值不同但 cascade 上下文或 semantic class 不同的 manifest。 */
function createIsolatedManifest(): AnalyzeBuildInput['manifest'] {
  return {
    atomic: {
      _color_red: createAtomicEntry('_color_red', 'color', 'red'),
      _color_blue_hover: createAtomicEntry('_color_blue_hover', 'color', 'blue', { pseudo: ':hover' }),
      _color_green_important: createAtomicEntry('_color_green_important', 'color', 'green', {}, true),
      _color_black: createAtomicEntry('_color_black', 'color', 'black')
    },
    classes: {
      '/project/src/Button.module.css::button': {
        id: '/project/src/Button.module.css',
        sourceClassName: 'button',
        resolvedClassName: 'x_button',
        atomicClassNames: ['_color_red', '_color_blue_hover', '_color_green_important'],
        suggestedClassName: 'x_button _color_red _color_blue_hover _color_green_important'
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

/** 创建 analyzer conflict fixture 使用的最小 atomic manifest entry。 */
function createAtomicEntry(
  className: string,
  property: string,
  value: string,
  context: AnalyzeBuildInput['manifest']['atomic'][string]['context'] = {},
  important = false
): AnalyzeBuildInput['manifest']['atomic'][string] {
  const source = {
    id: '/project/src/Button.module.css',
    line: 1,
    column: 1
  };

  return {
    key: `${property}:${value}:${important}`,
    className,
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

/** 创建覆盖 analyzer 主要聚合维度的输入 fixture。 */
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
