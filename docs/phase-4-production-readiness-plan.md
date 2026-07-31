# Phase 4 真实项目试用稳固方案规划

## 文档状态

Status: completed

本文档是 Phase 4 的活文档，用于在实现前沉淀阶段目标、产品边界、关键决策、执行顺序和验收标准。
当前版本已经完成 Route A 实现、验收补强、visual flake 修复、dev shared CSS owner
调整、中型真实项目 Pilot 和 analyzer declaration conflict 提示。Phase 4 已于 2026-07-14
完成收尾；后续如果 Route A 在真实项目试用中暴露新的阻塞或迁移结论，应进入新的
追踪文档，不再重开 Phase 4 范围。

## 已确认背景

- GSS 的产品主线是 CSS Modules only，不以普通全局 CSS 自动 atomic 化作为默认目标。
- CSS Modules 是项目价值成立的核心杠杆，因为插件可以通过 `styles.xxx` export mapping 在不改写 JSX / TSX 的前提下追加 atomic class。
- `@semantic-atomic-css/core` 仍保持构建工具无关的 CSS transform engine 边界；CSS Modules tokens、scoped name、构建工具生命周期和 asset 输出属于 adapter / integration layer。
- Phase 3 已完成 Vite adapter Route B 第一版闭环，包含 `.module.css` 接管、default export tokens、全局 atomic CSS asset、manifest/report 可选输出和 computed style 对照验收。
- Phase 4 第一批已迁移到 Route A，CSS Modules 编译语义复用 Vite 6 `preprocessCSS`，GSS 负责 atomization、tokens 增强、fallback CSS、asset/report 输出。

## Phase 4 定位

Phase 4 定位为：

```txt
真实项目试用稳固
```

核心问题：

```txt
现有 Vite + CSS Modules safe atomization 路径，是否足够安全、可解释、可验收，能让真实项目开始试用？
```

## 已决策摘要

- Phase 4 成功标准是真实项目可试用。
- Phase 4 先完成可执行方案，再进入第一批实现。
- Vite adapter 目标路线改为 Route A，优先复用 Vite 原生 CSS Modules pipeline。
- Route A 先做 feasibility spike，再决定 migration 或记录阻塞结论。
- CSS Modules feature 不预设固定黑名单；由 Route A spike 判定可继承、不可继承或待决策。
- `modules.namedExports: true` 由 Route A spike 判定是否可继承；`diagnostics.strict: true` 在 Phase 4 显式失败。
- 新增 `@semantic-atomic-css/analyzer`，承载构建工具无关的分析与评估能力。
- 不拆完整 `@semantic-atomic-css/css-modules` 包，CSS Modules 兼容由各构建工具 adapter 对齐自身工具。
- Phase 4 明确暂缓普通 CSS、预处理器、Rsbuild/Rspack、named exports 实现、strict mode、CSS-only HMR、完整 source map 和 overlay。

## 第一批实现结果

截至 2026-07-07，Phase 4 第一批任务已完成：

- Route A feasibility spike 结论为可行。Vite 6 公开导出的 `preprocessCSS(code, filename, config)` 能返回
  CSS Modules scoped CSS 和 `modules` tokens，并能继承 `localsConvention`、`generateScopedName`、
  `composes`、`:import(...)`、`:export`、`@value` 等 Vite 原生 CSS Modules 行为。
- Vite adapter 已迁移到 Route A。GSS 仍接管最终 JS/CSS 输出，但 CSS Modules 编译语义来自 Vite 原生
  preprocess pipeline；GSS 只负责 safe atomization、tokens atomic 增强、fallback CSS、asset/report 输出。
- core 新增 `non-exported-class` preserved reason。Route A 下如果 scoped CSS 中出现无法通过 Vite tokens
  命中 DOM 的 class，例如 `:global(...)` 产生的 class，core 会保守保留 fallback CSS。
- `modules.namedExports: true`、`diagnostics.strict: true` 和未显式覆盖的 `css.modules: false` 已显式失败。
- 新增 `@semantic-atomic-css/analyzer`，显式开启 report 时会在现有 build JSON report 中追加 `analysis` 字段。
- 新增 `pnpm verify:phase4`，并已通过 `pnpm verify:phase3`、`pnpm verify:phase3:visual`、`pnpm verify:phase4`。

Route A 当前仍不承诺完整 source map，也不承诺 named exports、strict mode、CSS-only HMR 或预处理器输入。

第二批验收补强已完成：

