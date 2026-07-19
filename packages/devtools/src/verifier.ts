/**
 * Playwright-compatible computed style verifier 与稳定 diff report。
 *
 * @module devtools/verifier
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** verifier 所需的最小 Playwright Page 结构，避免把 Playwright 变成生产依赖。 */
export type PlaywrightPageLike = {
  goto(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle'; timeout?: number }): Promise<unknown>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  hover(selector: string): Promise<unknown>;
  focus(selector: string): Promise<unknown>;
  click(selector: string): Promise<unknown>;
  $eval<Result, Argument>(
    selector: string,
    pageFunction: (element: Element, argument: Argument) => Result | Promise<Result>,
    argument: Argument
  ): Promise<Result>;
  close(): Promise<unknown>;
};

/** verifier 所需的最小 Playwright BrowserContext 结构。 */
export type PlaywrightBrowserContextLike = {
  newPage(): Promise<PlaywrightPageLike>;
  close(): Promise<unknown>;
};

/** verifier 所需的最小 Playwright Browser 结构。 */
export type PlaywrightBrowserLike = {
  newContext(options: { viewport: { width: number; height: number } }): Promise<PlaywrightBrowserContextLike>;
};

/** 单个 computed style 采集前的受支持交互。 */
export type ComputedStyleAction = {
  type: 'hover' | 'focus' | 'click';
  /** 默认使用当前 case selector。 */
  selector?: string;
  /** click 等异步交互完成后等待出现的 selector。 */
  waitForSelector?: string;
};

/** 一个稳定 DOM 锚点及需要严格比较的 computed style 属性。 */
export type ComputedStyleCase = {
  id: string;
  selector: string;
  properties: string[];
  /** 可选 pseudo element，例如 `::before`。 */
  pseudo?: string;
  action?: ComputedStyleAction;
};

/** 单页、单视口的 computed style 快照。 */
export type ComputedStyleSnapshot = Record<string, Record<string, string>>;

/** 一个 viewport 下的 semantic/native 对照证据。 */
export type StyleDiffRun = {
  id: string;
  viewport: { width: number; height: number };
  baseline: ComputedStyleSnapshot;
  candidate: ComputedStyleSnapshot;
};

/** 单个属性差异。 */
export type ComputedStyleDifference = {
  runId: string;
  viewport: { width: number; height: number };
  caseId: string;
  property: string;
  baseline: string | null;
  candidate: string | null;
};

/** 可持久化、可合并的 Phase 7 style diff report。 */
export type StyleDiffReport = {
  schemaVersion: 1;
  baselineLabel: string;
  candidateLabel: string;
  summary: {
    runs: number;
    cases: number;
    comparisons: number;
    differences: number;
    passed: boolean;
  };
  runs: StyleDiffRun[];
  differences: ComputedStyleDifference[];
};

/** high-level Playwright verifier 配置。 */
export type VerifyComputedStylesOptions = {
  browser: PlaywrightBrowserLike;
  baseline: { label?: string; url: string };
  candidate: { label?: string; url: string };
  cases: ComputedStyleCase[];
  viewports?: Array<{ width: number; height: number }>;
  readySelector?: string;
  timeoutMs?: number;
  runId?: string;
};

/**
 * 从已导航的 Playwright page 采集 computed styles。
 *
 * @remarks action 按 cases 输入顺序执行，因此调用方应把无交互 case 放在交互 case 之前。
 */
export async function captureComputedStyles(
  page: PlaywrightPageLike,
  cases: ComputedStyleCase[]
): Promise<ComputedStyleSnapshot> {
  validateComputedStyleCases(cases);
  const snapshot: ComputedStyleSnapshot = {};

  for (const definition of cases) {
    if (definition.action) {
      const selector = definition.action.selector ?? definition.selector;
      await page[definition.action.type](selector);
      if (definition.action.waitForSelector) {
        await page.waitForSelector(definition.action.waitForSelector);
      }
    }

    snapshot[definition.id] = await page.$eval(
      definition.selector,
      (element, input) => {
        const style = getComputedStyle(element, input.pseudo ?? null);
        const styleRecord = style as unknown as Record<string, string>;
        return Object.fromEntries(
          input.properties.map((property) => [
            property,
            (style.getPropertyValue(property) || styleRecord[property] || '')
              .trim()
              .replaceAll(location.origin, '<origin>')
          ])
        );
      },
      { properties: [...definition.properties], pseudo: definition.pseudo }
    );
  }

  return snapshot;
}

/**
 * 从已采集快照创建逐属性 diff report。
 */
export function createStyleDiffReport(input: {
  baselineLabel?: string;
  candidateLabel?: string;
  runs: StyleDiffRun[];
}): StyleDiffReport {
  const runs = input.runs.map((run) => ({
    id: run.id,
    viewport: { ...run.viewport },
    baseline: cloneSnapshot(run.baseline),
    candidate: cloneSnapshot(run.candidate)
  }));
  const differences: ComputedStyleDifference[] = [];
  let comparisons = 0;
  let cases = 0;

  for (const run of runs) {
    const caseIds = [...new Set([...Object.keys(run.baseline), ...Object.keys(run.candidate)])].sort(compareText);
    cases += caseIds.length;

    for (const caseId of caseIds) {
      const baseline = run.baseline[caseId] ?? {};
      const candidate = run.candidate[caseId] ?? {};
      const properties = [...new Set([...Object.keys(baseline), ...Object.keys(candidate)])].sort(compareText);

      if (properties.length === 0) {
        throw new Error(
          `[semantic-atomic-css] style-diff-properties-empty runId=${JSON.stringify(run.id)} caseId=${JSON.stringify(caseId)}`
        );
      }

      for (const property of properties) {
        comparisons += 1;
        const baselineValue = baseline[property] ?? null;
        const candidateValue = candidate[property] ?? null;
        if (baselineValue !== candidateValue) {
          differences.push({
            runId: run.id,
            viewport: { ...run.viewport },
            caseId,
            property,
            baseline: baselineValue,
            candidate: candidateValue
          });
        }
      }
    }
  }

  return {
    schemaVersion: 1,
    baselineLabel: input.baselineLabel ?? 'native',
    candidateLabel: input.candidateLabel ?? 'semantic',
    summary: {
      runs: runs.length,
      cases,
      comparisons,
      differences: differences.length,
      passed: comparisons > 0 && differences.length === 0
    },
    runs,
    differences
  };
}

/** 合并同一 baseline/candidate 语义下的多个 diff reports。 */
export function mergeStyleDiffReports(reports: StyleDiffReport[]): StyleDiffReport {
  if (reports.length === 0) {
    return createStyleDiffReport({ runs: [] });
  }

  const [first] = reports;
  for (const report of reports.slice(1)) {
    if (report.baselineLabel !== first.baselineLabel || report.candidateLabel !== first.candidateLabel) {
      throw new Error('[semantic-atomic-css] style-diff-label-mismatch');
    }
  }

  return createStyleDiffReport({
    baselineLabel: first.baselineLabel,
    candidateLabel: first.candidateLabel,
    runs: reports.flatMap((report) => report.runs)
  });
}

/**
 * 启动两组 Playwright pages，对每个 viewport 严格采集并返回 diff report。
 */
export async function verifyComputedStyles(options: VerifyComputedStylesOptions): Promise<StyleDiffReport> {
  const viewports = options.viewports ?? [{ width: 1280, height: 900 }];
  validateViewports(viewports);
  validateComputedStyleCases(options.cases);
  const timeoutMs = options.timeoutMs ?? 30_000;
  const reports: StyleDiffReport[] = [];

  for (const viewport of viewports) {
    const context = await options.browser.newContext({ viewport });
    const pages: PlaywrightPageLike[] = [];

    try {
      const baselinePage = await context.newPage();
      pages.push(baselinePage);
      const candidatePage = await context.newPage();
      pages.push(candidatePage);
      await Promise.all([
        navigateForVerification(baselinePage, options.baseline.url, options.readySelector, timeoutMs),
        navigateForVerification(candidatePage, options.candidate.url, options.readySelector, timeoutMs)
      ]);
      const [baseline, candidate] = await Promise.all([
        captureComputedStyles(baselinePage, options.cases),
        captureComputedStyles(candidatePage, options.cases)
      ]);
      reports.push(
        createStyleDiffReport({
          baselineLabel: options.baseline.label,
          candidateLabel: options.candidate.label,
          runs: [
            {
              id: `${options.runId ?? 'computed-style'}@${viewport.width}x${viewport.height}`,
              viewport,
              baseline,
              candidate
            }
          ]
        })
      );
    } finally {
      await Promise.allSettled(pages.map((page) => page.close()));
      await context.close();
    }
  }

  return mergeStyleDiffReports(reports);
}

/** diff 不为空时抛出包含可读属性级证据的错误。 */
export function assertNoStyleDifferences(report: StyleDiffReport): void {
  if (report.summary.comparisons === 0) {
    throw new Error('[semantic-atomic-css] computed-style-no-comparisons');
  }

  if (report.summary.passed) {
    return;
  }

  const details = report.differences
    .slice(0, 20)
    .map(
      (difference) =>
        `${difference.runId} ${difference.caseId}.${difference.property}: ${report.baselineLabel}=${JSON.stringify(difference.baseline)} ${report.candidateLabel}=${JSON.stringify(difference.candidate)}`
    )
    .join('\n');
  const omitted = Math.max(0, report.differences.length - 20);
  throw new Error(
    `[semantic-atomic-css] computed-style-diff differences=${report.differences.length}\n${details}${omitted ? `\n... 另有 ${omitted} 项差异` : ''}`
  );
}

/** 写入前确保父目录存在，并使用稳定两空格 JSON 格式持久化 diff report。 */
export async function writeStyleDiffReport(filename: string, report: StyleDiffReport): Promise<void> {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

/** 指定路径时先持久化完整 report，再以差异结果决定验收是否失败。 */
export async function writeAndAssertStyleDiffReport(
  report: StyleDiffReport,
  filename?: string
): Promise<void> {
  if (filename) {
    await writeStyleDiffReport(filename, report);
  }
  assertNoStyleDifferences(report);
}

/** 等待页面 load 事件和可选 ready selector，不被 overlay 的持续轮询阻塞。 */
async function navigateForVerification(
  page: PlaywrightPageLike,
  url: string,
  readySelector: string | undefined,
  timeoutMs: number
): Promise<void> {
  await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
  if (readySelector) {
    await page.waitForSelector(readySelector, { timeout: timeoutMs });
  }
}

/** 验证 viewport 非空且宽高是有限正数，避免未启动浏览器却判绿。 */
function validateViewports(viewports: Array<{ width: number; height: number }>): void {
  if (viewports.length === 0) {
    throw new Error('[semantic-atomic-css] computed-style-viewports-empty');
  }

  for (const viewport of viewports) {
    if (
      !Number.isFinite(viewport.width) ||
      !Number.isFinite(viewport.height) ||
      viewport.width <= 0 ||
      viewport.height <= 0
    ) {
      throw new Error(
        `[semantic-atomic-css] computed-style-viewport-invalid width=${String(viewport.width)} height=${String(viewport.height)}`
      );
    }
  }
}

/** 验证 case 键和属性集合可形成唯一、非空的实际比较。 */
function validateComputedStyleCases(cases: ComputedStyleCase[]): void {
  if (cases.length === 0) {
    throw new Error('[semantic-atomic-css] computed-style-cases-empty');
  }

  const caseIds = new Set<string>();
  for (const definition of cases) {
    if (!definition.id.trim()) {
      throw new Error('[semantic-atomic-css] computed-style-case-id-empty');
    }
    if (caseIds.has(definition.id)) {
      throw new Error(
        `[semantic-atomic-css] computed-style-case-id-duplicate id=${JSON.stringify(definition.id)}`
      );
    }
    caseIds.add(definition.id);

    if (!definition.selector.trim()) {
      throw new Error(
        `[semantic-atomic-css] computed-style-selector-empty id=${JSON.stringify(definition.id)}`
      );
    }
    if (definition.properties.length === 0) {
      throw new Error(
        `[semantic-atomic-css] computed-style-properties-empty id=${JSON.stringify(definition.id)}`
      );
    }

    const properties = new Set<string>();
    for (const property of definition.properties) {
      if (!property.trim()) {
        throw new Error(
          `[semantic-atomic-css] computed-style-property-empty id=${JSON.stringify(definition.id)}`
        );
      }
      if (properties.has(property)) {
        throw new Error(
          `[semantic-atomic-css] computed-style-property-duplicate id=${JSON.stringify(definition.id)} property=${JSON.stringify(property)}`
        );
      }
      properties.add(property);
    }
  }
}

/** 防御性复制快照，避免 report 持久化后被调用方继续修改。 */
function cloneSnapshot(snapshot: ComputedStyleSnapshot): ComputedStyleSnapshot {
  return Object.fromEntries(
    Object.entries(snapshot).map(([caseId, styles]) => [caseId, { ...styles }])
  );
}

/** 以不受 locale 影响的字典序稳定 case 和 property 输出。 */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
