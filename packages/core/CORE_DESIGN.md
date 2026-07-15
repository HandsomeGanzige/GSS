# Core 包设计决策文档

## 文档定位

本文档记录 `@semantic-atomic-css/core` 的设计理念、职责边界、核心概念和关键决策。
它会随着项目推进持续更新，最终目标是成为维护者和使用者理解 core 包的主要设计文档。

注意：截至 2026-07-03，`packages/core` 已按本文档方向落地 Phase 2 core v1。当前实现只关注
core transform engine，不包含 Vite adapter、CSS Modules tokens、virtual CSS 或 playground 兼容。

## 当前实现状态

Phase 2 core v1 已实现以下能力：

- 新 public API：`transformCss(input, options)` 与 `createTransformer(options)`。
- public types、IR、selector analysis、declaration analysis、atomic registry、CSS render、
  manifest 和 report。
- selector v1 safe 范围：单 source class + 可选一个支持的 pseudo class。
- unsafe selector preserved fallback，并输出稳定 unsafe reason diagnostic。
- custom property declaration 默认 preserved；普通 `var(...)` declaration 可以 atomize。
- atomic key 包含 `prop`、`value`、`important`、`pseudo`、`media`、`supports`。
- `createTransformer()` 支持跨文件复用 atomic declaration。
- 单次 `TransformCssResult` 是当前输入的转换快照；跨文件聚合 CSS/report 通过 transformer
  的 `getAtomicCss()`、`getReport()` 和 `getManifest()` 获取。
- 聚合 `getManifest()` 的 atomic 部分来自 `AtomicRegistry` 快照，因此跨文件复用的 atomic class 会保留
  所有 sources；classes 部分来自每次 transform result 的 class manifest 合并。
- unsupported at-rule preserved block 会在输出前尝试执行 selector scoping，并把 block 内 source class
  写入 class mapping，确保后续 CSS Modules adapter 能生成 fallback hook。
- 当前 `createTransformer()` 是 append-only build collector，不支持同一 `id` 的更新/失效。后续接入
  Vite dev/HMR 前，需要补充 `invalidate(id)` 或重新构建 registry 的策略。
- nested rule 不参与 atomize，当前整体 scoped preserved，并输出 `nested-rule` diagnostic。
- parse error 不向外抛出，返回 `parse-error` diagnostic 和空 CSS 结果。
- `TransformCssInput.preserveClassNames` 允许 adapter 按稳定原因保守保留整个 class。
  Phase 5 首个原因为 `asset-reference`，用于避免构建工具的延迟资源 URL 进入 atomic key。

当前明确不实现：

- 旧 `compileCssModule` API。
- CSS Modules tokens。
- Vite/Rsbuild/Webpack 生命周期。
- 文件读取、文件写入、virtual module 或 asset emit。
- `analysis` mode。该 mode 暂不暴露在 public type 中，后续语义定案后再加入。

core 当前验收命令：

```bash
corepack pnpm --filter @semantic-atomic-css/core test
corepack pnpm exec tsc -p packages/core/tsconfig.json --noEmit
corepack pnpm --filter @semantic-atomic-css/core build
```

## Core v1 行为契约

本节记录 Phase 2 core v1 已经收口的行为契约。后续 adapter、report、CI 或 verifier 工作应以这些
契约为基础，除非先更新本文档和对应测试。

### Public API 契约

- runtime public export 只包含 `transformCss` 和 `createTransformer`。
- public type export 只表达 core transform engine 所需数据结构，例如 `ScopeStrategy`、
  `TransformCssInput`、`TransformCssResult`、`Diagnostic`、`TransformManifest` 和 `TransformReport`。
- `transformCss(input, options)` 是单次 helper，不复用上一次输入的 registry。
- `createTransformer(options)` 是 append-only build collector，用于一次性 build 中跨文件复用 atomic
  declaration 和聚合 manifest/report。
- `createTransformer()` 当前不支持同一 `id` 更新或失效；dev/HMR adapter 必须额外设计
  `invalidate(id)` 或重建 transformer。

### 输入边界契约

- core 只接收标准 CSS 字符串和 `ScopeStrategy`。
- core 不关心输入来自 `.css`、`.module.css`、Less、Sass、预处理器输出还是虚拟模块。
- core 不读取文件、不写文件、不处理 include/exclude、不生成 CSS Modules tokens、不管理 virtual module。
- CSS Modules scoped name、locals convention、named exports、HMR、asset emit 和构建 warning 展示都属于
  adapter/integration layer。
- `preserveClassNames` 只接收 adapter 已经判定的 class 与原因；core 不识别 Vite 占位符、
  `url()` 或任何 Sass/Less 语法。

### Selector 契约

- safe selector 只允许单 source class，最多一个受支持 pseudo class。
- v1 支持的 pseudo class 为 `:hover`、`:focus`、`:active`、`:disabled`、`:focus-visible`。
- selector list、缺失 source class、复合 class、tag、id、attribute、combinator、pseudo element、
  unsupported pseudo 和 `:global` 都必须作为 unsafe selector preserved。
- unsafe selector 必须输出 `unsafe-selector` diagnostic，并写入 class mapping 的 `unsafeReasons`。
- preserved selector 中 source class 必须通过 `scope.resolveClassName` 改写；`:global(...)` 展开为标准 selector，
  且 global class 不调用 resolver。

### Declaration 与顺序契约