- Route A build 测试和 `pnpm verify:phase4` 临时 fixture 均显式覆盖 `:import(...)`，不再只通过
  `composes from` 间接覆盖 ICSS import 路径。
- Route A build 测试和 `pnpm verify:phase4` 临时 fixture 覆盖 Vite `css.modules: false` 时由 GSS 显式
  `modules` 配置重新启用 preprocess CSS Modules 的路径，避免只在 helper 单元测试中验证该保护策略。
- Route A 第三批补强覆盖 Vite 原生 `css.modules.namedExports: true`。未显式配置 GSS `modules` 时，
  继承该配置会直接失败；显式配置 GSS `modules` 时，以 GSS modules 配置作为覆盖源，不继承 Vite
  `namedExports`。
- Route A build 测试和 `pnpm verify:phase4` 临时 fixture 增加普通 CSS 对照，确认普通 CSS 仍由 Vite
  原生 CSS asset 输出，而原 CSS Modules scoped CSS 不会重复进入 Vite 原生 CSS asset。
- dev virtual CSS 已切换为单一 shared CSS owner。Route A dev 下所有 `.module.css` 导入同一个
  `virtual:semantic-atomic-css/dev.css`，该 owner 聚合当前 `devResults`、按 atomic key 去重并保持首次出现顺序，
  不再使用 cascade layer 包裹 atomic rule。
- shared CSS owner 已加载后，如果普通加载路径首次转换新的 CSS Module，adapter 会通过 Vite dev server
  重新加载该 virtual CSS module。该动作同时使服务端 transform 缓存失效并向浏览器发送 shared virtual CSS
  模块更新，避免新模块只进入 `devResults`、浏览器却继续复用旧 shared CSS 快照。
- 2026-07-14 复盘确认：cascade layer 可以限制 GSS 内部重复 atomic key 的后注入覆盖，但 layered
  normal declaration 会输给未分层的普通 author CSS，例如全局 `button { font: inherit; }`，导致按钮
  `font-weight` 与 Vite native CSS Modules dev 渲染不一致。shared unlayered CSS owner 是当前 MVP 下更接近
  Vite native dev 行为的方案。
- `pnpm verify:phase3:visual` 现在会先构建 core、analyzer 和 vite package，再启动 semantic/native dev
  与 build preview，避免 visual 验收误用旧 `dist`。
- 新增 `pnpm verify:phase4:full`，串联 Phase 4 静态验收与 visual computed style 对照。`pnpm verify:phase4`
  仍是静态验收命令。
- fail fast 配置保护已统一输出 `unsupported-feature feature=... id=... reason=...` 格式；失败后生成
  report / analysis 仍是后续增强项。
- report 验收断言补充 analyzer `health`、`highRiskFiles`、gzip / brotli 体积字段，确保 JSON analysis
  的关键试用信号稳定输出。
- `@semantic-atomic-css/analyzer` package export 的 `types` 已改为指向 `dist/index.d.ts`，避免发布消费时暴露源码路径。

## 已确认决策

### 决策 1：Phase 4 成功标准

Phase 4 的成功标准是：

```txt
让现有 Vite + CSS Modules safe atomization 路径达到真实项目可试用状态。
```

这里的“可试用”不是指支持更多语法或更多构建工具，而是指：

- 不支持的 CSS Modules 语义不会 silent miscompile。
- 使用者可以通过 report 看懂 atomic 收益、fallback 风险和 unsafe 分布。
- semantic/native computed style 对照覆盖主要高风险场景。
- CSS Modules only 产品边界清晰，不误导用户以为支持普通 CSS 自动 atomic 化。

### 决策 2：Phase 4 交付范围

Phase 4 采用：

```txt
规划先行，随后按规划进入第一批实现。
```

本文件最终必须成为可执行方案，而不只是讨论纪要。定稿后，后续执行 agent 应能从本文档明确知道：

- Phase 4 做什么。
- Phase 4 不做什么。
- 先做哪些任务。
- 每项任务如何验收。
- 哪些设计边界不能破坏。

### 决策 3：第一批实现主题优先级

Phase 4 第一批实现顺序为：

```txt
Route A feasibility spike
→ Route A migration 或记录阻塞结论
→ CSS Modules feature 继承分类与不可继承 feature fail fast
→ 配置能力继承分类与保护
→ analyzer 包与 build JSON analysis 集成
→ acceptance / verifier 增强
```

原因：

