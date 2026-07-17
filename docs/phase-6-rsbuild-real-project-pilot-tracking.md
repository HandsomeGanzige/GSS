# Phase 6 中型 React + Rsbuild 真实项目 Pilot 推进记录

## 当前状态

- Status: completed
- 开始日期：2026-07-16
- 完成日期：2026-07-17
- 项目入口：`playground/rsbuild-react-css-modules`
- 锁定基线：Rsbuild `2.1.6`、Rspack `2.1.4`、React `19`、Sass/Less plugins `2.0.1`

自动错误边界和 semantic/native computed style 门禁仍由 `fixtures/rsbuild-css-modules` 负责。本 Pilot
用于观察较大 React module graph、多 entry、lazy chunk、真实业务 selector 和调试体验，不进入根
`pnpm verify`。

## 目标与边界

- 主入口复用 5 个懒加载业务路由，混用 CSS、SCSS 与 Less Modules。
- 增加独立 `inspector` entry，观察多入口 HTML、全局 atomic asset、跨模块 cascade 和 ICSS tokens。
- semantic/native 共享 React、CSS Modules、预处理器、资源和 chunk split 配置，只切换 GSS adapter。
- 输出 manifest/report 并记录 analyzer 指标，但不把 Pilot 固定为自动回归 fixture。
- 不扩大到 named exports、source map、SSR/Node、worker、library 或 raw Rspack adapter。

## 实施结果

| 场景 | 实现 |
| --- | --- |
| 主业务入口 | `index.html`，5 个 React lazy routes，CSS/SCSS/Less Modules 与本地 SVG |
| 契约入口 | `inspector.html`，source order、ICSS class/value 同值、独立 lazy CSS Module |
| CSS Modules | `camelCase` locals convention 与 `pilot_[name]__[local]` custom ident |
| 预处理器 | Sass `@use`、Less `@import`、两种 `additionalData` |
| semantic 输出 | 全局 atomic CSS、manifest、report、analyzer analysis，并在两个 HTML 中先于 native CSS link |
| native 对照 | 不注册 adapter，同一份源码与 Rsbuild 原生 extraction |
| 静态观察 | `scripts/inspect-artifacts.mjs` 检查双入口、lazy、SVG、三语言 sources 和契约 probe |

## 验证命令

```bash
pnpm --filter playground-rsbuild-react-css-modules typecheck
pnpm --filter playground-rsbuild-react-css-modules build:semantic
pnpm --filter playground-rsbuild-react-css-modules build:native
pnpm --filter playground-rsbuild-react-css-modules inspect:artifacts
pnpm --filter playground-rsbuild-react-css-modules acceptance
```

## 静态产物结果

- semantic/native build 均通过，均生成 `index.html`、`inspector.html`、lazy JS/CSS 和同 hash SVG。
- semantic build 输出 `static/css/semantic-atomic.css`、manifest/report；两个 HTML 的 atomic link 均在
  entry native CSS 之前。
- manifest/report 覆盖 23 个 CSS Modules source，包含 `.module.css`、`.module.scss` 和
  `.module.less`。
- source-order probe 在锁定版本下相同：native 与 semantic 均由 `ZSourceOrder` 规则获胜。
- ICSS probe 的完整同值 class/value 均保持原生 token；对应 class 按 `ambiguous-export-value` 整类
  fallback，静态检查把该结果作为硬断言。

Analyzer 指标：

| 指标 | 结果 |
| --- | --- |
| source classes | `228` |
| atomic declarations | `289` |
| reused atomic declarations | `923` |
| reuse ratio | `0.7616` |
| unsafe rules | `38` |
| preserved CSS ratio | `0.3009` |
| estimated total diff | `-15658` bytes |
| health | `risky` |

## 浏览器旅程

