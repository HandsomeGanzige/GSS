# Compact atomic class contract

## 结论与边界

本文记录已接受并实现的 compact class 合同。已确认的约束是：所有通过现有
selector/declaration/cascade 正确性门禁的 CSS 仍全量原子化；删除未提交的 benefit Planner
主线；新增 `compact` 并作为 Vite/Rsbuild 生产默认，dev 保持 `readable`，显式
`hash`/`prefix` 保持兼容；不增产品依赖，不改 selector、atomic key、cascade、fallback、
manifest/report schema 或 semantic class preservation。

已接受的 `compact` 定义是“现有 32-bit FNV-1a fingerprint 的 7 字符 lower-base36
CSS-safe 编码”。Core 的直接
默认仍为 `readable + "_"`，只由 Adapter 把 build 默认切换为 `compact + ""`。这样不会
把“构建工具的 dev/build 环境策略”泄漏给 Core，也不会改变直接调用 Core 的现有默认输出。

## 编码合同

### Fingerprint

- 输入仍是 `createAtomicKey(input)` 返回的完整 canonical JSON key；不删减
  `selectorIdentity/prop/value/important/media/supports`。
- compact 与现有 `hashString` 复用同一 32-bit FNV-1a fingerprint，按现有
  JavaScript UTF-16 code-unit 遍历规则处理字符串。不使用 Node crypto，不增依赖。
- `hash` 策略仍执行原 `toString(36).padStart(length, '0').slice(0, length)`，
  其 `_` + 8 位 base36 精确输出保持不变。

### 定长 CSS-safe 编码

32-bit fingerprint 先转成固定 7 位 lower-base36。因为无符号 32-bit 值的七位
base36 首位只可能是 `0 | 1`，再将它可逆映射为 `a | b`：

```txt
u32:      existing FNV-1a 32-bit fingerprint
base36:   u32.toString(36).padStart(7, "0")
compact:  (base36[0] === "0" ? "a" : "b") + base36.slice(1)
shape:    [ab][0-9a-z]{6}
capacity: 2^32
```

因为首字符始终是 ASCII letter，无 prefix 的 compact token 本身就是合法 CSS identifier，
后续不需要 escape 或 `ensureValidClassName` 补位。仍统一走 `ensureValidClassName(prefix + digest)`，
保持现有数字或负数开头 prefix 的修复行为。对中间包含空格、点号等非法字符的
prefix 不新增清理或默默改写；这与当前 public prefix 合同一致。

默认 compact 长度为 7，比现有默认 hash `"_" + 8 个 base36` 的 9 字符少 2 字符。
compact 与显式 hash 保持相同的 32-bit collision domain，不把无碰撞当作正确性假设。

### 方案比较

| 方案 | 默认长度 | 有效位宽 | 适配与风险 | 结论 |
| --- | ---: | ---: | --- | --- |
| 当前 `_` + base36 | 9 | 32 | 全兼容，但第一个 hash 字符实际总是填充 `0`，不够紧凑 | 保留为显式 `hash` |
| 32-bit lower-base36 首位映射 | 7 | 32 | 比旧 hash 短 2 字符，碰撞域不弱于旧 hash，小写字母表保留压缩局部性 | **已接受** |

## Collision 与确定性

`AtomicRegistry` 仍是唯一的碰撞裁决者，不把 hash 无碰撞当成前提：

1. 同 key 始终复用已注册 class，并继续检查 renderer CSS 一致性。
2. 不同 key 得到同一 base class 时，继续使用现有
   ``${base}_${hashString(`${key}:${collisionIndex}`, 5)}`` 分支，直到找到未占用名称。
   这保留 readable/hash 的 collision 输出兼容，compact 也不会 silent alias。
3. Core append-only registry 的明示合同是“对相同注册序列可复现”和“首次注册顺序就是
   declaration 输出顺序”。在极端罕见的异 key base/suffix collision 中，改变注册顺序
   可能改变哪个 key 拥有无 suffix 基名、哪个 key 拥有 suffix；用户已明确接受这一边界。
   无论顺序如何，registry 都不得把不同 key 静默合并为同一 class。
4. 为消除这一极罕见的顺序差异，本批不新增 fail-fast、全局收集/重分配、两阶段 build
   或 Planner；也不改 selector/cascade/fallback 语义。

为了可测 compact collision，不应在测试中暴力寻找 32-bit 碰撞。已把
`AtomicRegistry.createAvailableClassName` 中的纯分配循环抽成包内 helper（不从 `src/index.ts`
导出），用预填充 `keyByClassName` 直接验证“同 key 复用、异 key suffix、suffix 再碰撞继续探测”。

## 默认值与 public 兼容矩阵

prefix 必须在 strategy 确定后解析，不能再只用一个全局 `defaultClassNameOptions.prefix`：

