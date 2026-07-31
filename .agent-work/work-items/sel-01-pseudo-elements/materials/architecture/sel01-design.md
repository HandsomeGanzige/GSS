# SEL-01 单 local anchor pseudo element 内部设计

## 结论

建议只开放四种等价输入：`.class::before`、`.class:before`、`.class::after`、
`.class:after`。parser 仍由 `postcss-selector-parser` 提供，Core 将 legacy 单冒号与双冒号分别
规范化为 `::before`、`::after`，同一 canonical 值同时用于 atomic identity、atomic renderer
和 registry mutation 前的 cascade guard。`before` 与 `after` 是两个独立 pseudo box，不互相
阻断；`:before` 与 `::before` 命中同一个 pseudo box，必须作为可能竞争的等 specificity
occurrence 处理。

本方案不改变 public API、manifest/report schema、atomic descriptor 形状、生产依赖或 adapter
职责。semantic scoped class 继续保留；无法证明 occurrence 重排安全时，整个 source class 在首次
`registry.register` 前 fallback，并复用既有 `pseudo-element` reason，不增加新的公开 reason。

## 已确认约束与本方案假设

已确认约束：

- grammar 只覆盖单 local anchor 的 `before` / `after`，且 legacy 单冒号必须支持；不开放任意
  pseudo element。
- SEL-01 arm 不进入 selector list；包含 SEL-01 形态的任意 list 仍以 `selector-list` 完整保留。
- legacy alias 参与 cascade 时必须规范化；公共 schema 保持不变；semantic class 始终保留。
- 不把 selector grammar、guard 或 renderer 复制到 Vite/Rsbuild adapter。

本设计采用的内部选择是：不仅 guard 规范化，atomic identity 和 renderer 也统一输出双冒号。
这是 recommendation，不改变 preserved renderer：class-wide fallback 仍只 scope local class，保留
Core 实际收到的 `:before` 或 `::before` spelling。

## 仓库证据

- `planSelectorRewrite.ts` 已是 selector parse、grammar、identity、atomic renderer 和 preserved
  renderer 的单一入口；eligible arm 已携带内部 `cascadeGuard`，适合局部扩展而无需公共 schema。
- `planInputClassPreservation.ts` 已在 registry mutation 前收集完整 input evidence，并对 SEL-02
  attribute/pseudo 竞争、单 rule 竞争 occurrence 和 SEL-03 class 连接分量做固定点保留。
- SEL-03 的实现已证明 planner 可以先形成 arm 决策、再在任何注册前因 list/evidence 整体回退；
  SEL-01 应复用该顺序，不引入 rollback。
- parser probe 表明四种输入都产生无子节点的 `pseudo` node，`value` 分别为 `:before`、
  `::before`、`:after`、`::after`；在 AST clone 上把 value 设为双冒号后，serializer 稳定输出
  `.__GSS_ANCHOR__::before` / `.__GSS_ANCHOR__::after`。
- 当前同一业务语料中，Vite Pilot 有 3 条 `::before / pseudo-element`，Rsbuild Pilot 将同三条
  规范化成 `:before / unsupported-pseudo`。两端都只有 `SelectorMatrix.selectorValue` 是
  pseudo-only class；`PipelineBoard.taskCard` 另受 descendant evidence 阻断，
  `DiagnosticsRoute.diagnosticProbe` 另受 compound/descendant evidence 阻断。

## 方案比较

### A. identity/renderer 保留输入 spelling，仅 guard 规范化

优点是改动最小，并与 attribute selector 的 serializer-preserving 策略表面一致。缺点是同一业务
源码经 Vite/Rsbuild 后会得到不同 identity、class name 和 descriptor CSS；`:before` 与
`::before` 也不能复用相同 declaration。legacy alias 已有明确的语义等价关系，因此这种差异没有
产品价值，并削弱跨 adapter 的稳定性。

### B. identity、renderer 与 guard 全部 canonicalize（推荐）

