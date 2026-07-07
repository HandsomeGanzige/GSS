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
});

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