- 普通 declaration 默认 atomize。
- custom property declaration 默认 preserved，不输出 warning，但进入 report/manifest 基础数据。
- 使用 `var(...)` 的普通 declaration 可以 atomize。
- `!important` 必须进入 atomic key，并生成与非 important declaration 不同的 atomic class。
- shorthand/longhand 不展开、不重排、不做冲突图分析；同一 source class 内的 `atomicClassNames` 必须保持
  declaration 原始顺序。
- 不确定或暂不支持的 declaration 应 preserved + diagnostic，不允许为了提高 atomization rate 改变 cascade 语义。

### Preserved Fallback 契约

- unsafe selector 整条 preserved。
- `preserveClassNames` 标记的 safe class 必须整条 preserved，同一 class 的 pseudo、media 和 supports
  rules 也不能部分 atomize，避免重排后改变 cascade。
- class 级保留必须输出 `preserved-class` diagnostic，记入 preserved rules/declarations，
  但不得伪装为 unsafe selector；manifest class 保留且 `atomicClassNames` 为空。
- safe selector 中 mixed declaration 只 preserved 无法 atomize 的 declaration。
- nested rule 不参与 atomize，整块 scoped preserved，并输出 `nested-rule` diagnostic。
- unsupported at-rule 整块 preserved；如果块内包含 selector，输出前应尽量执行 selector scoping，并把 source class
  写入 class mapping，确保后续 CSS Modules adapter 有 fallback hook。
- preserved CSS 内部必须按原始 IR 顺序输出，不能把 rule 和 block 分组后重排。
- 最终调用方拼接 CSS 时应保持 atomic CSS first、preserved CSS second。

### Manifest / Report 契约

- 单次 `TransformCssResult` 只描述当前输入的 atomic CSS、preserved CSS、classes、manifest 和 report 快照。
- `createTransformer().getAtomicCss()` 输出跨文件去重后的 atomic CSS。
- `createTransformer().getManifest()` 的 atomic 部分来自 registry 快照，复用 atomic class 必须保留所有 sources；
  classes 部分来自每次 transform 的 class manifest 合并。
- `createTransformer().getReport()` 应使用全局去重后的 atomic CSS size，并重新计算
  `estimatedTotalDiffBytes`，避免跨文件复用时 size 字段内部不一致。
- manifest/report 是内存结构，core 不负责写入磁盘或决定输出路径。

### 验收契约

core v1 收口验收以以下测试为准：

- selector reason 覆盖 safe pseudo、selector list、missing source class、combinator、compound class、
  tag/id/attribute、pseudo element、unsupported pseudo、`:global`。
- declaration 覆盖 custom property、`var(...)`、vendor prefix、`!important`。
- atomizer 覆盖 readable/hash class name、context key separation、class name collision、跨文件复用。
- transform fixture 覆盖 nested fallback、unsupported at-rule fallback、preserved order、manifest/report aggregation。
- contract tests 覆盖 public API surface、scope strategy 稳定性、shorthand/longhand 顺序和 append-only transformer。

## Core 的长期定位

`@semantic-atomic-css/core` 应被定位为一个纯粹的 CSS transform engine。

它的目标不是成为 CSS Modules 编译器，也不是成为某个构建工具插件的一部分，而是：

```txt
接收一段已经确定需要转换的标准 CSS
执行安全的 CSS 语义分析和 atomic 转换
输出 atomic CSS、preserved CSS、class mapping、diagnostics、manifest/report 基础数据
```

当前 MVP 只支持 CSS Modules，是短期产品切入策略，不应成为 core 的长期边界。

## Core 不应该关心什么

core 不应该关心 CSS 的来源：

- 不关心源文件是 `.css`、`.module.css`、`.less` 还是 `.scss`。
- 不关心 Less / Sass / PostCSS pipeline 如何运行。
- 不关心文件如何读取。
- 不关心 include / exclude 如何匹配。
- 不关心 Vite、Rsbuild、Webpack 或 CLI 的生命周期。
- 不关心 virtual module id 如何生成。
- 不关心构建产物如何 emit。
- 不关心 HMR 如何触发。
- 不负责最终 CSS Modules tokens 的生成。

这些职责应由 integration layer 或 adapter layer 承担。

## 系统分层

长期设计中，整个项目可以拆成三层：

```txt
Integration Layer
  ↓
Adapter Layer
  ↓
Core Transform Layer
```

### Integration Layer

负责接入具体构建工具，例如 Vite、Rsbuild、Webpack 或 CLI。

典型职责：

- 读取用户配置。
- 处理 include / exclude。
- 接入 dev / build 生命周期。
- 管理 virtual module。
- 处理 HMR。
- emit CSS asset。
- emit manifest / report 文件。
- 输出构建 warning / error。

### Adapter Layer

负责把不同来源的样式输入准备成 core 可以处理的标准 CSS。

典型职责：

- 将 Less / Sass 编译为标准 CSS。
- 处理 CSS Modules scoped class mapping。
- 处理普通 CSS、scoped CSS 或其他样式来源的 class 解析策略。
- 将不同来源统一成 core 的 `transformCss` 输入。

CSS Modules 属于 adapter 事实，不属于 core 事实。

### Core Transform Layer

负责纯 CSS 转换。

典型职责：

- 解析 CSS AST。
- 分析 selector 是否可以安全转换。
- 分类 declaration 是否可以 atomize。
- 生成 atomic key。
- 生成 atomic class name。
- 生成 atomic CSS。
- 生成 preserved CSS。
- 生成 class mapping。
- 生成 diagnostics。
- 生成 manifest/report 的基础数据。

## 架构规划方法

core 包不应只按“职责目录”规划。职责目录可以帮助拆文件，但不足以指导一个长期可扩展的编译器内核。

本项目更适合采用：

