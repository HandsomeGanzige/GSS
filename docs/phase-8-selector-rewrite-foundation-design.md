# Phase 8 Selector Rewrite 基础设计

## 文档状态

- Status: completed
- 对应待办：`FOUND-01A`
- 完成日期：2026-07-21
- 实现状态：`FOUND-01B` 已于 2026-07-21 完成

本文档只收口 selector rewrite plan 的深模块设计、interface、不变量、错误模型和
实施拆分。它不改变当前 safe selector 范围，不开放 pseudo element、attribute selector
或其他新语法，也不授权修改 atomic key、class name、manifest/report schema 或 cascade 语义。

## 实施前现状证据

当前 selector 知识分散在多个模块中：

| 位置 | 当前职责 | 问题 |
| --- | --- | --- |
| `selector/analyzeSelector.ts` | 解析 selector、分类 safe/unsafe、提取 pseudo | 能力判定与 AST 证据紧耦合 |
| `selector/collectClassNames.ts` | 再次解析并收集 source/global class | 与 analyzer 重复遍历 |
| `selector/scopeSelector.ts` | 再次解析、resolve local class、展开 `:global` | 与 atomic selector 改写分属两条路径 |
| `engine/createTransformer.ts` | 读取 `sourceClassName`/`pseudo` 并组装 context | engine 知道 selector 表示细节 |
| `atomizer/createAtomicKey.ts` | 把 `context.pseudo` 写入 key | 只能表达当前单 suffix 模型 |
| core/Vite/Rsbuild renderer | 分别拼接 `.${className}${pseudo}` | 三处重复 selector render 知识 |
| analyzer | 使用 `context.pseudo` 划分 conflict context | selector identity 演进会波及消费方 |

同一 selector 在 safe transform、preserved fallback 和 nested/unsupported block 路径中可被解析多次。
如果直接为 pseudo element、attribute、tag 和 selector list 分别添加字段与 renderer 分支，
复杂性会继续扩散到 engine、registry、两个 adapter 和 analyzer。

## 设计目标

1. 在 core `selector/` seam 内集中 selector 解析、证据收集、能力 policy、改写和 preserved scoping。
2. 让 engine 只根据结构化决策选择 eligible/preserved 路径，不理解 selector AST。
3. 为单 local anchor 能力提供共用基础，后续通过模块内 policy 逐项开放语法。
4. 保留 `ScopeStrategy` 的 class-level interface，不把 AST 或完整 selector rewrite 交给 adapter。
5. 使 selector 模块成为调用方和测试共用的唯一界面，内部可以重构而不改消费方。
6. `FOUND-01B` 首先以行为中性方式落地，所有现有 CSS、class、key、manifest/report
   和 diagnostic 保持不变。

## 非目标

- 不在 `FOUND-01B` 开放任何当前 unsafe selector。
- 不为多 local class、selector list 或 functional pseudo 预先建立宽泛公共类型。
- 不更改 `TransformCssOptions` 或对用户暴露 aggressive/capability 开关。
- 不在 adapter 中实现 selector parser、specificity 计算或 template 替换。
- 不在本批决定 `CssTransformContext`、`AtomicDeclaration` 和 manifest/report 的最终兼容性变更。
- 不用 selector 基础改造夹带 cascade、source-order、source map 或 runtime target 扩展。

## 决策 1：建立 in-process 深模块

selector rewrite 是纯计算、无 I/O 依赖的 in-process 模块。不新增 port 或 adapter；
`postcss-selector-parser` 只是模块内部实现依赖。

模块的删除测试应该成立：如果删除它，AST 解析、global 分类、reason 优先级、
anchor 替换、identity 和 scoping 将重新散落到 engine/output/adapter，说明该模块提供了真实深度。

目标依赖方向：

```txt
engine / scopeCssBlock
  → selector rewrite module
      → postcss-selector-parser
      → public ScopeStrategy types

selector rewrite module
  ✕ engine
  ✕ registry
  ✕ output
  ✕ Vite/Rsbuild
```

## 决策 2：最小 interface

长期目标 interface 只有一个入口：

```ts
function planSelectorRewrite(selector: string): SelectorRewriteDecision
```

`SelectorRewriteDecision` 是模块内部类型，不从 `@semantic-atomic-css/core` 包导出：

```ts
type SelectorRewriteDecision = EligibleSelectorRewrite | PreservedSelectorRewrite

type SelectorRewriteCommon = {
  sourceClassNames: readonly string[]
  globalClassNames: readonly string[]
  renderPreservedSelector(
    scope: ScopeStrategy,
    context: ResolveClassNameContext
  ): string
}

type EligibleSelectorRewrite = SelectorRewriteCommon & {
  kind: 'eligible'
  anchorClassName: string
  identity: string
  renderAtomicSelector(className: string): string
}

type PreservedSelectorRewrite = SelectorRewriteCommon & {
  kind: 'preserved'
  reason: UnsafeSelectorReason
  details?: readonly UnsafeSelectorReason[]
}
```