- Route A 是 Vite adapter 的目标路线，后续保护和 analyzer 集成应落在正确 adapter 路线上。
- CSS Modules feature 继承分类仍然高优先级，但应在 Route A 接入形态明确后实现。
- analyzer 仍进入第一批，但在 adapter 路线稳定后接入。
- 验收最后收口，确保 Phase 4 不是只在文档上安全。

### 决策 4：CSS Modules feature 继承与 fail fast 策略

Phase 4 在 Route A 目标下，不预设固定 CSS Modules feature 黑名单。

默认原则：

- 优先继承 Vite 原生 CSS Modules 能力。
- 如果 Vite 原生 CSS Modules 已经正确处理某个 feature，并且 GSS 在 atomization、tokens 增强和
  preserved fallback 过程中能保持等价，则不应额外 fail fast。
- 只有当 GSS 无法证明处理后仍与 Vite 原生 CSS Modules 等价时，才 fail fast。
- fail fast 报错必须包含 feature、文件、位置和原因。
- Phase 4 不提供 warning-only 宽松模式。

原因：

普通 unsafe selector 可以通过 preserved fallback CSS 保持样式命中；CSS Modules feature 则属于构建工具
CSS Modules pipeline 的编译语义。Route A 的目标是对齐 Vite 原生 CSS Modules，因此不能在未验证前
把 Vite 已支持的语义一刀切禁用。最终 fail fast 范围必须由 Route A feasibility spike 结论决定。

### 决策 5：Route A spike 必须评估的 CSS Modules feature

Route A spike 必须评估以下 CSS 文件内 feature 能否继承 Vite 原生 CSS Modules 语义：

```txt
composes
:import(...)
:export
@value
```

这些能力会影响 CSS Modules tokens、跨文件 class 组合或变量导入导出。它们不应被默认视为不支持，
但必须被 Route A spike 明确分类：

```txt
可继承：Vite 原生处理后，GSS 能保持 tokens / CSS / fallback 等价。
不可继承：GSS 无法拿到足够信息或无法保持等价，必须 fail fast。
待决策：build/dev 行为不一致或依赖不稳定接入点，需要继续讨论。
```

以下内容不纳入本决策范围：

- `modules.namedExports: true`：属于 adapter 配置行为，放入单独配置保护决策。
- `.module.scss` / `.module.less`：属于输入类型扩展，延后到 CSS Modules 预处理器阶段。
- 普通 CSS 文件：不属于 GSS 主线。
- CSS-only HMR：属于开发体验问题，不是第一批 silent miscompile 风险。

### 决策 6：配置能力继承与保护策略

Phase 4 第一批实现纳入配置能力继承与保护策略。

Route A spike 必须评估：

```txt
modules.namedExports: true
```

策略：

- 如果 Route A 能继承并增强 Vite 原生 named exports，则允许。
- 如果 Route A 不能稳定改写 named exports，则 `modules.namedExports: true` 必须 fail fast。
- 不默默忽略 named exports 配置，也不假装配置已经生效。

仍然显式失败的配置：

```txt
diagnostics.strict: true
```

原因：

- strict mode 是 GSS 自己的治理门禁策略，不是 Vite 原生 CSS Modules 能力。
- Phase 4 不实现 strict mode，因此用户显式开启时必须直接报错。

边界：

- named exports 后续如果支持，属于 CSS Modules adapter 能力，不进入 core。
- strict mode 后续如果支持，属于 integration layer 的治理门禁，不进入 core。

### 决策 7：Phase 4 分析与评估能力增强范围

Phase 4 分析与评估能力增强目标是服务真实项目试用判断：

```txt
构建一次后，用户能知道 GSS 是否值得继续试，风险集中在哪里。
```

这里的能力不应被狭义命名为 report。report 只是当前最直接的输出形式；长期看，这一层更像
GSS 的分析与评估层，可服务 build JSON report、CI 门禁、调试面板、dashboard 或后续 overlay。

第一批增强范围：

- fallback / unsafe 风险：unsafe rule 数量、unsafe reason 分布、preserved CSS 占比、高风险文件。
- atomic 复用收益：atomic declaration 总数、reused atomic declaration 数量、source class 数量、复用趋势。
- 体积信息：raw CSS before / after、gzip / brotli before / after、class string 增量估算。
- unsupported feature 摘要：构建失败时能说明 feature、文件、位置和原因；未来如果生成 report，也应能按 feature 聚合。

边界：

- Phase 4 先增强 build 产物 JSON report。
- 不做 dev server report UI。
- 不做 browser overlay。
- 体积数据是 CSS 与 class string 维度的估算，不宣称等同最终 JS/CSS bundle 真实差异。

