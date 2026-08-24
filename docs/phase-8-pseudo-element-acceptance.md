# Phase 8 SEL-01 单 local anchor 伪元素验收

## 状态

- Status: completed
- 日期：2026-07-29
- 独立 Retest / Rereview：最终通过，SEL-01 已收口

## 自动覆盖

- Core：modern/legacy before/after、spelling identity、near-miss、alias cascade、A-B-A、
  shorthand/longhand、media/supports、before/after 隔离、selector-list 全量 fallback、
  non-exported/config/nested/unsafe evidence 与 fresh-transformer 零部分 registry。
- Vite/Rsbuild package：generic descriptor mapping、alias/list fallback，以及 HMR stale token/CSS 清理。
- 双 fixture static：真实构建 token、单-arm selector、semantic class preservation 与无 scoped duplicate。
- 双 fixture visual 脚本：semantic/native dev/preview、desktop/narrow、before/after computed content、颜色、
  display、宽高/间距与 semantic-only token 对应 CSSOM rule；CSSOM assertion 接受 Chrome 将 legacy
  pseudo element 序列化为双冒号，但 static assertion 继续严格检查输入 spelling。

## 本轮证据

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @semantic-atomic-css/core verify` | passed（161 tests） |
| Vite/Rsbuild 定向 package tests | passed |
| `pnpm --filter @semantic-atomic-css/vite-fixture verify` | passed |
| `pnpm --filter @semantic-atomic-css/rsbuild-fixture verify` | passed |
| Vite fixture `test:visual` | passed：`/private/tmp/gss-vite-pseudo-element-final-retest.json`，`64 / 228 / 676 / 0`，`summary.passed=true` |
| Rsbuild fixture `test:visual` | passed：`/private/tmp/gss-rsbuild-pseudo-element-retest.json`，`8 / 204 / 464 / 0`，`summary.passed=true` |
| 双 fixture CSSOM serialization self-test | passed：模拟 legacy `:before/:after` canonicalize 为双冒号 |
| 根 `pnpm verify` | passed（Core 161、Analyzer 10、Devtools 19、Vite 41、Rsbuild 23 tests；双 fixture static passed） |

reason 回归覆盖同时包含 pseudo alias 与 attribute/pseudo-class 风险：前者的 diagnostic、class
`unsafeReasons` 与 preserved rule reason 为既有 `pseudo-element`，后者仍为
`attribute-cascade-order`；base、普通 pseudo 和 selector-list 连接传播只执行 class-wide fallback，
不伪造 public reason，fresh transformer 的 registry/manifest 保持零部分注册。

## 独立 Review/Test 修复链

1. 首轮 Review 报告 P2：pseudo-element alias cascade guard 的 public diagnostic、class
   `unsafeReasons` 与 preserved rule reason 错用 `attribute-cascade-order`。修复后 pseudo candidate 使用
   既有 `pseudo-element`，attribute candidate 保持 `attribute-cascade-order`，class-wide propagation
   不伪造 reason，focused rereview PASS。
2. 首轮 full visual 因 Chrome 将 legacy `:before` / `:after` CSSOM selector 标准化为双冒号而失败。
   matcher 只在浏览器 `selectorText` 断言层接受同 generated box alias；Core/static 的 input spelling
   contract 未放宽。修复后 Rsbuild full visual 报告
   `/private/tmp/gss-rsbuild-pseudo-element-retest.json` PASS：runs/cases/comparisons/differences 为
   `8 / 204 / 464 / 0`。
3. Vite 首次 focused retest 又暴露 visual capture 已改为 `expectedSelectors[]`，attribute/SCSS guarded
   后置断言却仍读取旧 `expectedSelector`，导致完整 selector、token、property 与 value 均正确时仍失败；
   这不是 Core、stale build/port 或 adapter production 问题。统一严格 matcher 并加入错误 pseudo box、
   selector list、token、property 的负向 mutation self-test 后，最终报告
   `/private/tmp/gss-vite-pseudo-element-final-retest.json` PASS：`64 / 228 / 676 / 0`。

## 双 Pilot 同语料 artifact

`/private/tmp/gss-pseudo-element-pilot/baseline.sha256` 自身 SHA-256 为
`4e0d162ba27f1604ac80fa489e9c15fd16bd391123a8039a24bac0ed2a50f670`，其中列出的全部 baseline
文件在实施后逐项校验为 `OK`；semantic/native current 位于同目录 `current/`。两端 native 目录与
baseline `diff -qr` 均无差异，证明未修改 Pilot 业务语料制造收益。

| 指标 | Vite | Rsbuild |
| --- | ---: | ---: |
| files / sourceClasses / beforeCssBytes | `17 / 212 / 44309`（不变） | `23 / 228 / 46899`（不变） |
| beforeRawCssBytes | `44341`（不变） | `46943`（不变） |
| 旧 pseudo blocker | `pseudo-element: 3 → 0` | `unsupported-pseudo: 3 → 0` |
| atomic definitions / reuse | `255/858 → 259/865`（`+4/+7`） | `283/907 → 287/914`（`+4/+7`） |
| preserved rules / declarations | `40/154 → 38/143` | `48/178 → 46/167` |
| preserved ratio | `0.3264 → 0.3112` | `0.3369 → 0.3235` |
| after raw / gzip / brotli | `17960/4291/3771 → 17794/4284/3759` | `20082/4773/4199 → 19915/4762/4180` |
| class-string increase | `11130 → 11240` | `11900 → 12010` |
| estimated total diff | `-15251 → -15307` | `-14961 → -15018` |

`selectorValue` 的 9 条 base declaration 与 2 条 pseudo declaration 形成 11 个 mapping，class string
由 42 bytes 增至 152 bytes；4 个新 definition、7 个 reuse 与 source declaration 数一致。
`taskCard`、`diagnosticProbe` 都保持零 mapping，分别继续由 `descendant-selector`，以及
`compound-class-selector + descendant-selector` 保留；SEL-01 只移除它们不再适用的旧 pseudo reason。

| Adapter | Artifact | Baseline SHA-256 | Current SHA-256 |
| --- | --- | --- | --- |
| Vite | report | `7d6811675c0a14ce0b034a136a04692d38421441581ab731c44ff2beb3d3dba1` | `31585ddd591945f2b51a1e06870b8de591597303043594aacb39eb08627e9f76` |
| Vite | manifest | `f726c8462161cfe9398599ca544d40ca1ba86550d9482836a9a850c009e1af8a` | `4fe3f465972aa973ff40fecc7a098b160615430c7dff9f3fb959bd59c61bd67c` |
| Vite | atomic CSS | `9cd433a7a53d2f2862d86e5a318ff6cfb20ab2ba934a6a6a0f265b48563e10c0` | `d03cdfaadf6fa5c8061bb3f1f3564e8ebdbb49b7de376f45f6446e6e8d101e0c` |
| Rsbuild | report | `a18365e0b2ab3419df67592a60c5871ec2290e97cb21d40e3d8a91ffbf51a356` | `851b3e99132c53f256a6c8b1236b0f00929b92362f3f485da68e0a5378ba6670` |
| Rsbuild | manifest | `3e32912a17285b93c7a5f11665ac5e9275ac60ce9ba98b4c588508ebdeac7a4de` | `b6b538561f32916ac57e56aed19c15283dfaa28cdb890d22b85b428c82426e92` |
| Rsbuild | atomic CSS | `f5d1a77ee920afc6341944563dcaa40f29046432d79956afb981d1e291032cd1` | `58a9c7c0f96d5bee2a25ea23017bce54076b71e319c34dbe5a52c9359a3cdc14` |

## 收口结论

- Core、Vite/Rsbuild package、双 fixture static 与根 `pnpm verify` 最终通过。
- 独立 Test 已覆盖真实 Chrome CSSOM canonicalization、computed pseudo style 与 semantic-only token 绑定；
  独立 Review/focused rereview 已覆盖 reason 归属、class-wide 传播和零部分 registry。
- Pilot corpus、hash 与 delta 未因修复改变；SEL-01 状态为 `completed`。
