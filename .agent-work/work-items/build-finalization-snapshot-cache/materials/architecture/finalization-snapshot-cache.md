# 构建收尾快照缓存架构建议

> 状态：**superseded**。本文保留首版完整 registry snapshot cache 的历史设计；
> 该方案因 10x retained-heap 门禁失败，不得作为当前实施依据。最终合同见
> [低 retained-heap 构建收尾缓存架构](low-retained-finalization-cache.md)。

## 结论

建议把缓存边界放在 `createTransformer()` 的闭包内，做成**按 transform revision 失效的懒收尾快照**。缓存只服务 Core 的聚合 getter，不新增 public API，不把 build-tool 生命周期带入 Core，也不替换 Vite/Rsbuild 各自承担稳定排序和生产序列化的 CSS 聚合。

首版应缓存同一 revision 下的 registry 防御性快照、atomic CSS 和聚合 report；manifest 仍从内部快照投影为每次调用独立的新对象，避免公开可变对象进入缓存。只有固定基准证明收益且冷路径、堆内存均无回退时才实现；如果缓存一份完整 registry clone 造成不可接受的 retained heap，再单独评估 registry 内部只读借用视图，不在首版提前增加该复杂度。

## 已确认约束与当前事实

以下是代码和任务包已经确认的约束，不是本提案的新假设：

- public `Transformer` API、CSS/manifest/report 字节、对象键顺序、schema、selector 与 cascade 语义均不得改变。
- `AtomicRegistry` 是 append-only，Map 首次插入顺序就是 atomic 默认输出顺序；reuse 会继续追加 `sources` 并增加复用计数。
- `AtomicRegistry.list()` 当前逐条深复制 selector、declaration/source、context 和全部 sources；返回对象允许调用方修改而不污染 registry。
- `createTransformer()` 当前没有同 id 更新或 invalidate；build 每轮新建 transformer，Vite/Rsbuild dev report 则从可失效的 adapter state 重放。
- `getManifest()` 的 atomic 来自 registry 全量快照，classes 来自每次 transform 后已经防御性合并的 `latestClassManifest`。
- Vite/Rsbuild 的最终 atomic CSS 不是简单调用 `getAtomicCss()`：adapter 会按稳定 source id 收集单次 transform 结果，并使用自己的 production/order 聚合路径。该路径承担基础/条件分区、断点与生产序列化约束，不能作为“重复渲染”直接删除。
- 不新增生产依赖。

## 当前重复工作的量化

记：

- `U`：registry 中唯一 atomic declaration 数；
- `S`：所有 atomic entry 的 `sources` 总数；
- `C`：聚合 class manifest entry 数；
- `F`：成功进入 transformer 聚合的 report 数；
- `D`：所有 report diagnostics 总数；
- `B`：atomic CSS UTF-8/字符串长度量级。

单个 Core getter 的当前成本如下：

| getter | registry list | atomic render | report merge | 其他主要分配 |
| --- | ---: | ---: | ---: | --- |
| `getAtomicCss()` | 1 | 1 | 0 | `list()` 深拷贝 `Theta(U + S)`，渲染 `Theta(U + B)` |
| `getManifest()` | 1 | 0 | 0 | `list()` 先深拷贝，`createManifest()` 再深拷贝 atomic 嵌套字段，并 clone `C` 个 class entries |
| `getReport()` | 2 | 1 | 1 | `mergeReports()` 为 `Theta(F + D)`；第一次 list 用于 render，第二次 list 只为读取 `.length`，但仍完整深拷贝 `Theta(U + S)` |

因此，同一 revision 上各调用链的**确定性工作次数**是：

| 实际调用链 | registry list | Core atomic render | report merge | manifest projection | adapter atomic render |
| --- | ---: | ---: | ---: | ---: | ---: |
| Core 调用方依次取 CSS/manifest/report | 4 | 2 | 1 | 1 | 0 |
| Vite：仅 manifest | 1 | 0 | 0 | 1 | 1 |
| Vite：仅 report（analyzer 仍需 manifest） | 3 | 1 | 1 | 1 | 1 |
| Vite：manifest + report | 4 | 1 | 1 | 2 | 1 |
| Rsbuild `createBuildArtifactSnapshot()` | 3 | 1 | 1 | 1 | 1 |

Vite 同时开启 manifest/report 时，`generateBundle()` 先调用一次 `getManifest()`；`createBuildReport()` 又调用 `getReport()` 和 `getManifest()`，所以是 4 次 list。Rsbuild snapshot 无论最终是否 emit 两个 JSON，当前都会先完整构造 manifest、report 和 analysis，所以固定是 3 次 list。两个 adapter 表中的 1 次 adapter render 是正确性所有者，不计入可删除的 Core 重复工作；Core render 仍用于 report 的 `afterAtomicCssBytes`。