```txt
IR-first compiler architecture
+ pipeline / pass 处理模型
+ ports / adapters 边界
+ rule / diagnostic 治理模型
```

也就是说，先设计 core 的领域数据结构和转换阶段，再决定源码目录。目录应该服务数据流和扩展点，
而不是让目录反过来决定架构。

### 行业实践参考

以下实践对 core 包有直接启发：

- PostCSS 强调插件应“只做好一件事”，并要求 warning 通过结构化机制交给 runner，而不是直接
  `console.warn`；这支持 core 只输出 diagnostics，由 adapter 决定展示方式。
  参考：[PostCSS Plugin Guidelines](https://postcss.org/docs/postcss-plugin-guidelines)。
- Babel 的基本模型是 parse、transform、generate，并通过 visitor/state 管理 AST 变换；这支持
  core 使用 pipeline/pass，而不是把所有逻辑堆进一个 compiler 函数。
  参考：[Babel Plugin Handbook](https://github.com/jamiebuilds/babel-handbook/blob/master/translations/en/plugin-handbook.md)。
- ESLint 和 Stylelint 把 rule、message、tests、docs、metadata 作为长期治理单元；这支持
  unsafe selector、preserved declaration 和 strict policy 未来演进为稳定 diagnostic/rule 模型。
  参考：[ESLint custom rules](https://eslint.org/docs/latest/extend/custom-rules)、
  [Stylelint plugins](https://stylelint.io/developer-guide/plugins/)。
- Vite / Rollup 使用 hooks、virtual module、plugin factory 处理构建工具接入；这支持把 Vite、
  Rsbuild、Webpack 等能力放在 integration layer，而不是放入 core。
  参考：[Vite Plugin API](https://vite.dev/guide/api-plugin.html)。
- UnoCSS 将 rules、extractors、presets、transformers、layers 拆成不同扩展概念；这说明样式工具
  应区分输入发现、转换规则、输出排序和用户 preset。
  参考：[UnoCSS config](https://unocss.dev/config/)。
- CSSTree 和 Lightning CSS 都把 CSS 工具定位为 parser、walker/transformer、generator、
  validator/minifier 等组合能力；这支持 GSS core 按 CSS transform engine 思路规划。
  参考：[CSSTree](https://github.com/csstree/csstree)、
  [Lightning CSS](https://github.com/parcel-bundler/lightningcss)。

### IR-first 原则

core 内部不应让 PostCSS node 在所有模块间自由流动。PostCSS AST 是 parser 层输入，不能成为整个
系统的领域模型。

推荐做法：

```txt
CSS string
  ↓
PostCSS AST
  ↓
GSS IR
  ↓
analysis results
  ↓
transformation plan
  ↓
outputs
```

GSS IR 是 core 自己定义的中间表示，用于隔离 parser 变化、adapter 变化和输出格式变化。

v1 可以保持 IR 简洁，不需要构建完整 CSS 语法树。只需要沉淀转换必须依赖的领域结构：

```ts
type CssRuleRecord = {
  id: string
  selector: string
  declarations: DeclarationMeta[]
  context: CssTransformContext
  source?: SourceLocation
}

type PreservedRule = {
  id: string
  selector: string
  scopedSelector: string
  declarations: DeclarationMeta[]
  context: CssTransformContext
  reason: string
  source?: SourceLocation
}

type PreservedBlock = {
  id: string
  css: string
  reason: string
  source?: SourceLocation
}
```

这些结构的价值是：

- selector analysis 不需要知道 PostCSS rule node 的全部细节。
- declaration analysis 不依赖 PostCSS declaration node。
- renderer 可以基于稳定结构输出 CSS。
- diagnostics / manifest / report 可以共享同一组 source、reason 和 context。
- 未来如果更换 parser 或加入高级 parser，主要影响 ast 层和 IR 构建层。

### Pipeline / Pass 模型

core 的主流程应是一条明确 pipeline：

```txt
parseCss
  ↓
collectIr
  ↓
analyzeSelectors
  ↓
analyzeDeclarations
  ↓
buildTransformPlan
  ↓
registerAtomicDeclarations
  ↓
renderCssOutputs
  ↓
createManifest
  ↓
createReport
```

每个 pass 应遵循：

- 输入输出结构明确。
- 不直接读写文件。
- 不直接打印日志。
- 不隐式依赖全局状态。
- 需要共享状态时通过 `TransformContext` 或 `AtomicRegistry` 显式传入。

不建议在第一版做可插拔 pass manager。先把 pass 边界写清楚，等真实扩展需求出现后再抽象插件化。

### Ports / Adapters 边界

core 对外只暴露 transform engine 需要的 ports：

```ts
type ScopeStrategy = { ... }
type AtomicClassNameOptions = { ... }
type DiagnosticPolicy = { ... }
```

Vite、Rsbuild、Less、Sass、CSS Modules 都是 adapters。adapter 可以准备 CSS、准备 scope strategy、
决定 class name strategy、决定是否 fail build，但不能把构建工具生命周期塞进 core。

### 设计模式应用原则

本项目应该使用设计模式解决真实变化点，不应为了模式而模式。

推荐应用：

- Pipeline：组织 transform 阶段。
- Visitor：封装 AST traversal，但 visitor 只收集或分发，不承载大量业务规则。
- Strategy：`ScopeStrategy`、class name strategy、diagnostic policy。
- Registry：`AtomicRegistry` 维护 key、className、source 和顺序。
- Discriminated Union：`SelectorAnalysis`、`DeclarationAnalysis`、`Diagnostic` 等结果结构。
- Collector：`DiagnosticCollector`、`ClassMappingBuilder`、`PreservedCssCollector` 聚合转换过程数据。
- Ports and Adapters：integration 和 adapter 包通过稳定 port 调用 core。

不推荐过早使用：

- 复杂 dependency injection container。
- 过度抽象的 plugin manager。
- 为每个小函数创建 class。
- 在没有真实需求前支持外部 AST 或自定义 pass 注入。

## 已确认的核心决策

### 1. 主入口使用 `transformCss`

长期主入口应面向通用 CSS 转换，而不是 CSS Modules：

```ts
transformCss(input, options)
```

本次大修不兼容旧的 `compileCssModule` API。core 已从 CSS Modules 原型编译器边界演进为通用
CSS transform engine。

### 2. core 接收 CSS 字符串，不接收外部 AST

主入口应该接收标准 CSS 字符串：

```ts
type TransformCssInput = {
  id: string
  css: string
  scope: ScopeStrategy
}
```

core 自己负责使用统一的 parser 解析 CSS AST。

这样做的原因：

- 不同 adapter 可能产生不同 AST 形态。
- 不同 parser 或 PostCSS 版本可能导致节点结构、source location 和序列化行为不一致。
- selector 安全判断、preserved CSS render 和 diagnostics 都依赖 AST 一致性。
- 由 core 统一解析，可以把 AST 一致性控制在 core 内部。

未来可以考虑内部或高级入口接收 PostCSS AST，但不作为第一稳定 public API。

### 3. core 负责执行 selector scoping，但不负责生成 scoped name

core 需要在 preserved CSS 中替换 class name，因此它应该负责执行 selector scoping。

但是 scoped name 的来源不属于 core。core 应通过外部传入的 scope strategy 获取最终 class name：

```ts
type ScopeStrategy = {
  resolveClassName(className: string, context: ResolveClassNameContext): string
  shouldExportClassName?(className: string, context: ResolveClassNameContext): boolean
}
```

CSS Modules adapter 可以传入：

```txt
button -> Button_button__hash
```

普通 CSS adapter 可以传入 identity resolver：

```txt
button -> button
```

这样 core 可以保持通用，不把 CSS Modules scoped name 生成逻辑写死在内部。

### 4. `preserveSemanticClass` 改为 `preserveResolvedClass`

长期配置不应绑定 CSS Modules 或 semantic class 概念。

`preserveResolvedClass` 的含义是：

```txt
生成建议 class name 时，是否保留 scope strategy 解析后的 class name。
```

CSS Modules 场景下，它通常等价于保留 semantic scoped class：

```txt
Button_button__hash _color_red
```

普通 CSS 或其他 scoped CSS 场景下，它表示是否保留解析后的原始 class hook。

### 5. core 输出 class mappings，而不是 CSS Modules tokens

`tokens` 是 CSS Modules adapter 或 integration layer 的产物，不属于 core 的通用输出。

core 应输出通用 class mapping 数据：

```ts
type TransformClassMapping = {
  sourceClassName: string
  resolvedClassName: string
  atomicClassNames: string[]
  suggestedClassName: string
  unsafeReasons?: string[]
}
```

CSS Modules adapter 可以基于该数据生成：

```txt
styles.button = "Button_button__hash _color_red"
```

普通 CSS adapter 可以选择只使用 diagnostics 和 report，而不使用 `suggestedClassName`。

### 6. core 保留 `suggestedClassName`

core 可以生成建议 class name：

```txt
resolvedClassName + atomicClassNames
```

但它只表示 core 根据转换结果给出的推荐组合，不代表 core 负责写回用户代码或生成 CSS Modules tokens。

adapter 可以使用它，也可以基于自己的运行环境忽略或二次加工。

### 7. `ScopeStrategy` v1 保持克制

`ScopeStrategy` 的第一版只解决 class name 解析，不支持 arbitrary selector rewrite。

确认后的 v1 结构为：

```ts
type ScopeStrategy = {
  resolveClassName(className: string, context: ResolveClassNameContext): string
  shouldExportClassName?(className: string, context: ResolveClassNameContext): boolean
}
```

其中 `resolveClassName` 必填，并且必须返回 string。adapter 如果不认识某个 class，应返回原始
class name，而不是返回 `undefined`。

`shouldExportClassName` 可选，默认语义为 true。它用于决定某个 source class 是否应该进入
`result.classes`。CSS Modules 场景通常会导出所有 local class，普通 CSS 或 analysis-only 场景
可以选择不导出。

`ResolveClassNameContext` v1 保持为最小上下文：

```ts
type ResolveClassNameContext = {
  id: string
  originalSelector: string
  usage: 'safe-rule' | 'preserved-rule' | 'class-mapping'
}
```

设计约束：

- resolver 不接收 AST node，避免把 core 内部解析细节泄漏给 adapter。
- resolver 不返回完整 selector，只返回 class name。
- global class 不调用 resolver，由 core selector 层识别并跳过。
- source location 暂不传给 resolver，后续如有真实需求再扩展。

### 8. selector analysis 使用通用 source class 概念

selector analysis 不再使用 CSS Modules 语义较强的 `localName`，而是使用更通用的
`sourceClassName` / `sourceClassNames`。

它的职责是判断 selector 能否安全转换，并为后续 atomizer、preserved renderer、diagnostics
和 class mapping 提供结构化信息。

确认后的 v1 结构方向为：

```ts
type SelectorAnalysis =
  | SafeSelectorAnalysis
  | UnsafeSelectorAnalysis

type SafeSelectorAnalysis = {
  kind: 'safe'
  selector: string
  sourceClassName: string
  sourceClassNames: string[]
  pseudo?: string
}

type UnsafeSelectorAnalysis = {
  kind: 'unsafe'
  selector: string
  sourceClassNames: string[]
  globalClassNames: string[]
  reason: UnsafeSelectorReason
  details?: UnsafeSelectorReason[]
}
```

设计约束：

- v1 safe selector 必须只有一个明确的 `sourceClassName`。
- unsafe selector 仍需要收集 `sourceClassNames`，用于 preserved CSS scoping。
- `globalClassNames` 单独记录，preserved render 时不调用 resolver。
- unsafe v1 使用 primary `reason`，`details` 仅作为后续扩展或诊断补充。
- selector list v1 不拆分，直接 unsafe。
- `:global` v1 直接 unsafe，但 preserved render 需要保留 global class。

`UnsafeSelectorReason` 应稳定为枚举类型，v1 方向包括：

```ts
type UnsafeSelectorReason =
  | 'selector-list'
  | 'missing-source-class'
  | 'compound-class-selector'
  | 'descendant-selector'
  | 'child-selector'
  | 'adjacent-selector'
  | 'sibling-selector'
  | 'tag-selector'
  | 'id-selector'
  | 'attribute-selector'
  | 'pseudo-element'
  | 'unsupported-pseudo'
  | 'global-selector'
  | 'nested-rule'
  | 'unknown-selector'
```

后续不再优先使用粗粒度 `complex-selector`，而是尽量输出可治理的具体 reason。

### 9. declaration analysis 默认保守但不绑定文件类型

declaration analysis 的职责是判断 declaration 能否安全 atomize，并给 preserved declaration 输出稳定原因。

确认后的 v1 结构方向为：

```ts
type DeclarationAnalysis =
  | AtomizableDeclarationAnalysis
  | PreservedDeclarationAnalysis

type AtomizableDeclarationAnalysis = {
  kind: 'atomizable'
  declaration: DeclarationMeta
}

type PreservedDeclarationAnalysis = {
  kind: 'preserved'
  declaration: DeclarationMeta
  reason: PreservedDeclarationReason
}

type DeclarationMeta = {
  prop: string
  value: string
  important: boolean
  source?: SourceLocation
}
```

v1 决策：

- 后续层优先消费结构化 `DeclarationMeta`，不直接依赖 PostCSS declaration node。
- CSS custom property declaration 默认 preserved。
- 使用 `var(...)` 的普通 declaration 可以 atomize。
- `!important` 可以 atomize，但必须进入 atomic key。
- vendor-prefixed declaration v1 默认可以 atomize。
- shorthand / longhand v1 不展开，也不做 property conflict graph。
- 同一个 source class 内，`atomicClassNames` 必须保留 declaration 原始顺序。
- safe selector 内可以 mixed declaration：部分 atomize，部分 preserved。
- 长期原则是不确定 declaration preserved + diagnostic。

v1 preserved reason 先保持克制：

```ts
type PreservedDeclarationReason =
  | 'custom-property-declaration'
  | 'unsupported-declaration'
  | 'invalid-declaration'
```

### 10. atomic key 与 registry 负责复用、稳定性和顺序

atomic key 是判断两条 declaration 能否复用同一个 atomic class 的唯一依据。

v1 key 应包含：

```txt
prop
value
important
pseudo
media
supports
```

概念输入为：

```ts
type AtomicKeyInput = {
  declaration: DeclarationMeta
  context: CssTransformContext
}

type CssTransformContext = {
  pseudo?: string
  media?: string
  supports?: string
}
```

v1 normalize 策略：

- `prop` 只做 `trim` + `lowercase`。
- `value` 只做 `trim`。
- 不做 `#fff -> #ffffff`、`0px -> 0`、`rgb(...) -> red` 这类激进 value canonicalization。

原因是 CSS value canonicalization 很复杂，错误 normalize 可能改变语义或降低调试可读性。
更激进的压缩应留给成熟 CSS minifier 或后续经过验证的优化阶段。

`!important`、`pseudo`、`media`、`supports` 必须进入 atomic key。以下声明不能共享同一个 key：

```css
.button { color: red; }
.button { color: red !important; }
.button:hover { color: red; }

@media (min-width: 768px) {
  .button { color: red; }
}
```

atomic registry 的职责：

- 根据 key 判断是否已有 atomic declaration。
- 没有时生成 atomic class name。
- 记录 source locations。
- 保持首次出现顺序。
- 支持跨文件复用。
- 为最终 atomic CSS 输出提供稳定列表。

长期设计中，registry 应由 `createTransformer()` 实例持有，以支持跨文件复用：

```ts
const transformer = createTransformer(options)
transformer.transformCss(input)
transformer.getAtomicCss()
transformer.getReport()
```

当前 v1 transformer 按一次性 build 聚合器实现，是 append-only 语义；同一个 `id` 多次 transform 会被视为
多次输入追加，不会自动移除旧 atomic/report 数据。dev/HMR adapter 需要在接入前补充失效策略。

同时可以提供无状态 helper：

```ts
transformCss(input, options)
```

该 helper 内部创建临时 transformer，适合测试和简单使用。

class name 策略长期不应绑定 dev / prod 概念，而应由 integration layer 决定：

```ts
type AtomicClassNameOptions = {
  strategy: 'readable' | 'hash'
  prefix: string
}
```

Vite adapter 可以在 dev 时传 `readable`，在 build 时传 `hash`。

输出顺序规则：

- atomic CSS 按首次 register 的顺序输出。
- class mapping 内的 `atomicClassNames` 按 declaration 原始顺序追加。
- 不全局按 key 排序，避免破坏 shorthand / longhand cascade。

class name collision 必须处理。无论 readable 还是 hash strategy，如果生成出的 class name 已被不同
key 使用，都应追加 hash suffix 或采用等价方式消除冲突。

### 11. CSS render 与 preserved CSS 输出追求稳定和保守正确性

render 层负责把结构化转换结果输出为稳定 CSS 字符串。它不负责判断 selector 是否安全，也不负责
生成 atomic key。

atomic CSS render 基于 `AtomicDeclaration` 输出：

```css
._color_red {
  color: red;
}

._hover_color_blue:hover {
  color: blue;
}
```

如果带有 at-rule context，则保留外层上下文：

```css
@media (min-width: 768px) {
  ._media_x_color_red {
    color: red;
  }
}
```

media 与 supports 同时存在时，v1 沿用当前语义：按 core 处理得到的 context 包裹，不额外重排。

preserved CSS render 需要处理两类来源：

- unsafe rule 整条 preserved。
- safe rule 中部分 declaration preserved，例如 custom property declaration。

preserved selector scoping 规则：

- source class 调用 `scope.resolveClassName`。
- global class 不调用 resolver。
- `:global(...)` 在 preserved 输出中展开为标准 selector。
- v1 不支持 selector 级 arbitrary rewrite。
- resolver 只返回 class name，不返回完整 selector。

示例：

```css
.card .button {
  font-weight: bold;
}
```

CSS Modules adapter resolver 输出：

```css
.Card_card__hash .Button_button__hash {
  font-weight: bold;
}
```

普通 CSS identity resolver 输出：

```css
.card .button {
  font-weight: bold;
}
```

unknown at-rule v1 整段 preserved，例如 `@keyframes` 不进入 selector 分析。media / supports 下的
preserved rule 必须保留外层 at-rule。

formatting 策略：

- v1 不追求格式化保真，追求稳定输出。
- 使用 2 spaces indentation。
- rule 之间空一行。
- declaration 每行一个。
- `!important` 必须保留。
- 普通 comment v1 不作为核心保证。
- license comment 后续单独讨论。

最终 CSS 输出顺序保持：

```txt
atomic CSS first
preserved CSS second
```

这样 unsafe fallback 更容易覆盖 atomic CSS，符合正确性优先原则。

长期结构上，render 层优先消费结构化数据；未知或无法结构化处理的 CSS 可通过 `PreservedBlock`
保存原始 CSS 块和 preserved reason。

### 12. diagnostics、manifest、report 分别面向事件、索引和聚合

diagnostics、manifest 和 report 都由转换过程产生，但三者职责不同：

```txt
diagnostics：事件级，描述本次转换发生了什么问题或保守处理。
manifest：索引级，用于从产物反查来源。
report：聚合级，用于理解整体转换效果和治理指标。
```

#### Diagnostics

diagnostics 是 core 的基础结构化输出。core 负责生产 diagnostics，但不负责打印或展示。

概念结构：

```ts
type Diagnostic = {
  code: DiagnosticCode
  level: 'info' | 'warning' | 'error'
  message: string
  id: string
  selector?: string
  sourceClassName?: string
  reason?: string
  source?: SourceLocation
}

type DiagnosticCode =
  | 'unsafe-selector'
  | 'preserved-declaration'
  | 'parse-error'
  | 'unsupported-at-rule'
  | 'unknown'
```

决策：

- diagnostic 使用稳定 `code`，`message` 可以随文案优化变化。
- unsafe selector 默认是 `warning`。
- custom property preserved 默认不发 warning，避免噪音过多，但应进入 report/manifest 基础数据。
- parse error 是 `error`。
- unknown at-rule preserved 可作为 `info` 或后续按策略调整。
- strict / fail build 最终由 integration layer 决定。

#### Manifest

manifest 用于反查产物来源，例如：

```txt
这个 atomic class 从哪里来？
这个 source class 最终对应哪些 atomic class？
```

概念结构：

```ts
type TransformManifest = {
  atomic: Record<string, AtomicManifestEntry>
  classes: Record<string, ClassManifestEntry>
}

type AtomicManifestEntry = {
  key: string
  className: string
  declaration: DeclarationMeta
  context: CssTransformContext
  sources: SourceLocation[]
}

type ClassManifestEntry = {
  id: string
  sourceClassName: string
  resolvedClassName: string
  atomicClassNames: string[]
  suggestedClassName: string
  unsafeReasons?: UnsafeSelectorReason[]
}
```

class entry key 可以使用：

```txt
${id}::${sourceClassName}
```

manifest 是机器可读索引，不应承载过多展示文案，也不负责 warning 策略。

#### Report

report 面向整体转换效果、风险和治理指标。

概念结构：

```ts
type TransformReport = {
  summary: {
    files: number
    sourceClasses: number
    atomicDeclarations: number
    reusedAtomicDeclarations: number
    unsafeRules: number
    preservedRules: number
    preservedDeclarations: number
  }
  size: {
    beforeCssBytes: number
    afterAtomicCssBytes: number
    afterPreservedCssBytes: number
    estimatedClassStringIncreaseBytes: number
    estimatedTotalDiffBytes: number
  }
  diagnostics: Diagnostic[]
}
```

未来可扩展：

- gzip / brotli size。
- unsafe reason breakdown。
- per-file summary。
- top reused declarations。
- HTML / Markdown / CI report。

core 返回 manifest/report 基础数据，但不写文件。Vite、Rsbuild、Webpack 或 CLI adapter 决定是否
emit asset、输出路径和展示格式。

#### SourceLocation

source location 由 core 采集，因为 core 负责解析 CSS AST。

长期建议使用 `id` 而不是 `file`：

```ts
type SourceLocation = {
  id: string
  line?: number
  column?: number
}
```

原因是 core 输入不一定来自真实文件，也可能来自虚拟模块、内存字符串或预处理器结果。

## 目标源码结构

core 的目标目录结构应体现 IR-first 和 pipeline/pass，而不是只按粗略职责拆分。

推荐结构：

```txt
packages/core/src/
  index.ts

  public/
    types.ts

  engine/
    createTransformer.ts
    transformCss.ts
    runPipeline.ts
    types.ts

  ast/
    parseCss.ts
    collectIr.ts
    sourceLocation.ts
    types.ts

  ir/
    types.ts

  passes/
    analyzeSelectors.ts
    analyzeDeclarations.ts
    buildTransformPlan.ts
    registerAtomicDeclarations.ts
    types.ts

  selector/
    analyzeSelector.ts
    scopeSelector.ts
    collectClassNames.ts
    types.ts

  declaration/
    analyzeDeclaration.ts
    toDeclarationMeta.ts
    types.ts

  registry/
    AtomicRegistry.ts
    ClassMappingBuilder.ts
    PreservedCssCollector.ts
    types.ts

  atomizer/
    createAtomicKey.ts
    createAtomicClassName.ts
    readableAtomicName.ts
    types.ts

  output/
    renderAtomicCss.ts
    renderPreservedCss.ts
    renderRule.ts
    wrapAtRule.ts
    createManifest.ts
    createReport.ts
    createSizeReport.ts
    types.ts

  diagnostics/
    DiagnosticCollector.ts
    createDiagnostic.ts
    messages.ts
    types.ts

  policies/
    defaultOptions.ts
    classNameStrategy.ts
    diagnosticPolicy.ts
    scopeStrategy.ts
    types.ts

  utils/
    bytes.ts
    hash.ts
    sanitize.ts
    stableStringify.ts
```

### 目录职责说明

- `public/`：只放 public API 类型。其他模块不得随意从这里导入内部实现细节。
- `engine/`：编译器编排层，负责创建 transformer、运行 pipeline、维护跨文件 registry。
- `ast/`：负责 PostCSS parse、AST traversal、source location 提取和 IR 收集。
- `ir/`：放 GSS 自己的中间表示，例如 `CssRuleRecord`、`PreservedRule`、`PreservedBlock`。
- `passes/`：放 pipeline 中的阶段函数，负责把 IR 逐步转成 transform plan 和最终结果。
- `selector/`：只处理 selector 结构化分析、source/global class 收集和 scoping。
- `declaration/`：只处理 declaration meta 和 atomizable/preserved 判断。
- `registry/`：维护有状态集合，包括 atomic registry、class mapping builder、preserved CSS collector。
- `atomizer/`：处理 atomic key 和 atomic class name，不负责读取文件或 adapter 逻辑。
- `output/`：把结构化结果转成 CSS、manifest、report、size data。
- `diagnostics/`：生产和收集结构化 diagnostics，不打印。
- `policies/`：放可注入策略的默认实现和类型，例如 class name、diagnostic、scope 相关默认策略。
- `utils/`：只放无业务语义工具。不要把 selector、atomic、report 业务逻辑塞进 utils。

### 模块依赖方向

实现时应保持单向依赖，避免环：

```txt
public/types
  ↑
engine
  → ast
  → passes
  → registry
  → output
  → diagnostics

passes
  → selector
  → declaration
  → atomizer
  → registry
  → diagnostics

selector/declaration/atomizer/output
  → ir/public types
  → utils
```

禁止：

- `selector` 依赖 `engine`。
- `declaration` 依赖 `engine`。
- `atomizer` 依赖 Vite 或 adapter。
- `output` 读取文件或写文件。
- `utils` 反向依赖任何业务模块。

## 实施交接指南

本节用于指导后续 agent 执行大修。执行前必须重新阅读本文档和 `AGENTS.md`。

### 总体实施原则

- 本次大修可以 breaking，不需要兼容旧 `compileCssModule` API。
- 但每一步仍应尽量保持 CSS 转换行为稳定，避免把 API breaking 和语义变化混在一起。
- 所有新增代码注释必须使用中文。
- 每个类、函数、方法、导出类型、关键流程函数都需要中文注释。
- 修改 core 语义时必须同步更新本文档。
- 不确定的 CSS 继续 preserved + diagnostic，不允许为了压缩率削弱 fallback。

### 推荐迁移阶段

1. **建立测试基线**
   - 增加 selector、declaration、atomizer、renderer 的单元测试。
   - 保留 fixture snapshot 作为端到端行为契约。
   - 先覆盖当前行为，再开始搬迁。

2. **建立 public types 与 IR**
   - 新增 `public/types.ts` 和 `ir/types.ts`。
   - 定义 `TransformCssInput`、`TransformCssResult`、`ScopeStrategy`、`CssRuleRecord` 等核心结构。
   - 不急着实现全部功能，先让类型表达目标边界。

3. **迁移 utils**
   - 先迁移 hash、sanitize、bytes、stable stringify。
   - utils 不应包含业务判断。

4. **迁移 selector 与 declaration**
   - 先迁移纯分析函数。
   - 补充 safe/unsafe selector reason tests。
   - 补充 custom property、important、vendor prefix、mixed declaration tests。

5. **迁移 atomic registry**
   - 实现 `AtomicRegistry`。
   - 确认 key、className、source、order 的稳定性。
   - 测试跨文件复用和 class name collision。

6. **迁移 renderer/output**
   - 实现 atomic CSS render、preserved CSS render、manifest/report/size。
   - 确认 atomic first、preserved second。
   - 确认 `:global(...)` preserved 输出为标准 selector。

7. **实现 engine pipeline**
   - 实现 `createTransformer()` 和 `transformCss()`。
   - 用 pipeline 串起 parse、IR、analysis、plan、registry、output。
   - 删除 core 内的 virtual CSS 职责。

8. **更新 Vite adapter**
   - Vite adapter 负责文件读取、virtual module、tokens、warning、emit assets。
   - CSS Modules scoped name 和 tokens 生成不再由 core 承担。
   - 使用 core 的 class mapping 生成 CSS Modules tokens。

9. **文档和验收**
   - 更新 README、Phase 文档、验收文档。
   - 运行 core tests、typecheck、build、phase verify。
   - 如果 pnpm 基线仍不可用，记录替代命令和原因。

### 每阶段验收要求

- selector / declaration / atomizer / renderer 模块测试通过。
- fixture snapshot 变化必须解释原因。
- `preserved CSS` 不得丢失 unsafe fallback。
- `atomicClassNames` 顺序不得破坏 declaration 原始顺序。
- `!important` 必须保持 key separation。
- `custom property declaration` 默认 preserved。
- `core` 不得引入 Vite、React、浏览器运行时或文件系统写入。

### 实现时优先使用的数据结构

- `Map`：用于 key 到 declaration、className、class mapping 的稳定映射。
- `Set`：用于 unsafe reason、source class 去重。
- `Array`：用于保留首次出现顺序，不要用对象 key 排序替代。
- discriminated union：用于 `SelectorAnalysis`、`DeclarationAnalysis`、diagnostic 等分支结果。
- builder / collector：用于聚合 diagnostics、class mapping、preserved CSS，避免到处传可变散装对象。

### 禁止事项

- 不要在 core 中读取或写入文件。
- 不要在 core 中生成或解析 Vite virtual module id。
- 不要让 core 直接生成 CSS Modules tokens。
- 不要把 Less / Sass 编译器依赖加入 core。
- 不要让 PostCSS node 成为所有模块的公共输入输出。
- 不要在 core 中 `console.warn` 或 `console.log`。
- 不要把业务逻辑放进 `utils`。
- 不要为了提高 atomization rate 移除 preserved fallback。

## 建议的目标输入输出

### TransformCssInput

```ts
type TransformCssInput = {
  id: string
  css: string
  scope: ScopeStrategy
}
```

字段说明：

- `id`：样式来源标识，用于 source location、manifest 和 diagnostics。
- `css`：已经准备好的标准 CSS 字符串。
- `scope`：class name 解析策略，由 adapter 提供。

### TransformCssOptions

```ts
type TransformCssOptions = {
  preserveResolvedClass?: boolean
  className?: AtomicClassNameOptions
}
```

配置原则：

- 只放和 CSS 转换语义直接相关的选项。
- 不放 include / exclude。
- 不放 Less / Sass 编译配置。
- 不放构建工具生命周期配置。
- `analysis` mode 当前暂不暴露，后续语义稳定后再加入。

### TransformCssResult

```ts
type TransformCssResult = {
  id: string
  css: {
    atomic: string
    preserved: string
  }
  classes: Record<string, TransformClassMapping>
  atomic: AtomicDeclaration[]
  diagnostics: Diagnostic[]
  manifest: TransformManifest
  report: TransformReport
}
```

输出原则：

- `atomic` 和 `preserved` 是 core 的 CSS 转换产物。
- `classes` 是通用 class mapping，不是 CSS Modules tokens。
- `diagnostics` 记录 warning、unsafe reason 和 source location。
- `manifest` / `report` 是调试和治理所需的基础数据。

## 能力归属判断标准

一个能力应该放进 core，需要同时满足以下大部分条件：

- 不依赖具体构建工具。
- 不依赖具体文件类型。
- 只依赖标准 CSS 内容、scope strategy 和 transform options。
- 影响 atomic 转换正确性。
- 影响 preserved fallback 正确性。
- 需要被 Vite、Rsbuild、Webpack、CLI 或 verifier 共同复用。

一个能力通常不应该放进 core，如果它属于：

- 文件选择，例如 include / exclude。
- 文件读取或写入。
- Less / Sass 编译。
- CSS Modules tokens 生成。
- 构建工具生命周期。
- virtual module 管理。
- asset emit。
- HMR。
- console warning 展示格式。
- report 文件写入。

## 当前仍待讨论的问题

以下问题还没有最终定案，后续推进时需要继续补充到本文档：

- `ScopeStrategy` 后续是否需要支持 selector 级 rewrite。
- selector unsafe reason 是否要稳定为枚举类型。
- `analysis` mode 是否只输出 diagnostics/report，还是也生成模拟转换结果；当前 public API 暂不暴露。
- manifest/report 是否默认生成，还是作为可选能力。
- source location 与 source map 的长期设计。
- plain CSS 场景是否默认只能 analysis，还是允许 safe transform。
- class name 生成策略是否允许外部完全接管。
- strict mode 是否属于 core options，还是 integration layer 的门禁策略。

## 当前阶段结论

core 包的 Phase 2 方向是：

```txt
从 CSS Modules 原型编译器
演进为通用 CSS transform engine
```

当前 CSS Modules 能力仍然是第一个落地场景，但不再作为 core 的架构边界。
