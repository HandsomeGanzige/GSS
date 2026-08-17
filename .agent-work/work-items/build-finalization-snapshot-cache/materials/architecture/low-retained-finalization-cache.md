# 低 retained-heap 构建收尾缓存架构

## 结论

首版“在 transformer cache 中保留一份完整 `registry.list()` 防御性快照”不应继续。推荐把 Core 内部边界改成**同步 borrowed visitor**：`AtomicRegistry` 继续独占 declaration 对象图，renderer、manifest projector 和 CSS byte meter 只能在同步回调期间读取深只读 view；任何聚合 cache 都不得保存该 view、数组、iterator 或 registry declaration 的嵌套引用。

cache 改为按 transform revision 失效的轻量产物缓存：

- `getManifest()` 每次直接从 borrowed visitor 投影一份新的完整防御性 manifest，不缓存 canonical manifest，也不先构造 `registry.list()`；
- `getReport()` 缓存不含 declaration 的 canonical report，并缓存 atomic CSS byte count；report-only 路径用 renderer 的 byte sink 计算字节数，不保留整段 CSS string；
- `getAtomicCss()` 被实际调用时才生成并缓存 immutable CSS string，同时记录其 byte count；
- `TransformCssResult` 继续使用单次 transform 自有的 atomic/manifest/report 对象，聚合状态在接收 report 时深复制，绝不接收 public result 的可变引用。

这保留所有 public 防御性契约，又使 Vite 的 `manifest -> report -> manifest` 路径在 GC 后只新增轻量 report/数字缓存；完整 declaration 图始终只有 registry 所拥有的一份，完整 public manifest 仅在返回调用方时存在一份。

## 首版失败与内存口径问题

固定 benchmark 的已有机器数据如下；candidate 是缓存完整 `registry.list()` clone 的首版：

| 10x 指标 | baseline | 首版 candidate | candidate / baseline | 判断 |
| --- | ---: | ---: | ---: | --- |
| cold Vite | 31.864 ms | 19.831 ms | 0.622 | 时间改善 |
| hot Vite | 453.151 ms | 133.786 ms | 0.295 | 时间改善 |
| all getters | 29.361 ms | 12.581 ms | 0.429 | 时间改善 |
| end-to-end | 3,044.989 ms | 2,128.311 ms | 0.699 | 时间改善 |
| observed heap delta | 49,647,504 B | 34,246,560 B | 0.690 | 瞬时分配改善 |
| GC 后 incremental retained | 2,104 B | 8,886,064 B | 4,223.4 | **失败** |

baseline 的 2,104 B 是“setup 后 GC”与“finalization 后 GC”两个大数之差，量级小于 GC/heap bookkeeping 噪声。以它作为唯一比例分母会产生失真的 4,223 倍：这个比例不能表达产品影响大小，也不适合作为稳定门禁。不过这不改变首版的绝对事实：candidate 在相同 10x 路径多保留约 8.9 MB；这与完整 declaration clone 的生命周期一致，必须记为失败，不能因比例失真而豁免。

现有 JSON 只保存差值，无法从中恢复 finalization 后的 total live heap；因此不能倒推出首版的 total-retained ratio。后续 baseline 和 candidate 必须用校正后的同一 benchmark 重跑，同时保存以下原始值，且不再用 `Math.max(0, delta)` 覆盖负噪声：

```txt
setupRetainedHeapBytes       = setup 完成并显式 GC 后的 heapUsed
totalRetainedHeapBytes       = cold finalization 完成并显式 GC 后的 heapUsed
incrementalRetainedHeapBytes = totalRetainedHeapBytes - setupRetainedHeapBytes（保留有符号原值）
positiveIncrementalBytes     = max(0, incrementalRetainedHeapBytes)，只用于门禁
observedPeakHeapBytes        = setup 后及每个 getter 返回后采样到的最大 heapUsed
observedPeakHeapDeltaBytes   = observedPeakHeapBytes - setupRetainedHeapBytes
```

`observedPeak` 只代表 getter 边界采样，不宣称捕获同步 getter 内部的瞬时真峰值；baseline/candidate 必须使用同一采样点比较。内存矩阵至少跑 7 个独立 transformer round，丢弃前 2 个并报告后 5 个的 median；每轮结束释放 transformer 并显式 GC。`global.gc` 不可用时 retained 门禁为 `not_run`，不得用普通 `heapUsed` 替代通过结论。