四种输入先按 `before` / `after` 分类，再为 atomic plan 输出双冒号 canonical template。它让
同一 selector 在两个 adapter 中具有相同 identity/key/class，alias 可安全复用；guard 也使用同一
canonical 值，不会漏掉 `:before` / `::before` 竞争。代价是 atomic CSS 不逐字保留 legacy spelling，
但双冒号是两者共同的标准等价输出，fallback CSS 仍保持输入 spelling。

### C. 开放所有无参数 pseudo element 或顺带允许 selector list

这会把 `::marker`、`::first-line`、functional pseudo、list 原子注册与新的 cascade/specificity
问题带入同一批次，超过已确认边界，也没有 Pilot 需求证据。拒绝该方案。

## 可直接实现的 grammar

在 `planSelectorArm` 中先识别 pseudo-element candidate，再进入现有通用 unsafe detail 收集：

1. root 只能有一个 selector arm；多个 arm 时 SEL-01 不 eligible。
2. arm 顶层必须恰好两个 node，顺序固定为一个非 `:global` local class，随后一个无子节点的
   `pseudo` node；不能有 combinator、tag、id、attribute、额外 class 或其他 pseudo。
3. pseudo node value 只接受 `:before`、`::before`、`:after`、`::after`。
4. source class escape 继续由 parser 解码；anchor replacement 继续在 AST clone 上执行。
5. `.x::first-line`、`.x::marker`、`.x::part(name)` 等双冒号 near-miss 继续
   `pseudo-element`；`.x:visited` 等单冒号 near-miss 继续 `unsupported-pseudo`。组合结构沿用
   现有稳定 primary reason 优先级。
6. `.a::before, .b::before`、`.a, .b:before` 以及 base/attribute/pseudo-class 与 SEL-01 混合的
   list 均完整 `selector-list` fallback，不能注册安全 arm。

建议增加内部 helper：

```ts
type SupportedPseudoElement = '::before' | '::after'

function canonicalizePseudoElement(value: string): SupportedPseudoElement | undefined
```

helper 只接受上述四个 exact value，不做大小写折叠，也不接受 parser 能解析的其他 pseudo。

## Identity 与 renderer

eligible arm 的结果如下：

| 输入 | identity | atomic renderer |
| --- | --- | --- |
| `.button:before` | `.__GSS_ANCHOR__::before` | `._token::before` |
| `.button::before` | `.__GSS_ANCHOR__::before` | `._token::before` |
| `.button:after` | `.__GSS_ANCHOR__::after` | `._token::after` |
| `.button::after` | `.__GSS_ANCHOR__::after` | `._token::after` |

renderer 必须 clone 单 arm AST，只替换 direct anchor class，并把已识别的 pseudo node value 改为
canonical 双冒号；不得用字符串拼接。`renderPreservedSelector` 不调用 canonicalizer，只 scope local
class，因此 fallback 的 selector spelling、wrapper 和输入顺序不变。resolver/export callback 的
`originalSelector` 仍是完整原 selector。

identity 中 `before` / `after` 必须不同；element base、现有 pseudo class、attribute 与 pseudo
element 也继续是不同 identity。descriptor 仍只有 `{ identity, css }`，无需 version、kind 或 alias 字段。

## Legacy alias cascade guard

扩展仅供 Core preflight 使用的内部 union：

```ts
type SelectorCascadeGuard =
  | ExistingGuards
  | { kind: 'pseudo-element'; name: '::before' | '::after' }
```

`name` 必须来自 canonicalizer。`planInputClassPreservation.ts` 将现有 attribute 专用判断收敛成
selector guard 判断，但保持 SEL-02 行为不变：

- pseudo-element pair 只有在两侧均为 `kind: 'pseudo-element'` 且 canonical name 相同时才可能
  竞争；所以 `:before` 与 `::before` 竞争，任意 before 与任意 after 独立。
- pseudo element 不与 base、现有 pseudo class或 attribute guard 竞争：它们要么作用于不同 box，
  要么 specificity 不同；不能复用 attribute 的 overlap 规则。
- 同一 pseudo-element rule 内也执行 occurrence 检查，覆盖 `A -> B -> A` 和 registry 先前已确定
  相反 key 顺序的风险。
