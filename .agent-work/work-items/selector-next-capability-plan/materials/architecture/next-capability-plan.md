# Phase 8 下一 selector 能力架构方案

> 状态：proposal，尚未获得 owner 批准。本文只规划，不修改 compiler 行为、公开契约或产品文档。

## 结论

推荐下一项为 **FOUND-04 设计/原型**，并把 GOV-01 缩成该研究批次内部的只读 shadow evaluator；
先证明多 local anchor 的 injection anchor、semantic guard、resolved identity 与 same-class cascade，
再由 owner 在 SEL-05 compound 与 SEL-06 descendant/child 之间单独选一个实施。不要现在直接开放 SEL-04。

推荐排序：

1. FOUND-04 设计/原型（内含非产品化 GOV-01 shadow），只产出证明和 candidate artifact，不改写正式 CSS。
2. 若 FOUND-04 通过门槛，按 shadow 实测在 SEL-05 与 SEL-06 中只批准一个；当前原始上限偏向 SEL-06。
3. SEL-04 的“单 local anchor + 后代 tag”可作低收益备选；tag+class、id+class、更多 pseudo 继续 deferred。
4. GOV-01 独立产品能力暂不做；FOUND-05 保持 deferred。

## 已确认边界

- demand-first；fixture cascade oracle 只验证风险，不代表真实需求。
- semantic scoped class 与完整 fallback 始终保留。
- 不引入 JSX usage、DOM class 共现、跨 class/module 顺序推断或 FOUND-05 的替代实现。
- SEL-04 的 tag+class、id+class、更多 pseudo 和单锚点结构必须分别批准。
- adapter 不复制 selector grammar、anchor selection、identity 或 cascade guard。
- 无等价证明、收益不足或 shadow/native 不一致时继续 fallback。

## 当前真实 blocker 与 class 图

冻结 artifact：

| Adapter | report SHA-256 | manifest SHA-256 |
| --- | --- | --- |
| Vite | `31585ddd...e9f76` | `4fe3f465...bd67c` |
| Rsbuild | `851b3e99...a6670` | `b6b53856...6e92` |

report 直接值：

| Adapter | unsafe | 分布 | preserved declarations / ratio |
| --- | ---: | --- | ---: |
| Vite | 11 | descendant 6、compound 3、child 1、non-exported 1 | `143 / 0.3112` |
| Rsbuild | 16 | descendant 9、compound 3、child 1、attribute-cascade 2、non-exported 1 | `167 / 0.3235` |

双 Pilot 的 unsafe diagnostics 与 manifest 均没有 `tag-selector`、`id-selector` 或
`unsupported-pseudo`；source 也没有同 compound tag+class、id+class 或白名单外单 pseudo 的业务规则。
fixture 中 `button.oracle*` 是 cascade oracle，明确不计需求。

共享业务 class 图如下；箭头仅表示 authored selector 结构，不推断运行时 DOM 共现：

| 图/selector | direct rules / declarations | 当前 class-wide evidence |
| --- | ---: | --- |
| `ActivityTable.row[data-tone] -> state` | `2 / 4` | row、state：descendant-only |
| `BuildArtifactPanel.artifactRow[data-status] -> statusBadge` | `1 / 2` | 两 class：descendant-only |
| `ModuleMatrix.fileList -> fileItem` | `1 / 2` | 两 class：descendant-only |
| `PipelineBoard.stage -> taskCard` | `1 / 1` | 两 class：descendant-only |
| `MetricsGrid.metricCard + positive/warning` | `2 / 2` | 三 class：compound-only |
| `diagnosticProbe + acknowledgedProbe` | `1 / 1` | acknowledgedProbe compound-only；diagnosticProbe mixed |
| `diagnosticProbe -> diagnosticCode` | `1 / 2` | diagnosticCode descendant-only；diagnosticProbe mixed |
| `acknowledgedList > acknowledgedItem` | `1 / 1` | 两 class：child-only |

