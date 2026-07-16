# Phase 6 中型 React + Rsbuild 真实项目 Pilot 推进记录

## 当前状态

- Status: in_progress
- 开始日期：2026-07-16
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
- ICSS probe 发现 class token 和同值非 class export 都被追加 atomic classes；该结果证明 adapter 当前
  不能仅凭 locals 字符串稳定区分 class 与 ICSS value。

Analyzer 指标：

| 指标 | 结果 |
| --- | --- |
| source classes | `228` |
| atomic declarations | `291` |
| reused atomic declarations | `925` |
| reuse ratio | `0.7607` |
| unsafe rules | `38` |
| preserved CSS ratio | `0.2954` |
| estimated total diff | `-15666` bytes |
| health | `risky` |

## 浏览器旅程

| 编号 | 模式 | 旅程 | 状态 |
| --- | --- | --- | --- |
| R1 | semantic dev | Overview 与 Build lazy route、模式标识、三语言矩阵 | passed |
| R2 | semantic dev | inspector source order、ICSS token、lazy module | partial |
| R3 | native dev | inspector source order 与 ICSS token 对照 | passed |
| R4 | semantic dev | `390 × 844` 主入口与 inspector 无横向溢出 | passed |
| R5 | semantic/native preview | 两个入口与全部 5 routes 对照 | pending |
| R6 | semantic dev | Sass/Less partial 更新与 stale token 清理 | pending |

R2 标记为 `partial` 是因为页面与 lazy chunk 均正常，但 ICSS 非 class export 被错误增强；这是 adapter
正确性问题，不是 Pilot 页面故障。浏览器仅出现预期的 unsafe/preserved diagnostics，没有 runtime error。

2026-07-16 进一步检查 R1 时发现，旧 dev bridge 会把每个 CSS Module 的完整 atomic CSS 注入独立 style
tag；后加载模块重复输出同名原子类，导致 active nav 的 teal 被 gray 覆盖。adapter 改为单一共享 style
owner 后，active nav computed color 恢复为 `rgb(15, 118, 110)`；页面只有 1 个共享 owner，owner 内重复
atomic selector 数为 0。该问题已下沉到自动 fixture 的跨模块 cascade 回归。

## 本轮仓库验证

2026-07-16 已完成以下验证：

- `pnpm --filter @semantic-atomic-css/rsbuild verify`：通过；4 个 test files、11 项测试，包含 dev
  atomic key 去重与 readable class collision fail-fast。
- `pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual`：通过；base/preprocessor 的完整
  semantic/native dev/preview 矩阵包含新增的跨模块 cascade 回归。
- `pnpm --filter playground-rsbuild-react-css-modules acceptance`：通过；完成 typecheck、semantic/native
  build 与静态产物检查，并按预期报告 ICSS token 分类风险。
- `pnpm typecheck`：通过，包含 Rsbuild adapter、fixture 与两个 Pilot。
- `pnpm build`：通过；semantic build 输出的 unsafe selector / preserved class 信息均为预期保守诊断。
- `pnpm verify`：通过；core、analyzer、Rsbuild adapter、Vite adapter 及两套 fixture 未发现回归。
- `git diff --check`：通过，构建目录未进入工作区变更列表。

## 收口条件

- 修复或 fail fast 处理 ICSS class/value 同值歧义，并让 inspector semantic 状态恢复为 `pass`。
- 完成 semantic/native preview 的主入口、inspector、5 routes 与窄屏对照。
- 完成 Sass/Less partial 更新旅程，确认无 stale CSS/token。
- 重新运行根 `pnpm typecheck`、`pnpm build`、`pnpm verify` 并检查最终 diff。