重复 getter 的放大也可精确表达。对同一 revision 重复 `k` 次 Core CSS/manifest/report 组合，当前为 `4k` 次 list、`2k` 次 render、`k` 次 merge；推荐方案应收敛到 1 次 list、1 次 render、1 次 merge，只有每次返回独立 manifest/report 所需的公开对象复制随 `k` 增长。

## 方案比较

### A. Transformer 级聚合快照缓存（推荐）

在 `createTransformer()` 闭包中维护 revision 和 lazy cache。transformer 是唯一同时知道 registry、reports、class manifest 以及三个 getter 组合关系的边界，因此可以共享一次 list/render/merge，又不暴露新 API。

优点：

- 能消除 `getReport()` 内部的第二次 list，也能跨三个 getter 共享 list 与 render；
- Vite、Rsbuild 和直接 Core 调用方同时受益，adapter 无需复制缓存策略；
- invalidation 点单一，只有闭包内的同步 `transformCss()` 能改变聚合状态；
- 保持 `AtomicRegistry` 当前“getter 全部防御性复制”的封装。

代价与风险：

- 持有一份 registry 深拷贝直到下一次 transform 或 transformer 释放，会增加 retained heap；
- 缓存的 report/manifest 不能直接返回，否则调用方修改会污染后续 getter；
- 首次 getter 不能为了“快照完整”而无条件构造三个产物，否则 manifest-only 会退化。

结论：采用**按组件懒计算**，并用 10x retained-heap 门禁约束内存；不要做任一 getter 都 eagerly 构造全部产物的版本。

### B. AtomicRegistry 快照缓存

让 `AtomicRegistry.list()` 自己按 mutation version 缓存列表，register/reuse 时失效。

优点是失效靠近真实 mutation，且可复用于未来其他 registry 消费者。缺点是 public/internal `list()` 仍必须每次返回防御性副本：若缓存对象直接返回会破坏现有隔离；若每次再 clone，首调反而多一份 clone，并且 report merge、CSS render、class manifest 仍重复。为了获得明显收益需要新增“unsafe/borrowed internal view”或 copy-on-write registry，这会扩大 registry 契约与维护风险。

结论：不作为首版。只有 Transformer clone 的 retained heap 超过门禁、同时 profile 证明 clone 是主因时，才设计包内非公开的只读借用视图；不得把它暴露给 public caller。

### C. Adapter 本地缓存

Vite 可以缓存 `createBuildReport()` 结果，Rsbuild 可以缓存 `createBuildArtifactSnapshot()`，并由 buildResults/state 变化失效。

这能减少某个 adapter 的重复 finalization，但 Vite/Rsbuild 必须分别实现版本、失效、mutation isolation；直接 Core 调用者仍无收益，且 `getReport()` 内部两次 list 无法从 adapter 消除。dev state 还包含删除、HMR generation、environment reset 等不同失效语义，错误缓存更容易产生 stale report。

结论：不用于解决本 Work Item。adapter 继续拥有生产 CSS 排序/序列化；若后续 profile 显示 `stabilizeManifest()` 或 analyzer 才是主耗时，可另立 adapter 优化，不与 Core 快照混做。

## 推荐状态模型

内部概念建议如下；命名可由实现者按现有风格调整，不新增 public type：

```txt
aggregate state
  registry
  reports (内部拥有，不与 transform result 共享可变对象)
  latestClassManifest
  revision

lazy finalization cache for revision
  atomicDeclarations?  <- registry.list()，只供闭包内部使用
  atomicCss?           <- 从 atomicDeclarations 按现有 renderer 生成
  aggregateReport?     <- mergeReports + 现有全局 atomic size 修正
```

行为流程：

1. `transformCss(input)` 进入时先使整个 finalization cache 失效并推进 revision，然后调用现有同步 pipeline。
2. 成功时把 report 的内部自有副本加入 aggregate state，并按现有逻辑合并 class manifest；失败时不追加 report/classes。之所以在 `runTransform()` **之前**失效，是因为未知异常理论上可能发生在 registry 已部分 mutation 之后，旧缓存绝不能遮蔽实际 registry 状态。已由 preflight 保证零部分注册的错误路径仍保持原行为。
3. 任一 getter 首次需要 atomic declarations 时只调用一次 `registry.list()`；同 revision 后续 getter 复用该闭包私有数组。
4. `getAtomicCss()` 首次按现有 `renderAtomicCss()` 生成字符串，后续复用字符串。字符串不可变，可直接返回。
5. `getReport()` 首次按现有 `mergeReports()`、reuse count、atomic count、UTF-8 size 和 `estimatedTotalDiffBytes` 公式生成内部 canonical report；每次公开返回都复制 summary、size、diagnostics 及 diagnostics 的可变嵌套 source，不能返回 canonical 引用。
6. `getManifest()` 每次从内部 atomic declarations 和 `latestClassManifest` 生成新的防御性对象。首版不直接返回/复用一个可变 canonical manifest；这样 manifest-only 冷路径保持与当前相同的必要投影层数，并满足现有 descriptor mutation 测试。若 benchmark 证明重复 projection 仍占主导，可缓存 canonical 后继续对外深拷贝，但必须重新通过冷路径和 heap 门禁。

