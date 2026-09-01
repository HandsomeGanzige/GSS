/**
 * 不依赖框架、使用 Shadow DOM 隔离的 GSS browser overlay runtime。
 *
 * @module devtools/overlay
 */
import { isValidDevReportEndpoint } from './protocol.js';

/** overlay runtime 的生成选项。 */
export type BrowserOverlayRuntimeOptions = {
  /** dev report API 的同源绝对 pathname。 */
  endpoint: string;
  /** 轮询间隔，默认 1500ms，最小 250ms。 */
  pollIntervalMs?: number;
};

/**
 * 生成可注入 dev HTML 的独立 browser runtime。
 *
 * @remarks
 * runtime 只读取同源 report API；UI 挂在 Shadow DOM 中，不向业务 DOM 注入全局 CSS。动态 report
 * 内容只通过 `textContent` 写入，避免 diagnostics/source id 形成 HTML 注入面。
 *
 * @param options - endpoint 与轮询间隔。
 * @returns 可作为 inline module script children 的 JavaScript。
 */
export function createBrowserOverlayRuntime(options: BrowserOverlayRuntimeOptions): string {
  if (!isValidDevReportEndpoint(options.endpoint)) {
    throw new Error(`[semantic-atomic-css] invalid-dev-report-endpoint endpoint=${options.endpoint}`);
  }

  const requestedInterval = options.pollIntervalMs ?? 1_500;
  if (!Number.isFinite(requestedInterval) || requestedInterval <= 0) {
    throw new Error(`[semantic-atomic-css] invalid-overlay-poll-interval value=${String(requestedInterval)}`);
  }
  const interval = Math.max(250, Math.floor(requestedInterval));
  const endpoint = JSON.stringify(options.endpoint);

  return `(() => {
  const marker = 'data-semantic-atomic-css-overlay';
  if (document.querySelector('[' + marker + ']')) return;
  const endpoint = ${endpoint};
  const host = document.createElement('aside');
  host.setAttribute(marker, '');
  host.setAttribute('aria-label', 'GSS development report');
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = \`<style>
    :host { all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; color-scheme: dark; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
    button { border: 1px solid #334155; border-radius: 999px; background: #0f172a; color: #e2e8f0; padding: 8px 12px; cursor: pointer; box-shadow: 0 8px 24px rgb(15 23 42 / .3); }
    button[data-health="ready"] { border-color: #10b981; }
    button[data-health="risky"] { border-color: #f59e0b; }
    button[data-health="blocked"], button[data-health="offline"] { border-color: #ef4444; }
    section { position: absolute; right: 0; bottom: 42px; width: min(360px, calc(100vw - 32px)); max-height: min(520px, calc(100vh - 80px)); overflow: auto; box-sizing: border-box; border: 1px solid #334155; border-radius: 12px; background: #020617; color: #cbd5e1; padding: 14px; box-shadow: 0 16px 40px rgb(2 6 23 / .45); }
    section[hidden] { display: none; }
    h2 { margin: 0 0 10px; color: #f8fafc; font: 600 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
    dl { display: grid; grid-template-columns: 1fr auto; gap: 5px 12px; margin: 0; }
    dt { color: #94a3b8; } dd { margin: 0; color: #f8fafc; }
    p { margin: 10px 0 0; color: #94a3b8; overflow-wrap: anywhere; }
  </style><button type="button" aria-expanded="false" data-health="idle">GSS · idle</button><section hidden><h2>Semantic Atomic CSS</h2><dl></dl><p></p></section>\`;
  const button = shadow.querySelector('button');
  const panel = shadow.querySelector('section');
  const list = shadow.querySelector('dl');
  const note = shadow.querySelector('p');
  button.addEventListener('click', () => {
    const open = panel.hasAttribute('hidden');
    panel.toggleAttribute('hidden', !open);
    button.setAttribute('aria-expanded', String(open));
  });
  // 只用 DOM textContent 重建展示行，不把 report 字段解析为 HTML。
  const setRows = (rows) => {
    list.replaceChildren();
    for (const [label, value] of rows) {
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = label;
      detail.textContent = String(value);
      list.append(term, detail);
    }
  };
  let refreshInFlight = false;
  // 只验证 overlay 实际展示的当前字段，避免在浏览器中复制完整 report 模型。
  const invalidPayload = () => {
    throw new Error('[semantic-atomic-css] invalid-dev-report-payload');
  };
  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
  const validatePayload = (payload) => {
    if (!isRecord(payload)) invalidPayload();
    if (payload.adapter !== 'vite' && payload.adapter !== 'rsbuild' && payload.adapter !== 'webpack') invalidPayload();
    if (payload.status !== 'idle' && payload.status !== 'ready' && payload.status !== 'error') invalidPayload();
    if (!Array.isArray(payload.environments)) invalidPayload();
    if (payload.status === 'idle' && payload.environments.length !== 0) invalidPayload();
    if (payload.status === 'ready' && payload.environments.length === 0) invalidPayload();
    if (payload.status === 'error' && typeof payload.error !== 'string') invalidPayload();
    if (payload.status === 'idle' || payload.status === 'error') return payload;
    for (const environment of payload.environments) {
      if (!isRecord(environment) || !isRecord(environment.report)) invalidPayload();
      const report = environment.report;
      if (!isRecord(report.summary) || !isRecord(report.analysis)) invalidPayload();
      if (!isRecord(report.analysis.health) || !isRecord(report.analysis.size)) invalidPayload();
      if (!['ready', 'risky', 'blocked'].includes(report.analysis.health.status)) invalidPayload();
      if (!isFiniteNumber(report.summary.files)) invalidPayload();
      if (!isFiniteNumber(report.summary.atomicDeclarations)) invalidPayload();
      if (!isFiniteNumber(report.summary.unsafeRules)) invalidPayload();
      if (!isFiniteNumber(report.summary.preservedRules)) invalidPayload();
      if (!isFiniteNumber(report.analysis.size.estimatedTotalDiffBytes)) invalidPayload();
    }
    return payload;
  };
  // 同一时刻只允许一个 report 请求，避免旧响应覆盖新状态。
  const refresh = async () => {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      const response = await fetch(endpoint, { headers: { accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const payload = validatePayload(await response.json());
      if (payload.status === 'idle') {
        button.dataset.health = 'idle';
        button.textContent = 'GSS · idle';
        setRows([['Adapter', payload.adapter], ['Modules', 0]]);
        note.textContent = '等待 CSS Modules 完成首次转换。';
        return;
      }
      if (payload.status === 'error') {
        button.dataset.health = 'blocked';
        button.textContent = 'GSS · error';
        setRows([['Adapter', payload.adapter], ['Last good environments', payload.environments.length]]);
        note.textContent = payload.error;
        return;
      }
      const reports = payload.environments.map((environment) => environment.report);
      const priority = { ready: 0, risky: 1, blocked: 2 };
      let health = 'ready';
      let files = 0;
      let atomic = 0;
      let unsafe = 0;
      let preserved = 0;
      let sizeDiff = 0;
      for (const report of reports) {
        const next = report.analysis.health.status;
        if (priority[next] > priority[health]) health = next;
        files += report.summary.files;
        atomic += report.summary.atomicDeclarations;
        unsafe += report.summary.unsafeRules;
        preserved += report.summary.preservedRules;
        sizeDiff += report.analysis.size.estimatedTotalDiffBytes;
      }
      button.dataset.health = health;
      button.textContent = 'GSS · ' + health;
      setRows([['Adapter', payload.adapter], ['Files', files], ['Atomic declarations', atomic], ['Unsafe rules', unsafe], ['Preserved rules', preserved], ['Estimated diff', (sizeDiff >= 0 ? '+' : '') + sizeDiff + ' B']]);
      note.textContent = 'Report API: ' + endpoint;
    } catch (error) {
      button.dataset.health = 'offline';
      button.textContent = 'GSS · offline';
      setRows([['Report API', endpoint]]);
      note.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      refreshInFlight = false;
    }
  };
  document.documentElement.append(host);
  void refresh();
  let timer;
  // BFCache 离开时停止轮询，恢复页面时重建唯一 timer。
  const startPolling = () => {
    if (timer !== undefined) return;
    timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, ${interval});
  };
  const stopPolling = () => {
    if (timer === undefined) return;
    window.clearInterval(timer);
    timer = undefined;
  };
  startPolling();
  window.addEventListener('pagehide', stopPolling);
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    startPolling();
    if (!document.hidden) void refresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
})();`;
}