interface 的语义：

- `eligible` 只表示 selector 通过当前产品 policy；它仍可因 adapter export evidence、
  `preserveClassNames` 或 declaration policy 进入 fallback。
- `anchorClassName` 是唯一可被 atomic class node 替换的 source/local class。
- `identity` 是不含 source class name 的 opaque 稳定标识；调用方只能用于等值判断/生成 key，
  不得解析其内容。
- `renderAtomicSelector` 只使用 AST clone 把 anchor class node 替换为输入 atomic class node。
- `renderPreservedSelector` 解析所有 source class，跳过 global class，并展开 `:global(...)`。
- 返回数组是只读快照，渲染方法每次从内部 AST clone 开始，不共享可变 node。

### `FOUND-01B` 兼容投影

现有 engine 仍需要 `SelectorAnalysis.pseudo` 生成当前 `CssTransformContext`。
`FOUND-01B` 可在 selector 模块内部保留一个明确标记的短期 `compatibilityPseudo` 投影，
用于保证当前 key/class/CSS 字节不变。它不进入 public type，不允许被新 selector 能力复用，
并必须在 `FOUND-02` 完成 selector-aware identity/renderer 后删除。

这是有期限的迁移桥，不是长期 interface 的一部分。

## 决策 3：capability policy 属于模块内部

core 当前没有 selector mode/preset 产品需求，因此不向 engine、adapter 或公共配置暴露
`SelectorPolicy` interface。`planSelectorRewrite` 内部持有当前 policy，依次执行：

```txt
parse once
→ collect structural evidence
→ apply current capability policy
→ create eligible or preserved decision
```

`FOUND-01B` 的 policy 必须精确复制 v1：

- 一个 direct source class。
- 最多一个 `:hover`、`:focus`、`:active`、`:disabled` 或 `:focus-visible`。
- selector list、额外 local class、tag/id/attribute/combinator、pseudo element、unsupported pseudo
  和 `:global` 继续使用当前 primary reason/details。

后续 `SEL-*` 批次只能在这个模块内扩展 policy 和对应证明，不在 engine/adapter
中添加 selector 分支。“parser 能够解析”不等于“当前 policy 允许 atomize”。

## 决策 4：`ScopeStrategy` 保持 class-level seam

`ScopeStrategy` 继续只提供：

```ts
resolveClassName(className, context): string
shouldExportClassName?(className, context): boolean
```

不增加 selector AST、template、specificity 或完整 selector rewrite 回调。原因：

- Vite 和 Rsbuild 已作为两个真实 adapter 实现同一 class resolution/export evidence interface。
- selector 改写是标准 CSS 结构知识，应保持在 core，不在两个 adapter 复制。
- adapter 只需回答“这个 class 最终叫什么/能否进入 token”，不应了解 AST 占位符。
- 完整 selector callback 会让 core 无法独立证明 specificity 和 fallback 正确性。

export evidence 仍由 engine 在 `eligible` 决策后使用 `shouldExportClassName(anchorClassName, context)`
查询；selector 模块不引入 CSS Modules token 语义。

## 决策 5：AST 改写不使用字符串替换

模块保留解析后的内部 AST，所有输出都基于 clone：

- atomic render 只修改已记录 anchor class node 的 `value`。
- preserved render 使用 resolver 改写所有非 global class node，再展开 `:global(...)`。
- 不对 raw selector 执行 `replace()`、正则替换或占位符文本插值。
- atomic class 通过 class node serializer 输出，继续遵守 CSS escaping 规则。
- 调用 render 不能修改决策中的原 AST，多次调用必须得到相同结果。

单 anchor 等价证明的核心是：

```txt
唯一 local class node
→ 替换为一个 atomic class node
→ 其余 AST node 与顺序不变
→ class specificity (0,1,0) 不变
```

这个结构证明不代表该 selector 已通过 cascade 门禁；cascade 仍属于 `FOUND-02`。

## 决策 6：selector identity

`identity` 由模块内部从 AST clone 生成：

1. 把唯一 anchor class node 替换为内部 sentinel class node。
2. 保留其余 selector 结构、global 语义和节点顺序。
3. 使用 selector parser serializer 生成稳定文本。
4. 加入内部版本前缀，例如 `selector-v1\0...`。

不取消引号、escape、属性 value 或 functional pseudo 的语法差异，也不承诺把所有语义等价的
不同拼写归并为同一 identity。正确性优先于最大化复用。

例子（仅概念表示，sentinel 不是 public 字符串协议）：

