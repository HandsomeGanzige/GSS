# Phase 8 Selector-aware Identity / Renderer 与 Cascade 方案

## 文档状态

- Status: `completed`
- 生命周期：`FOUND-02` 历史设计与验证证据；当前能力状态以 Phase 8 backlog 为准
- 对应待办：`FOUND-02`
- 创建日期：2026-07-21
- 完成阶段：`FOUND-02-0/A/B/C/D` 已于 2026-07-25 完成

本文档记录已确认的 `FOUND-02` 设计与证据；`FOUND-02` 本身没有开放新 selector。后来单独确认的
attribute、pseudo element 与 selector list 能力分别记录在对应 Phase 8 设计和验收文档中；本文不重复
维护后续能力的动态状态。

## 结论摘要

`FOUND-01B` 已经把 selector AST 知识收敛到 `planSelectorRewrite(selector)`。本迁移启动前，后续链路曾由
`CssTransformContext.pseudo` 承担 atomic key、class name、renderer 与 analyzer context 四种职责；若当时只把
`pseudo` 扩展成更多字符串字段，selector 知识会再次扩散到 core、Vite、Rsbuild 和 analyzer。

已确认方案是：

1. 先修复已复现的同 source class atomic/preserved cascade 反转，作为 `FOUND-02-0` correctness 门禁。
   evidence 必须同时覆盖普通 rules、nested rules 和 unsupported preserved blocks；无法解析时在 registry
   mutation 前 fail fast。
2. 使用必填、可序列化的 `AtomicSelectorDescriptor` 替代 public `context.pseudo`。
3. descriptor 只包含 opaque identity 与 core 预渲染的最终 selector CSS；adapter 不解析 identity、
   不拼 selector，也不接收 AST/template closure。
4. 当前 `.class` 和五种已支持 pseudo class 一并 clean replacement，不保留 compatibility codec；
   允许 atomic key、readable/hash class、manifest 与 snapshot 一次性变化。
5. 项目未投产，所有包只支持当前契约；不引入 schema/key version、legacy reader 或
   dual truth，按 Core → Analyzer → Devtools → Vite → Rsbuild → fixture 分批迁移。
6. 建立 static + Vite/Rsbuild visual cascade oracle；通过后仍需为每个 `SEL-*` 单独确认开放。
7. 删除 `preserveResolvedClass` 配置，始终保留 semantic scoped class，确保任何 fallback 都有 DOM hook。
8. 不同 source class 在同一元素上形成 atomic/fallback 等优先级顺序竞争，当前作为明确不支持的
   authoring pattern 延期处理；不阻塞 `FOUND-02-C`、收益复盘或后续单项 selector 实验。

该方案解决 selector 表达与交接问题，但不会自动证明所有跨 class、跨 module cascade 安全。
没有 usage/import evidence 的部分继续作为显式边界，不得包装成“已证明等价”；其中已明确延期的
atomic/fallback 跨 class 顺序竞争不在当前批次重复提请决策。

## 当前事实与数据流

`FOUND-02-B1` 后 Core 链路是：

```txt
planSelectorRewrite(selector)
  → identity + renderAtomicSelector(className)
  → createAtomicKey({ declaration, selectorIdentity, context })
  → registry 选择 className 并存储 { identity, css }
  → AtomicDeclaration.selector
  → Core renderer 直接消费 selector.css
  → manifest 防御性复制 descriptor
```

仓库证据：

- `planSelectorRewrite` 持有 source-independent canonical identity 和 clone-based
  `renderAtomicSelector(className)`，两者已进入 Core registry/output。
- `CssTransformContext` 是 public type，只包含 media/supports；selector 命中语义由必填 descriptor 表达。
- Core 已删除 pseudo selector 拼接；Analyzer 已改为消费 descriptor identity；Vite 与 Rsbuild
  renderer 均已完成 descriptor CSS 迁移。
- 两个 adapter 必须继续持有可序列化 atomic records，用于跨 module key 去重、条件分区、
  breakpoint 排序和 dev/HMR 快照失效；AST closure 不能越过 core 单次 transform。
- analyzer 已按 `selector.identity + media + supports + important` 分组，conflict detail
  必填输出 selector identity，且不使用 class-specific descriptor CSS 作为分组值。
- Devtools 已改为无人为 schema version 的当前 report 契约；nested report 原样透传，
  overlay 仅校验展示必需字段，不复制 Core/Analyzer 完整模型。
