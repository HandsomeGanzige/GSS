# FOUND-04 独立评估

> 结论：**no-go**。四个 policy 都没有同时满足“Vite/Rsbuild 各至少 2 个 exact-only class”与“estimated total diff 不恶化”。本结论不授权 SEL-05/06 正式改写。

## 1. 固定门禁与结果

门禁只计单 policy 的双 Pilot exact-only 与 estimated total diff delta；mixed、policy 组合、fixture 或 authored 上限均不计。

| Policy | Vite exact / total delta | Rsbuild exact / total delta | 结论 |
| --- | ---: | ---: | --- |
| `compound` | `1 / +40 B` | `1 / +16 B` | fail：exact 不足且体积恶化 |
| `two-local-descendant` | `6 / +1176 B` | `6 / +1170 B` | fail：体积恶化 |
| `child` | `2 / +173 B` | `2 / +173 B` | fail：体积恶化 |
| `single-local-descendant-tag` | `0 / 0 B` | `0 / 0 B` | fail：无 exact-only 收益 |

因此，不能把 descendant 的 6 个 exact-only、child 的 2 个 exact-only，或两者组合后的数字解读为 go。

## 2. 从原始 evaluation 复算的全量口径

`definitions/reuse` 是该 policy 启用后的全 corpus replay 值；`links` 只是 candidate token links；`preserved Δ` 为 candidate 减 baseline。`atomic/preserved Δ` 顺序为 raw/gzip/brotli，`class Δ` 为 class-string raw bytes。

| Pilot / policy | rules / direct / source | exact / mixed | defs / reuse / links | preserved Δ | atomic Δ | preserved CSS Δ | class Δ | total Δ | blockers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Vite compound | `1/1/1` | `1/4` | `260/867/1` | `-3` | `+162/+66/+53` | `-246/-39/-31` | `+124` | `+40` | `found-05:2` |
| Vite descendant | `4/8/8` | `6/4` | `272/902/8` | `-50` | `+1304/+245/+204` | `-1894/-338/-286` | `+1766` | `+1176` | `same-anchor:1, remaining:1` |
| Vite child | `1/1/1` | `2/0` | `262/873/1` | `-11` | `+243/+84/+67` | `-429/-55/-45` | `+359` | `+173` | `0` |
| Vite descendant-tag | `0/0/0` | `0/0` | `259/865/0` | `0` | `0/0/0` | `0/0/0` | `0` | `0` | `0` |
| Rsbuild compound | `1/1/1` | `1/4` | `288/916/1` | `-3` | `+135/+53/+51` | `-231/-33/-27` | `+112` | `+16` | `found-05:2` |
| Rsbuild descendant | `4/8/8` | `6/4` | `300/951/8` | `-50` | `+1298/+243/+207` | `-1885/-293/-258` | `+1757` | `+1170` | `same-anchor:1, remaining:1` |
| Rsbuild child | `1/1/1` | `2/0` | `290/922/1` | `-11` | `+243/+82/+75` | `-426/-54/-46` | `+356` | `+173` | `0` |
| Rsbuild descendant-tag | `0/0/0` | `0/1` | `287/914/0` | `0` | `0/0/0` | `0/0/0` | `0` | `0` | `same-anchor:2, remaining:1` |

Baseline replay 为 Vite `259 definitions / 865 reuse`、Rsbuild `287 / 914`。两端 policy 分类和共享 class 结果稳定：

- compound exact-only 均仅 `acknowledgedProbe`；mixed 均为 `metricCard/positive/warning/diagnosticProbe`。
- descendant exact-only 均为 `row/state`、`artifactRow/statusBadge`、`fileList/fileItem`；mixed 均为 `stage/taskCard`、`diagnosticProbe/diagnosticCode`。
- child exact-only 均为 `acknowledgedList/acknowledgedItem`，无 mixed。
- descendant-tag 在 Vite 无目标；Rsbuild `details` 仅为 mixed，不计 unlock。

## 3. 确定性、capture 与 artifact 核对

- Vite `run-1` 与 `run-2` 逐字节相同，SHA-256 均为 `d6d7f011e72b5428d30aaa3dd11138c4197006e7599a8de3728a2766cb2deebb`。
- Rsbuild `run-1` 与 `run-2` 逐字节相同，SHA-256 均为 `c402d38773f06dd1b33248f50b86d30dda160a0d46089380a1e5cf5ed3695466`。
- 从 `vite-capture.json` 重放再得 `d6d7...eebb`；从 `rsbuild-capture.json` 重放再得 `c402...5466`。capture 集合为 `17 / 23` 个 input，join 后 before CSS 为 `44325 / 46921 B`，与 evaluation 一致。
- aggregate capture SHA-256 为 Vite `912376d37aa4a01b98c93e3b7e7d57427fe5d54818ec62d8bda3d849dd36a53d`、Rsbuild `a789dbe3057314da4760b2c1d6e77612eb491e192d176c11e26202e8033de7cc`；各个 capture 文件与 manifest 记录相符。
- `captures/files.sha256` 错误地把自身记为空文件 hash，因而整份 `shasum -c` 必然有一项失败；这不影响其他每条 capture hash、aggregate hash 或重放一致性，但归档时应排除 manifest 自身。
- capture 前后三个 adapter target hash 相同，且当前文件与 pre-image `cmp` 相同；临时 instrumentation 已完全移除。
- 当前 artifact hash：Vite CSS/report/manifest 为 `d03cdf...101e0c / 31585d...e9f76 / 4fe3f4...bd67c`；Rsbuild 为 `58a9c7...3cdc14 / c0b811...b8e87 / b6b538...26e92`。全文件 hash manifest 均通过。