```txt
.button                  → selector-v1\0.__GSS_ANCHOR__
.button:hover            → selector-v1\0.__GSS_ANCHOR__:hover
.button::before          → selector-v1\0.__GSS_ANCHOR__::before
.button[data-state=open] → selector-v1\0.__GSS_ANCHOR__[data-state=open]
```

`FOUND-01B` 只在模块内生成/测试 identity，不让它进入 atomic key 或公共产物。
`FOUND-02` 开始前需项目 owner 单独确认以下兼容性决策：

- 现有 `.class` / `.class:hover` 是否继续保持当前 key/class name。
- `identity` 是否写入 `CssTransformContext`、`AtomicDeclaration` 或单独字段。
- manifest/report 是否需要 schema version 或兼容字段。
- Vite/Rsbuild/analyzer 何时从 `context.pseudo` 迁移到新 selector identity。

## 决策 7：可序列化交接点不泄漏 rewrite plan

`SelectorRewritePlan` 含有 AST/closure，只存活于单次 rule transform 中，不进入 registry、
manifest、report 或 adapter。

`FOUND-02` 的目标交接形态是：

```txt
selector rewrite plan
  → opaque selector identity       (用于 atomic key/conflict context)
  → rendered atomic selector CSS   (用于 core/Vite/Rsbuild renderer)
```

registry 完成 class name 选择后，在 core 内调用 plan 一次生成最终 selector CSS；
后续消费方只读可序列化字符串，不重新解析 template，不使用 `&` 或 sentinel 字符串替换。

具体 public type 变更属于 `FOUND-02` 的 owner 确认项，本文档不预先定案。

## 决策 8：错误与 fallback 模型

### Selector 可解析

- `planSelectorRewrite` 只在解析成功后产生可重复渲染的 AST plan。
- policy 不允许时返回 `preserved` 分支，保留当前 primary reason、details、source/global classes。
- `renderPreservedSelector` 中 resolver 抛错时继续透传，不吞错或返回未 scoped CSS。

### Selector 无法解析

- 决策分支使用 `unknown-selector`，source/global class evidence 为空。
- 当前 top-level preserved scoping 会再次抛出 parser error；`FOUND-01B` 为保持错误语义，
  不擅自改为原样输出或静默忽略。
- 是否将该路径改为结构化 parse diagnostic + 安全保留，需要单独产品决策和回归，
  不属于行为中性改造。

### Nested/unsupported block

- `scopeCssBlock` 继续由 PostCSS 遍历 rule，但每个 selector 通过同一 `planSelectorRewrite` interface
  收集 class evidence 并渲染 preserved selector。
- block 级 try/catch 和当前保守降级保持不变。

## 决策 9：公共兼容性

`FOUND-01B` 不改变：

- runtime public exports：仍只有 `transformCss` 和 `createTransformer`。
- `TransformCssInput`、`TransformCssOptions` 和 `ScopeStrategy`。
- `CssTransformContext`、`AtomicKeyInput`、`AtomicDeclaration`、manifest/report 结构。
- `UnsafeSelectorReason` 枚举、primary reason 优先级和 diagnostic message 语义。
- atomic class name/key、CSS 文本、class mapping 顺序和跨文件复用。

`SelectorAnalysis` 当前是 public type，但 runtime `analyzeSelector` 不是 public export。
`FOUND-01B` 不删除或破坏该类型，也不导出新 rewrite plan 类型。
若新 engine 不再内部使用 `SelectorAnalysis`，只能先标记为兼容类型；是否在未来主版本删除，
需要独立公共类型审计。

## 决策 10：测试 interface

测试与 engine 通过同一 `planSelectorRewrite` interface 观察行为：

- eligible：anchor、identity、atomic render、preserved render 和只读 class evidence。
- preserved：primary reason、details、source/global class 和 preserved render。
- 稳定性：同一 plan 重复 render 不变，不与上一次输出共享 AST mutation。
- 等价：替换前后只有 anchor class value 改变，其余 AST serialization 不变。
- 保守：所有当前 unsafe reason 与 `:global` scoping 结果不变。

实施时重写现有 `selector.test.ts` 使其通过新 interface 测试，不在旧
`analyzeSelector`/`scopeSelector` 测试之上叠加一套重复测试。`transformer.test.ts` 和 `contract.test.ts`
继续作为深模块之外的可观察产物门禁。

`FOUND-01B` 验收：

```bash
pnpm --filter @semantic-atomic-css/core verify
pnpm verify
```

由于该批次要求字节级行为中性，不新增浏览器语义，默认不需要运行两套
`test:visual`。若 static fixture 或最终 diff 显示 CSS/token 产物变化，则不得以“内部重构”收口；
必须停止并重新确认范围。

## 拒绝的方案

### 按 selector 类型增加独立 renderer