```ts
strategy = configuredStrategy ?? 'readable'
prefix = configuredPrefix ?? (strategy === 'compact' ? '' : '_')
```

| 调用场景 | 有效 strategy | 未显式配置 prefix | 兼容结果 |
| --- | --- | --- | --- |
| Core 直接调用，无 `className` | readable | `_` | 完全保留现有默认 |
| Core 显式 readable | readable | `_` | 保留现有输出 |
| Core 显式 hash | hash | `_` | 保留现有 `_` + 8 base36 精确输出 |
| Core 显式 compact | compact | `""` | 7 字符 compact |
| Core 只显式 prefix `P` | readable | `P` | 与现有 Core strategy 默认一致 |
| Vite/Rsbuild dev，无 strategy | readable | `_` | 保持可读调试名 |
| Vite/Rsbuild build，无 strategy | compact | `""` | 新的生产默认 |
| Adapter 显式 readable/hash/compact | 显式值 | 该 strategy 的默认 | 显式 strategy 不被环境覆盖 |
| Adapter 只显式 prefix `P` | dev readable / build compact | `P` | 环境选 strategy，prefix 始终优先 |
| 任意 strategy 显式 `prefix: ""` | 对应 strategy | `""` | 空串是有效显式值，不得回退默认 |

必须把 `AtomicClassNameStrategy` 扩为 `'readable' | 'hash' | 'compact'`，不新增另一套
Adapter option。Vite/Rsbuild 继续透传 `TransformCssOptions`。manifest 仍以实际 class name
为 key，因此生产默认改名是预期 build-output 变化，不是 schema 变化。

## 精确实现面

### Core

- `packages/core/src/public/types.ts`：扩展 `AtomicClassNameStrategy`；不改 option 形状。
- `packages/core/src/utils/hash.ts`：保留 `hashString` 字节输出，复用 32-bit fingerprint 生成
  固定 7 字符 lower-base36 encoder，注释 UTF-16/bit-width/alphabet 约束。
- `packages/core/src/atomizer/createAtomicClassName.ts`：在 `hash` 分支前后增加显式
  `compact` 分支；readable/hash 代码不改。
- `packages/core/src/policies/defaultOptions.ts`：改为 strategy-aware prefix resolution；Core 直接默认
  仍是 readable + `_`。
- `packages/core/src/registry/AtomicRegistry.ts`：保留 registry 碰撞正确性；可抽出包内纯 helper
  以做定向 collision 测试，不改 package public API。
- `packages/core/CORE_DESIGN.md`：记录三策略、32-bit lower-base36/7-char 格式、strategy-aware prefix、
  registry 碰撞边界和 Adapter 默认。

### Adapter

- `packages/vite/src/plugin.ts`：build fallback 从 `hash` 改为 `compact`，serve 仍 readable；保留
  `prefix: options.core.className?.prefix` 的显式透传。
- `packages/rsbuild/src/plugin.ts`：build fallback 从 `hash` 改为 `compact`，dev 仍 readable；保留
  显式 prefix。
- `packages/vite/src/types.ts` 与 `packages/rsbuild/src/types.ts` 无需新 option，但公开注释/
  README 要说清 dev/build 默认与显式覆盖。
- 同步 `packages/vite/README.md`、`packages/rsbuild/README.md`、Vite/Rsbuild 现有 design/tracking
  中的“build 默认 hash”文字和 option union 示例；不改其他 Adapter 语义。

## Planner 清理清单

清理必须用定向 patch，先再次读取 `git diff`，不得用宽泛 checkout 覆盖同文件的
非 Planner 改动。以本文调查时的 worktree 为准：

### 整体删除的 Planner 新文件/目录

- `packages/core/src/engine/createBuildPlanner.ts`
- `packages/core/src/engine/createBuildPlanningCostEvaluator.ts`
- `packages/core/src/engine/benchmarkBuildPlanner.ts`
- `packages/core/test/buildPlanner.test.ts`
- `packages/core/test/buildPlannerBenchmark.test.ts`
- `packages/analyzer/test/analyzeBuildOptimization.test.ts`
- `docs/phase-9-declaration-benefit-optimization-design.md`
- `docs/phase-9-declaration-benefit-optimization-tracking.md`
- `docs/phase-9-declaration-benefit-optimization-acceptance.md`
- `scripts/benchmark-build-planner.mjs`
- `scripts/build-planner-corpus-lib.mjs`
- `scripts/test-build-planner-corpus.mjs`
- `scripts/verify-build-planner-corpus.mjs`
- `scripts/results/` 下全部 Planner benchmark/corpus summary、run、lock 和 pointer 产物。当前
  `scripts/` 没有其他文件；执行删除时若出现新的非 Planner 文件，不得删整目录。