Rsbuild 另有 `InspectorApp.details div/dt/dd`：`3 / 9` direct declarations，只有 `details`
一个 local anchor；它是“单 local anchor + 后代 tag”结构，不是同 compound tag+class。另有
`InspectorApp.card` 的 2 条 `attribute-cascade-order`，不属于本次 selector grammar 机会。

manifest 证明全部相关 class 当前 mapping 为 0。按 unsafeReasons 的整类释放关系：

| 候选 | Vite 可完整解锁 class | Rsbuild 可完整解锁 class | authored declaration 上限 |
| --- | ---: | ---: | ---: |
| SEL-05 compound-only | 4 | 4 | `13 / 13` |
| SEL-06 两-local descendant-only | 9 | 9 | `80 / 80` |
| SEL-04 单-local descendant-tag | 0 | 1 | `0 / 12` |
| child-only | 2 | 2 | `11 / 11` |
| compound + descendant（含 mixed diagnosticProbe） | 14 | 14 | `113 / 113` |
| 再含 child；Rsbuild 再含 descendant-tag | 16 | 17 | `124 / 136` |

“上限”是从 authored source 统计的受 class-wide fallback 影响的 rule declaration occurrence，
不是可归因收益；它尚未扣除新 guard/cascade fallback，也不是 token、reuse 或字节实测。

## 路线比较

### A：直接实施 SEL-04 子集

| 子集 | 收益证据 | 复杂度/风险 | 判断 |
| --- | --- | --- | --- |
| 同 compound tag+class | 双 Pilot 0 direct blocker | specificity 可保留，但需独立 guard/cascade 矩阵 | 不投资 |
| 同 compound id+class | 双 Pilot 0 direct blocker | ID specificity、互斥与复用面更窄 | 不投资 |
| 更多单 pseudo | 双 Pilot 0 direct blocker | 每个 pseudo 的状态/函数/privacy 语义不同 | 不做泛化白名单 |
| 单 local + 后代 tag | Rsbuild 3 rules、1 class、12 上限 | 当前单 anchor seam 可延伸，但需建模“token 在祖先、声明作用于后代” | 仅备选 |

直接做前三项违反 demand-first。最后一项可实现，但仅 Rsbuild inspector 有需求，跨 adapter 复用与
字节收益未知，优先级低于真实共享的多 local 图。

### B：FOUND-04 设计/原型后决定 SEL-05/06

优点：直接对准双 Pilot 共享 blocker；可一次解决 injection anchor、semantic guard、resolved identity、
class role 与 preflight seam，避免把 compound/combinator 强塞进现有“唯一 class 即唯一语义归属”。

代价：不是小 grammar patch。错误 anchor 会把“两 class/结构同时满足”降级为单 class；未解析的 guard
进入全局 registry identity 会导致跨 module 错误复用；guard selector 的等 specificity occurrence 还可能
被 append-only registry 重排。

判断：收益上限最高，且设计先行可以在任何正式 CSS 改写前停止，是首选。

### C：先交付 GOV-01 产品化 shadow analysis

优点：以后每个 candidate 都能持续给出频率、class unlock、reuse 与风险。

代价：现有 report/manifest 缺少完整 IR、declaration occurrence 与 candidate cascade evidence；准确 shadow
必须在 Core preflight 内运行。若产品化，需要迁移 report producer、Analyzer、Vite/Rsbuild、Devtools、
overlay、static/HMR consumers 与 contract，成本可能超过本次 selector 设计。

判断：**不作为独立产品能力**。本轮把它定义为 FOUND-04 的内部研究工具和硬前置门槛；不写入稳定
report、不改变 health、不向用户宣称 candidate 已支持。若未来有持续治理需求，再单独提案产品化 GOV-01。

## FOUND-04 Core 方向

现 seam 的 `EligibleSelectorArmRewrite` 只有 `anchorClassName`、source-class-independent `identity`、
`renderAtomicSelector` 与单一 `cascadeGuard`；`planInputClassPreservation` 又会把 preserved selector 中
所有 source class 以同一 reason 整类保留。多 local selector 不能安全复用这一假设。