## 方案比较

### A. 同步 borrowed visitor + 轻量 cache（推荐）

registry 通过 Core 内部 reader 同步访问 declaration，不生成数组或 clone。manifest 在 visitor 内直接深复制到本次返回对象；renderer 只消费 selector/declaration/context；byte meter 只累计逐 rule UTF-8 byte length 和 `\n\n` separator。cache 只保留 string、number 和 canonical report。

优点是没有第二份 declaration 图，所有 getter 都仍由 registry 的 Map 插入顺序驱动，reuse 追加的 sources 在失效后立即可见；public 对象的 clone 边界也集中在 manifest/report return projection。代价是 report-first 后再调用 CSS 会遍历 registry 两次，因为 report 路径刻意只缓存 byte count、不缓存 CSS string。这是以少量冷路径重复渲染换 retained heap 的明确选择。

### B. 暴露 readonly iterable/view

让 registry 返回 `Iterable<Readonly<AtomicDeclaration>>` 可以复用现有 `for...of`，但 iterator 或元素引用很容易被缓存、跨 getter 保留或意外写入；TypeScript `readonly` 也不提供 runtime 隔离。它扩大了引用逃逸面，不采用。

### C. registry 提供 renderer/manifest 专用投影方法

把 `renderCss()`、`createManifest()` 放进 registry 可以完全隐藏引用，但会让 registry 同时拥有输出格式、UTF-8 size 和 public schema，破坏当前 registry/output 职责边界，也使后续 renderer 变更必须修改 registry。不采用。

### D. 不缓存 CSS/report，仅每次 visitor 重算

内存最小，但重复 report 仍反复 merge 和渲染，无法保留首版已经证明的 hot-path 收益。borrowed visitor 已足以移除 declaration clone，继续保留轻量派生产物 cache 更平衡。

## Core 内部类型与所有权边界

建议在 registry 内部模块定义但**不从 `packages/core/src/index` 或 package root 导出**以下结构；名称可按实现风格调整：

```ts
type BorrowedAtomicDeclaration = {
  readonly key: string;
  readonly className: string;
  readonly selector: Readonly<AtomicDeclaration['selector']>;
  readonly declaration: Readonly<AtomicDeclaration['declaration']>;
  readonly context: Readonly<AtomicDeclaration['context']>;
  readonly sources: readonly Readonly<AtomicDeclaration['sources'][number]>[];
};

interface AtomicDeclarationReader {
  readonly declarationCount: number;
  visitBorrowed(visitor: (declaration: BorrowedAtomicDeclaration) => void): void;
}
```

`visitBorrowed()` 必须是同步、不可重入 mutation 的内部借用：不能返回 visitor 结果，不能返回数组/iterator，consumer 不得 capture declaration 或任一嵌套引用。深 readonly 是编译期护栏，真正的安全边界来自 package-private 可达性和仅允许 renderer/projector/byte meter 三个受审 consumer。`AtomicRegistry.list()` 保持现有防御性 clone 行为供现有内部测试/诊断使用，但聚合 finalization 禁止调用它。

各模块最小改动与所有权如下：

| 模块 | 最小内部改动 | 长期所有者 / 禁止泄露 |
| --- | --- | --- |
| `AtomicRegistry` | 实现 `AtomicDeclarationReader`；`declarationCount` 为 Map size；`visitBorrowed` 按 Map 插入顺序同步遍历 | registry 独占 declaration、selector、declaration source、context、sources 数组及 source 对象；`list()` 契约不变 |
| renderer | 让 `renderAtomicCss` 接受 array 或内部 reader，抽出单 rule renderer；新增同源 `measureAtomicCssBytes` sink | 只返回新 string/number，不保存 reader/view；byte sink 必须与完整 string 的 `byteLength` 对 Unicode 输入相等 |
| manifest projector | `createManifest` 接受 array 或内部 reader，visitor 内按现有字段顺序深复制到新 manifest | 返回对象由 caller 独占；不得缓存 manifest 或在其中放 borrowed ref |
| report merger | `mergeReports` 公式和 schema 不变；增加/复用完整 `cloneReport` return projection | aggregate reports/canonical report 由 transformer 独占；每次 public return 深复制 summary、size、diagnostics 及全部可变嵌套 source |
| transformer | transform-entry 失效；成功后 clone report 入 aggregate；管理 `atomicCss?`、`atomicCssBytes?`、`aggregateReport?` | cache 不得含 reader、declaration、manifest、`TransformCssResult` 或 registry refs |

