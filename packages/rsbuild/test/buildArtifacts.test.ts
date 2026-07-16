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
});