### 决策 8：分析与评估层命名和定位

Phase 4 规划引入构建工具无关的分析与评估层，推荐包名：

```txt
@semantic-atomic-css/analyzer
```

长期定位：

```txt
负责构建工具无关的转换效果分析、风险分析、体积评估和试用健康度摘要。
```

边界：

- 不属于 `@semantic-atomic-css/core`，避免 core 承担产物评估、压缩体积和试用报告职责。
- 不写死在 `@semantic-atomic-css/vite`，避免后续 Rsbuild / Rspack / CLI 重复实现。
- report 是 analyzer 的一种输出消费方式，不是该层的全部定位。
- 第一版仍服务 build JSON report 增强，但命名和数据模型要为 CI、dashboard、overlay 等后续场景预留空间。

### 决策 9：analyzer 是否进入 Phase 4 第一批实现

`@semantic-atomic-css/analyzer` 进入 Phase 4 第一批实现。

原因：

- 分析与评估能力不属于 core。
- 分析与评估能力也不应写死在 Vite adapter 内。
- 后续 Rsbuild / Rspack / CLI 都可能复用同一套转换效果分析、风险分析和体积评估。
- Phase 4 的目标是真实项目可试用，analyzer 是解释试用收益和风险的核心能力。

### 决策 10：analyzer 第一版能力范围

`@semantic-atomic-css/analyzer` 第一版只做构建后结构化分析。

输入来源：

- core 的 `TransformReport`。
- core 的 `TransformManifest`。
- 构建前原始 CSS 聚合信息。
- 构建后 atomic + preserved CSS 信息。
- adapter 收集到的文件级信息。

输出能力：

- 风险分析：unsafe reason 分布、preserved CSS 占比、高风险文件列表、unsupported feature 结构化入口。
- 收益分析：atomic declarations、reused atomic declarations、source classes、atomic 复用摘要。
- 体积分析：raw CSS before / after、gzip / brotli before / after、class string 增量、estimated total diff。
- 试用健康度摘要：输出 `ready` / `risky` / `blocked` 这类结构化状态，帮助用户判断是否适合继续试用。

明确不做：

- 不读取文件。
- 不写文件。
- 不依赖 Vite。
- 不做 UI。
- 不做 dev overlay。
- 不做 CI fail policy；analyzer 只输出数据，门禁由 adapter 或 CI 决定。

### 决策 11：CSS Modules 兼容能力的归属

Phase 4 不拆 `@semantic-atomic-css/css-modules` 这类完整 CSS Modules 共享包。

原因：

- 不同构建工具已有各自 CSS Modules 实现，用户预期是 GSS adapter 对齐当前构建工具的 CSS Modules 行为。
- Vite adapter 应对齐 Vite CSS Modules；未来 Rsbuild / Rspack adapter 应对齐 Rspack CSS Modules。
- 如果 GSS 抽出一个完整 CSS Modules 包并统一 scoped name、tokens、`localsConvention`、`composes`、
  `:import`、`:export` 等语义，容易变成第三套 CSS Modules 实现，反而增加兼容风险。

因此：

- CSS Modules 编译语义属于各构建工具 adapter 的兼容责任。
- core 继续只接收标准 CSS 字符串和 `ScopeStrategy`，不感知 CSS Modules。
- adapter 应尽量复用所在构建工具提供的 CSS Modules 能力；没有稳定 hook 时，才采用保守 Route B 或内部近似实现。
- Phase 4 可以新增构建工具无关的小工具，但必须先证明它不绑定某个 CSS Modules 实现细节。
- 未来如需抽取共享能力，应优先考虑 `adapter-utils` 或 `css-modules-tools` 这类工具定位，而不是完整 CSS Modules 编译器定位。

### 决策 12：Vite adapter 长期路线

Phase 4 明确采用 Route A 作为 Vite adapter 的目标路线：

```txt
优先复用 Vite 原生 CSS Modules pipeline 的结果，再执行 GSS atomization 与 tokens 增强。
```

目标：

- Vite adapter 应尽量对齐 Vite 自身 CSS Modules 行为，而不是长期维护一套 GSS 近似 CSS Modules 实现。
- scoped class、tokens、`localsConvention`、`generateScopedName` 等行为优先来自 Vite 原生 CSS Modules 结果。
- GSS 的职责应收敛为：在拿到 Vite CSS Modules 编译结果后，执行 safe atomization、preserved fallback、tokens 增强、asset 输出和 analyzer 集成。

