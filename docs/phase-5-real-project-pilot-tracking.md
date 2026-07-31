# Phase 5 中型 React + Vite 真实项目 Pilot 推进记录

## 当前状态

Status: in_progress

开始日期：2026-07-15

本记录跟踪 `playground/vite-react-css-modules` 在 Phase 5 完成后的真实消费方扩展。自动错误边界与
visual 回归仍由 `fixtures/vite-css-modules` 负责；Pilot 聚焦较大 React module graph 中的人工体验、
产物观察和 partial full reload。

## 目标与边界

- 保持现有 5 个懒加载路由，不新增专门的预处理器演示路由。
- 在真实业务模块中混用 CSS、SCSS 与 Less Modules。
- 覆盖 Sass `@use`、Less `@import`、`additionalData`、本地资源和 `composes` 闭包。
- 对比 semantic/native 的 dev、preview、tokens、computed style 和窄屏布局。
- 不复制 publicDir、自定义 `renderBuiltUrl`、错误依赖和自动浏览器 fixture。
- 不修改 core、analyzer、Vite adapter 公共 API，不向根目录增加命令。

## 实施结果

| 场景 | 实现 |
| --- | --- |
| Sass 首屏模块 | `Shell.module.scss` 使用共享 `_pilot-theme.scss`、嵌套 pseudo/media 和 Vite `additionalData` |
| 资源与 compose | `logoAsset` 引用本地 SVG，实际 `logoMark` 通过 `composes` 关联资源 class |
| Less lazy 模块 | `BuildArtifactPanel.module.less` 使用 `pilot-theme.less`、mixin、嵌套 selector 和 `additionalData` |
| 三语言混用 | 其余 CSS Modules 保持不变，CSS/SCSS/Less 共同注册全局 atomic rules |
| 可观察性 | Shell 和 Build route 显示 semantic/native 模式；Build route 展示语言矩阵和代表性 token |

Pilot 固定使用与自动 fixture 相同的 `sass 1.101.0` 和 `less 4.6.7`。semantic/native 共享同一份
CSS Modules、预处理器和 `assetsInlineLimit: 0` 配置，仅插件列表不同。

## 静态产物验收

执行命令：

```bash
pnpm --filter playground-vite-react-css-modules typecheck
pnpm --filter playground-vite-react-css-modules build:semantic
pnpm --filter playground-vite-react-css-modules build:native
```

当前结果：

- semantic/native build 均通过，均发布 `assets/pilot-mark-[hash].svg`。
- `semantic-atomic.css` 使用最终 `/assets/pilot-mark-[hash].svg`，无 `__VITE_ASSET__` 残留。
- manifest/report 同时包含 `.module.css`、`.module.scss` 和 `.module.less` source id。
- `logoAsset` 与 composed `logoMark` 的 `atomicClassNames` 均为空，report 含两条
  `preserved-class / asset-reference`。
- `display: grid` 等 atomic rule 的 sources 同时包含 CSS、SCSS 与 Less。
- `unsupportedFeatures` 为空，health 为预期的 `risky`，没有进入 `blocked`。

Analyzer 指标：

| 指标 | 结果 |
| --- | --- |
| source classes | `212` |
| atomic declarations | `264` |
| reused atomic declarations | `944` |
| reuse ratio | `0.7815` |
| unsafe rules | `23` |
| preserved rules / declarations | `26 / 59` |
| preserved CSS ratio | `0.2055` |
| before/after raw bytes | `44695 / 15571` |
| before/after gzip bytes | `5191 / 4152` |
| before/after brotli bytes | `4371 / 3624` |
| estimated total diff | `-17044` bytes |

风险来源仍是 Pilot 刻意保留的 unsafe selector 和 Settings route 的一组 shorthand/longhand 顺序冲突；
新增资源保留使 preserved CSS ratio 从 Phase 5 前的 `0.1882` 上升到 `0.2055`，仍低于 `0.3` 门槛。

## 2026-07-27 SEL-02 同语料 artifact 复盘

本节只追加 SEL-02 的 semantic/native artifact 复盘，不改变上方历史人工旅程及本文
`in_progress` 状态。adapter 的自动静态/浏览器边界见
[Phase 3 acceptance](phase-3-acceptance.md)。