本模型下，同一 revision 的 Vite manifest+report 从 4 次 list 降为 1 次，Rsbuild 从 3 次降为 1 次；Core render 与 report merge 至多各 1 次。manifest 因公开防御性语义仍按调用次数投影，这是有意保留的成本。

## 失效与防御性语义

### 必须成立的失效规则

- 每次 `transformCss()` 调用开始前失效，无论输入 CSS 是否为空、parse 是否产生空结果、最终是否抛错。
- register 新 key 和 reuse 旧 key 都由这次 transform 覆盖：reuse 会改变 `sources` 与 reused count，因此绝不能只按 unique key 数决定 freshness。
- 不按 input id 做局部失效；当前 transformer 是 append-only，不存在删除/覆盖语义。
- Vite `buildStart()`、Rsbuild compilation reset 继续通过新 transformer/重放拥有跨轮失效，不把 HMR state 引入 Core。
- getter 本身不得推进 revision；任意重复或交错 getter 都只能观察同一聚合 revision。

### 空输入与调用顺序

- 新 transformer 在任何 transform 前：CSS 为 `''`，manifest 两区均为空，report 所有计数为 0，`files` 为 0。
- 成功 transform 空 CSS/parse-empty result 后按现有 report 语义计入该次 result；即使 registry 仍为空也必须是新 revision。
- `manifest -> report -> manifest`、`report -> CSS -> report`、连续十次同一 getter 都必须值相等；两个结构化返回对象不得共享可变引用。
- `getter -> transform -> getter` 必须立即看到新增 sources/classes/files/reuse 与重新计算的 CSS size。
- `getter -> 抛错的 transform -> getter` 不得返回旧缓存；若错误路径按现有 preflight 保证零 mutation，则值相等但必须来自重新验证后的 revision。

### 外部修改契约

建议把契约明确为：调用方对任何 `TransformCssResult`、`getManifest()` 或 `getReport()` 返回对象的修改，都不能改变 registry、后续聚合 getter 或另一返回对象。CSS 字符串天然不可变。

当前 atomic/manifest/class 路径已经大体满足该契约，但 `reports.push(result.report)` 会让公开 transform result 的 report/diagnostic 对象与内部聚合共享引用。实现缓存前应在入 aggregate state 时取得内部自有副本，否则调用方在首次 finalization 前修改 `result.report` 或 `result.diagnostics` 会污染缓存，缓存只会把既有泄漏固化。该加固不改变未发生外部 mutation 时的任何 bytes/schema/order。

不建议用 `Object.freeze()` 或 readonly public type 代替复制：现有返回类型可变，测试也会主动修改 manifest descriptor 后再次读取；冻结会形成新的 runtime 行为。

## 性能证据与 1x/10x benchmark

### 固定数据集

新增独立的 `packages/core/test/finalizationSnapshot.bench.ts`，只使用现有 Vitest/Node 能力，不增加 production dependency。数据生成必须固定 seed、固定 id 顺序、固定 scope：

- 1x：100 个 input，每个 10 个 safe class rule；每条包含 1 个跨文件复用 declaration 和 2 个由全局序号生成的唯一 declaration，共 3,000 registration occurrences、约 2,001 unique atomics、1,000 classes；每 10 个 input 再加入 1 条独立 unsafe rule以覆盖 diagnostics。
- 10x：文件、class、occurrence、unique value 与 diagnostics 全部乘 10，即 1,000 inputs、10,000 classes、30,000 occurrences、约 20,001 unique atomics。
- setup transform 不计入 finalization timer，但另记录“transform + 单次 finalization”端到端指标，防止把成本转移到 transform。

每个规模至少创建 7 个独立 transformer round，前 2 个仅 warm-up，报告后 5 个的 median；同机、同 Node/pnpm、相同 className options，baseline 与 candidate 交替执行，避免温度和 JIT 单向偏差。每轮记录：