Phase 4 对 Route A 的处理策略：

- Route A 进入第一批实现前置任务。
- 第一批先确认 Vite 是否存在足够稳定的公开能力或可接受接入点，用于获取 CSS Modules tokens 与 scoped CSS。
- 如果 Vite 没有稳定接入点，不直接退回长期 Route B；需要把阻塞点、可选实现路线和兼容风险补充到本文档后再继续决策。
- Route B 可作为当前实现基线和对照，不再作为 Vite adapter 的长期目标路线。

### 决策 13：Route A 的 Phase 4 执行边界

Route A 第一批任务分两步：

```txt
1. Route A feasibility spike
2. Route A migration
```

第一步先确认 Vite 6 是否存在足够稳定的公开能力或可接受接入点，用于获取 CSS Modules tokens、
scoped CSS 和模块 CSS 输出。

交付规则：

- 如果接入点足够稳定，再进入 Route A migration。
- 如果接入点不稳定，不强行使用脆弱内部 hack 完成迁移。
- 如果 Route A 被阻塞，必须把阻塞点、可选路线、兼容风险和后续决策补充到本文档，再决定是否保留 Route B 或采用混合路线。

Phase 4 的理想结果是 Route A 成功落地并通过 Phase 3 / Phase 4 验收；可接受结果是产出明确技术结论，
而不是在不稳定接入点上制造新的兼容债务。

### 决策 14：Route A feasibility spike 成功判定

Route A feasibility spike 必须有明确结论，不接受只停留在源码阅读层面的模糊判断。

成功判定：

- 能拿到 Vite 原生 CSS Modules tokens，包括受 `localsConvention`、`generateScopedName` 等 Vite 配置影响后的结果。
- 能拿到 scoped 后的 CSS，或能建立 source class 到 scoped class 的稳定关系。
- preserved fallback 能使用 scoped class 命中 DOM。
- 能阻止原 CSS Modules CSS 与 GSS atomic / preserved CSS 重复注入。
- 能改写最终 JS tokens，在原 Vite CSS Modules tokens 基础上追加 atomic classes。
- dev / build 都有可解释路径；build 必须优先可行，dev 如有差异必须写清楚 fallback 策略。
- 不依赖明显不稳定的 Vite 私有 hack；如果只能依赖内部结构，必须记录为风险而不是直接视为成功。

spike 输出：

- 可行：写出 Route A migration 方案。
- 不可行：写出阻塞点、备选路线和是否保留 Route B 的后续决策。
- 部分可行：写出 build / dev 分歧策略。

### 决策 15：Route A spike 调研边界

Route A spike 允许：

- 阅读 Vite 6 源码。
- 阅读 Vite CSS Modules 相关依赖的源码。
- 编写最小 spike 测试或临时 fixture 验证 hook 行为。
- 对比 Vite 原生 CSS Modules 与 GSS 当前 Route B 输出。

Route A spike 最终方案要求：

- 优先依赖 Vite 稳定 public API。
- 如果需要使用非公开接入点，必须在文档中明确标注风险、原因和替代路线。
- 不允许把明显不稳定的内部 hack 直接视为 Phase 4 成功迁移方案。
- spike 产生的实验代码如果不进入正式实现，应保持隔离，不污染生产路径。

### 决策 16：Phase 4 非目标

Phase 4 明确不做：

- 不支持普通全局 CSS 自动 atomic 化。
- 不支持 `.module.scss` / `.module.less`。
- 不实现 Rsbuild / Rspack adapter。
- 不实现 named exports。
- 不实现 strict mode。
- 不做 CSS-only HMR。
- 不做完整 source map。
- 不做 dev server report UI / browser overlay。
- 不做 aggressive atomization。
- 不承诺 Route A 一定迁移成功；如果 Vite 接入点不稳定，可以以 spike 结论作为交付。

## 执行方案

### 1. Route A feasibility spike

目标：

- 确认 Vite 6 是否能稳定复用原生 CSS Modules tokens 和 scoped CSS。
- 形成 Route A migration 方案，或明确记录阻塞点与备选路线。

输出：

- spike 结论写回本文档。
- 如果可行，补充 Route A migration 的具体执行步骤和验收方式。
- 如果不可行或部分可行，补充 build / dev 分歧、风险和后续决策项。

实现状态：

- 已完成，结论为可行。
- 采用 Vite 6 `preprocessCSS` 作为公开接入点，不读取 Vite 内部 `cssModulesCache`。
- 已用单元测试和 Phase 4 临时 fixture 验证 `localsConvention`、`generateScopedName`、`composes`、
  `:import(...)`、`:export`、`@value` 继承路径。