| 编号 | 模式 | 旅程 | 状态 |
| --- | --- | --- | --- |
| R1 | semantic dev | Overview 与 Build lazy route、模式标识、三语言矩阵 | passed |
| R2 | semantic dev | inspector source order、ICSS token、lazy module | passed |
| R3 | native dev | inspector source order 与 ICSS token 对照 | passed |
| R4 | semantic dev | `390 × 844` 主入口与 inspector 无横向溢出 | passed |
| R5 | semantic/native preview | 两个入口、全部 5 routes、desktop 与 `390 × 844` 对照 | passed |
| R6 | semantic dev | Sass/Less partial 更新与 stale token 清理 | passed |

ICSS 的公开输入只有最终 locals 字符串；class export 与 `:export` value 完整同值时，没有类型证据可以
安全选中其中一个。adapter 因此整类保留 scoped CSS，并让两个 export 都保持原值。inspector 的四张状态卡
在 semantic dev/preview 中均为 `pass`，浏览器仅出现预期的 unsafe/preserved diagnostics，没有 runtime error。

2026-07-16 进一步检查 R1 时发现，旧 dev bridge 会把每个 CSS Module 的完整 atomic CSS 注入独立 style
tag；后加载模块重复输出同名原子类，导致 active nav 的 teal 被 gray 覆盖。adapter 改为单一共享 style
owner 后，active nav computed color 恢复为 `rgb(15, 118, 110)`；页面只有 1 个共享 owner，owner 内重复
atomic selector 数为 0。该问题已下沉到自动 fixture 的跨模块 cascade 回归。

## 收口验收

2026-07-17 完成以下真实浏览器旅程：

- semantic/native preview 的 `index.html` 五个 lazy routes 在 desktop 与 `390 × 844` 下逐项 computed-style
  一致，均无横向溢出。
- `inspector.html` 的 source-order、ICSS class/value、lazy CSS Module 在两种 viewport 下完全一致；
  source-order computed color 为 `rgb(4, 120, 87)`，四张状态卡均为 `pass`。
- semantic dev 临时副本中修改 Sass `@use` partial，brand gap 从 `14px / _gap_14px` 更新为
  `22px / _gap_22px`；修改 Less `@import` partial，按钮从 `rgb(15, 118, 110) / _background_0f766e`
  更新为 `rgb(124, 58, 237) / _background_7c3aed`。旧 token 未留在当前元素，且始终只有一个 shared
  style owner、lazy route 未丢失、控制台无 error。

## 仓库验证

2026-07-17 已完成以下验证：

- `pnpm --filter @semantic-atomic-css/core verify`：通过；5 个 test files、32 项测试，包含新增的
  `ambiguous-export-value` class preservation。
- `pnpm --filter @semantic-atomic-css/rsbuild verify`：通过；4 个 test files、12 项测试，包含 ICSS
  完整同值保守路径、dev atomic key 去重与 readable class collision fail-fast。
- `pnpm --filter @semantic-atomic-css/rsbuild-fixture verify`：通过；真实 build 断言同值 class/value 均不增强。
- `pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual`：通过；base/preprocessor 的完整
  semantic/native dev/preview 矩阵包含 ICSS 同值和跨模块 cascade 回归。
- `pnpm --filter playground-rsbuild-react-css-modules acceptance`：通过；静态检查把 ICSS 保守结果作为硬断言。
- `pnpm typecheck`、`pnpm build`、`pnpm verify`：通过；覆盖全部产品包、fixtures 与 Pilot 类型/构建入口。
- `git diff --check`：通过，构建目录未进入工作区变更列表。

## 收口结论

- ICSS class/value 同值采用整类 fallback，不猜测、不污染非 class export。
- semantic/native preview、双入口、五个 lazy route、窄屏和 inspector 全部一致。
- Sass/Less partial reload 更新到新 computed style 与新 token，无 stale 当前 token。
- Batch 6 completed；后续若要减少同值 alias 的保守损失，需要上游提供可证明的 export 类型证据。