- 两套 fixture static 与 Rsbuild Playground inspector 已只消费当前 manifest selector descriptor
  和当前 build report；exact selector rule 与真实 bundle token mutation 门禁证明这些静态
  consumer 不依赖旧 class 片段。
- 两套 fixture visual 已只消费当前无版本 `adapter/status/environments` dev envelope，并覆盖
  overlay、HMR update/remove 与 stale selector 清理。
- Vite/Rsbuild 当前都输出“全局 atomic 在前、各模块 preserved 在后”。稳定 source-id 排序保证可复现，
  但不是原生 import/source order 证明。

详细路径证据见：

- `packages/core/src/selector/planSelectorRewrite.ts`
- `packages/core/src/atomizer/createAtomicKey.ts`
- `packages/core/src/atomizer/createAtomicClassName.ts`
- `packages/core/src/output/renderAtomicCss.ts`
- `packages/vite/src/plugin.ts`
- `packages/rsbuild/src/atomicCss.ts`
- `packages/analyzer/src/index.ts`

## `FOUND-02-0` 前已复现的 correctness 风险

该历史风险不依赖未来 `::before` 或 attribute selector；当时的 safe/unsafe 组合已经可以触发：

```css
.button,
.link {
  color: blue;
}

.button {
  color: red;
}
```

原生 CSS 中，`.button` 两条规则 specificity 相同，后出现的 `red` 获胜。

`FOUND-02-0` 修复前的 GSS 结果为：

```css
._color_red {
  color: red;
}

.s_button,
.s_link {
  color: blue;
}
```

`styles.button` 同时包含 `s_button _color_red`，最终由后输出的 preserved `blue` 获胜。
当时的只读 probe 已复现该结果；根因是 engine 逐 rule 决策，同一 class 出现在 unsafe selector
时不会阻止其后 eligible rule atomize，而输出阶段固定把全部 atomic 提前。

因此 `FOUND-02` 不能只做 schema/renderer 重构。该问题已由完成的 `FOUND-02-0` class-wide
preservation 修复；本节保留为后续 cascade oracle 的设计依据。

## 设计目标

1. 让 selector identity 和最终 selector CSS 成为 registry、adapter、manifest 与 analyzer 的
   唯一可序列化 selector 描述。
2. 保持 `planSelectorRewrite` 是 AST/policy/render 的唯一深模块 interface。
3. 保持 `ScopeStrategy` 为 class-level adapter seam，不向 adapter 暴露 selector AST/template。
4. 以无版本 clean replacement 统一当前与未来 selector key/class 生成，不维护旧 key/class 兼容路径。
5. 修复已证明的 atomic/preserved 同 class cascade 反转，并建立后续能力共用的证据矩阵。
6. 无类型边界只校验当前执行必需的具体字段，不通过 version 分流或兼容旧结构。
7. 对 preserved block evidence 和 semantic class token 可用性建立显式保守路径。

## 非目标

- 不在 `FOUND-02` 开放任何新 selector。
- 不引入 JSX/TSX usage metadata、跨 class 共现推断或 module import-order metadata。
- 不处理不同 source class 在同一元素上形成的 atomic/fallback 等优先级顺序竞争；当前项目把该写法
  视为不受支持，留到最终 correctness 优化时单独设计。
- 不用 `@layer` 解决通用顺序问题；Phase 4 已证明 layered normal declaration 会输给未分层 author CSS。
- 不把 AST、sentinel、template 替换协议或 render closure 写入 public result/manifest。
- 不为统一少量格式化代码新增没有必要的 public renderer runtime export。
- 不移除 semantic scoped class，不改变普通 CSS、preprocessor 或构建工具边界。
- 不把 `preserveResolvedClass: false` 与 fallback 的现有 silent failure 当作可接受兼容行为。

## 迁移方案比较

### 方案 A：直接 clean replacement

形态：删除 `context.pseudo`，所有 key/class name 直接使用 selector identity，manifest/report 与
adapter 一次切换。

优点：

- interface 最简单，没有兼容分支。
- selector identity 从第一天就是唯一 key 语义。

已接受影响：

- 当前 `.class` / `.class:hover` 的 key 与 hash class 全部变化。
- readable class、collision suffix、manifest snapshot、DOM token 与 fixture 大面积震荡。
- 这是一次显式 breaking output migration，必须通过 semantic contract tests、
  exact output golden 和 semantic/native visual 对照等具体证据收口。

结论：已确认采用。长期只有一个 selector interface，比保留旧 codec 更符合当前仓库阶段。

### 方案 B：长期 dual-write

形态：保留 `context.pseudo`，新增可选 selector descriptor；renderer 优先 descriptor，缺失时继续拼
`pseudo`。