- 2026-07-25 `FOUND-02-D` semantic artifact 与 2026-07-27 SEL-02 semantic artifact 的
  `files / sourceClasses / beforeRawCssBytes` 都保持 `17 / 212 / 44695`，可按同语料计算差值；
  semantic/native 两次重建均通过。
- 实际释放 `ModuleMatrix.surfaceCard`、`RuleInspector.ruleCard`、`ScenarioNotes.noteCard`、
  `SelectorMatrix.caseCard` 与 `Shell.topbar` 共 5 个 class，新增 52 个 declaration occurrences，
  拆分为 15 个 atomic definitions 与 37 个 reused occurrences。
- `attribute-selector` unsafe rules 从 9 降至 0，preserved rules/declarations 从 `55 / 206`
  降至 `40 / 154`，preserved CSS ratio 从 `0.4101` 降至 `0.3264`。
- after raw/gzip/brotli CSS 从 `19111 / 4326 / 3796` bytes 变为
  `17960 / 4291 / 3771` bytes；计入 class string 后 estimated total diff 从 `-14974`
  改善到 `-15605` bytes，即改善 631 bytes。
- 复杂 descendant/pseudo/compound evidence 仍让另外 3 个共享 class 整类 fallback。这里只把同语料
  report/manifest 的实际差值记为 SEL-02 收益；早期 exact-only class 与历史 token links 不作为因果值。

## 2026-07-28 SEL-03 selector list 同语料收口

- 实施前将 Modules route 的 `searchField/selectField`、`textControl/selectControl` 和两者
  `:focus-visible` 合并为 3 条真实 selector list，再用旧 Core 封存 semantic/native
  baseline；不修改 JSX、class 使用或视觉属性。
- baseline/current 的 `files / sourceClasses / beforeCssBytes / beforeRawCssBytes` 均为
  `17 / 212 / 44309 / 44341`，语料可比。
- 3 条 `selector-list` 全部消失，4 个目标 class 均保留 semantic token 并获得非空
  atomic mapping；preserved rules/declarations 由 `43 / 170` 降为 `40 / 154`。
- 16 个 source declaration 释放为 32 个 arm registrations，全部复用已有 atomic definitions；
  不将 32 个 reuse occurrence 记为 32 个新 source declaration。
- preserved ratio 由 `0.3492` 降为 `0.3264`；after raw/gzip/brotli 由
  `18592 / 4385 / 3845` 降为 `17960 / 4291 / 3771`。class-string increase 由
  `10810` 增至 `11130`，estimated total diff 仍从 `-14939` 改善到 `-15251`。
- semantic/native preview 在 `1280 × 844` 和 `390 × 844` 下的 Modules route 普通、
  focus-visible computed style 一致；四个 class 的 semantic/native token 数为
  `7/1、7/1、11/1、11/1`，base 与 focus 单-arm CSSOM 均存在。
- artifact 位于 `/private/tmp/gss-selector-list-pilot/{baseline,current}`，浏览器证据位于
  `/private/tmp/gss-selector-list-pilot/pilot-browser-closeout.json`。自动边界见
  [SEL-03 验收](phase-8-selector-list-acceptance.md)。

## 2026-07-29 SEL-01 pseudo-element 同语料 artifact

- 冻结 baseline SHA 清单逐项校验通过，native baseline/current 目录完全相同；未修改 Pilot CSS/JSX。
- `files/sourceClasses/beforeCssBytes/beforeRawCssBytes` 保持 `17/212/44309/44341`。
- 3 条 `pseudo-element` blocker 全消失；只有 `selectorValue` 获得 11 个 mapping，`taskCard` 与
  `diagnosticProbe` 继续由 descendant/compound evidence 保留且保持零 mapping。
- atomic definitions/reuse 为 `255/858 → 259/865`；preserved rules/declarations 为
  `40/154 → 38/143`；preserved ratio 为 `0.3264 → 0.3112`。
- after raw/gzip/brotli 为 `17960/4291/3771 → 17794/4284/3759`；class-string increase
  `11130 → 11240`，estimated total diff `-15251 → -15307`，改善 56 bytes。