例如在 engine/output 中分别增加 pseudo-element renderer、attribute renderer 和 tag renderer。
该方案 interface 浅，会重复 AST/scoping/identity 逻辑，拒绝。

### 扩展 `ScopeStrategy` 返回完整 selector

这会把标准 CSS 改写知识推给每个 adapter，并让 core 丧失对 specificity/fallback
的控制，拒绝。

### 导出 selector AST 或 template 让下游拼接

这会把 parser node、clone/mutation 和占位符协议变成公共 interface，且要求 Vite/Rsbuild
重新解析或替换，拒绝。

### 直接开放 parser 能够解析的任意单 anchor selector

selector 结构可改写不等于 cascade、token 注入和构建生命周期已验证，拒绝。

### 新旧 selector analysis 长期并存

两套路径会使 diagnostic reason、global scoping 和 class evidence 逐渐分叉。`FOUND-01B`
必须在同一批内把 engine 和 `scopeCssBlock` 切到新 interface，旧内部模块删除或变为新深模块的
不对外内部 helper。

## `FOUND-01B` 可执行拆分

### B1：建立内部类型与 plan 入口

- 在 `packages/core/src/selector/` 建立 `planSelectorRewrite` 与内部类型。
- 解析一次，收集 source/global class、结构 feature 和现有 unsafe reason/details。
- 对 parse 失败和 resolver 失败保持现有错误语义。

### B2：实现 clone-based render

- eligible plan 提供 atomic/preserved render。
- preserved plan 提供 preserved render。
- 解析、global 展开、class resolver 和 escaping 只在 selector 模块实现。

### B3：替换 engine 与 block scoping 调用点

- `createTransformer.ts` 改为消费 eligible/preserved decision。
- `scopeCssBlock.ts` 通过同一 plan interface 收集 class 并渲染 fallback。
- 保留现有 `ScopeStrategy` 与 class preservation/export evidence 顺序。
- 不改 atomic registry/output/adapter 公共数据。

### B4：替换测试，不叠加旧 seam 测试

- 重写 selector 测试，通过 plan interface 覆盖当前 safe/unsafe/scoping 全部行为。
- 补充重复 render、防御性数组、identity 稳定性和 AST 不共享回归。
- 运行 core verify 和根 verify，核对产物与原 diagnostic reason。

### B5：文档收口

- 把已实现 interface、不变量和测试结果同步到 `CORE_DESIGN.md`。
- 更新 Phase 8 backlog 状态，但不自动进入 `FOUND-02`。

## `FOUND-01B` 预期变更范围

预期修改：

- `packages/core/src/selector/*`
- `packages/core/src/engine/createTransformer.ts`
- `packages/core/test/selector.test.ts`
- 必要的 core 内部类型与注释
- `packages/core/CORE_DESIGN.md`
- Phase 8 backlog/tracking

默认不修改：

- `packages/vite` / `packages/rsbuild`
- `packages/analyzer` / `packages/devtools`
- public runtime exports 和 adapter options
- fixtures/Pilot 场景与验收断言
- package dependencies/lockfile

如果实施时必须越过上述默认范围，应停止 `FOUND-01B` 并重新向项目 owner 确认，
不自行扩大为 `FOUND-02` 或具体 selector 能力实现。

## 完成结论

`FOUND-01A` 确认了以下方向：

- selector rewrite 作为 core 内部 in-process 深模块。
- 长期只暴露一个 plan interface，AST/template 不泄漏。
- `ScopeStrategy` 继续是 class-level adapter seam，不承担 selector rewrite。
- capability policy 由 selector 模块内部持有，基础引擎不自动扩大产品语义。
- `FOUND-01B` 已以行为中性方式替换旧 selector seam，没有叠加第二套分析或 scoping 路径。
- `FOUND-02` 再单独确认 selector identity、public schema、adapter renderer 和 cascade 证据。

`FOUND-01B` 的实际结果：

- 新增 core 内部唯一入口 `planSelectorRewrite(selector)`，统一 eligible/preserved 决策、
  class evidence、identity 与 clone-based render。
- engine 与 `scopeCssBlock` 已迁移到该 decision；旧 `analyzeSelector`、`collectClassNames`
  和 `scopeSelector` 内部入口已删除。
- `compatibilityPseudo` 只在 core 内投影既有 `CssTransformContext.pseudo`；identity 尚未进入
  atomic key、class name、manifest/report 或 adapter/analyzer。
- `pnpm --filter @semantic-atomic-css/core verify` 通过（36 项测试），根 `pnpm verify` 通过；
  Vite/Rsbuild fixture 静态验收通过，未观察到产物或 diagnostic 回归。

下一次只需决定是否开始准备 `FOUND-02` 的兼容性与 cascade 方案；本次完成不授权
`FOUND-02` 实现或任何 `SEL-*` 能力。