- 两条可能竞争的 rule 继续复用 `classifyPropertyCompetition`：importance 不同或 same-property
  同 trimmed value 可放行；same property 不同 value、shorthand/longhand、未知关系均 fallback。
- `@media` / `@supports` 不作为互斥证明。
- 若 class 已有 descendant/nested/block/config/non-exported evidence，保留首次 reason，不额外伪造
  pseudo reason。

guard 命中时使用既有 `pseudo-element` 作为内部 preservation seed，并只让真正被 guard 阻断的
SEL-01 rule 产生既有 `unsafe-selector / pseudo-element`；同 class 的 base/其他 eligible rule 只
跟随 class-wide preservation。这样 warning/report 可追踪，同时不增加 public enum 或 schema。

preflight 必须在第一次 registry mutation 前完成。新鲜 transformer 中只有竞争 class 时，
`result.atomic`、`result.css.atomic`、`transformer.getManifest().atomic` 和
`transformer.getAtomicCss()` 必须全部为空；有 independent class 时只允许 independent token 出现。

## Selector-list 与 preservation

SEL-03 的“全部 arm eligible 即转换”需要增加一条明确 policy：任何 arm 的 guard kind 为
`pseudo-element` 时，整个 list 按 `selector-list` preserved。该判断发生在返回 eligible list 之前，
并保留整个 root 的 source/global class evidence。不能先把 pseudo arm 暴露给 registration loop。

list fallback 仍是 class-wide seed；已有连接分量固定点传播继续生效。custom property 等 preserved
declaration 在 eligible 的单 pseudo-element rule 中只保留原 selector 一次，不复制 warning、CSS 或
report occurrence。semantic resolved class 始终存在于 suggested token，SEL-01 不新增移除 semantic
class 的模式。

## 代码接入点

| 文件 | 改动职责 |
| --- | --- |
| `packages/core/src/selector/planSelectorRewrite.ts` | 四值 grammar、canonicalizer、canonical identity/renderer、pseudo-element guard、list 排除 |
| `packages/core/src/engine/planInputClassPreservation.ts` | alias overlap、before/after 独立、property competition、class-wide preflight 与零部分注册 |
| `packages/core/src/engine/transformCss.ts` | 公共入口保持不变；无需新增参数或 schema，只用于端到端 contract 验证 |

adapter 不增加 parser、canonicalizer 或 guard；继续消费 Core descriptor/tokens/diagnostics。公共 types、
manifest/report producer 与 consumer 不需要迁移。

## 测试矩阵

### `packages/core/test/selector.test.ts`

- 四种输入全部 eligible；两个 before identity/renderer 完全相同，两个 after 完全相同，before/after
  不同；escaped source class 与 repeated render clone 稳定。
- preserved renderer 分别保留 `:before` / `::before` 原 spelling 并只 scope class。
- `::first-line`、`::marker`、functional pseudo、pseudo+attribute、pseudo+pseudo、tag/id/combinator、
  compound class 与无 anchor 继续保守 reason。
- 含 SEL-01 的全 pseudo list、base+SEL-01 list 和 legacy+modern alias list 全部
  `selector-list`，保留全部 class evidence。

### `packages/core/test/cascadeOracle.test.ts`

- `.x:before` 与 `.x::before` 的同 importance 竞争属性整类 fallback；断言零部分 registry。
- 相同 alias condition + same property/same value 可复用；disjoint property、不同 importance 可放行。
- `::before` 与 `::after` 即使同 property 不互相阻断，并生成两个不同 identity/token。
- 单 rule `A -> B -> A`、shorthand/longhand、未知 property 关系、跨 media/supports alias 竞争均 fallback。
- 后置 unsafe/nested/block evidence 仍在注册前覆盖，independent class 继续 atomize，首次既有 reason 不被
  pseudo guard 覆盖。
- eligible pseudo rule 的 custom property preserved、普通 `var(...)` declaration atomized，原 selector
  只输出一次且顺序不变。

### `packages/core/test/selectorList.test.ts`

