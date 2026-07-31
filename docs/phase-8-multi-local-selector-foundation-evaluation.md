# Phase 8 多 Local Selector Foundation 评估

## 文档状态

- 评估项：`FOUND-04`
- 决策状态：`closed-no-go`
- 决策日期：2026-07-29
- Development 状态：rollback 与文档收口已完成
- 独立 Test：PASS
- 独立 Review：PASS（无 actionable finding）

本文记录 `FOUND-04` 一次性、非生产 shadow 评估的决策证据。结论只关闭本次评估，
不授权把 prototype 接入正式 transformer，不开放 multi-local、compound、descendant、child 或
descendant-tag production rewrite，也不改变既有 CSS、manifest、tokens、公开 diagnostic/report schema。

## 决策门禁与结论

每个 policy 独立判断，门禁要求 Vite 与 Rsbuild Pilot 各至少有 2 个 exact-only class，且
estimated total diff 不恶化。mixed class、policy 组合、fixture 与 authored 上限均不计入通过条件。

| Policy | Vite exact-only / total delta | Rsbuild exact-only / total delta | 结论 |
| --- | ---: | ---: | --- |
| `compound` | `1 / +40 B` | `1 / +16 B` | no-go：exact-only 不足且体积恶化 |
| `two-local-descendant` | `6 / +1176 B` | `6 / +1170 B` | no-go：体积恶化 |
| `child` | `2 / +173 B` | `2 / +173 B` | no-go：体积恶化 |
| `single-local-descendant-tag` | `0 / 0 B` | `0 / 0 B` | no-go：没有双 Pilot exact-only 收益 |

四项均未同时满足门禁，因此 `FOUND-04` 为 `closed-no-go`。descendant 的 6 个 exact-only、
child 的 2 个 exact-only 或其组合都不能解释为 go，也不能作为 `SEL-05` / `SEL-06` 的实施授权。

## 原始复算口径

`definitions/reuse` 是单个 policy 启用后的全 corpus replay 值；`links` 只是 candidate token links；
`preserved Δ` 为 candidate 减 baseline。下表列出决策使用的 raw 与 total delta，不用 authored 上限
替代实际收益；gzip/brotli 明细保留在原始 evaluation 证据中。

| Pilot / policy | rules/direct/source | exact/mixed | definitions/reuse/links | preserved declarations Δ | atomic raw Δ | preserved raw Δ | class-string Δ | total Δ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Vite compound | `1/1/1` | `1/4` | `260/867/1` | `-3` | `+162` | `-246` | `+124` | `+40` |
| Vite descendant | `4/8/8` | `6/4` | `272/902/8` | `-50` | `+1304` | `-1894` | `+1766` | `+1176` |
| Vite child | `1/1/1` | `2/0` | `262/873/1` | `-11` | `+243` | `-429` | `+359` | `+173` |
| Vite descendant-tag | `0/0/0` | `0/0` | `259/865/0` | `0` | `0` | `0` | `0` | `0` |
| Rsbuild compound | `1/1/1` | `1/4` | `288/916/1` | `-3` | `+135` | `-231` | `+112` | `+16` |
| Rsbuild descendant | `4/8/8` | `6/4` | `300/951/8` | `-50` | `+1298` | `-1885` | `+1757` | `+1170` |
| Rsbuild child | `1/1/1` | `2/0` | `290/922/1` | `-11` | `+243` | `-426` | `+356` | `+173` |
| Rsbuild descendant-tag | `0/0/0` | `0/1` | `287/914/0` | `0` | `0` | `0` | `0` | `0` |

baseline replay 为 Vite `259 definitions / 865 reuse`、Rsbuild `287 / 914`。两端 exact-only
分类一致：compound 只有 `acknowledgedProbe`；descendant 为 `row/state`、
`artifactRow/statusBadge`、`fileList/fileItem`；child 为
`acknowledgedList/acknowledgedItem`；descendant-tag 没有共享 exact-only class。

## 确定性与正式产物保持面

- Vite 两次 evaluation 的 SHA-256 都是
  `d6d7f011e72b5428d30aaa3dd11138c4197006e7599a8de3728a2766cb2deebb`。
- Rsbuild 两次 evaluation 的 SHA-256 都是
  `c402d38773f06dd1b33248f50b86d30dda160a0d46089380a1e5cf5ed3695466`。
- capture aggregate SHA-256 为 Vite
  `912376d37aa4a01b98c93e3b7e7d57427fe5d54818ec62d8bda3d849dd36a53d`、Rsbuild
  `a789dbe3057314da4760b2c1d6e77612eb491e192d176c11e26202e8033de7cc`；capture manifest 已排除自身，
  可由 `shasum -c /private/tmp/gss-found04-shadow/captures/files.sha256` 完整校验。