优点：

- 旧 JSON consumer 可以较平滑地继续读取。
- 可以分 package 逐步迁移。

问题：

- 同一 selector 存在两个 truth，长期会产生不一致。
- 旧 consumer 遇到未来 selector 时可能静默渲染错误，而不是 fail fast。
- `compatibilityPseudo` 实际没有退出，selector 知识仍泄漏到 analyzer/adapter。

结论：拒绝。实现过程中也不提交或验收 dual-write 中间态。

### 方案 C：版本化 descriptor + v1 key compatibility codec

形态：public/schema 使用必填 descriptor，删除 `context.pseudo`；core 内部只对当前六种 selector
保留精确的旧 key/class 编码，新 selector 使用版本化 identity key。

曾考虑的优点：

- 对 caller 只有一个 selector truth，module interface 更深。
- 现有 key/class/CSS 可以冻结，避免无价值 churn。
- 新 selector 无法被旧 schema consumer 静默接受。

拒绝原因：

- core 内部长期保留一个很小且有 golden test 的 v1 codec。
- 当前 package 仍处于 private `0.0.0`，长期保留 codec 的复杂度高于一次性 output migration 的收益。
- codec 会让旧实现继续成为新 key/class interface 的隐藏约束，降低 selector module 的 locality。

结论：拒绝。保留本节只记录 tradeoff，不进入实现。

## 推荐 interface

概念形态：

```ts
type AtomicSelectorDescriptor = {
  identity: string
  css: string
}

type CssTransformContext = {
  media?: string
  supports?: string
}

type AtomicDeclaration = {
  key: string
  className: string
  selector: AtomicSelectorDescriptor
  declaration: DeclarationMeta
  context: CssTransformContext
  sources: SourceLocation[]
}
```

interface 语义：

- `identity` 是 selector 模块生成的 opaque、source-independent equality key。caller 只能比较，不能解析。
- `css` 是 registry 确定 class name 后，由 plan 的 clone-based renderer 立即生成的最终 selector。
- descriptor 必填；不存在 descriptor 与 legacy pseudo 两种 public truth。
- `context` 只承载 `@media` / `@supports` 条件，不再混入 selector 维度。
- adapter 只读取 `selector.css`，不拼 class/pseudo，不识别 sentinel/template。
- analyzer 使用 `selector.identity + media + supports + important` 作为 conflict context。
- manifest/report 输出 descriptor；diagnostic 仍可保留原 source selector，二者职责不同。

数据流：

```txt
planSelectorRewrite AST plan
  → identity + 临时 render closure
  → registry 使用 selector key seed 选择/复用 key 与 class
  → 同步 renderAtomicSelector(className)
  → 保存纯数据 AtomicSelectorDescriptor
  → core/Vite/Rsbuild 读取 selector.css
  → analyzer 读取 selector.identity
```

closure 不进入 registry 长期状态、public result 或 adapter。这样既保留 selector module 的 locality，
又满足两个 adapter 的序列化/HMR 需求。

## Clean key/class replacement

当前 eligible identity 只有：

- base `.class`
- `:hover`
- `:focus`
- `:active`
- `:disabled`
- `:focus-visible`

当前六种 selector 与未来 selector 使用同一 key input：

```ts
type AtomicKeyInput = {
  declaration: DeclarationMeta
  selectorIdentity: string
  context: CssTransformContext
}
```

约束：

- `selectorIdentity` 必须进入 key；current 与 future selector 不分 legacy/new 分支。
- readable class 使用 selector module 提供的稳定、结构无关 hint，或统一使用 identity hash 片段；
  具体格式在 `FOUND-02-B` 执行方案中确认，但不复刻旧 pseudo 拼接路径。
- hash class、collision suffix、manifest key 与 CSS snapshot允许变化，并以语义 contract 测试固定新结果。
- `compatibilityPseudo` 与 public `context.pseudo` 一次删除，不换名、不 dual-write。
- `AtomicKeyInput` 作为 core internal 类型，不继续从 package interface 导出。

## Clean replacement 策略

`FOUND-02` 已确认为只支持当前契约的无版本迁移：