## 4. Rsbuild stale baseline 刷新边界

旧 frozen Rsbuild report `851b3e99...a6670` 与当前 report `c0b811db...b8e87` 只存在 direct attribution 差异：

- `unsafeRules 16 → 15`，`attribute-cascade-order 2 → 1`；旧 report 额外把 `card[data-status="pass"]` 记为 direct risk，当前只把 `card[data-status="risk"]` 记为 direct risk。
- `preservedRules=46`、`preservedDeclarations=167`、preserved ratio、CSS、manifest 与 tokens 均不变；全 artifact diff 只列出 report。
- 当前 Core contract 明确要求只有真正触发 cascade guard 的 rule/arm 输出 public reason，class-wide 传播只控制 fallback，不伪造 diagnostic。最终 Core 测试也断言一个 direct attribute diagnostic。

因此刷新合法：将 Rsbuild frozen report hash 替换为 `c0b811...b8e87`，manifest 仍为 `b6b538...26e92`，不得把这个差异归因于 FOUND-04 或宣称 CSS 收益。

## 5. 2083 行 prototype 处置

建议从 `packages/core` **删除，不保留、不迁入正式路径，也不另存一份可执行归档**：

- `src` 三文件 `1633` 行：`selector/planStructuralSelectorShadow.ts`、`engine/planStructuralSelectorShadow.ts`、`engine/evaluateStructuralSelectorShadow.ts`。
- 两个 test 文件 `386` 行：`structuralSelectorShadow.test.ts`、`structuralSelectorShadowContract.test.ts`。
- replay script `64` 行：`scripts/evaluate-structural-selector-shadow.mjs`。

三个 `src` 模块没有被 formal transformer 或 public export 引用，只被上述测试/脚本消费。保留它们会让 Core 永久维护一套复制 formal planning/replay/size 逻辑的旁路，与 `planSelectorRewrite` 作为 selector 内部深模块的现有边界冲突。四门禁全部 no-go 后，contract 的 stop/rollback 条款应执行：保留 contract、本评估和 hash 结论作为研究证据，删除可执行原型，以免日后对已漂移的旁路产生错误信心。

## 6. 状态、文档与后续排序

### 推荐状态

| 项 | 推荐状态 | 含义 |
| --- | --- | --- |
| FOUND-04 | `closed-no-go` | 研究/原型已完成，但生产 foundation 未通过门禁，不能视为 SEL-05/06 依赖已完成 |
| SEL-05 | `deferred` | compound 两端仅 1 exact-only，且体积恶化 |
| SEL-06 | `deferred` | descendant 和 child 都恶化 estimated total diff，不授权正式改写 |
| SEL-04 | `deferred` | descendant-tag 没有双 Pilot exact-only 收益，其他子集仍无真实需求证据 |
| GOV-01 | `internal-study-completed; product-deferred` | 本次 one-shot shadow 已完成决策职责；不产品化 report/schema/consumer |

### 权威文档变更清单

1. `docs/phase-8-capability-hardening-backlog.md`：更新上述五项状态，写入四 policy gate 结果、no-go、prototype 删除与“不授权 production rewrite”。
2. `docs/selector-capability-benefit-review.md`：新增 FOUND-04 双 Pilot 单 policy 证据表与双次 hash；把 Rsbuild current direct `attribute-cascade-order` 从 2 刷新为 1，记录 report hash 换代但 CSS/manifest/tokens 不变。
3. `packages/core/CORE_DESIGN.md`：原型删除后不应加入 shadow 或 multi-local “已支持”描述；现有 direct-risk attribution、深模块与 single-anchor 边界已正确，无行为性修改需求。

### 后续排序

当前不应继续实施 selector capability；先执行 rollback 与文档收口，之后等新真实 corpus 触发 demand-first 重评。若未来重开，只按当时新语料重跑门禁；本次证据下的观察顺序为：

1. SEL-06 `child` 最接近门禁（两端 exact=2，但仍 `+173 B`）。
2. SEL-06 `two-local-descendant` 真实 exact 需求最高，但当前恶化约 `1.17 KB`。
3. SEL-05 compound exact 不足，且已命中 FOUND-05 边界。
4. SEL-04 descendant-tag 无共享 exact；其他子集仍不符合 demand-first。

GOV-01 不插入这个 production 队列，FOUND-05 保持 deferred，不得为改善上述数字而扩大到 usage/order 推断。

## 7. 独立验证

- `pnpm --filter @semantic-atomic-css/core verify`：通过，12 files / 193 tests，typecheck 与 build 通过。
- evaluation/capture/artifact hash 重算、双次 diff、capture replay、adapter target pre/post hash 与 artifact diff 核对：通过；仅有上述 `captures/files.sha256` 自包含行需在归档时修正。