- capture 前后三个 adapter target hash 相同，临时 instrumentation 已移除；本次 rollback 不修改
  adapter、fixture、Pilot source、package/lockfile 或正式 Core implementation/test。
- 当前 Vite CSS/report/manifest hash 为
  `d03cdfaadf6fa5c8061bb3f1f3564e8ebdbb49b7de376f45f6446e6e8d101e0c`、
  `31585ddd591945f2b51a1e06870b8de591597303043594aacb39eb08627e9f76`、
  `4fe3f465972aa973ff40fecc7a098b160615430c7dff9f3fb959bd59c61bd67c`；当前 Rsbuild 为
  `58a9c7c0f96d5bee2a25ea23017bce54076b71e319c34dbe5a52c9359a3cdc14`、
  `c0b811dbf8003982a3fbf474fad690321b8b11d0c0f3ec4c3d86c7cf850b8e87`、
  `b6b538561f32916ac57e56aed19c15283dfaa28cdb890d22b85b428c82426e92`。

Rsbuild 旧 frozen report 与当前 report 的差异只在 direct attribution：当前只有
`card[data-status="risk"]` 这一条 direct `attribute-cascade-order` public diagnostic；
`card[data-status="pass"]` 只是同 class 的 class-wide preservation follower，不伪造第二条 public diagnostic。
因此 `unsafeRules` 为 `15`、`attribute-cascade-order` 为 `1`。CSS、manifest、tokens、
`preservedRules=46` 与 `preservedDeclarations=167` 均不变；report hash 刷新不是 `FOUND-04` 的 CSS 收益。

## 独立 Test 与 Review

- 独立 Test 复算 rollback、capture/evaluation checksum、四项 policy、Rsbuild attribution，运行
  Core、Vite、Rsbuild package verify、根 `pnpm verify` 与双 fixture full visual，结论为 PASS。
- Vite full visual 报告位于 `/private/tmp/gss-found04-vite-independent.json`：
  `64 runs / 228 cases / 676 comparisons / 0 differences`，`passed=true`。
- Rsbuild full visual 报告位于 `/private/tmp/gss-found04-rsbuild-independent.json`：
  `8 runs / 204 cases / 464 comparisons / 0 differences`，`passed=true`。
- adapter 的 capture 前 pre-image、目标 SHA-256 与 restored manifest 已持久化，独立 Test 可重新比较并通过；
  任务开始前正式 Core 的完整 checksum/pre-image 没有持久化，因此正式 Core byte-identical 的独立比较
  为 `not_run`，不能把当前文件 hash 或绿色测试冒充任务前逐字节证据。
- 对正式 Core 的可用证据限于开发阶段比对结论、当前无 executable shadow 或残留引用、正式 transformer /
  public export 未接入 candidate，以及当前 package/root/static/full visual 门禁全绿。
- 独立 Review 对状态、收益口径、Rsbuild baseline 刷新、删除范围与生产边界给出 PASS，未发现
  actionable finding。上述证据限制不改变 `closed-no-go`：semantic scoped fallback 继续保留，
  不授权 production rewrite，也不扩展到 `FOUND-05`。

## Rollback 与生产边界

四项 no-go 后，已删除 6 个只属于本次 Work Item 的可执行原型、测试与 replay script；不保留旁路、
不迁入正式路径，也不另存可执行归档。正式 Core 继续由 `planSelectorRewrite` 维护 single-anchor
深模块边界，multi-local 与 combinator selector 继续按既有规则保留 scoped fallback。

状态收口如下：

| 项 | 状态 | 含义 |
| --- | --- | --- |
| `FOUND-04` | `closed-no-go` | 内部评估完成，production foundation 未通过门禁 |
| `SEL-04` | `deferred` | descendant-tag 没有双 Pilot exact-only 收益，其他子集仍缺真实需求证据 |
| `SEL-05` | `deferred` | compound 两端仅 1 个 exact-only 且体积恶化 |
| `SEL-06` | `deferred` | descendant 与 child 均恶化 estimated total diff |
| `GOV-01` | `internal-study-completed; product-deferred` | one-shot shadow 已完成决策职责，不产品化 report/schema/consumer |
| `FOUND-05` | `deferred` | 不为改善本次数字扩大到 usage/order 推断 |

若未来出现新真实 corpus，只能按当时新语料重新申请和执行门禁；本次研究结果不自动恢复任何
selector capability，也不授权 production rewrite。