### 2. Route A migration

前置条件：

- Route A feasibility spike 判定可行。

目标：

- Vite adapter 优先复用 Vite 原生 CSS Modules 结果。
- GSS 在 Vite CSS Modules 结果基础上执行 safe atomization、preserved fallback、tokens 增强和 asset 输出。
- Route B 保留为当前实现基线和对照，不再作为长期目标路线。

实现状态：

- 已完成迁移。
- `packages/vite/src/plugin.ts` 在 load 阶段读取 `.module.css` 后调用 `preprocessCSS`，再把 scoped CSS 交给 core。
- `packages/vite/src/cssModules.ts` 只保留 Route A helper：文件匹配、Vite CSS Modules 配置合并、identity scope、
  Vite tokens class 候选收集和 tokens atomic 增强。
- build/dev 继续输出 GSS 聚合 CSS，避免原 CSS Modules CSS 与 GSS CSS 重复注入。

### 3. CSS Modules feature 继承分类与不可继承 feature fail fast

目标：

- 根据 Route A spike 结论，对 `composes`、`:import(...)`、`:export`、`@value` 进行分类。
- 可继承 feature 不额外 fail fast。
- 不可继承 feature 在 build / dev 中直接失败。
- fail fast 报错包含 feature、文件、位置和原因。

边界：

- 不自行实现完整 CSS Modules feature。
- 不提供 warning-only 宽松模式。

实现状态：

- `composes`、`:import(...)`、`:export`、`@value` 第一批判定为可继承。
- 非 class export 不追加 atomic class，保持 Vite 原生值。
- 本批没有新增 CSS 文件内 feature fail fast 黑名单；无法通过 tokens 命中 DOM 的 class 走 `non-exported-class`
  fallback，而不是 silent atomize。

### 4. 配置能力继承分类与保护

目标：

- 根据 Route A spike 结论，判断 `modules.namedExports: true` 是否能继承并增强 Vite 原生 named exports。
- 如果不能稳定继承，则 `modules.namedExports: true` 显式失败。
- `diagnostics.strict: true` 显式失败。

边界：

- 不实现 named exports。
- 不默默忽略 named exports 配置。
- 不实现 strict mode。

实现状态：

- `modules.namedExports: true` 显式失败。
- `diagnostics.strict: true` 显式失败。
- 未显式配置 GSS `modules` 时，如果 Vite `css.modules: false`，显式失败。
- 未显式配置 GSS `modules` 时，如果 Vite `css.modules.namedExports: true`，显式失败。
- 显式配置 GSS `modules` 时，不继承 Vite `css.modules` 对象；只把 GSS 当前支持的 modules 选项传给
  Vite preprocess。

### 5. analyzer 包与 build JSON analysis 集成

目标：

- 新增 `@semantic-atomic-css/analyzer`。
- analyzer 输出构建后结构化分析数据。
- Vite adapter 在显式开启 report 时，把 analyzer 结果写入 build JSON report。

第一版分析范围：

- unsafe reason 分布。
- preserved CSS 占比。
- 高风险文件列表。
- atomic 复用摘要。
- raw / gzip / brotli 体积分析。
- `ready` / `risky` / `blocked` 试用健康度摘要。

实现状态：

- 已新增 `packages/analyzer`，包名为 `@semantic-atomic-css/analyzer`。
- analyzer 不读取文件、不写文件、不依赖 Vite，只消费 core report/manifest、adapter 文件级信息和输出 CSS。
- 显式开启 Vite report 时，输出 JSON 保留原 core report 顶层字段，并新增 `analysis` 字段。
- analyzer 当前输出 unsafe reason 分布、preserved CSS 占比、高风险文件、atomic 复用摘要、
  raw/gzip/brotli 体积估算和 `ready` / `risky` / `blocked` 健康度。

### 6. acceptance / verifier 增强

目标：

- 新增 Phase 4 验收命令或扩展现有验收脚本。
- 覆盖 CSS Modules feature 继承分类和不可继承 feature fail fast。
- 覆盖配置能力继承分类与保护。
- 覆盖 analyzer build JSON analysis 输出。
- 保持 semantic/native computed style 对照作为渲染等价基线。

实现状态：