| Surface / consumer | 当前 selector 形态 | 迁移结果 |
| --- | --- | --- |
| `TransformCssResult.atomic` / `AtomicDeclaration` | `context.pseudo` | 必填 `selector` descriptor；context 只含 media/supports |
| `AtomicManifestEntry` / persisted manifest | 复制 `context.pseudo` | 必填 descriptor，不增 schema version |
| `AtomicKeyInput` | public declaration + context | 移回 Core internal，使用 selector identity，不继续公开 |
| `SelectorAnalysis` | public compatibility type，含 `pseudo` | 从 public exports 删除 |
| `BuildAnalysis.DeclarationConflict` | selector 维度藏在 `context.pseudo` | 已完成：`selectorIdentity` 必填，context 只含 media/supports |
| Vite renderer | 自行拼 selector | 已完成：只读 descriptor CSS，保留 Vite 聚合与 cascade 顺序 |
| Rsbuild renderer | 自行拼 selector | 已完成：只读 descriptor CSS，保留聚合、collision 与 cascade 顺序 |
| Rsbuild runtime bridge/dev snapshot | 序列化 AtomicDeclaration 子集 | 已完成：传递 descriptor 和当前 `{ sources }` 结构 |
| Devtools | 读取当前 report | 已完成当前 report 契约迁移，不建立 version 分流 |
| fixture static / Playground inspector | 读取当前 report/manifest | 已完成：只读当前 manifest selector descriptor 与 build report，不建立 version 分流 |
| fixture visual | 读取 dev report runtime envelope | 已完成：只读当前无版本 `adapter/status/environments` envelope |
| `TransformCssOptions.preserveResolvedClass` | 历史上可删除 semantic class | 已删除；mapping 始终包含 resolved semantic class |

迁移期间没有同时输出 pseudo 与 descriptor，也没有保留 compatibility type/reader/renderer。
当时采用 Core-first 顺序，并允许尚未迁移的下游包暂时 typecheck 失败；后续批次已全部迁移到
当前契约，根门禁与两个 adapter visual 也已恢复通过。

## `FOUND-02-0`：现有 cascade correctness 前置修复

### 推荐最小修复

core 在 registry mutation 前进行两遍 input 分析：

1. 第一遍收集每个 input 中所有 preserved/unsafe selector 的 `sourceClassNames`，覆盖普通 rule、
   nested rule 的完整 block 以及 unsupported at-rule `preservedBlocks` 内的 rules。
2. 只要某 source class 出现在 preserved/unsafe selector 中，该 class 的 eligible rules 也完整 preserved。
3. 同一 class 的规则由 `renderPreservedCss` 按原始 `order` 输出，恢复 class 内原顺序。
4. preserved/nested block class evidence 无法解析时，在 registry mutation 前透传原 parser error；不能在
   evidence 不完整时继续注册 atomic declarations，也不得原样输出未 scoped CSS 或静默丢弃 rule。

对上面的反例，`.button` 不再获得 `_color_red`，两条规则都按原始顺序进入 preserved CSS，结果恢复 red。

这是保守 correctness floor：它会降低 atomization rate，但不扩大语义、不需要 usage metadata，且可以
复用已有 `preserveClassNames` 的“整类保留”思想。它只解决已证明的 same-input/source-class
atomic-vs-preserved 反转，不宣称解决所有 atomic-vs-atomic 或跨 class/module 问题。

### Semantic class preservation

整类 preserved 依赖 resolved semantic class 仍存在于 DOM。当前 `ClassMappingBuilder` 在
`preserveResolvedClass: false` 时只输出 atomic tokens；若整类 fallback 后 atomic token 为空，
preserved selector 将完全无法命中。

已确认规则：

- 从 `TransformCssOptions` 删除 `preserveResolvedClass`。
- `ClassMappingBuilder` 始终把 resolved semantic class 放在 atomic classes 之前。
- Vite/Rsbuild 不再补默认值或转发该选项。
- 不提供 legacy false、自动兼容或条件 fail-fast 分支；显式使用旧字段由 TypeScript excess-property
  检查和 adapter 配置保护拒绝。

该 clean replacement 修复当前配置在 unsafe selector、custom property、nested/unsupported block
等 fallback 路径下已经存在的 silent failure。

### 为什么不只让 analyzer 报警

该反例是确定的 silent miscompile，不只是“可能风险”。AGENTS.md 的正确性红线要求无法证明安全时
保留 CSS；仅把它标成 `risky` 仍会输出错误 CSS，因此不足以作为修复。

### Owner 需要接受的影响

- 含有任一 unsafe selector 的 source class，其当前 safe declarations 也不再 atomize。
- report 中 atomic/reuse 数可能下降，preserved ratio 上升。
- Vite/Rsbuild/Pilot 的 CSS、manifest 和 report 会发生有意变化，但 native computed style 应恢复一致。

## Cascade 证据模型

### 只有相对顺序反转时才需要 order 判定

