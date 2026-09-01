import { describe, expect, it, vi } from 'vitest';
import {
  createBuildArtifactSnapshot,
  createEnvironmentBuildState,
  recordRuntimeBridgeResult,
  resetEnvironmentBuildState
} from '../src/buildArtifacts.js';
import type { CssLoaderBridgeResult as RuntimeBridgeResult } from '../src/buildArtifacts.js';
import { collectAtomicClassByKey, transformCompiledInput } from '../src/cssLoaderExport.js';

const { analyzeBuildSpy, getManifestSpy, getReportSpy } = vi.hoisted(() => ({
  analyzeBuildSpy: vi.fn(),
  getManifestSpy: vi.fn(),
  getReportSpy: vi.fn()
}));

vi.mock('@semantic-atomic-css/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@semantic-atomic-css/core')>();

  return {
    ...actual,
    createTransformer(...args: Parameters<typeof actual.createTransformer>) {
      const transformer = actual.createTransformer(...args);
      return {
        ...transformer,
        getManifest() {
          getManifestSpy();
          return transformer.getManifest();
        },
        getReport() {
          getReportSpy();
          return transformer.getReport();
        }
      };
    }
  };
});

vi.mock('@semantic-atomic-css/analyzer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@semantic-atomic-css/analyzer')>();

  return {
    ...actual,
    analyzeBuild(...args: Parameters<typeof actual.analyzeBuild>) {
      analyzeBuildSpy();
      return actual.analyzeBuild(...args);
    }
  };
});

