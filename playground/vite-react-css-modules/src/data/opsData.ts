import type { ActivityRow } from '../components/ActivityTable';
import type { ArtifactCheck } from '../components/BuildArtifactPanel';
import type { DebugTokenGroup } from '../components/DebugPanel';
import type { MetricItem } from '../components/MetricsGrid';
import type { ModuleSurface } from '../components/ModuleMatrix';
import type { PipelineStage } from '../components/PipelineBoard';
import type { RuleCard } from '../components/RuleInspector';
import type { ScenarioNote } from '../components/ScenarioNotes';
import type { SelectorCase } from '../components/SelectorMatrix';

export const metrics: MetricItem[] = [
  {
    label: 'Atomic rules',
    value: '428',
    delta: '+18%',
    tone: 'positive',
    detail: '跨模块重复 declaration 会在 build 阶段聚合去重。'
  },
  {
    label: 'Fallback selectors',
    value: '14',
    delta: 'tracked',
    tone: 'warning',
    detail: '保留 descendant、attribute 与 pseudo-element，验证正确性优先。'
  },
  {
    label: 'Module surfaces',
    value: '12',
    delta: '+7',
    tone: 'neutral',
    detail: '多个 CSS Modules 文件共同参与全局 CSS asset 输出。'
  },
  {
    label: 'Route views',
    value: '5',
    delta: 'lazy',
    tone: 'positive',
    detail: '无依赖 hash route 配合 lazy chunk 覆盖真实 SPA 加载路径。'
  }
];

export const stages: PipelineStage[] = [
  {
    title: 'Capture',
    count: 12,
    health: 'stable',
    tasks: [
      { title: 'CSS Modules import scan', owner: 'Vite adapter', meta: 'safe selectors', priority: 'high' },
      { title: 'Scoped class registry', owner: 'ScopeStrategy', meta: 'stable hash', priority: 'medium' }
    ]
  },
  {
    title: 'Transform',
    count: 24,
    health: 'warning',
    tasks: [
      { title: 'Atomic declaration split', owner: 'Core engine', meta: '@media + @supports', priority: 'high' },
      { title: 'Unsafe selector fallback', owner: 'Core report', meta: 'preserved CSS', priority: 'high' }
    ]
  },
  {
    title: 'Emit',
    count: 8,
    health: 'stable',
    tasks: [
      { title: 'Global CSS asset', owner: 'Build hook', meta: 'semantic-atomic.css', priority: 'high' },
      { title: 'HTML stylesheet link', owner: 'Adapter emit', meta: 'default manifest off', priority: 'low' }
    ]
  }
];

export const activities: ActivityRow[] = [
  { time: '09:14', module: 'Shell.module.css', event: 'topbar safe rules atomized', tone: 'success' },
  { time: '09:27', module: 'MetricsGrid.module.css', event: 'compound metric state preserved', tone: 'risk' },
  { time: '10:03', module: 'PipelineBoard.module.css', event: 'task pseudo-element fallback emitted', tone: 'risk' },
  { time: '10:31', module: 'ActivityTable.module.css', event: 'table row declarations atomized', tone: 'success' },
  { time: '11:08', module: 'RuleInspector.module.css', event: 'attribute selector warning visible', tone: 'warning' }
];

export const rules: RuleCard[] = [
  {
    title: 'Safe pseudo classes',
    level: 'pass',
    summary: ':hover、:focus-visible、:disabled 走 atomic 输出。'
  },
  {
    title: 'Unsafe fallback',
    level: 'warning',
    summary: 'descendant、attribute、pseudo-element 保留为 scoped fallback CSS。'
  },
  {
    title: 'Build aggregation',
    level: 'pass',
    summary: '多个模块最终写入同一个 assets/semantic-atomic.css。'
  }
];

export const debugGroups: DebugTokenGroup[] = [
  {
    label: 'Metric card',
    tokenKey: 'metricCard',
    note: 'semantic scoped class 与多个 atomic class 同时存在。'
  },
  {
    label: 'Pipeline task',
    tokenKey: 'taskCard',
    note: 'safe declaration atomized，伪元素边线走 fallback。'
  },
  {
    label: 'Activity row',
    tokenKey: 'row',
    note: '普通行样式 atomized，data-tone selector preserved。'
  }
];