candidate 从原位置移动到全局 atomic 区后：

- candidate 原本位于 preserved rule 之前：两者仍是 candidate → preserved，顺序未反转。
- candidate 原本位于 preserved rule 之后：输出变为 candidate → preserved，顺序反转。

但是否影响结果还取决于 target 共现、importance、specificity、属性与条件重叠。

### 证据矩阵

| 场景 | order 是否可能决定结果 | `FOUND-02` 门禁 |
| --- | --- | --- |
| declaration 属性互不竞争 | 否 | 可忽略该 pair |
| normal 与 `!important` 竞争 | 否，由 importance origin 决定 | 验证 rewrite 不改变 important |
| 同 importance、specificity 不同 | 通常否，由 specificity 决定 | 必须证明 rewrite specificity 不变 |
| 同 importance、同 specificity，candidate 原本在 fallback 前 | 相对顺序未反转 | 可保留当前 winner |
| 同 importance、同 specificity，candidate 原本在 fallback 后 | 是，已反转 | 同 source class 必须整类 fallback；不同 source class 共现属于当前明确延期边界 |
| 重复同属性不同值 | 是 | 比较原始 occurrence，不依赖 class token 顺序 |
| shorthand/longhand | 是 | 使用 analyzer 的保守 property overlap 表 |
| 相同值的重复 declaration | winner 值不变 | 仍检查 side effect/serialization，不报冲突 |
| base 与条件 rule | 条件生效时可能 | 条件可能重叠就完整比较 |
| 两个 `@media` / `@supports` | 可能 | 只有可证明互斥时忽略；未知按重叠 |
| selector-list/global/classless fallback | 可能共命中 | 同 specificity 且顺序翻转时 fallback |
| unsupported at-rule / nested preserved block | 条件生效时可能共命中 | class evidence 纳入 prepass；解析失败则在 registry mutation 前 fail fast |
| 两个独立 atomic class 共现 | 缺 usage evidence | 保持既有显式边界，不声称已证明 |
| 跨 module preserved/atomic 竞争 | source-id 不是 import-order proof | 当前视为不支持的 authoring pattern，延期到最终 correctness 优化 |
| pseudo element/attribute 候选 | specificity 可保持，但仍受上述 pair 约束 | 每个 `SEL-*` 单独过矩阵 |

### 条件上下文注意事项

analyzer 当前只按 media/supports 完全相等分组，这不足以证明互斥：

- 无条件 rule 与 media rule 在 media 生效时重叠。
- `(min-width: 600px)` 与 `(min-width: 900px)` 在宽屏重叠。
- `@supports` 的任意两个不同表达式默认可能同时成立。
- 嵌套 media/supports 组合必须按最终条件交集判断，不能只比较字符串。

第一版 oracle 可以保守地把“不能证明互斥”视为可能重叠；无需立即实现完整 SAT solver。

### 已确认延期的跨 class/module 边界

以下模式已由项目 owner 于 2026-07-25 明确延期：

```css
.fallback,
.peer {
  color: blue;
}

.atomic {
  color: red;
}
```

当同一元素同时使用 `fallback` 与 `atomic`，且 winner 依赖两条等 importance、等 specificity
规则的原始顺序时，当前 atomic-first / preserved-second 输出可能反转结果。

当前约束是：

- 把这种跨 source class、跨 module 的 atomic/fallback 顺序竞争视为不受支持的 authoring pattern。
- `FOUND-02-C` 不为它实现 usage metadata、import-order evidence、occurrence renderer 或全局 fallback。
- 不添加 expected-difference 测试来冻结错误；文档只记录边界。
- 该边界不阻塞当前 cascade oracle、收益复盘或后续单项 selector 实验，但相关能力不得声称覆盖这种写法。
- 除非项目 owner 主动进入最终 correctness 优化，后续批次不再重复提请该决策。

## 为什么不在 FOUND-02 引入 occurrence renderer

完整保持跨 class/module 原始 cascade 的一个方向是引入带 semantic guard 的 per-occurrence atomic rule，
例如使用 `:where(.resolved)._atomic` 保持 specificity，并按原始 occurrence 输出。然而它会同时要求：

- adapter 提供真实 import/chunk order，而不是 source-id 排序；
- 同一个 reused atomic class 按 semantic guard 输出多个 occurrence；
- semantic resolved class 成为不可关闭的 mapping invariant；
- manifest/report 同时建模 definition 与 occurrence；
- 两套 adapter 的 dev/build/chunk/lazy/HMR 顺序重新验收。