describe('css-loader adapter build artifacts', () => {
  it('独立 readable-keyed transform 与全局 CSS 保持 token/class 闭合', () => {
    const state = createEnvironmentBuildState(false);
    const options = { className: { strategy: 'readable-keyed' as const } };
    for (const [id, value] of [
      ['/project/a.module.css', 'calc(1559px + 1%)'],
      ['/project/b.module.css', 'calc(4151px + 1%)']
    ] as const) {
      const input = { id, scopedCss: `.token { width: ${value}; }`, exportedClassNames: ['token'], preserveClassNames: {} };
      const transform = transformCompiledInput(input, options);
      recordRuntimeBridgeResult(state, { resourcePath: id, inputs: [input], atomicClassByKey: collectAtomicClassByKey([{ id, scopedCss: input.scopedCss, transform }]) });
    }
    const snapshot = createBuildArtifactSnapshot(state, options);
    const selected = [...state.atomicClassByKey.values()];
    expect(new Set(selected).size).toBe(2);
    for (const className of selected) expect(snapshot.atomicCss).toContain(`.${className}`);
    state.atomicClassByKey.set([...state.atomicClassByKey.keys()][0]!, '_wrong');
    expect(() => createBuildArtifactSnapshot(state, options)).toThrow(/atomic-token-css-closure/);
  });

  it('默认 build 使用 compact-keyed 消除已知 32-bit compact 跨 registry 碰撞', () => {
    const state = createEnvironmentBuildState(false);
    const options = { className: { strategy: 'compact-keyed' as const } };
    for (const [id, value] of [
      ['/project/a.module.css', 'calc(204705096px + 29%)'],
      ['/project/b.module.css', 'calc(3791420266px + 35%)']
    ] as const) {
      const input = { id, scopedCss: `.token { width: ${value}; }`, exportedClassNames: ['token'], preserveClassNames: {} };
      const transform = transformCompiledInput(input, options);
      recordRuntimeBridgeResult(state, { resourcePath: id, inputs: [input], atomicClassByKey: collectAtomicClassByKey([{ id, scopedCss: input.scopedCss, transform }]) });
    }
    const snapshot = createBuildArtifactSnapshot(state, options);
    expect(new Set(state.atomicClassByKey.values()).size).toBe(2);
    for (const className of state.atomicClassByKey.values()) expect(snapshot.atomicCss).toContain(`.${className}`);
  });

  it('build metadata 按配置惰性 finalization，report 共享一次 manifest snapshot', () => {
    const state = createEnvironmentBuildState(false);
    state.inputs.set('/project/Button.module.css', {
      id: '/project/Button.module.css',
      scopedCss: '.Button_button__hash { color: red; }',
      exportedClassNames: ['Button_button__hash'],
      preserveClassNames: {}
    });
    const options = { className: { strategy: 'readable' as const } };
    const resetSpies = () => {
      getManifestSpy.mockClear();
      getReportSpy.mockClear();
      analyzeBuildSpy.mockClear();
    };

    resetSpies();
    const disabled = createBuildArtifactSnapshot(state, options, { manifest: false, report: false });
    expect(getManifestSpy).not.toHaveBeenCalled();
    expect(getReportSpy).not.toHaveBeenCalled();
    expect(analyzeBuildSpy).not.toHaveBeenCalled();
    expect(disabled).not.toHaveProperty('outputCss');
    expect(disabled).not.toHaveProperty('manifest');
    expect(disabled).not.toHaveProperty('report');

    resetSpies();
    const manifestOnly = createBuildArtifactSnapshot(state, options, { manifest: true, report: false });
    expect(getManifestSpy).toHaveBeenCalledTimes(1);
    expect(getReportSpy).not.toHaveBeenCalled();
    expect(analyzeBuildSpy).not.toHaveBeenCalled();
    expect(manifestOnly).not.toHaveProperty('outputCss');
    expect(manifestOnly.manifest).toBeDefined();
    expect(manifestOnly).not.toHaveProperty('report');

    resetSpies();
    const reportOnly = createBuildArtifactSnapshot(state, options, { manifest: false, report: true });
    expect(getManifestSpy).toHaveBeenCalledTimes(1);
    expect(getReportSpy).toHaveBeenCalledTimes(1);
    expect(analyzeBuildSpy).toHaveBeenCalledTimes(1);
    expect(reportOnly).not.toHaveProperty('manifest');
    expect(reportOnly.outputCss).toContain('color: red');
    expect(reportOnly.report).toBeDefined();

    resetSpies();
    const both = createBuildArtifactSnapshot(state, options, { manifest: true, report: true });
    expect(getManifestSpy).toHaveBeenCalledTimes(1);
    expect(getReportSpy).toHaveBeenCalledTimes(1);
    expect(analyzeBuildSpy).toHaveBeenCalledTimes(1);
    expect(both.outputCss).toBe(reportOnly.outputCss);
    expect(both.manifest).toEqual(manifestOnly.manifest);
    expect(both.report).toEqual(reportOnly.report);
  });

  it('按 source id 聚合、跨文件复用，并把基础规则放在条件规则之前', () => {
    const state = createEnvironmentBuildState(false);
    state.inputs.set('/project/a.module.css', {
      id: '/project/a.module.css',
      scopedCss: '@media (max-width: 640px) { .A_a__hash { color: red; } }',
      exportedClassNames: ['A_a__hash'],
      preserveClassNames: {}
    });
    state.inputs.set('/project/z.module.css', {
      id: '/project/z.module.css',
      scopedCss: '.Z_z__hash { color: red; padding: 8px; }',
      exportedClassNames: ['Z_z__hash'],
      preserveClassNames: {}
    });

    const options = { className: { strategy: 'compact' as const } };
    const first = createBuildArtifactSnapshot(state, options);
    const second = createBuildArtifactSnapshot(state, options);

    const reversedState = createEnvironmentBuildState(false);
    for (const input of [...state.inputs.values()].reverse()) {
      reversedState.inputs.set(input.id, input);
    }
    const reversed = createBuildArtifactSnapshot(reversedState, options);

    expect(first).toEqual(second);
    expect(first).toEqual(reversed);
    expect(Object.keys(first.manifest.atomic).every((className) => /^[ab][0-9a-z]{6}$/.test(className))).toBe(true);
    expect(first.atomicCss.indexOf('padding: 8px')).toBeLessThan(first.atomicCss.indexOf('@media'));
    expect(first.report.summary.files).toBe(2);
    expect(first.report.analysis.benefit.atomicDeclarations).toBe(3);
    expect(Object.keys(first.manifest.classes)).toEqual([
      '/project/a.module.css::A_a__hash',
      '/project/z.module.css::Z_z__hash'
    ]);
  });

  it('重复 source 的 preserve reason 使用稳定优先级且与 loader 完成顺序无关', () => {
    const createState = (reversed: boolean) => {
      const state = createEnvironmentBuildState(false);
      const reasons = reversed
        ? (['asset-reference', 'ambiguous-export-value'] as const)
        : (['ambiguous-export-value', 'asset-reference'] as const);
      for (const [index, reason] of reasons.entries()) {
        recordRuntimeBridgeResult(state, {
          resourcePath: `/project/owner-${index}.module.css`,
          inputs: [{
            id: '/project/shared.module.css',
            scopedCss: '.Shared_value__hash { color: red; }',
            exportedClassNames: ['Shared_value__hash'],
            preserveClassNames: { Shared_value__hash: reason }
          }]
        });
      }
      return state;
    };

    const first = createState(false);
    const reversed = createState(true);
    expect(first.inputs.get('/project/shared.module.css')?.preserveClassNames).toEqual({
      Shared_value__hash: 'asset-reference'
    });
    expect(createBuildArtifactSnapshot(first, { className: { strategy: 'readable' } }))
      .toEqual(createBuildArtifactSnapshot(reversed, { className: { strategy: 'readable' } }));
  });

  it('合并同一 compiled row 的 export/preserve evidence，并在新 compilation 前清空', () => {
    const state = createEnvironmentBuildState(false);
    const createResult = (exportedClassNames: string[], preserve = false): RuntimeBridgeResult => ({
      resourcePath: `/project/${exportedClassNames.join('-')}.module.css`,
      inputs: [
        {
          id: '/project/shared.module.css',
          scopedCss: '.Shared_a__hash { color: red; } .Shared_b__hash { color: blue; }',
          exportedClassNames,
          preserveClassNames: preserve ? { Shared_b__hash: 'asset-reference' } : {}
        }
      ],
      nativeLocals: {},
      augmentedLocals: {},
      transforms: []
    });

    recordRuntimeBridgeResult(state, createResult(['Shared_a__hash']));
    recordRuntimeBridgeResult(state, createResult(['Shared_b__hash'], true));

    expect(state.inputs.get('/project/shared.module.css')).toMatchObject({
      exportedClassNames: ['Shared_a__hash', 'Shared_b__hash'],
      preserveClassNames: { Shared_b__hash: 'asset-reference' }
    });

    resetEnvironmentBuildState(state);
    expect(state.inputs.size).toBe(0);
    expect(state.atomicClassByKey.size).toBe(0);
  });

  it('使用 descriptor CSS 渲染 base/pseudo、条件与 important，并持久化当前 manifest', () => {
    const state = createEnvironmentBuildState(false);
    state.inputs.set('/project/Button.module.css', {
      id: '/project/Button.module.css',
      scopedCss: [
        '.Button_button__hash { color: red; border-color: blue !important; }',
        '.Button_button__hash:hover { color: red; }',
        '@supports (display: grid) {',
        '  .Button_button__hash:focus-visible { display: grid; }',
        '}',
        '@media (min-width: 600px) {',
        '  .Button_button__hash:hover { color: blue; }',
        '}',
        '@media (max-width: 1100px) {',
        '  .Button_button__hash { padding: 2px; }',
        '}',
        '@media (max-width: 640px) {',
        '  .Button_button__hash { padding: 1px; }',
        '}'
      ].join('\n'),
      exportedClassNames: ['Button_button__hash'],
      preserveClassNames: {}
    });

    const snapshot = createBuildArtifactSnapshot(state, { className: { strategy: 'readable' } });
    const entries = Object.values(snapshot.manifest.atomic);

    expect(snapshot.atomicCss).toContain('._selector_q0dmug_color_red {');
    expect(snapshot.atomicCss).toContain('._selector_qf5xvc_color_red:hover {');
    expect(snapshot.atomicCss).toContain(
      '._supports_1gj8cx_selector_1qzezs_display_grid:focus-visible {'
    );
    expect(snapshot.atomicCss).toContain('border-color: blue !important;');
    expect(snapshot.atomicCss).toContain('@supports (display: grid) {');
    expect(snapshot.atomicCss).toContain('@media (min-width: 600px) {');
    expect(snapshot.atomicCss.indexOf('padding: 2px;')).toBeLessThan(
      snapshot.atomicCss.indexOf('padding: 1px;')
    );
    expect(snapshot.atomicCss).not.toContain('__GSS_ANCHOR__');
    expect(entries.every((entry) => snapshot.atomicCss.includes(`${entry.selector.css} {`))).toBe(true);
    expect(entries.every((entry) => !('pseudo' in entry.context))).toBe(true);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          selector: {
            identity: '.__GSS_ANCHOR__',
            css: '._selector_q0dmug_color_red'
          }
        }),
        expect.objectContaining({
          selector: {
            identity: '.__GSS_ANCHOR__:hover',
            css: '._selector_qf5xvc_color_red:hover'
          }
        })
      ])
    );
  });

  it('build snapshot 保持 readable grammar 与 supports-then-media 套层，由 native minifier 拥有最终序列化', () => {
    const state = createEnvironmentBuildState(false);
    state.inputs.set('/project/Readable.module.css', {
      id: '/project/Readable.module.css',
      scopedCss: [
        '.Readable_base__hash { color: red !important; }',
        '@media (min-width: 600px) {',
        '  @supports (display: grid) { .Readable_both__hash:hover { display: grid; } }',
        '}'
      ].join('\n'),
      exportedClassNames: ['Readable_base__hash', 'Readable_both__hash'],
      preserveClassNames: {}
    });

    const snapshot = createBuildArtifactSnapshot(state, { className: { strategy: 'readable' } });

    expect(snapshot.atomicCss).toBe(
      [
        '._selector_q0dmug_color_red_important {\n  color: red !important;\n}',
        '@media (min-width: 600px) {\n  @supports (display: grid) {\n    ._media_1ltocy_supports_1gj8cx_selector_qf5xvc_display_grid:hover {\n      display: grid;\n    }\n  }\n}'
      ].join('\n\n')
    );
  });

  it('generic artifact 聚合 pseudo-element spelling、mapping 与保守 fallback', () => {
    const state = createEnvironmentBuildState(false);
    state.inputs.set('/project/Pseudo.module.css', {
      id: '/project/Pseudo.module.css',
      scopedCss: [
        '.Pseudo_before__hash::before { content: ""; color: red; }',
        '.Pseudo_after__hash:after { content: ""; display: block; }',
        '.Pseudo_alias__hash:before { color: red; }',
        '.Pseudo_alias__hash::before { color: blue; }',
        '.Pseudo_fallback__hash::after, .Pseudo_peer__hash { color: green; }'
      ].join('\n'),
      exportedClassNames: [
        'Pseudo_before__hash',
        'Pseudo_after__hash',
        'Pseudo_alias__hash',
        'Pseudo_fallback__hash',
        'Pseudo_peer__hash'
      ],
      preserveClassNames: {}
    });

    const snapshot = createBuildArtifactSnapshot(state, { className: { strategy: 'readable' } });
    const before = snapshot.manifest.classes['/project/Pseudo.module.css::Pseudo_before__hash'];
    const after = snapshot.manifest.classes['/project/Pseudo.module.css::Pseudo_after__hash'];
    const alias = snapshot.manifest.classes['/project/Pseudo.module.css::Pseudo_alias__hash'];
    const fallback = snapshot.manifest.classes['/project/Pseudo.module.css::Pseudo_fallback__hash'];
    const entries = Object.values(snapshot.manifest.atomic);

    expect(before?.atomicClassNames).toHaveLength(2);
    expect(after?.atomicClassNames).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ selector: expect.objectContaining({ identity: '.__GSS_ANCHOR__::before' }) }),
        expect.objectContaining({ selector: expect.objectContaining({ identity: '.__GSS_ANCHOR__:after' }) })
      ])
    );
    expect(entries.every(({ selector }) => !selector.css.includes(','))).toBe(true);
    expect(alias).toMatchObject({ atomicClassNames: [], unsafeReasons: ['pseudo-element'] });
    expect(fallback).toMatchObject({ atomicClassNames: [], unsafeReasons: ['selector-list'] });
    expect(snapshot.outputCss).toContain('.Pseudo_alias__hash:before');
    expect(snapshot.outputCss).toContain('.Pseudo_alias__hash::before');
    expect(snapshot.outputCss).toContain('.Pseudo_fallback__hash::after, .Pseudo_peer__hash');
    expect(snapshot.report.analysis.risk.unsafeReasonDistribution).toMatchObject({
      'pseudo-element': 2,
      'selector-list': 1
    });
  });

  it('聚合单-arm selector-list descriptor，并对 unsafe mixed list 保持整类 fallback', () => {
    const state = createEnvironmentBuildState(false);
    state.inputs.set('/project/List.module.css', {
      id: '/project/List.module.css',
      scopedCss: [
        '.List_a__hash, .List_b__hash { color: red; }',
        '.List_a__hash:hover, .List_b__hash:hover { background: blue; }',
        '.List_a__hash[data-ready], [data-ready].List_b__hash { border-color: green; }',
        '.List_safe__hash, .List_parent__hash .List_unsafe__hash { margin: 4px; }',
        '.List_safe__hash { padding: 8px; }'
      ].join('\n'),
      exportedClassNames: [
        'List_a__hash',
        'List_b__hash',
        'List_safe__hash',
        'List_parent__hash',
        'List_unsafe__hash'
      ],
      preserveClassNames: {}
    });

    const snapshot = createBuildArtifactSnapshot(state, { className: { strategy: 'readable' } });
    const a = snapshot.manifest.classes['/project/List.module.css::List_a__hash'];
    const b = snapshot.manifest.classes['/project/List.module.css::List_b__hash'];
    const safe = snapshot.manifest.classes['/project/List.module.css::List_safe__hash'];

    expect(a?.atomicClassNames).toContain('_selector_q0dmug_color_red');
    expect(b?.atomicClassNames).toContain('_selector_q0dmug_color_red');
    expect(a?.atomicClassNames).toContain('_selector_qf5xvc_background_blue');
    expect(b?.atomicClassNames).toContain('_selector_qf5xvc_background_blue');
    expect(snapshot.atomicCss).toContain('._selector_q0dmug_color_red {');
    expect(snapshot.atomicCss).toContain('._selector_qf5xvc_background_blue:hover {');
    expect(Object.values(snapshot.manifest.atomic).every(({ selector }) => !selector.css.includes(','))).toBe(true);
    expect(safe).toMatchObject({ atomicClassNames: [], unsafeReasons: ['selector-list'] });
    expect(snapshot.outputCss).toContain('.List_safe__hash, .List_parent__hash .List_unsafe__hash');
    expect(snapshot.report.analysis.risk.unsafeReasonDistribution).toMatchObject({ 'selector-list': 1 });
  });

  it('聚合 attribute descriptor 与 token，并对顺序风险整类 fallback/report', () => {
    const state = createEnvironmentBuildState(false);
    state.inputs.set('/project/Attribute.module.css', {
      id: '/project/Attribute.module.css',
      scopedCss: [
        '.Attribute_presence__hash[data-ready] { border-color: red; }',
        '.Attribute_exact__hash[data-state=open] { color: green; }',
        '[data-tone=warm].Attribute_before__hash { background: gold; }',
        '.Attribute_orderRisk__hash[data-state] { color: red; }',
        '.Attribute_orderRisk__hash:hover { color: blue; }',
        '.Attribute_orderRisk__hash { padding: 4px; }'
      ].join('\n'),
      exportedClassNames: [
        'Attribute_presence__hash',
        'Attribute_exact__hash',
        'Attribute_before__hash',
        'Attribute_orderRisk__hash'
      ],
      preserveClassNames: {}
    });

    const snapshot = createBuildArtifactSnapshot(state, { className: { strategy: 'readable' } });
    const classes = Object.values(snapshot.manifest.classes);
    const presence = classes.find(({ sourceClassName }) => sourceClassName === 'Attribute_presence__hash');
    const exact = classes.find(({ sourceClassName }) => sourceClassName === 'Attribute_exact__hash');
    const before = classes.find(({ sourceClassName }) => sourceClassName === 'Attribute_before__hash');
    const orderRisk = classes.find(
      ({ sourceClassName }) => sourceClassName === 'Attribute_orderRisk__hash'
    );

    expect(snapshot.manifest.atomic['_selector_jyr83m_border-color_red']?.selector).toEqual({
      identity: '.__GSS_ANCHOR__[data-ready]',
      css: '._selector_jyr83m_border-color_red[data-ready]'
    });
    expect(snapshot.manifest.atomic._selector_7vq563_color_green?.selector).toEqual({
      identity: '.__GSS_ANCHOR__[data-state=open]',
      css: '._selector_7vq563_color_green[data-state=open]'
    });
    expect(snapshot.manifest.atomic._selector_tvzsrj_background_gold?.selector).toEqual({
      identity: '[data-tone=warm].__GSS_ANCHOR__',
      css: '[data-tone=warm]._selector_tvzsrj_background_gold'
    });
    expect(snapshot.atomicCss).toContain('._selector_jyr83m_border-color_red[data-ready] {');
    expect(snapshot.atomicCss).toContain('._selector_7vq563_color_green[data-state=open] {');
    expect(snapshot.atomicCss).toContain('[data-tone=warm]._selector_tvzsrj_background_gold {');
    expect(snapshot.atomicCss).not.toContain('__GSS_ANCHOR__');
    expect(presence?.atomicClassNames).toEqual(['_selector_jyr83m_border-color_red']);
    expect(exact?.atomicClassNames).toEqual(['_selector_7vq563_color_green']);
    expect(before?.atomicClassNames).toEqual(['_selector_tvzsrj_background_gold']);
    expect(orderRisk).toMatchObject({
      atomicClassNames: [],
      unsafeReasons: ['attribute-cascade-order']
    });
    expect(snapshot.outputCss).toContain('.Attribute_orderRisk__hash[data-state]');
    expect(snapshot.outputCss).toContain('.Attribute_orderRisk__hash:hover');
    expect(snapshot.outputCss).toContain('.Attribute_orderRisk__hash {');
    expect(snapshot.report.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'unsafe-selector',
        reason: 'attribute-cascade-order',
        sourceClassName: 'Attribute_orderRisk__hash'
      })
    );
    expect(snapshot.report.analysis).toMatchObject({
      health: { status: 'risky' },
      risk: {
        unsafeReasonDistribution: { 'attribute-cascade-order': 1 },
        highRiskFiles: [expect.objectContaining({ unsafeRules: 1 })]
      }
    });
  });

  it('build analysis conflict 保留 selector identity', () => {
    const state = createEnvironmentBuildState(false);
    state.inputs.set('/project/Button.module.css', {
      id: '/project/Button.module.css',
      scopedCss: '.Button_button__hash { color: red; }\n.Button_button__hash { color: blue; }',
      exportedClassNames: ['Button_button__hash'],
      preserveClassNames: {}
    });

    const snapshot = createBuildArtifactSnapshot(state, { className: { strategy: 'readable' } });

    expect(snapshot.report.analysis.risk.declarationConflicts).toContainEqual(
      expect.objectContaining({
        kind: 'same-property',
        selectorIdentity: '.__GSS_ANCHOR__',
        properties: ['color']
      })
    );
  });
});