- `.agent-work/work-items/benefit-aware-build-planner/` 整个历史 work item 与 architecture materials。
- `.agent-work/work-items/benefit-aware-adapter-builds/` 整个未接入 Adapter Planner work item 与
  architecture materials。
- **保留** `.agent-work/work-items/compact-atomic-class-names/` 和 `.agent-work/index.md` 当前对该
  work item 的索引；它们是新主线，不是待删 Planner 产物。

### 已修改文件中只删除的 Planner 符号/段落

- `packages/core/src/index.ts`：删 `createBuildPlanner` runtime export，以及
  `BuildOptimizationPlan` / `BuildOptimizationSummary` / `BuildPlanner` / `BuildTransformSnapshot`
  type exports。
- `packages/core/src/public/types.ts`：删上述四个 Planner public type 的整块定义；保留
  `Transformer` 及其前后现有 public types。
- `packages/core/src/ir/types.ts`：只从 `PreservedRule.reason` union 删 `'benefit-plan'`。
- `packages/core/test/contract.test.ts`：恢复 runtime public surface 只期望
  `createTransformer` / `transformCss`；紧随的 compact 实现不新增 runtime export。
- `packages/analyzer/src/index.ts`：删 Core Planner 的三个 type imports，删
  `BuildOptimizationSnapshotAnalysis` / `BuildOptimizationDelta` /
  `BuildOptimizationCompressionGate` / `BuildOptimizationAnalysis`，删
  `analyzeBuildOptimization` 和 `createBuildOptimizationSnapshotAnalysis`；保留现有
  `analyzeBuild`、zlib 体积分析与其他 Analyzer 改动。
- `packages/core/src/engine/createTransformer.ts`：调查时该文件相对 HEAD 的整个 diff 都是
  Planner prepared-replay/cost 重构。要恢复原 `createTransformer` + `runTransform` 单路径，并删除下列
  Planner seams：
  - imports: `createAtomicClassName`, `createAtomicKey`/`AtomicKeyInput`, `hashString`, `renderRule`,
    `wrapAtRule`；
  - exported/internal symbols: `createBuildPlanningTransformer`,
    `estimatePreparedBuildPlanningArtifactBytes`,
    `estimatePreparedBuildPlanningSelectionArtifactBytes`, `TransformRegistry`,
    `PreparedBuildPlanningCostCache`, `createPreparedBuildPlanningCostCache`, `CostAtomicRegistry`,
    `getPreparedBuildPlanningAtomicMetadata`, `PreparedBuildPlanningTraceFragment`,
    `getPreparedBuildPlanningTraceFragment`, `PreparedTransformInput`,
    `BuildPlanningPreparationEvent`, `setBuildPlanningPreparationObserverForTest`,
    `prepareBuildPlanningInput`；
  - private prepared/cost path: `prepareCostFragment`, `renderPreservedItems`, `RecordingCostRegistry`,
    `createTransformerInternal`, `PreparedRule`, `PreparedBlock`, `prepareTransformInput`, `prepareRule`,
    `prepareSelectorRewrite`, `prepareBlock`, `prepareClassMappings`, `createMemoizedScope`,
    `replayPreparedTransform`, `replayPreparedCost`, `CostClassMappingBuilder`,
    `shouldBenefitPreserveClass`, `preserveBenefitPlannedSafeRule`，以及全部
    `benefitPreserved*` / `rawPassthrough*` / `freezeForReplay` 分支。
  由于该文件可能在多 agent 期间继续变化，实施时仍应对照 HEAD 原函数与当前 diff
  逐块复原，不执行破坏性 checkout。
- `README.md`：删顶部 Planner 能力段、Phase 9 三文档链接段、Phase 9 边界/
  fingerprint/benchmark 段；保留已扩展的 `SEL-04` 至 `SEL-09` deferred 文字。
- `packages/core/CORE_DESIGN.md`：删 public API 中的 Planner 入口/类型，删当前状态的
  4 条 Planner bullets，删完整 `Build Benefit Planner 合同`节，删验收中的 Planner
  contract bullet；保留所有 selector/cascade 现有合同，然后补充 compact 命名合同。
- `semantic-atomic-css-plugin-plan.md`：删首段 Phase 9 引用、Core 职责的净收益 bullet、
  pipeline 后的 Planner replay 段、完整 `21.9` 节、“当前工作入口”中 Phase 9
  句子、验收条目 7 和阶段九条目；保留同一 diff 中 `SEL-04` 至 `SEL-09`
  全部 deferred 的非 Planner 边界加强。