- artifact 位于 `/private/tmp/gss-pseudo-element-pilot/{baseline,current}`；完整 hash 与边界见
  [SEL-01 验收](phase-8-pseudo-element-acceptance.md)。Pilot corpus/delta 未因 reason/CSSOM matcher 修复改变；
  独立 Test/Review 与最终 Vite full visual 已通过，SEL-01 状态为 `completed`。

## 2026-07-29 FOUND-04 多 local foundation 评估

- 使用当前 Vite Pilot 的真实 post-CSS-Modules capture 进行一次性 shadow replay；未修改 Pilot source，
  未把 candidate 结果接入 CSS、manifest、report、diagnostic 或 tokens。
- compound 为 `1 exact-only / +40 B`；two-local descendant 为 `6 / +1176 B`；child 为
  `2 / +173 B`；single-local descendant-tag 为 `0 / 0 B`。四项都未通过“双 Pilot 各至少
  2 个 exact-only 且 estimated total diff 不恶化”的门禁。
- 两次 evaluation SHA-256 均为
  `d6d7f011e72b5428d30aaa3dd11138c4197006e7599a8de3728a2766cb2deebb`，capture aggregate
  SHA-256 为 `912376d37aa4a01b98c93e3b7e7d57427fe5d54818ec62d8bda3d849dd36a53d`。
- `FOUND-04` 已 `closed-no-go`，shadow prototype 已回滚；`SEL-04` / `SEL-05` / `SEL-06`
  deferred，不授权 production rewrite。独立 Test/Review 已 PASS；Vite full visual 报告
  `/private/tmp/gss-found04-vite-independent.json` 为 `64 runs / 228 cases / 676 comparisons /
  0 differences`，`passed=true`。adapter pre-image/hash 可独立复核，但任务前正式 Core 完整
  checksum/pre-image 未持久化，Core byte-identical 独立比较为 `not_run`；当前只依赖开发阶段
  比对结论、无 shadow/正式入口未接入与全门禁，继续 semantic fallback 且不扩展 `FOUND-05`。完整口径见
  [FOUND-04 评估](phase-8-multi-local-selector-foundation-evaluation.md)。

## 人工浏览器旅程

| 编号 | 模式 | 旅程 | 状态 |
| --- | --- | --- | --- |
| P1 | semantic/native dev | 全部 5 route、模式标识和核心交互 | partial |
| P2 | semantic/native dev | Build 语言矩阵、SCSS/Less token 与资源图形 | passed |
| P3 | semantic/native dev | `390 × 844` 窄屏布局、hover/focus 与响应式 | partial |
| P4 | semantic/native preview | 核心 computed style 和资源访问对照 | partial |
| P5 | semantic dev | 修改 Sass partial 后 full reload，无 stale token | passed |
| P6 | semantic dev | 修改 Less partial 后 full reload，无 stale token | passed |

本次已完成：

- semantic dev 依次通过 Overview、Modules、Diagnostics、Build、Settings 的核心交互，桌面与
  `390 × 844` 均无横向溢出。
- semantic/native dev 的 Build route 均显示正确模式；SCSS 资源 token 在两种模式下只有 scoped
  compose classes，Less token 在 semantic 中附加 atomic classes、native 中保持单个 scoped class。
- semantic preview 的桌面与窄屏 computed style、最终 SVG URL 和 build atomic token 通过，
  浏览器 console 无 error/warning。
- Sass partial 更新时 Overview 的 React period 从 `7d` 重置为 `24h`，背景色同步更新；
  Less partial 更新时 Build environment 从 `development` 重置为 `production`，token 中只有
  新的 atomic class。恢复源文件后 computed style 与 token 都回到基线。
- 根 `pnpm typecheck`、`pnpm build`、`pnpm verify` 以及 Pilot `build:native` 均通过。

未完成项：

- 浏览器控制层在批量切换 native dev 本地端口时拒绝继续访问；未使用另一套浏览器自动化机制绕过。
- 因此本轮没有重新执行 native 的其余 4 个 route、`390 × 844` 窄屏和 native preview。Phase 4
  对这些未改动 route 已有通过记录，本轮 native dev 已覆盖发生变化的共享 Shell 与 Build/Less 表面，
  但这不能替代新的完整 native preview 记录。

只有上述旅程、根 `typecheck/build/verify` 和最终 diff 检查完成后，本文状态才改为 `completed`。