这是一项独立的大型架构变化。本方案先用 class-wide preservation 修复可证明问题，并保留
occurrence model 作为未来候选，不把它夹带进 descriptor 迁移。

## 推荐实施拆分

### `FOUND-02-0`：当前 cascade correctness 修复

- Status: `completed`
- 加入 selector-list/source-order 回归。
- engine 改为先收集所有 rules/nested/preserved blocks 的 class preservation evidence，再注册 atomic declaration。
- 同 input 中只要 class 参与 unsafe selector，整类 preserved。
- block evidence 解析失败时在 registry mutation 前 fail fast。
- 删除 `preserveResolvedClass`，class mapping 始终保留 semantic scoped class。
- 对比 atomization/report 下降并运行两 adapter visual。
- 完成证据：core 55、Vite 36、Rsbuild 15 tests，根 `pnpm verify`、两套 fixture static
  与 base/preprocessor visual 验收全部通过；独立 Test 通过，Review 无 actionable finding。

### `FOUND-02-A`：breaking output inventory

- Status: `completed`
- 基线：[Selector Descriptor v2 基线](phase-8-selector-descriptor-v2-baseline.md)
- 当前迁移方案：[Selector Descriptor Clean Replacement 方案](phase-8-selector-descriptor-migration-plan.md)
- 记录当前六种 selector 的旧 key/class/CSS，仅用于解释预期 breaking diff，不作为兼容约束。
- 建立可执行的 v1 golden，覆盖六种 selector identity/key/class/CSS、条件、`!important`
  与 collision，保留 runtime `undefined` 与 JSON omission 的真实迁移边界。
- A 当时提出的 versioned 契约已被 owner 后续决策取代；当前以无版本、无兼容、
  Core-first 分批方案为准。

### `FOUND-02-B`：descriptor clean replacement 分批迁移

- Status: `completed`
- `FOUND-02-B1` Core 已完成：descriptor、identity/key/class、registry/renderer、manifest 与
  semantic contract tests 已收口；Core verify 65 tests 通过。
- 建立 `AtomicSelectorDescriptor` 和统一 selector-aware key input；不建立 legacy codec。
- 删除 `compatibilityPseudo` 与 public `context.pseudo`。
- registry 得到 class name 后立即调用 plan renderer，保存纯数据 descriptor。
- core renderer、manifest clone、public types 与 contract tests 改为 descriptor。
- Vite/Rsbuild 只读取 `selector.css`，保留各自已验证的聚合和 breakpoint 顺序。
- Rsbuild browser snapshot 序列化 descriptor，HMR dispose 不留 stale selector。
- analyzer 按 `selector.identity` 分组，并在 conflict detail 输出 selector identity。
- dev report/overlay、fixture scripts 和 Playground inspector 同步升级。
- 无类型边界校验当前必需字段，不实施 version 分流；不开放新 selector。
- 该迁移按 Core、Analyzer、Devtools、Vite、Rsbuild、fixture/Playground 分批执行；
  每批独立验证和暂停，最后一批恢复根门禁。

`FOUND-02-B2` 已完成：Analyzer 的 `DeclarationConflict` 必填 `selectorIdentity`，
分组严格使用 identity/media/supports/important，保留原 property conflict graph、
class token 顺序和跨 semantic class 不推断边界。Analyzer verify 7 项测试通过。

`FOUND-02-B3` 已完成：Devtools 的 dev envelope 和 style diff report 删除
`schemaVersion`，不保留兼容 reader；overlay 对当前展示字段严格校验，
非法 payload 显示 offline 和 `invalid-dev-report-payload`。Devtools verify 17 项测试通过。

`FOUND-02-B4` 已完成：Vite dev/build renderer 只读取 `selector.css`，manifest 显式复制
descriptor，build conflict 保留 `selectorIdentity`，dev report 使用当前无版本 envelope；
HMR update/remove、stale async 和 import removal 回归保持。Vite verify 37 项测试通过。

`FOUND-02-B5` 已完成：Rsbuild build/dev renderer 只读取 `selector.css`，browser runtime
只注册当前 `{ sources }` snapshot 并序列化 descriptor；manifest/report/dev envelope、HMR
update/remove/stale dispose 与 collision 保护均已迁移。Rsbuild verify 18 项测试通过。

`FOUND-02-B6` 已完成：

- current static consumer：两套 fixture static 与 Rsbuild Playground inspector 只读当前 manifest
  selector descriptor 和 build report，exact rule、真实 JS token mutation 与 source-order parity
  门禁通过。