export const moduleSurfaces: ModuleSurface[] = [
  {
    name: 'Shell',
    files: ['Shell.tsx', 'Shell.module.css'],
    coverage: 'hash route nav、hero、disabled button、attribute fallback',
    weight: 'large',
    state: 'active'
  },
  {
    name: 'Overview route',
    files: ['OverviewRoute.tsx', 'MetricsGrid.module.css', 'PipelineBoard.module.css'],
    coverage: 'KPI、pipeline、hover、@supports、descendant fallback',
    weight: 'large',
    state: 'active'
  },
  {
    name: 'Modules route',
    files: ['ModulesRoute.tsx', 'ModuleMatrix.module.css', 'ScenarioNotes.module.css'],
    coverage: '文件矩阵、重复 declaration、attribute fallback',
    weight: 'medium',
    state: 'active'
  },
  {
    name: 'Diagnostics route',
    files: ['DiagnosticsRoute.tsx', 'SelectorMatrix.module.css', 'RuleInspector.module.css'],
    coverage: 'safe/unsafe selector 分类、pseudo-element fallback',
    weight: 'medium',
    state: 'watch'
  },
  {
    name: 'Build route',
    files: ['BuildRoute.tsx', 'BuildArtifactPanel.module.css', 'DebugPanel.module.css'],
    coverage: '产物断言、tokens 输出、深色 debug panel',
    weight: 'medium',
    state: 'active'
  },
  {
    name: 'Settings route',
    files: ['SettingsRoute.tsx', 'SettingsRoute.module.css'],
    coverage: '条件 class、表单校验、checkbox、disabled 与保存状态',
    weight: 'medium',
    state: 'active'
  }
];

export const selectorCases: SelectorCase[] = [
  { selector: '.actionButton:hover', mode: 'safe', reason: 'supported-pseudo', output: 'atomic hover rule' },
  { selector: '.actionButton:focus-visible', mode: 'safe', reason: 'supported-pseudo', output: 'atomic focus-visible rule' },
  { selector: '.actionButton:disabled', mode: 'safe', reason: 'supported-pseudo', output: 'atomic disabled rule' },
  { selector: '.metricCard.warning', mode: 'fallback', reason: 'compound-class-selector', output: 'preserved scoped CSS' },
  { selector: '.taskCard::before', mode: 'fallback', reason: 'pseudo-element', output: 'preserved scoped CSS' },
  { selector: ".row[data-tone='risk'] .state", mode: 'fallback', reason: 'descendant-selector', output: 'preserved scoped CSS' },
  { selector: ".artifactRow[data-status='pass'] .statusBadge", mode: 'fallback', reason: 'descendant-selector', output: 'preserved scoped CSS' }
];

export const artifactChecks: ArtifactCheck[] = [
  { label: 'HTML link injection', value: 'assets/semantic-atomic.css', status: 'pass' },
  { label: 'Global atomic asset', value: 'semantic-atomic.css', status: 'pass' },
  { label: 'Manifest opt-in', value: 'semantic-atomic-manifest.json', status: 'pass' },
  { label: 'Report analysis', value: 'semantic-atomic-report.json', status: 'pass' },
  { label: 'Unsafe fallback', value: 'scoped preserved CSS', status: 'watch' }
];

export const scenarioNotes: ScenarioNote[] = [
  {
    title: 'Route shell',
    detail: 'hash route 只改变 React view，不改变 Vite adapter API，用于模拟 SPA 多入口视图。',
    tone: 'info'
  },
  {
    title: 'CSS reuse',
    detail: '多个模块重复使用 display、gap、border-radius、font-weight，build 阶段应聚合 atomic class。',
    tone: 'success'
  },
  {
    title: 'Fallback budget',
    detail: '保留少量 unsafe selector，warning 应可预期，CSS 不应被错误丢弃。',
    tone: 'warning'
  }
];
