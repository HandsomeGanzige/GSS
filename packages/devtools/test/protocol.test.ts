import { describe, expect, it } from 'vitest';
import {
  createBrowserOverlayRuntime,
  createDevReportEnvelope,
  isValidDevReportEndpoint,
  matchesDevReportRequest,
  type DevReportEnvelope,
  type DevReportEnvironment
} from '../src/index.js';

const typeEnvironment = null as unknown as DevReportEnvironment;
const legalIdle = { adapter: 'vite', status: 'idle', environments: [] } satisfies DevReportEnvelope;
const legalReady = { adapter: 'rsbuild', status: 'ready', environments: [typeEnvironment] } satisfies DevReportEnvelope;
const legalError = { adapter: 'webpack', status: 'error', error: 'failed', environments: [typeEnvironment] } satisfies DevReportEnvelope;
// @ts-expect-error error 状态必须携带稳定错误摘要。
const missingError = { adapter: 'webpack', status: 'error', environments: [] } satisfies DevReportEnvelope;
// @ts-expect-error idle 不得携带 environment。
const invalidIdle = { adapter: 'vite', status: 'idle', environments: [typeEnvironment] } satisfies DevReportEnvelope;
// @ts-expect-error ready 必须至少携带一个 environment。
const invalidReady = { adapter: 'rsbuild', status: 'ready', environments: [] } satisfies DevReportEnvelope;
void [legalIdle, legalReady, legalError, missingError, invalidIdle, invalidReady];

