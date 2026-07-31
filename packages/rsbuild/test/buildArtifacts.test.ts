import { describe, expect, it } from 'vitest';
import {
  createBuildArtifactSnapshot,
  createEnvironmentBuildState,
  recordRuntimeBridgeResult,
  resetEnvironmentBuildState
} from '../src/buildArtifacts.js';
import type { RuntimeBridgeResult } from '../src/runtimeBridgeLoader.js';

describe('Rsbuild build artifacts', () => {
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

    const first = createBuildArtifactSnapshot(state, { className: { strategy: 'hash' } });
    const second = createBuildArtifactSnapshot(state, { className: { strategy: 'hash' } });

    expect(first).toEqual(second);
    expect(first.atomicCss.indexOf('padding: 8px')).toBeLessThan(first.atomicCss.indexOf('@media'));
    expect(first.report.summary.files).toBe(2);
    expect(first.report.analysis.benefit.atomicDeclarations).toBe(3);
    expect(Object.keys(first.manifest.classes)).toEqual([
      '/project/a.module.css::A_a__hash',
      '/project/z.module.css::Z_z__hash'
    ]);
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
    expect(state.bridgeResults.size).toBe(0);
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
