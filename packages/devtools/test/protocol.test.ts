import { describe, expect, it } from 'vitest';
import {
  createBrowserOverlayRuntime,
  createDevReportEnvelope,
  isValidDevReportEndpoint,
  matchesDevReportRequest
} from '../src/index.js';

describe('dev report protocol', () => {
  it('创建版本化、稳定排序的 envelope', () => {
    const report = {
      summary: {
        files: 0,
        sourceClasses: 0,
        atomicDeclarations: 0,
        reusedAtomicDeclarations: 0,
        unsafeRules: 0,
        preservedRules: 0,
        preservedDeclarations: 0
      },
      size: {
        beforeCssBytes: 0,
        afterAtomicCssBytes: 0,
        afterPreservedCssBytes: 0,
        estimatedClassStringIncreaseBytes: 0,
        estimatedTotalDiffBytes: 0
      },
      diagnostics: [],
      analysis: {
        health: { status: 'ready' as const, reasons: [] },
        risk: {
          unsafeReasonDistribution: {},
          preservedCssRatio: 0,
          highRiskFiles: [],
          unsupportedFeatures: [],
          declarationConflictSummary: {
            total: 0,
            sameProperty: 0,
            shorthandLonghand: 0,
            affectedFiles: 0,
            affectedClasses: 0
          },
          declarationConflicts: []
        },
        benefit: {
          sourceClasses: 0,
          atomicDeclarations: 0,
          reusedAtomicDeclarations: 0,
          reuseRatio: 0
        },
        size: {
          beforeRawCssBytes: 0,
          afterRawCssBytes: 0,
          beforeGzipCssBytes: 0,
          afterGzipCssBytes: 0,
          beforeBrotliCssBytes: 0,
          afterBrotliCssBytes: 0,
          estimatedClassStringIncreaseBytes: 0,
          estimatedTotalDiffBytes: 0
        }
      }
    };

    expect(createDevReportEnvelope('rsbuild', [{ name: 'z', report }, { name: 'a', report }])).toMatchObject({
      schemaVersion: 1,
      adapter: 'rsbuild',
      status: 'ready',
      environments: [{ name: 'a' }, { name: 'z' }]
    });
    expect(createDevReportEnvelope('vite', [])).toEqual({
      schemaVersion: 1,
      adapter: 'vite',
      status: 'idle',
      environments: []
    });
  });

  it('只匹配合法 endpoint 的 pathname', () => {
    const endpoint = '/__semantic-atomic-css/report';
    expect(isValidDevReportEndpoint(endpoint)).toBe(true);
    expect(isValidDevReportEndpoint('relative')).toBe(false);
    expect(isValidDevReportEndpoint('/report?<script>')).toBe(false);
    expect(isValidDevReportEndpoint('/../report')).toBe(false);
    expect(isValidDevReportEndpoint('/a/./report')).toBe(false);
    expect(isValidDevReportEndpoint('/%2e%2e/report')).toBe(false);
    expect(matchesDevReportRequest(`${endpoint}?t=1`, endpoint)).toBe(true);
    expect(matchesDevReportRequest('/other', endpoint)).toBe(false);
  });

  it('overlay runtime 使用 Shadow DOM、同源 API 与 textContent', () => {
    const runtime = createBrowserOverlayRuntime({ endpoint: '/__semantic-atomic-css/report' });
    expect(runtime).toContain('attachShadow');
    expect(runtime).toContain("fetch(endpoint");
    expect(runtime).toContain('textContent');
    expect(runtime).toContain('data-semantic-atomic-css-overlay');
    expect(runtime).toContain('refreshInFlight');
    expect(runtime).toContain("addEventListener('pageshow'");
    expect(runtime).not.toContain('</script>');
  });
});