- 已新增 `pnpm verify:phase4`。
- `pnpm verify:phase4` 会先执行 `pnpm verify:phase3`，再运行 `scripts/verify-phase-4.mjs`。
- `scripts/verify-phase-4.mjs` 使用临时 Vite fixture 验证 Route A feature 继承、tokens atomic 增强、
  非 class export 保持、global fallback、Vite `css.modules: false` 显式覆盖和 analyzer `analysis` 输出。
- `scripts/verify-phase-4.mjs` 同时验证未显式配置 GSS `modules` 时，继承 Vite
  `css.modules.namedExports: true` 会显式失败。
- `scripts/verify-phase-4.mjs` 验证普通 CSS 继续由 Vite asset 输出，CSS Modules scoped CSS 不会重复进入
  Vite 原生 CSS asset。
- `pnpm verify:phase3:visual` 会先构建 core、analyzer、vite package，再执行 Playwright computed
  style 对照，避免使用旧 dist 造成误判；interaction button 场景会额外断言 `fontWeight: 800`，覆盖
  shared dev CSS owner 对全局 `button { font: inherit; }` 的回归。
- `pnpm verify:phase4:full` 会串联 `pnpm verify:phase4` 和 `pnpm verify:phase3:visual`，作为 Phase 4
  完整验收入口。
- 2026-07-07 已通过 `pnpm verify:phase4` 和修复后的 `pnpm verify:phase3:visual`。本地连续三次
  visual 验收通过，用于回归之前的 `dev/desktop/base/cascade-active` flake。
- 2026-07-14 dev shared CSS owner 调整后，已通过 `pnpm --filter @semantic-atomic-css/vite test`、
  `pnpm verify:phase3:visual` 和 `pnpm verify:phase4:full`。

### 7. 中型 React + Vite 真实项目 Pilot

目标：

- 把 `playground/vite-react-css-modules` 从人工展示页升级为真实项目试用基准。
- 使用 5 个 lazy route、16 个导出 React 组件和 18 个 CSS Module 覆盖 shared owner、Route A 继承、
  safe atomization、unsafe fallback、report/manifest 与响应式布局。
- 通过 semantic/native、dev/build preview、desktop/mobile 四个维度执行人工浏览器验收。

实现状态：

- 已完成，详细推进和结果见 `docs/phase-4-real-project-pilot-tracking.md`。
- Vite 原生 `localsConvention: 'camelCase'` 和可读 `generateScopedName` 由 Route A 继承，GSS 未配置
  modules 覆盖；semantic build 显式输出 manifest 与带 `analysis` 的 report。
- semantic/native dev、build、preview 入口已分离，semantic/native build 分别写入 `dist/semantic`
  与 `dist/native`。
- 浏览器验收覆盖搜索、筛选、选中、抽屉、fallback、artifact、ICSS exports、条件 class、表单校验、
  checkbox、disabled/save 和一次可逆 CSS Module full reload。

Pilot 推动的 adapter 修复：

- CSS Module HMR 除清理 `devResults` 和 shared CSS 外，还会精确失效对应内部 JS virtual module，
  确保 full reload 重新生成 tokens，不再依赖测试中的 `moduleGraph.invalidateAll()`。
- dev/build 聚合 atomic CSS 会稳定地先输出基础 rules，再输出 `@media` / `@supports` contextual rules；
  简单 `max-width` 在原槽位中按断点从大到小、简单 `min-width` 从小到大，避免复用 key 破坏正常
  responsive override。复杂媒体表达式仍保持首次登记顺序，不宣称完整跨模块 cascade 建模。
- build CSS、preserved fallback 和 analyzer modules 按规范化 source id 使用同一稳定顺序；report diagnostics、
  manifest keys 和共享 atomic sources 在输出边界规范化，避免并发 transform 完成顺序进入持久化产物。

最终结果：

- 2026-07-14 再次通过 `pnpm verify:phase4:full`；Vite adapter 当前为 24 个测试。
- semantic/native 的 dev 与 build preview 在 desktop 和 `390 × 844` 下关键 computed style 与核心交互
  一致，五个移动 route 的横向溢出和控件裁切均为 `0`。
- analyzer health 为 `risky`，原因是刻意保留的 unsafe selector fallback 和 1 组同一
  semantic class 内的 shorthand / longhand 顺序依赖；`unsupportedFeatures` 为空，
  preserved CSS ratio 为 `0.1882`。
- 连续两次 semantic build 的 atomic CSS、report 与 manifest SHA-256 分别保持一致，analyzer 最终
  gzip 为 `4609 / 4073` bytes、brotli 为 `3875 / 3558` bytes。
