import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  assertNoStyleDifferences,
  createStyleDiffReport,
  mergeStyleDiffReports,
  verifyComputedStyles,
  writeAndAssertStyleDiffReport,
  type PlaywrightBrowserLike,
  type PlaywrightPageLike
} from '../src/index.js';

describe('style diff report', () => {
  it('拒绝零检查、重复 case id 和空 properties', async () => {
    const browser: PlaywrightBrowserLike = {
      newContext: vi.fn(async () => {
        throw new Error('invalid input 不应启动 browser');
      })
    };
    const base = {
      browser,
      baseline: { url: 'http://native.test' },
      candidate: { url: 'http://semantic.test' }
    };

    await expect(verifyComputedStyles({ ...base, cases: [], viewports: [] })).rejects.toThrow(
      /computed-style-viewports-empty/
    );
    await expect(verifyComputedStyles({ ...base, cases: [] })).rejects.toThrow(/computed-style-cases-empty/);
    await expect(
      verifyComputedStyles({ ...base, cases: [{ id: 'empty', selector: '#empty', properties: [] }] })
    ).rejects.toThrow(/computed-style-properties-empty/);
    await expect(
      verifyComputedStyles({
        ...base,
        cases: [
          { id: 'duplicate', selector: '#left', properties: ['color'] },
          { id: 'duplicate', selector: '#right', properties: ['display'] }
        ]
      })
    ).rejects.toThrow(/computed-style-case-id-duplicate/);

    const emptyReport = createStyleDiffReport({ runs: [] });
    expect(emptyReport.summary.passed).toBe(false);
    expect(() => assertNoStyleDifferences(emptyReport)).toThrow(/computed-style-no-comparisons/);
  });

  it('输出逐属性差异和稳定摘要', () => {
    const report = createStyleDiffReport({
      runs: [
        {
          id: 'base/dev@1280x900',
          viewport: { width: 1280, height: 900 },
          baseline: {
            button: { color: 'rgb(1, 2, 3)', display: 'block' }
          },
          candidate: {
            button: { color: 'rgb(4, 5, 6)', display: 'block' }
          }
        }
      ]
    });

    expect(report.summary).toEqual({
      runs: 1,
      cases: 1,
      comparisons: 2,
      differences: 1,
      passed: false
    });
    expect(report).not.toHaveProperty('schemaVersion');
    expect(report.differences).toEqual([
      {
        runId: 'base/dev@1280x900',
        viewport: { width: 1280, height: 900 },
        caseId: 'button',
        property: 'color',
        baseline: 'rgb(1, 2, 3)',
        candidate: 'rgb(4, 5, 6)'
      }
    ]);
    expect(() => assertNoStyleDifferences(report)).toThrow(/button\.color/);
  });

  it('差异断言失败前先写出完整 JSON report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'gss-style-diff-'));
    const filename = join(root, 'report.json');
    const report = createStyleDiffReport({
      runs: [{
        id: 'failure',
        viewport: { width: 1280, height: 900 },
        baseline: { button: { color: 'red' } },
        candidate: { button: { color: 'blue' } }
      }]
    });

    try {
      await expect(writeAndAssertStyleDiffReport(report, filename)).rejects.toThrow(/computed-style-diff/);
      const written = JSON.parse(await readFile(filename, 'utf8'));
      expect(written).toMatchObject({
        summary: { differences: 1, passed: false },
        differences: [{ caseId: 'button', property: 'color' }]
      });
      expect(written).not.toHaveProperty('schemaVersion');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('合并多个通过的 verifier runs', () => {
    const createPassing = (id: string) =>
      createStyleDiffReport({
        runs: [
          {
            id,
            viewport: { width: 520, height: 900 },
            baseline: { shell: { display: 'grid' } },
            candidate: { shell: { display: 'grid' } }
          }
        ]
      });
    const report = mergeStyleDiffReports([createPassing('dev'), createPassing('preview')]);

    expect(report.summary).toEqual({
      runs: 2,
      cases: 2,
      comparisons: 2,
      differences: 0,
      passed: true
    });
    expect(report).not.toHaveProperty('schemaVersion');
    expect(() => assertNoStyleDifferences(report)).not.toThrow();
  });

  it('通过 Playwright-compatible browser seam 导航、交互并采集', async () => {
    const createPage = (color: string): PlaywrightPageLike => ({
      goto: vi.fn(async () => undefined),
      waitForSelector: vi.fn(async () => undefined),
      hover: vi.fn(async () => undefined),
      focus: vi.fn(async () => undefined),
      click: vi.fn(async () => undefined),
      $eval: vi.fn(async (_selector, _pageFunction, input: { properties: string[] }) =>
        Object.fromEntries(input.properties.map((property) => [property, property === 'color' ? color : 'block']))
      ) as PlaywrightPageLike['$eval'],
      close: vi.fn(async () => undefined)
    });
    const baselinePage = createPage('rgb(1, 2, 3)');
    const candidatePage = createPage('rgb(1, 2, 3)');
    const pages = [baselinePage, candidatePage];
    const closeContext = vi.fn(async () => undefined);
    const browser: PlaywrightBrowserLike = {
      newContext: vi.fn(async () => ({
        newPage: async () => pages.shift() ?? candidatePage,
        close: closeContext
      }))
    };

    const report = await verifyComputedStyles({
      browser,
      baseline: { url: 'http://native.test' },
      candidate: { url: 'http://semantic.test' },
      readySelector: '#app',
      cases: [
        { id: 'button', selector: '#button', properties: ['color', 'display'] },
        { id: 'button-hover', selector: '#button', properties: ['color'], action: { type: 'hover' } }
      ]
    });

    expect(report.summary).toMatchObject({ comparisons: 3, differences: 0, passed: true });
    expect(baselinePage.goto).toHaveBeenCalledWith('http://native.test', {
      waitUntil: 'load',
      timeout: 30_000
    });
    expect(candidatePage.hover).toHaveBeenCalledWith('#button');
    expect(closeContext).toHaveBeenCalledOnce();
  });

  it('第二个 page 创建失败时关闭已创建 page 与 context', async () => {
    const baselinePage = {
      close: vi.fn(async () => undefined)
    } as unknown as PlaywrightPageLike;
    const closeContext = vi.fn(async () => undefined);
    let pageCount = 0;
    const browser: PlaywrightBrowserLike = {
      newContext: vi.fn(async () => ({
        async newPage() {
          pageCount += 1;
          if (pageCount === 2) throw new Error('candidate-page-failed');
          return baselinePage;
        },
        close: closeContext
      }))
    };

    await expect(
      verifyComputedStyles({
        browser,
        baseline: { url: 'http://native.test' },
        candidate: { url: 'http://semantic.test' },
        cases: [{ id: 'button', selector: '#button', properties: ['color'] }]
      })
    ).rejects.toThrow(/candidate-page-failed/);
    expect(baselinePage.close).toHaveBeenCalledOnce();
    expect(closeContext).toHaveBeenCalledOnce();
  });
});