- current visual consumer：两套 fixture visual 只读当前无版本
  `adapter/status/environments` dev envelope，并验证 overlay、HMR update/remove 与 stale
  selector 清理。
- static gate：Core 65、Analyzer 7、Devtools 17、Vite 37、Rsbuild 18，共 18 个 test files、
  144 项测试及全部 typecheck/build 通过；根 `pnpm verify` 和两套 fixture static 通过。
- visual：Vite 20 runs/100 cases/356 comparisons、Rsbuild 8 runs/80 cases/180 comparisons，
  两者均为 0 differences、`passed=true`。

### `FOUND-02-C`：cascade oracle

- Status: `completed`
- C1 Core：新增 9 项专用 cascade oracle，覆盖 importance、specificity、重复声明、
  shorthand/longhand、条件重叠、evidence preflight 与稳定输出；Core verify 为
  8 files/74 tests。
- C2 Vite：加入 6 个 atomic/fallback mixed case，并把 2 个 existing same-value reuse case 纳入
  固定 winner、token 与 CSSOM 验收；最终 full visual 为
  20 runs/132 cases/420 comparisons/0 differences，`passed=true`。
- C3 Rsbuild：加入同样 6 个 mixed case，并把 1 个 existing late-reuse case 纳入验收；
  最终 full visual 为 8 runs/108 cases/220 comparisons/0 differences，`passed=true`。
- C4 canonical closeout：根 `pnpm verify` 通过，Core 74、Analyzer 7、Devtools 17、
  Vite 37、Rsbuild 18 tests，共 19 files/153 tests，全部 typecheck/build 与两套 fixture
  static 通过；canonical reports 为
  `/private/tmp/gss-vite-cascade-oracle-closeout.json` 和
  `/private/tmp/gss-rsbuild-cascade-oracle-closeout.json`。
- C1-C3 的独立 Test/Review 已逐批收口；C4 由独立 Test 在最终组合状态下重跑根门禁与两套
  full visual，结果全绿。
- 绿色 oracle 只证明当前支持范围及上述代表场景：属性不竞争、importance/specificity winner、
  未发生顺序反转的等 specificity 竞争、media/supports 重叠、same-value reuse、fixed winner、
  native token preservation 与精确 CSSOM atomic rule 绑定。它不证明任意 source class/module
  的 DOM 共现，也不覆盖 `FOUND-05` 所述依赖原始顺序的跨 class/module 等优先级竞争。
- C 完成当时没有自动授权 `FOUND-02-D` 或任何 `SEL-*`；D 后续经过单独 owner 确认才执行。
  C 本身不开放 pseudo element、attribute selector 或其他当前 unsafe selector。

### `FOUND-02-D`：收益复盘与下一 selector 决策

- Status: `completed`
- 收益复盘：[Selector 能力收益复盘](selector-capability-benefit-review.md)。
- 四组 current fixture/Pilot report 与 manifest 已直接生成到临时目录并保存 hash；Vite/Rsbuild
  preprocessor fixture 与 Vite Pilot 满足同 corpus 比较条件，Rsbuild Pilot 因无同构历史 artifact
  只记录 current 快照与历史参考。
- report 聚合 delta、exact-only class、历史 atomic token links 与 authored rule frequency 已按
  直接指标、派生指标、历史值、代理和未知因果收益分开记录；没有把 warning、preserved ratio
  或 token links 冒充可恢复 declaration/reuse/bytes。
- current 六种 eligible selector 的 identity、canonical JSON key、readable/hash class 与 descriptor
  CSS 已和历史输出逐项固定；聚焦 contract 8 项测试通过。
- demand-first 门槛支持只选择 `SEL-02`：两个 Pilot 的 attribute exact-only class 均不少于 pseudo，
  Vite 历史 token links 为 `46 / 9`，跨 adapter authored rules 为 `11 / 3`，attribute 分类稳定，
  而 Rsbuild pseudo 会规范化为 `:before` / `unsupported-pseudo`。
- 这是 2026-07-25 当时的需求排序结论，不是实施收益：`SEL-02` 后来经 owner 单独确认并完成；
  `SEL-01` 未授权，`FOUND-05` 继续 `deferred`。

### `SEL-02`：后续 attribute selector 收口

- Status: `completed`
- `SEL-02` 沿用本设计的 source-independent selector identity、Core 预渲染 descriptor、
  semantic class preservation 与 registry mutation 前 preflight，不把 selector 解析扩散到 adapter。
- 首批只支持单 local anchor 的 presence / exact equality；unsupported operator、flag、namespace、
  多 attribute、复合结构与 `[class...]` 继续 fallback。