array 输入仍服务单次 `runTransform()`，因此 `TransformCssResult` 的 CSS/manifest 构造流程无需借用 registry。`createManifest` 从 reader 构造 aggregate manifest 时只产生最终公开图，不再出现“`list()` clone + manifest clone”两份完整图。

## Cache 状态、失效与 getter 工作次数

推荐闭包状态：

```txt
aggregate state
  registry                    // 唯一 declaration 图
  internally-owned reports   // 成功 transform 后深复制入内
  internally-owned latestClassManifest
  revision

finalization cache for revision
  atomicCss?: string          // 仅 getAtomicCss 实际被调用后存在
  atomicCssBytes?: number     // CSS 或 report 首次需要时存在
  aggregateReport?: report   // canonical internal report，无 declaration refs
```

每次 `transformCss(input)` **进入时**先推进 revision 并清空三个 cache 字段，再调用 `runTransform()`。必须在调用前失效，因为异常可能发生在 registry 已部分 mutation 之后；即使已知错误路径当前能 preflight 到零 mutation，也不能让旧 cache 掩盖状态。成功后把 result report 深复制进 aggregate reports，并按现有逻辑 clone/merge class manifest；失败时不追加 report/classes，但下一 getter 仍在新 revision 上重算。

reuse-only transform 同样失效：它会追加 registry `sources` 并改变 `getReusedCount()`，unique declaration count 不变不代表 freshness。空 CSS、parse-empty 和同 id append 也都走相同入口失效。Vite/Rsbuild 跨 build 生命周期仍由新 transformer/adapter state reset 负责，不把 adapter generation 放入 Core。

同一 revision 的工作次数如下；“registry visit”只读现有图，不分配 declaration clone：

| getter 顺序 | registry visit | 完整 CSS string render | CSS byte sink | report merge | manifest public projection |
| --- | ---: | ---: | ---: | ---: | ---: |
| `CSS` | 1 | 1 | 0（render 同时记录 bytes） | 0 | 0 |
| `manifest` | 1 | 0 | 0 | 0 | 1 |
| `report` | 1 | 0 | 1 | 1 | 0 |
| `CSS -> report -> manifest` | 2 | 1 | 0 | 1 | 1 |
| `report -> CSS -> report` | 2 | 1 | 1 | 1 | 0 |
| `manifest -> report -> manifest` | 3 | 0 | 1 | 1 | 2 |
| 上一行后再重复 10 次 | 每次 manifest 再 2 次 | 0 | 0 | 0 | 每轮 2 |

manifest 的每次 projection 是 public 深防御性契约所需工作，不能通过缓存可变 canonical manifest 消除。report 每次 public return 仍需 clone，但 merge 只做一次。若 `getAtomicCss()` 先发生，report 直接使用已记录 byte count；若 report 先发生，只保留 byte count，后续 CSS 再 render 一次。这一 ordering-dependent 上限应写入工作次数测试，不能继续要求“任意顺序总共只 render 一次”而迫使 report-only 路径保留 CSS string。

## 可执行 benchmark 与接受门禁

修订 `finalizationSnapshot.bench.ts` 时，baseline 与 candidate 都必须在同一 Node/pnpm、className options、固定 1x/10x inputs 和相同 getter 顺序下独立重跑。除现有时间项外，metrics JSON 必须增加 setup/total/incremental/observed-peak 原始字段，并记录 output fingerprints；旧的两个 JSON 只能作为首版失败证据，不能作为新 total-retained gate 的输入。

candidate 必须同时通过：