- `docs/phase-8-capability-hardening-backlog.md`：只删 2026-08-13 Phase 9 Planner 边界段，以及
  收尾段“Phase 9 Core/Analyzer 净收益选择不改 selector 状态”句子；保留日期、
  `SEL-04`–`SEL-09` deferred、candidate→deferred 和其他非 Planner 更新。

## 最小测试与验收矩阵

### 行为与公共面

| 层级 | 必须覆盖 | 最小命令/证据 |
| --- | --- | --- |
| Core hash/encoder | compact 精确向量、Unicode key 稳定、`^[ab][0-9a-z]{6}$`、固定 7 字符、`0/1 -> a/b` 边界；现有 hash 精确值不变 | `pnpm --filter @semantic-atomic-css/core verify` |
| Core options | Core 默认 readable `_`；三策略无 prefix/空 prefix/自定义 prefix/数字开头 prefix 矩阵 | 同上 |
| Core registry/output | 同 key reuse、compact base collision + 二次 suffix collision、selector CSS、mapping、manifest key、report bytes 自洽；readable/hash 现有快照不变 | 同上 |
| Planner removal | runtime export 只有 `createTransformer`/`transformCss`；全仓无 `createBuildPlanner`/`BuildOptimization*`/`benefit-plan`/Planner script 引用 | Core verify + `rg` 负向检查 |
| Analyzer | Planner API/test 删除后既有 analyzeBuild 与 zlib 分析不回归 | `pnpm --filter @semantic-atomic-css/analyzer verify` |
| Vite Adapter | serve 默认 readable，build 默认 compact；显式 readable/hash/compact/prefix；连续正常 build 输出可复现 | `pnpm --filter @semantic-atomic-css/vite verify` |
| Rsbuild Adapter | dev/build 默认和显式覆盖同 Vite；相同注册序列的 snapshot 可复现；不新增 compact collision fail-fast | `pnpm --filter @semantic-atomic-css/rsbuild verify` |
| 跨包 | Core public types、Adapter build 与 fixture static 无回归 | `pnpm verify` |

### Fixture/Pilot browser 与体积

体积基线应在改默认前先用当前显式/implicit `hash` build 采集到 `/tmp`；不要保留
Planner corpus 脚本或结果。如果已改完默认，用 Adapter 显式
`core.className: { strategy: 'hash' }` 构建同一 corpus 获取对照。每个 corpus 都记录：

- 独立 atomic CSS asset 的 raw/gzip/brotli bytes；
- 所有产品 `.css` + `.js` 文件逐文件 raw/gzip/brotli 后求和（不把可选
  manifest/report JSON 混入产品 payload）；
- atomic declaration 数、class mapping 中 atomic token 出现数与平均 token 长度；
- 连续两次清理 build 的文件列表与 SHA-256。

| Corpus | 语义验收 | 体积/确定性关闭条件 |
| --- | --- | --- |
| Vite fixture base + preprocessor | 静态 verify；dev readable / preview compact 的 desktop+narrow+interaction computed-style parity | compact atomic raw 严格小于 hash，atomic gzip/brotli 不回退；总 CSS+JS raw/gzip/brotli 都不回退；两次 compact build hash 一致 |
| Rsbuild fixture base + preprocessor | 静态 verify；dev readable / preview compact、lazy/HMR/partial computed-style parity | 同上，并验证多入口/资源场景不改 class 自洽 |
| Vite Pilot | semantic compact build + native build；现有人工 route/viewport 核心页抽验 | compact 对显式 hash 的 atomic raw 严格变小，atomic gzip/brotli 不回退，总 CSS+JS raw/gzip/brotli 均不回退；两次 build 一致 |
| Rsbuild Pilot | `pnpm --filter playground-rsbuild-react-css-modules acceptance`；双入口/lazy/static inspector；必要时人工 preview | 同 Vite Pilot，另验证两个 HTML entry 引用同一 compact atomic asset |

浏览器门禁按仓库现有命令运行：

```bash
pnpm --filter @semantic-atomic-css/vite-fixture verify
pnpm --filter @semantic-atomic-css/vite-fixture test:visual
pnpm --filter @semantic-atomic-css/rsbuild-fixture verify
pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual
pnpm --filter playground-vite-react-css-modules build
pnpm --filter playground-vite-react-css-modules build:native
pnpm --filter playground-rsbuild-react-css-modules acceptance
```

gzip/brotli 任一真实 corpus 相对 hash 回退时，不应用 raw 改善直接掩盖；要保留数字并
回到 alphabet/bit-width 方案复核后再确认生产默认。这个体积门禁不允许根据收益选择
个别 declaration 回退 preserved；全部 correctness-eligible CSS 仍必须原子化。

## 明确非目标

本合同不引入 compact collision fail-fast、全局 class 收集/密集编号、两阶段 build、
Planner、selector/cascade 放宽或基于收益的 preserved 选择。