describe('dev report protocol', () => {
  it('创建当前 envelope、稳定排序 environment 并原样保留 nested analysis', () => {
    const report = createReport();
    const envelope = createDevReportEnvelope('rsbuild', [{ name: 'z', report }, { name: 'a', report }]);

    expect(envelope).toMatchObject({
      adapter: 'rsbuild',
      status: 'ready',
      environments: [{ name: 'a' }, { name: 'z' }]
    });
    expect(envelope).not.toHaveProperty('schemaVersion');
    expect(envelope.environments[0]?.report.analysis.risk.declarationConflicts[0]?.selectorIdentity).toBe(
      '.__GSS_ANCHOR__:hover'
    );
    expect(envelope.environments[0]?.report.diagnostics[0]?.reason).toBe('attribute-cascade-order');
    expect(
      envelope.environments[0]?.report.analysis.risk.unsafeReasonDistribution['attribute-cascade-order']
    ).toBe(1);
    expect(envelope.environments[0]?.report).toBe(report);
    expect(createDevReportEnvelope('vite', [])).toEqual({
      adapter: 'vite',
      status: 'idle',
      environments: []
    });
  });

  it('JSON roundtrip 原样保留 nested diagnostic reason 与 analysis distribution', () => {
    const report = createReport();
    const envelope = createDevReportEnvelope('vite', [{ name: 'client', report }]);

    expect(envelope.environments[0]?.report).toBe(report);

    const serialized = JSON.stringify(envelope);
    const roundtripped = JSON.parse(serialized) as typeof envelope;

    expect(serialized).not.toContain('schemaVersion');
    expect(roundtripped.environments[0]?.report.diagnostics[0]?.reason).toBe(
      'attribute-cascade-order'
    );
    expect(
      roundtripped.environments[0]?.report.analysis.risk
        .unsafeReasonDistribution['attribute-cascade-order']
    ).toBe(1);
  });

  it('安全 selector list 不需新协议字段，unsafe mixed list 原样展示 selector-list reason', () => {
    const unsafeReport = createReport();
    unsafeReport.diagnostics[0]!.reason = 'selector-list';
    unsafeReport.diagnostics[0]!.selector = '.button, .parent .link';
    unsafeReport.analysis.risk.unsafeReasonDistribution = { 'selector-list': 1 };
    const unsafeEnvelope = createDevReportEnvelope('vite', [{ name: 'client', report: unsafeReport }]);

    expect(unsafeEnvelope.environments[0]?.report.diagnostics[0]?.reason).toBe('selector-list');
    expect(
      unsafeEnvelope.environments[0]?.report.analysis.risk.unsafeReasonDistribution['selector-list']
    ).toBe(1);

    const safeReport = createReport();
    safeReport.summary.unsafeRules = 0;
    safeReport.summary.preservedRules = 0;
    safeReport.diagnostics = [];
    safeReport.analysis.health = { status: 'ready', reasons: [] };
    safeReport.analysis.risk.unsafeReasonDistribution = {};
    const safeEnvelope = createDevReportEnvelope('rsbuild', [{ name: 'client', report: safeReport }]);

    expect(safeEnvelope).not.toHaveProperty('schemaVersion');
    expect(safeEnvelope.environments[0]?.report.diagnostics).toEqual([]);
    expect(safeEnvelope.environments[0]?.report.analysis.risk.unsafeReasonDistribution).toEqual({});
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
    expect(runtime).not.toContain('schemaVersion');
    expect(runtime).not.toContain('</script>');
  });

  it('overlay 接受并展示有效 idle 和 ready payload', async () => {
    const idle = await executeOverlay({
      adapter: 'vite',
      status: 'idle',
      environments: []
    });

    expect(idle.button.dataset.health).toBe('idle');
    expect(idle.button.textContent).toBe('GSS · idle');
    expect(idle.rows()).toEqual([
      ['Adapter', 'vite'],
      ['Modules', '0']
    ]);

    const report = createReport();
    report.summary.files = 2;
    report.summary.atomicDeclarations = 5;
    report.summary.unsafeRules = 1;
    report.summary.preservedRules = 3;
    report.analysis.health.status = 'risky';
    report.analysis.size.estimatedTotalDiffBytes = -12;
    const ready = await executeOverlay({
      adapter: 'rsbuild',
      status: 'ready',
      environments: [{ name: 'client', report }]
    });

    expect(ready.button.dataset.health).toBe('risky');
    expect(ready.button.textContent).toBe('GSS · risky');
    expect(ready.rows()).toEqual([
      ['Adapter', 'rsbuild'],
      ['Files', '2'],
      ['Atomic declarations', '5'],
      ['Unsafe rules', '1'],
      ['Preserved rules', '3'],
      ['Estimated diff', '-12 B']
    ]);
    expect(ready.rows().flat()).not.toContain('attribute-cascade-order');
  });

  it('Webpack compilation error 保留 last-good environment 与稳定 error 展示', async () => {
    const overlay = await executeOverlay({
      adapter: 'webpack',
      status: 'error',
      error: 'webpack-compilation-failed',
      environments: [{ name: 'web', report: createReport() }]
    });

    expect(overlay.button.dataset.health).toBe('blocked');
    expect(overlay.button.textContent).toBe('GSS · error');
    expect(overlay.rows()).toEqual([
      ['Adapter', 'webpack'],
      ['Last good environments', '1']
    ]);
    expect(overlay.note.textContent).toBe('webpack-compilation-failed');

    const empty = await executeOverlay({
      adapter: 'webpack',
      status: 'error',
      error: 'webpack-compiler-failed',
      environments: []
    });
    expect(empty.rows()).toContainEqual(['Last good environments', '0']);
  });

  it.each([
    ['adapter enum', { adapter: 'parcel', status: 'idle', environments: [] }],
    ['status enum', { adapter: 'vite', status: 'pending', environments: [] }],
    ['environments array', { adapter: 'vite', status: 'idle', environments: {} }],
    ['idle consistency', { adapter: 'vite', status: 'idle', environments: [{}] }],
    ['ready consistency', { adapter: 'vite', status: 'ready', environments: [] }],
    [
      'missing displayed summary field',
      {
        adapter: 'vite',
        status: 'ready',
        environments: [
          {
            report: {
              summary: { atomicDeclarations: 1, unsafeRules: 0, preservedRules: 0 },
              analysis: { health: { status: 'ready' }, size: { estimatedTotalDiffBytes: 0 } }
            }
          }
        ]
      }
    ],
    [
      'invalid displayed analysis field',
      {
        adapter: 'vite',
        status: 'ready',
        environments: [
          {
            report: {
              summary: { files: 1, atomicDeclarations: 1, unsafeRules: 0, preservedRules: 0 },
              analysis: { health: { status: 'unknown' }, size: { estimatedTotalDiffBytes: '0' } }
            }
          }
        ]
      }
    ]
  ])('非法 payload：%s 进入 offline 并暴露稳定错误', async (_name, payload) => {
    const overlay = await executeOverlay(payload);

    expect(overlay.button.dataset.health).toBe('offline');
    expect(overlay.button.textContent).toBe('GSS · offline');
    expect(overlay.note.textContent).toContain('invalid-dev-report-payload');
  });
});