- same-class 等 specificity 的 attribute/pseudo order-risk 使用 `attribute-cascade-order` 保守整类保留；
  不扩大 `FOUND-05`，也不推测跨 class/module usage。
- Vite/Rsbuild adapter 验收边界分别见 [Phase 3 acceptance](phase-3-acceptance.md) 与
  [Phase 6 Rsbuild acceptance](phase-6-rsbuild-rspack-adapter-acceptance.md)。
- Pilot 同语料复盘证明两个 adapter 都实际释放 5 个 class、52 个 declaration occurrences；
  其中 15 个为 atomic definitions、37 个为 reused occurrences。exact-only class 与历史 token links
  仍只作为早期排序代理，实际收益见 [Selector 能力收益复盘](selector-capability-benefit-review.md)。

## 测试与验收

### Core

- current 六种 selector clean replacement 后的新 key、readable/hash class、CSS exact contract。
- identity 相同且 class 相同必须得到相同 rendered selector；identity 不同不得复用 key。
- escaping、collision、重复 render、media/supports/important 隔离稳定。
- descriptor 必填；public context 不再含 pseudo；禁止 dual truth。
- selector-list current cascade 反例恢复原生结果。
- unsupported at-rule/nested block 在前、eligible rule 在后的同 class 反例恢复原生结果。
- block evidence 解析失败在 registry mutation 前 fail fast，不留下部分 atomic output。
- unsafe class-wide preservation 成功路径与不相关 class 仍可 atomize 的保守边界。
- public options 不再包含 `preserveResolvedClass`；所有 mapping 始终以 semantic class 开头。

### Analyzer 与 consumer

- selector identity 相同才进入同一 conflict context。
- 不同 identity、media/supports、important 不误并。
- conflict detail 可追踪 selector identity。
- consumer 直接迁移当前 descriptor 结构，无类型边界校验必需字段，不做 version 分流。
- public exports 不再包含 `AtomicKeyInput` / `SelectorAnalysis`，其余未授权 exports 保持不变。

### Vite/Rsbuild

- 同一 core snapshot 的 selector CSS 一致。
- build/dev key dedupe、collision、base/context/breakpoint 排序不回归。
- HMR remove/update 不保留 stale descriptor 或 CSS。
- manifest/report 连续构建稳定。
- 两套 fixture 的 semantic/native dev/preview visual 全部通过。

### 最低命令

```bash
pnpm --filter @semantic-atomic-css/core verify
pnpm --filter @semantic-atomic-css/analyzer verify
pnpm --filter @semantic-atomic-css/devtools verify
pnpm --filter @semantic-atomic-css/vite verify
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm verify
pnpm --filter @semantic-atomic-css/vite-fixture test:visual
pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual
```

## 已确认决策

1. 采用无版本 clean replacement：必填 descriptor，不保留旧 key/class codec 或 dual-write。
2. 不冻结当前六种 selector 的 atomic key、readable/hash class 与 CSS；允许一次性 breaking output migration。
3. `FOUND-02-0` 使用 class-wide preservation，接受部分 atomization rate 主动下降；evidence 覆盖
   普通/nested/unsupported preserved blocks，无法解析时在 registry mutation 前 fail fast。
4. 删除 `preserveResolvedClass`，始终保留 semantic scoped class。
5. public/consumer 分批迁移：public context 删除 `pseudo`、移除无 runtime seam 的
   `AtomicKeyInput` / `SelectorAnalysis` exports；不引入 schema/key version 或兼容分支。
6. descriptor 只使用 `identity + core 预渲染 css`，不公开 template、AST 或 runtime renderer。
7. Vite/Rsbuild semantic/native visual matrix 是 `FOUND-02` 必过门禁。
8. 跨 class/module、缺 usage/import evidence 的竞争保留为显式既有风险边界；其中同元素
   atomic/fallback 等优先级顺序竞争已明确视为当前不支持的 authoring pattern，延期到最终
   correctness 优化；该边界没有阻塞后来分别完成的 C/D，也不阻塞后续单项 `SEL-*` 评估，
   但 C/D 完成都不授权任何 `SEL-*`，该边界也不在后续批次重复提请决策。

`FOUND-02-0/A/B/C/D` 与后续 `SEL-02` 已完成，没有引入 version/compatibility 路径。
该完成不自动授权 pseudo element、selector list、更广 selector template 或 usage evidence；其他
`SEL-*` 仍保持各自既有状态并需单独确认后才能进入设计或实施。