建议内部两阶段模型（名称仅为 proposal）：

```ts
type StructuralSelectorArm = {
  sourceClassNames: readonly string[]
  injectionAnchorClassName: string
  semanticGuardClassNames: readonly string[]
  specificity: SpecificityTuple
  resolve(scope, context): ResolvedSelectorArm
}

type ResolvedSelectorArm = {
  anchorClassName: string
  identity: string
  cascadeGuard: StructuralCascadeGuard
  renderAtomicSelector(className: string): string
}
```

- multi-local 首批固定选择 subject compound 中最右侧可导出 local class 为 injection anchor；
  descendant/child 首批选择最右侧 local class。不要用 usage/fan-out 猜测动态选择。
- 单-local descendant-tag 只能选择唯一 local ancestor，必须作为独立 policy 子集。
- 其余 local class 是 semantic guard：AST clone 中保留并由 scope resolver 解析，semantic token 不移除。
- identity 必须在 guard resolve 后生成并包含 resolved guard spelling；否则不同 module 的同名 source guard
  会错误共用首个模块的 CSS selector。暂不设计“一个 token 多个 guard selector”的新 registry/schema。
- atomic renderer 只替换 injection anchor node，保留 tag/id/combinator、spacing、node order 与 specificity。
- public `AtomicSelectorDescriptor`、manifest/report shape、class-name algorithm 和依赖保持不变；新 candidate
  产生的新 identity/class 可变化，但已有 SEL-01/02/03 contract 必须逐字节不变。
- non-exported injection anchor、resolver 异常、composes/adapter preservation evidence 或 selector-list 任一 arm
  失败时 whole-rule fallback；guard class 不因“可解析”而自动视为可注入 token。

Preflight 必须在第一次 registry mutation 前完成：

1. 建立 rule arm 的 injection/guard 角色图，不再无差别把所有 source class 当同一 mapping owner。
2. 对同 injection source class、可能 co-match、同 importance、等 specificity 的不同 guard identity，
   用现有 property competition 表判断 winner 是否可能变化；不能证明互斥则 anchor class-wide fallback。
3. media/supports 继续视为可能重叠；不增加 DOM 共现推断。
4. 不比较不同 injection source class 的共现竞争；明确继承 FOUND-05 deferred 边界。
5. preserved fallback 与 eligible rule 混合时验证 atomic-first/preserved-second 的原 occurrence winner；
   guard-only class 是否可解除当前无差别 preservation，必须由静态 oracle 单独证明，不能顺带放宽。

## 下一项 Batch 0..5 计划

### Batch 0：冻结基线与授权边界

- 固定上述四份 artifact hash、diagnostic 集合、16/18 个 selector-related manifest class entries。
- 固定已有 base/pseudo/attribute/list/pseudo-element identity、CSS、manifest/report 快照。
- owner 只授权 FOUND-04 设计/原型和内部 shadow；不授权 SEL-05/06 production rewrite。

### Batch 1：Core interface 与等价证明原型

- 在 Core 内部拆出 structural plan 与 resolved arm，不泄漏 parser node。
- 实现 prototype policy：compound、two-local descendant、child、single-local descendant-tag 分开 flag。
- 证明一对一 class node replacement、specificity 不变、guard scoping、deterministic anchor 与 whole-list fallback。
- 既有能力输出必须完全不变；任何 clean replacement 需求立即停止并另提兼容性决策。

### Batch 2：preflight + 内部 GOV-01 shadow

- 使用隔离 shadow registry 模拟 registration，不修改正式 registry、CSS、mapping 或 health。
- 输出仅供研究 artifact：candidate rules、direct declarations、exact-only/mixed class、blocked reason、
  definitions/reuse、class-string 与 raw/gzip/brotli 估算，并区分 source occurrence 与 token link。
- 为获取真实 adapter post-CSS-Modules 输入，可使用时间盒的内部 instrumentation；交付前移除，不新增公开
  `analysis` mode、report 字段或跨包 internal import。