- 全部 pseudo arms、mixed base/pseudo、mixed legacy/modern 三类 list 均完整 fallback。
- list 后跟关联 eligible rule 时 class 连接传播，fresh transformer 的 atomic manifest 无任何目标 class
  registration。
- non-exported/config preservation 继续传播，不伪造新的 unsafe reason。

### 其他 contract 与验收

- 在 `packages/core/test/selectorOutputContract.test.ts` 固定 before/after canonical
  identity、key/class、descriptor CSS、media/supports/important 与 readable/hash 输出。
- 最低静态门禁：`pnpm --filter @semantic-atomic-css/core verify`，随后
  `pnpm --filter @semantic-atomic-css/vite verify`、`pnpm --filter @semantic-atomic-css/rsbuild verify`
  和根 `pnpm verify`。
- 两套 adapter fixture 都增加 semantic/native dev/preview pseudo-element case；用
  `getComputedStyle(element, '::before')` / `getComputedStyle(element, '::after')` 对比 `content`、
  `color` 和至少一个布局属性，并运行两个 fixture 的 `test:visual`。adapter 只增加验收语料和断言，
  不增加生产逻辑。

## 双 Pilot baseline 与收口门槛

当前仓库 `dist` 可作为实施前快照来源，但必须在代码修改前复制到独立临时目录并记录 hash；ignored
产物不能被后续 build 覆盖后冒充 baseline。

| 门槛 | Vite Pilot | Rsbuild Pilot |
| --- | ---: | ---: |
| files / source classes / before raw CSS bytes | `17 / 212 / 44341` | `23 / 228 / 46943` |
| 当前 pseudo authored diagnostics | `3 × pseudo-element` | `3 × unsupported-pseudo` |
| pseudo-only potentially unlockable class | `1` | `1` |
| 当前 preserved ratio | `0.3264` | `0.3369` |
| 当前 estimated total diff | `-15251` | `-14961` |

收口必须满足：

1. baseline/current 的 `files`、`sourceClasses`、`beforeRawCssBytes` 完全相同；否则不计算因果 delta。
2. 两端三条 before authored diagnostic 都从旧 pseudo reason 中消失；
   `SelectorMatrix.selectorValue` 保留 semantic token且获得非空 atomic mapping。
3. `PipelineBoard.taskCard` 与 `DiagnosticsRoute.diagnosticProbe` 仍因各自现有
   descendant/compound evidence 整类 fallback，不能为了展示收益清除其他 reason。
4. 记录 atomic definitions、reuse registrations、preserved rules/declarations、preserved ratio、
   raw/gzip/brotli、class-string increase 和 estimated total diff 的同语料差值。若 exact-only class 未释放，
   或两端 estimated total diff 任一变差，则能力不进入完成状态，回到 owner 评估。
5. semantic/native preview 在 `1280 × 844` 与 `390 × 844` 下逐项对比三处 `::before` 的
   computed `content`、color/background 和代表性布局属性；before CSSOM rule、semantic token 和页面
   console 也必须通过。Rsbuild 输入为 legacy `:before` 时，atomic CSSOM 必须是 canonical
   `::before`。

## 文档清单与回滚

实施时同步更新：

- `semantic-atomic-css-plugin-plan.md`：safe grammar、identity/renderer、list 排除与 preflight 规则。
- `packages/core/CORE_DESIGN.md`：内部 guard、canonical alias、preservation 与验收 contract。
- `docs/phase-8-capability-hardening-backlog.md`：SEL-01 状态、边界和实测收益。
- 新增或既有 SEL-01 design/acceptance 文档：成功、保守失败、静态/visual/Pilot 证据。
- `docs/selector-capability-benefit-review.md` 与两份 Pilot tracking：只记录同语料因果 delta，不把历史
  token links 或 authored count 冒充实际收益。

若 Core、任一 adapter visual 或 Pilot computed style 出现差异，回滚点只需关闭四值 grammar，让四种
selector 恢复原 preserved fallback；semantic class、preserved renderer、public schema 和 adapter
消费路径均无需迁移或清理。