- 当前仍不处理两个同时生效 class 的同属性竞争，也不完整建模复杂媒体表达式与任意 import order；这些
  场景应优先进入 analyzer 冲突提示，再决定是否扩展编译语义。

### 8. Analyzer declaration conflict 提示

已按 `docs/phase-4-analyzer-conflict-tracking.md` 完成结构化冲突提示。第一版只报告
同一 semantic class 内可从 manifest 确定的同属性或 shorthand / longhand 竞争；不读取
JSX / TSX，不把同模块不同 class 共享属性直接视为冲突。Pilot 校准表明，后一策略
会产生 164 组缺少 DOM 共现证据的高噪声候选。

实现结果：

- `analysis.risk` 新增 `declarationConflictSummary` 和 `declarationConflicts`。
- 冲突存在时 health 降为 `risky`，但不作为 `blocked` 或构建失败条件。
- analyzer 单元测试和 Vite build report 测试已覆盖输出与误报边界。
- Pilot 最终确定 1 组 `border -> border-left-color` shorthand / longhand 顺序依赖。

2026-07-22，Analyzer 已跟进 Core selector descriptor 契约：

- conflict detail 必填输出 `selectorIdentity`。
- 只在 selector identity、media、supports 和 important 都相同时分析属性竞争。
- 分组读取 `atomic.selector.identity`，不使用包含具体 atomic class 的
  `atomic.selector.css`。
- 不再读取 `context.pseudo`，也不保留旧 manifest 或缺失 boolean 的兼容分支。

## 验收标准

### 1. 继承 Phase 3 基线

Phase 4 不得破坏现有 Phase 3 验收：

```bash
pnpm verify:phase3
pnpm verify:phase3:visual
```

要求：

- static build 验收继续通过。
- semantic/native computed style 对照继续通过。
- acceptance fixture 继续作为自动验收基准。

### 2. 新增 Phase 4 静态验收

已新增：

```bash
pnpm verify:phase4
pnpm verify:phase4:full
```

覆盖：

- Route A build 输出仍包含 `semantic-atomic.css`。
- tokens 仍包含 semantic scoped class + atomic classes。
- Route A 第一批判定可继承的 `composes`、`:import(...)`、`:export`、`@value` 通过临时 fixture 验收。
- `modules.namedExports: true` 会显式失败。
- `diagnostics.strict: true` 会显式失败。
- Vite `css.modules: false` 未显式配置 GSS `modules` 时会失败；显式配置 GSS `modules` 时可重新启用
  Route A preprocess 路径。
- Vite `css.modules.namedExports: true` 未显式配置 GSS `modules` 时会失败；显式配置 GSS `modules` 时
  由 GSS modules 配置覆盖，不继承 named exports。
- 普通 CSS asset 保持 Vite 原生输出；Route A 接管的 CSS Modules scoped CSS 不重复注入到 Vite 原生
  CSS asset。
- 显式开启 report 后，build JSON report 包含 analyzer analysis 数据。
- analyzer analysis 包含同一 semantic class 内可证明的 declaration conflict 摘要与详情，
  detail 可追踪 selector identity，且不误报不同 identity、media、supports、important
  或 semantic class 的声明。
- 默认仍不输出 manifest/report。
- `pnpm verify:phase4` 是静态验收；`pnpm verify:phase4:full` 额外包含 visual computed style 对照。

### 3. Route A 专项验收

如果 Route A migration 成功：

- semantic/native tokens 差异只允许追加 atomic classes。
- Vite `localsConvention` / `generateScopedName` 结果以 Vite 原生 CSS Modules 为准。
- 不重复注入原 CSS Modules CSS 和 GSS CSS。
- preserved fallback 仍能命中 scoped class。
- dev / build 路径差异必须被测试或文档明确覆盖。

如果 Route A 被阻塞：

- 验收产物是 spike 结论文档。
- spike 结论必须记录阻塞点、备选路线、兼容风险和后续决策入口。

## Phase 4 收尾结论

2026-07-14，Phase 4 已达到“真实项目可试用”成功标准：Route A 不支持的边界能够明确失败或
保守 fallback，analyzer 能解释收益、风险、体积和 class 内 declaration 冲突，精简 fixture 的
静态与 visual 验收全部通过，中型 Pilot 的 semantic/native dev 与 build preview 完成四维对照。

本结论表示可进入真实项目扩大试用，不表示已进入公开生产发布。named exports、strict mode、
预处理器、CSS-only HMR、完整 source map 和跨 class / 复杂媒体表达式的完整 cascade 建模仍保持为
后续范围。