1. 冷 Vite 路径：`getManifest(); getReport(); getManifest()` 一次；
2. 热路径：冷调用后，同一 revision 再重复上述组合 10 次；
3. Core 全 getter路径：`getAtomicCss(); getManifest(); getReport()`；
4. 端到端 build collector：setup + 一次冷 Vite 路径；
5. `heapUsed`：setup 后、冷 finalization 后、显式 GC 可用时 GC 后 retained heap。

当前 Core workspace 可用 Vitest 2.1.8 的 `bench`、`--outputJson` 和 `--compare`；基准只写入 `/tmp`，不提交机器数据：

```bash
pnpm --filter @semantic-atomic-css/core exec vitest bench test/finalizationSnapshot.bench.ts --run --outputJson=/tmp/gss-finalization-baseline.json
pnpm --filter @semantic-atomic-css/core exec vitest bench test/finalizationSnapshot.bench.ts --run --compare=/tmp/gss-finalization-baseline.json --outputJson=/tmp/gss-finalization-candidate.json
```

Vitest JSON 用于时间比率；peak/retained heap 由 benchmark 文件使用 Node `process.memoryUsage()` 记录。不要为此修改 package scripts 或引入 benchmark dependency。

### 接受门禁

实现前必须先在未优化代码生成 baseline；没有 baseline 不得以静态推断宣称提速。candidate 同时满足：

- 确定性工作门禁：同一 revision 任意 getter 顺序中 `registry.list()` 恰好至多 1 次、Core atomic render 至多 1 次、report merge 至多 1 次；下一次 transform 后三者可以各再执行 1 次。
- 冷路径无回退：1x、10x 冷 Vite median 均不得超过 baseline 的 1.05 倍。
- 端到端无回退：1x、10x“transform + 单次 finalization”median 均不得超过 baseline 的 1.05 倍。
- 热路径必须有证据：1x、10x 的 10-repeat median 都必须低于 baseline，且改善至少 10%；否则缓存的复杂度不成立，不合入优化。
- 内存无回退：10x finalization peak heap 不超过 baseline 1.10 倍；GC 后 retained heap 不超过 baseline 1.10 倍。若时间收益达标但 retained heap 失败，停止首版并评估 registry 包内 borrowed view，不放宽门禁。

性能数字不作为跨机器绝对值门禁，只比较同一次实验的 baseline/candidate ratio。CI 中更稳定的门禁是工作次数；wall-clock ratio 可放专用性能 job，普通共享 runner 不用绝对毫秒判失败。

## 正确性与回归验证

Core 至少新增/补充以下测试：

- 初始空 transformer 三 getter、空 CSS transform 后 freshness；
- 三个 getter 的全排列、重复十次与交错读取，值和现有未缓存结果一致；
- getter 后新 key transform、reuse-only transform、parse-empty transform、抛错 transform 的失效；
- 修改第一次 `getManifest()` 的 selector/declaration/context/sources/classes 数组，后读不受影响；
- 修改第一次 `getReport()` 的 summary/size/diagnostics/source，后读不受影响；
- 修改 `TransformCssResult.report`、`diagnostics`、manifest、atomic 后，聚合 getter 不受影响；
- report 的 unique atomic count、reuse count、all sources、UTF-8 bytes 与 `estimatedTotalDiffBytes` 公式不变；
- 通过 mock/包内 seam 断言每 revision list/render/merge 次数，而不是依赖计时测试证明 cache 命中。

Adapter 不修改生产聚合边界，但需要现有 build tests 继续证明：

- Vite manifest-only、report-only、二者同时开启时 JSON bytes/order/schema 与 analyzer 输入不变；
- Rsbuild snapshot 重复构造、反向输入顺序和 processAssets 输出不变；
- buildStart/environment reset 后无上一轮 sources/classes/report 泄漏。

最低验证命令：

```bash
pnpm --filter @semantic-atomic-css/core verify
pnpm --filter @semantic-atomic-css/vite verify
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm verify
```

该改动涉及缓存 freshness、异常路径和公开对象隔离，应由独立 Test 角色执行上述语义矩阵和 benchmark，并由独立 Review 角色重点检查 revision 失效点、内部对象所有权、report 公式与 retained heap。

## 明确不做

- 不增加 `getSnapshot()`、`invalidate(id)` 或 public revision API。
- 不把 Vite/Rsbuild buildResults、environment 或 HMR generation 放入 Core。
- 不用 Core `getAtomicCss()` 替换 adapter 的生产 CSS 聚合。
- 不改变 manifest/report stabilizer、JSON schema、排序或 analyzer 输入。
- 不在缺少 baseline 或未通过 1x/10x 门禁时仅凭理论操作次数提交优化。
