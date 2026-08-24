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

## 2026-07-27 SEL-02 同语料 artifact 复盘

本节是在已完成 Pilot 上追加的 SEL-02 产物复盘，不改变 2026-07-17 的历史收口结论。adapter 的
自动静态/浏览器边界见
[Phase 6 Rsbuild acceptance](phase-6-rsbuild-rspack-adapter-acceptance.md)。

- 2026-07-25 `FOUND-02-D` semantic artifact 与 2026-07-27 SEL-02 semantic artifact 的
  `files / sourceClasses / beforeRawCssBytes` 都保持 `23 / 228 / 46943`，可按同语料计算差值；
  semantic/native 两次重建均通过。
- 与 Vite 共享业务语料一致，实际释放 5 个 class、52 个 declaration occurrences，拆分为
  15 个 atomic definitions 与 37 个 reused occurrences。
- 旧 11 条 `attribute-selector` 中 9 条释放；`InspectorApp.card` 的 risk arm 直接命中同 class
  原始顺序竞争并报 1 条 `attribute-cascade-order`，pass arm 只因 class-wide 传播继续 fallback，
  不产生第二条 public diagnostic。
- preserved rules/declarations 从 `86 / 324` 降至 `71 / 272`，preserved CSS ratio 从
  `0.5158` 降至 `0.4569`。after raw/gzip/brotli CSS 从 `24285 / 5078 / 4455` bytes 变为
  `23143 / 5052 / 4436` bytes；计入 class string 后 estimated total diff 从 `-12628`
  改善到 `-13250` bytes，即改善 622 bytes。
- 复杂 descendant/pseudo/compound evidence 继续保守 fallback。这里只把同语料 report/manifest
  的实际差值记为 SEL-02 收益；早期 exact-only class 与历史 token links 不作为因果值。

## 2026-07-28 SEL-03 selector list 同语料收口

- Modules route 使用与 Vite 完全相同的 3 条业务 list；Rsbuild 原生 CSS 管线另在
  Inspector、Diagnostics 和 Overview 聚合出 7 条全 eligible list，因此 baseline 共有
  10 条 `selector-list`、15 个只受该原因阻断的 class。
- baseline/current 的 `files / sourceClasses / beforeCssBytes / beforeRawCssBytes` 均为
  `23 / 228 / 46899 / 46943`，与 native 使用同一业务 source。
- 10 条 `selector-list` 全部消失，15/15 目标 class 保留 semantic token 并获得非空
  atomic mapping。连接分量传播同时解锁关联 eligible rules，preserved rules/declarations
  由 `71 / 272` 降为 `48 / 178`。
- 94 个 source declaration 被释放；registry 新增 135 个 registration/token links，拆为
  16 个 definitions 和 119 个 reuse。arm occurrence 与 source declaration 分开报告。
- preserved ratio 由 `0.4569` 降为 `0.3369`；after raw/gzip/brotli 由
  `23143 / 5052 / 4436` 降为 `20082 / 4773 / 4199`。class-string increase 由
  `10550` 增至 `11900`，estimated total diff 从 `-13250` 改善到 `-14961`。
- semantic/native preview 在 `1280 × 844` 和 `390 × 844` 下的 Modules route 普通、
  focus-visible computed style、semantic token 与单-arm CSSOM 全部一致。
- artifact 位于 `/private/tmp/gss-selector-list-pilot/{baseline,current}`，详细验收见
  [SEL-03 验收](phase-8-selector-list-acceptance.md)。

## 2026-07-29 SEL-01 pseudo-element 同语料 artifact

- 冻结 baseline SHA 清单逐项校验通过，native baseline/current 目录完全相同；未修改 Pilot CSS/JSX。
- `files/sourceClasses/beforeCssBytes/beforeRawCssBytes` 保持 `23/228/46899/46943`。
- Rspack baseline 的 3 条 `unsupported-pseudo` blocker 全消失；只有 `selectorValue` 获得 11 个
  mapping，`taskCard` 与 `diagnosticProbe` 继续由 descendant/compound evidence 保留且保持零 mapping。
- atomic definitions/reuse 为 `283/907 → 287/914`；preserved rules/declarations 为
  `48/178 → 46/167`；preserved ratio 为 `0.3369 → 0.3235`。
- after raw/gzip/brotli 为 `20082/4773/4199 → 19915/4762/4180`；class-string increase
  `11900 → 12010`，estimated total diff `-14961 → -15018`，改善 57 bytes。
- artifact 位于 `/private/tmp/gss-pseudo-element-pilot/{baseline,current}`；完整 hash 与边界见
  [SEL-01 验收](phase-8-pseudo-element-acceptance.md)。Pilot corpus/delta 未因 reason/CSSOM matcher 修复改变；
  独立 Test/Review 与最终 Rsbuild full visual 已通过，SEL-01 状态为 `completed`。

## 2026-07-29 FOUND-04 多 local foundation 评估

- 使用当前 Rsbuild Pilot 的真实 post-CSS-Modules capture 进行一次性 shadow replay；未修改 Pilot source，
  未把 candidate 结果接入 CSS、manifest、report、diagnostic 或 tokens。
- compound 为 `1 exact-only / +16 B`；two-local descendant 为 `6 / +1170 B`；child 为
  `2 / +173 B`；single-local descendant-tag 为 `0 / 0 B`。四项都未通过“双 Pilot 各至少
  2 个 exact-only 且 estimated total diff 不恶化”的门禁。
- 两次 evaluation SHA-256 均为
  `c402d38773f06dd1b33248f50b86d30dda160a0d46089380a1e5cf5ed3695466`，capture aggregate
  SHA-256 为 `a789dbe3057314da4760b2c1d6e77612eb491e192d176c11e26202e8033de7cc`。
- current report 只有 1 条 direct attribute risk 与 1 条 class-wide follower，不是 2 条 public
  diagnostic；report hash 刷新为
  `c0b811dbf8003982a3fbf474fad690321b8b11d0c0f3ec4c3d86c7cf850b8e87`，CSS、manifest 与 tokens 不变。
- `FOUND-04` 已 `closed-no-go`，shadow prototype 已回滚；`SEL-04` / `SEL-05` / `SEL-06`
  deferred，不授权 production rewrite。独立 Test/Review 已 PASS；Rsbuild full visual 报告
  `/private/tmp/gss-found04-rsbuild-independent.json` 为 `8 runs / 204 cases / 464 comparisons /
  0 differences`，`passed=true`。adapter pre-image/hash 可独立复核，但任务前正式 Core 完整
  checksum/pre-image 未持久化，Core byte-identical 独立比较为 `not_run`；当前只依赖开发阶段
  比对结论、无 shadow/正式入口未接入与全门禁，继续 semantic fallback 且不扩展 `FOUND-05`。完整口径见
  [FOUND-04 评估](phase-8-multi-local-selector-foundation-evaluation.md)。

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