- shadow 自身必须有“关闭时正式 artifact byte-identical”断言。

### Batch 3：Core 静态门禁

- 成功：compound、descendant、child、single-local tag descendant 各自独立 cases。
- 保守：non-exported injection、guard resolver、mixed list、global、nested、unsupported at-rule、composes preserve。
- cascade：same guard/different guard、A-B-A、重复属性、shorthand/longhand、important、media/supports、
  selector specificity、guard-only class preservation，以及零正式 registry mutation。
- 运行 `pnpm --filter @semantic-atomic-css/core verify`；此批仍不批准正式转换。

### Batch 4：adapter/static/browser/HMR 候选验收

- Vite/Rsbuild 只透传 Core candidate artifact；不得解析 selector 或自行选 anchor。
- 两套 fixture 增加最小 compound/descendant/child oracle，static 检查 scoped guard、token owner、descriptor CSS、
  deterministic output；fixture 仍只算验证，不计收益。
- semantic/native dev + preview 对比普通、变体、祖先条件、child/descendant 负例、desktop/narrow。
- HMR 修改/移除 guard rule，验证 token、shared style owner、stale selector 和 report snapshot 清理。
- 正式模式继续 fallback；candidate 模式仅 shadow，不影响页面 computed style。

### Batch 5：双 Pilot gate 与单项实施选择

- 同一 source 冻结 semantic/native baseline，验证 files/sourceClasses/before bytes 与 native hash 可比。
- 分别报告 compound、two-local descendant、child、single-local descendant-tag 的 class-wide 实测，不合并宣传。
- owner 仅在此处选择 SEL-05 或 SEL-06 的一个最小子集；selection 之后另建 production design/acceptance。

## 成功、停止与回滚

成功门槛：

- candidate shadow 对当前正式 CSS/manifest/report/tokens 为 byte-identical；native artifact 不变。
- 目标子集 100% direct blocker 有可解释 outcome，mixed class 不被冒充 exact unlock。
- 至少双 Pilot共享一个子集获得 `>= 2` exact-only class，且实测 estimated total diff 不恶化；
  definitions/reuse、preserved declaration 与字节口径可复算。
- Core 静态 oracle、两 adapter static、full visual 与 HMR 全绿，0 computed differences、0 stale selector。

停止条件：

- 需要 JSX/DOM 共现、跨 module order、FOUND-05 或移除 semantic/fallback 才能证明安全。
- guard identity 必须新增多-selector registry/schema，或已有 SEL-01/02/03 output 被迫改变。
- candidate 只释放 mixed class、只在 fixture 出现、Pilot estimated total diff 恶化，或 Vite/Rsbuild 分类不稳定。
- 任一 silent miscompile、无法归因的 class-wide unlock 或非确定输出。

回滚策略：candidate policy flag 默认关闭；删除 prototype/shadow hook 即恢复既有 planner 与 class-wide fallback。
若后续 production 批次失败，只撤回对应 SEL-05/06 policy，保留 semantic scoped token、原 selector fallback、
既有 public reason/schema 和 FOUND-04 设计证据。

## API、schema、依赖与 owner 最小确认

- 计划阶段及 FOUND-04 原型不改变 public API、manifest/report/dev envelope/schema、health 或生产依赖。
- Core 继续只依赖结构化 CSS/selector AST；Analyzer 不读取文件，adapter 不复制 grammar，Devtools 只消费稳定协议。
- 若未来产品化 GOV-01，必须另行确认 current-schema clean replacement 和全 consumer 迁移，不能由本方案暗含授权。

owner 只需确认两项：

1. 是否批准“FOUND-04 设计/原型 + 内部非产品 GOV-01 shadow”为下一 Work Item，且不授权 production rewrite？
2. 是否接受 prototype 的确定性 anchor 规则：multi-local 选最右侧 subject local，单-local descendant-tag 选唯一 local？

未确认前，SEL-04、SEL-05、SEL-06 与 GOV-01 均保持现有 candidate/design-required 状态。