| 类别 | 必跑规模与门禁 |
| --- | --- |
| cold Vite time | 1x、10x median 均 `candidate <= baseline * 1.05` |
| hot Vite time | 1x、10x median 均至少改善 10%，即 `candidate <= baseline * 0.90` |
| all-getters time | 1x、10x median 均 `candidate <= baseline * 1.05` |
| end-to-end time | 1x、10x median 均 `candidate <= baseline * 1.05`，防止成本转移到 transform |
| observed peak heap | 10x `candidate.observedPeakHeapDelta <= baseline * 1.10`；报告绝对 bytes 与 ratio |
| total retained | 10x `candidate.totalRetainedHeapBytes <= baseline * 1.10`；报告绝对 bytes 与 ratio |
| incremental overhead | 10x 同时满足 `candidate.positiveIncrementalBytes <= 4 MiB` 且 `candidate.positiveIncrementalBytes - baseline.positiveIncrementalBytes <= 4 MiB`；若 baseline 正增量不足 1 MiB，只报告 ratio，不以 ratio 判定 |
| output equality | 1x、10x 的 CSS 原始 bytes、`JSON.stringify(manifest)` bytes、`JSON.stringify(report)` bytes/顺序/schema 与 baseline 完全相等；getter 全排列、重复读取和 transform 后 freshness 也必须 deep-equal |

固定 4 MiB 是该 10x benchmark 的绝对 cache envelope：足以容纳一个按需 CSS string 与小型聚合 report 的合理实现误差，但明确拒绝第二份 20,001-entry declaration 图。首版 8,886,064 B 大于 4,194,304 B，因此无论 2,104 B 的 ratio 是否可信、未来 total ratio 是否偶然通过，它都仍然失败。若推荐实现因 `getAtomicCss()` 确实被调用而超过 4 MiB，应取消 CSS string cache或另立证据调整设计，不能回退到完整 declaration cache，也不能临时放宽当前门禁。

output fingerprint 可以使用 Node 内置 `crypto`，不增加依赖；最终接受仍应对小型 fixture 做直接 string/deep equality，避免 hash 碰撞成为唯一正确性证据。peak/retained 与 wall-clock 是专用性能实验门禁；普通共享 runner 可以保留工作次数与 output equality 作为稳定门禁。

建议的实验命令仍为 Core 定向 bench，baseline/candidate 各保存独立 `/tmp` 文件，并额外运行语义验证：

```bash
NODE_OPTIONS=--expose-gc pnpm --filter @semantic-atomic-css/core exec vitest bench test/finalizationSnapshot.bench.ts --run
pnpm --filter @semantic-atomic-css/core verify
```

## 必须覆盖的防御性与 freshness 验证

- 任意修改第一次 `getManifest()` 返回值的 selector、declaration/source、context、sources/source 或 classes 数组，后续 manifest/report/CSS 不受影响；
- 任意修改第一次 `getReport()` 的 summary、size、diagnostics 及 diagnostic source，后续 report 不受影响；
- 任意修改 `TransformCssResult.atomic`、manifest、classes、diagnostics 或 report，首次及后续 aggregate getter 不受影响；
- getter 后分别执行 new-key、reuse-only、空 CSS、parse-empty、抛错 transform，下一 getter 观察到当前 registry sources/count/CSS bytes/report，而不是旧 cache；
- `measureAtomicCssBytes(reader)` 对 ASCII、Unicode value、media/supports 和空 registry 始终等于 `byteLength(renderAtomicCss(reader))`；
- visitor 顺序与 `registry.list()` 顺序一致，aggregate CSS、manifest atomic key/source 顺序和 report 公式不变；
- 工作次数 spy 证明 report-only 不生成/保留 CSS string，manifest 不调用 `registry.list()`，同 revision report merge/byte sink 至多一次，CSS string render 至多一次。

该候选涉及 registry 内部借用纪律、异常 freshness、UTF-8 byte 等价和 public mutation isolation，独立 Test 与独立 Review 都能提供实质信号：Test 应执行上述矩阵与修订后的 benchmark；Review 应重点追踪任何 borrowed ref capture、package-root export、manifest/cache 共享引用和 transform-entry 失效遗漏。

## 明确不做

- 不删除或改变 `AtomicRegistry.list()` 的防御性 clone 契约，但 finalization 不再使用它；
- 不从 package root 导出 reader、borrowed view、revision 或 cache API；
- 不把 registry declaration 引用写入 `TransformCssResult`、manifest、report 或 adapter state；
- 不缓存完整 manifest、完整 declaration array/iterator 或 registry snapshot；
- 不使用 Core CSS renderer 替换 Vite/Rsbuild 的生产排序与序列化路径；
- 不增加依赖、不修改 public schema/order/bytes，也不把 cache 下放到 adapter。