/** 创建同时覆盖 overlay 聚合展示与 nested Analyzer/Core 字段透传的 report。 */
function createReport(): DevReportEnvironment['report'] {
  return {
    summary: {
      files: 0,
      sourceClasses: 0,
      atomicDeclarations: 0,
      reusedAtomicDeclarations: 0,
      unsafeRules: 1,
      preservedRules: 1,
      preservedDeclarations: 0
    },
    size: {
      beforeCssBytes: 0,
      afterAtomicCssBytes: 0,
      afterPreservedCssBytes: 0,
      estimatedClassStringIncreaseBytes: 0,
      estimatedTotalDiffBytes: 0
    },
    diagnostics: [
      {
        code: 'unsafe-selector',
        level: 'warning',
        message: 'attribute selector cascade order requires preserved fallback',
        id: '/src/Button.module.css',
        selector: '.button[data-state]',
        sourceClassName: 'button',
        reason: 'attribute-cascade-order'
      }
    ],
    analysis: {
      health: { status: 'risky', reasons: ['存在 unsafe selector fallback'] },
      risk: {
        unsafeReasonDistribution: {
          'attribute-cascade-order': 1
        },
        preservedCssRatio: 0,
        highRiskFiles: [],
        unsupportedFeatures: [],
        declarationConflictSummary: {
          total: 1,
          sameProperty: 1,
          shorthandLonghand: 0,
          affectedFiles: 1,
          affectedClasses: 1
        },
        declarationConflicts: [
          {
            id: '/src/Button.module.css',
            sourceClassName: 'button',
            kind: 'same-property',
            selectorIdentity: '.__GSS_ANCHOR__:hover',
            context: {},
            important: false,
            properties: ['color'],
            declarations: [
              { atomicClassName: '_color_red', property: 'color', value: 'red' },
              { atomicClassName: '_color_blue', property: 'color', value: 'blue' }
            ]
          }
        ]
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
}

type OverlayNode = {
  dataset: Record<string, string>;
  textContent: string;
  children: OverlayNode[];
  attributes: Set<string>;
  setAttribute(name: string, value: string): void;
  hasAttribute(name: string): boolean;
  toggleAttribute(name: string, force: boolean): void;
  addEventListener(): void;
  replaceChildren(...nodes: OverlayNode[]): void;
  append(...nodes: OverlayNode[]): void;
  attachShadow?: () => OverlayShadow;
};

type OverlayShadow = {
  innerHTML: string;
  querySelector(selector: string): OverlayNode;
};

/** 使用最小 DOM seam 真实执行生成的 overlay runtime。 */
async function executeOverlay(payload: unknown): Promise<{
  button: OverlayNode;
  note: OverlayNode;
  rows(): string[][];
}> {
  const createNode = (): OverlayNode => ({
    dataset: {},
    textContent: '',
    children: [],
    attributes: new Set(),
    setAttribute(name) {
      this.attributes.add(name);
    },
    hasAttribute(name) {
      return this.attributes.has(name);
    },
    toggleAttribute(name, force) {
      if (force) this.attributes.add(name);
      else this.attributes.delete(name);
    },
    addEventListener() {},
    replaceChildren(...nodes) {
      this.children = nodes;
    },
    append(...nodes) {
      this.children.push(...nodes);
    }
  });
  const button = createNode();
  const panel = createNode();
  panel.attributes.add('hidden');
  const list = createNode();
  const note = createNode();
  const shadow: OverlayShadow = {
    innerHTML: '',
    querySelector(selector) {
      if (selector === 'button') return button;
      if (selector === 'section') return panel;
      if (selector === 'dl') return list;
      if (selector === 'p') return note;
      throw new Error(`Unexpected selector ${selector}`);
    }
  };
  const host = createNode();
  host.attachShadow = () => shadow;
  const documentElement = createNode();
  const document = {
    hidden: false,
    querySelector: () => null,
    createElement: (tagName: string) => (tagName === 'aside' ? host : createNode()),
    documentElement,
    addEventListener() {}
  };
  const window = {
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {}
  };
  const fetch = async () => ({
    ok: true,
    json: async () => payload
  });
  const runtime = createBrowserOverlayRuntime({ endpoint: '/__semantic-atomic-css/report' });

  new Function('document', 'window', 'fetch', runtime)(document, window, fetch);
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }

  return {
    button,
    note,
    rows() {
      const rows: string[][] = [];
      for (let index = 0; index < list.children.length; index += 2) {
        rows.push([list.children[index]?.textContent ?? '', list.children[index + 1]?.textContent ?? '']);
      }
      return rows;
    }
  };
}
