# Phase 8 能力强化待办

## 文档状态

- Status: backlog
- 建立日期：2026-07-19
- 最近更新：2026-07-29
- 当前阶段：`SEL-01` / `SEL-02` / `SEL-03` 已完成；`FOUND-04` 已 `closed-no-go`，
  `SEL-04` / `SEL-05` / `SEL-06` deferred
- 实施方式：一次只选择一个小批次，单独设计、实现、验证和收口

本文档记录 Phase 7 之后的能力强化候选项、依赖关系、决策门禁和建议顺序。
它是待办池，不是一次性实施计划，也不代表列出的所有能力已承诺进入产品主线。
每次只有在项目 owner 确认下一个批次后，才进入对应的设计与实施。

## 阶段定位

Phase 8 定位为：

```txt
编译器正确性强化
+ 可证明的能力覆盖扩展
+ 更稳定的治理与验收闭环
```

核心问题不是“如何提高 atomization rate”，而是：

```txt
哪些当前 fallback 的语义可以被结构化证明为等价转换，
并且能在 Vite/Rsbuild native 对照中稳定验收？
```

安全边界不变：

- 仍以 CSS Modules only 为产品主路径。
- 仍保留 semantic scoped class。
- 无法证明等价时仍保留 fallback CSS 并输出可追踪 diagnostic/report。
- 不用正则替代 PostCSS 和 `postcss-selector-parser` 的结构化分析。
- 不因转换率目标放宽 cascade、atomic key、class mapping 或构建工具继承边界。

## 当前基线

Phase 7 已于 2026-07-19 完成，后续能力强化可复用：

- 五个产品包与两套真实 CSS Modules fixture 的静态门禁。
- semantic/native dev 与 preview computed style 对照。
- 支持 viewport、hover、focus、click 和 pseudo element 的 verifier。
- 结构化 unsafe reason、preserved ratio、declaration conflict 与体积报告。

Vite 中型 Pilot 在 `FOUND-02-D` 时记录的 23 条 unsafe warning 曾作为第一份优先级证据：

| primary reason | 数量 | 当前判断 |
| --- | ---: | --- |
| `attribute-selector` | 9 | 高价值的单 local anchor 候选 |
| `pseudo-element` | 3 | 高价值的单 local anchor 候选 |
| `compound-class-selector` | 3 | 需要多 class mapping/cascade 设计 |
| `descendant-selector` | 6 | 需要结构 guard、复用收益与 cascade 证据 |
| `child-selector` | 1 | 与 descendant 属于同一结构化问题 |
| `non-exported-class` | 1 | 没有可证明的 DOM class 注入点，继续 fallback |

该分布来自特意覆盖 fallback 的 Pilot，不代表生产项目的普遍分布。
每次选择新能力前，应使用当前 fixture、Pilot 和可用的真实项目 report 重新计算收益。

## 状态与推进规则

| 状态 | 含义 |
| --- | --- |
| `candidate` | 已记录，尚未批准实施 |
| `design-required` | 需先解决语义、schema/API 或 adapter 边界 |
| `ready` | 边界与验收已确认，可进入实施 |
| `in-progress` | 当前唯一正在实施的小批次 |
| `completed` | 实现、测试、文档和验收已收口 |
| `blocked` | 当前无法安全推进 |
| `deferred` | owner 已明确延期；在约定的长期时点前不重复提请 |
| `rejected` | 收益、复杂度或产品边界不匹配 |

推进规则：

1. 任何时候最多只有一个 `in-progress` 能力批次。
2. `candidate` 不能直接进入代码修改；必须先确认产品收益、语义证明和验收矩阵。
3. 改变 safe selector/at-rule、atomic key、class name、manifest/report schema、cascade 或公共 API 时，
   先由项目 owner 确认设计边界。
4. 每个能力同时覆盖成功路径和保守失败/fallback 路径。
5. 完成当前批次后，先重新评估 report 收益和回归风险，再决定下一项。
6. 若验证暴露 silent miscompile，当前能力恢复 fallback，不降低断言或缩小对照面。

## 近期建议队列

近期队列只表示建议顺序，不表示批量授权。

| 顺序 | ID | 能力 | 状态 | 选择下一批时的门禁 |
| ---: | --- | --- | --- | --- |
| 0 | `FOUND-01A` | selector rewrite plan 设计 | `completed` | 深模块 seam、interface、不变量与拆分已收口 |
| 1 | `FOUND-01B` | 行为中性的单 local anchor 改写引擎 | `completed` | 单一内部 plan、迁移与验证已收口 |
| 2 | `FOUND-02` | selector-aware atomic identity/renderer 与 cascade 证据 | `completed` | 0/A/B/C/D 与最终证据已收口 |
| 3 | `SEL-02` | 单 local anchor attribute selector | `completed` | scope、实现、adapter 验收与同语料 Pilot 复盘已收口 |
| 4 | `SEL-01` | 单 local anchor pseudo element | `completed` | grammar、reason、双 adapter visual 与 Pilot 收益均已收口 |
| 5 | `SEL-03` | 全分支可证明安全的 selector list | `completed` | 全 arm planner、连接图 preflight、双 adapter/Pilot 已收口 |
| 6 | `SEL-04` | 更广的单 anchor selector template | `deferred` | 新真实 corpus 证明具体子集需求后重评 |
| 7 | `FOUND-04` | 多 local anchor/semantic guard 模型 | `closed-no-go` | 四项双 Pilot 门禁均未通过，prototype 已回滚 |
| 8 | `GOV-01` | candidate/shadow analysis 与收益报告 | `internal-study-completed; product-deferred` | one-shot 内部研究已完成，不产品化 schema/consumer |
| 9 | `FOUND-05` | 跨 class/module atomic/fallback occurrence 顺序 | `deferred` | 只在最终 correctness 优化时重新设计 |

demand-first [收益复盘](selector-capability-benefit-review.md) 当时只选择 `SEL-02` 作为下一份
方案准备对象；该能力后来经 owner 单独确认并完成。`SEL-01` 随后也经 owner 单独确认，
当前已完成独立 Test/Review 与修复复验。

显式依赖链：

```txt
FOUND-01A  selector rewrite plan 设计
    ↓
FOUND-01B  行为中性的单 local anchor 改写引擎
    ↓
FOUND-02   selector-aware atomic identity/renderer + cascade 证据
    ↓
SEL-01 / SEL-02 / SEL-03 completed；SEL-04 deferred
    ↓
FOUND-04   closed-no-go；未形成 production foundation
    ↓
SEL-05 / SEL-06 deferred；SEL-07 不提前实施
```

底层改写引擎能够解析某种 selector，不等于产品 policy 已经批准转换它。
基础批次默认保持当前 safe/unsafe 分类与产物完全不变；具体能力仍通过后续 `SEL-*`
批次单独开放。

## 正确性基础待办

### FOUND-01A：selector rewrite plan 设计

- Status: `completed`
- 设计：[Phase 8 Selector Rewrite 基础设计](phase-8-selector-rewrite-foundation-design.md)
- 设计一个 in-process 深模块，在 selector seam 内封装 AST 解析、local anchor 识别、
  template/identity 规范化、atomic selector render 和 fallback evidence。
- 该模块对调用方和测试只提供一个小 interface；`postcss-selector-parser` node、占位符细节和
  AST clone/mutation 不泄漏到 engine、registry、renderer 或 adapter。
- 建议概念形状，最终类型在设计批次中确认：

  ```ts
  type SelectorRewritePlan = {
    anchorClassName: string
    identity: string
    renderAtomicSelector(className: string): string
  }
  ```

- 必须区分“引擎可以构造 rewrite plan”与“当前 product policy 允许 atomize”，
  避免底层 parser 能力自动扩大产品语义。
- 必须证明 atomic class 只替换一个可导出 local anchor，其余 selector AST、specificity
  和条件不变。
- 必须决定 selector identity/template 的规范化、错误模型、稳定性要求与测试界面。
- 该批次只交付设计决策与可执行拆分，不修改 compiler 行为。

### FOUND-01B：行为中性的单 local anchor 改写引擎

- Status: `completed`
- 依赖：`FOUND-01A` 的设计已确认。
- 用新深模块替换现有分散的 selector analysis/render 决策，不让新旧两套分析路径长期并存。
- 第一批只建立“唯一可导出 local anchor”的底层改写能力；多 local anchor 仍由后续
  `FOUND-04` 处理。
- 引擎可以对 selector 产生 template/identity，但 capability policy 仍只允许现有 `.class`
  和已支持单 pseudo class 进入 atomize。
- selector 可完整解析但无 anchor、anchor 不可导出、多 anchor 或 policy 未开放时，保留当前
  unsafe reason、class evidence、scoped fallback 和 diagnostic。selector evidence 无法完整解析时，
  engine 在 registry mutation 前 fail fast，不伪造可成功返回的 fallback result。
- 完成结果：core 内部已建立 `planSelectorRewrite(selector)` 单入口，engine 与 block scoping
  已迁移，旧分析/收集/scoping 三入口已删除。
- 保持结果：当前 capability policy、unsafe reason、atomic class name/key、CSS、class mapping、
  manifest/report 与公共 schema 未改变；未开放任何新 selector。
- 验证结果：core verify 36 项测试通过，根 `pnpm verify` 通过，Vite/Rsbuild fixture 静态验收通过。

### FOUND-02：selector-aware atomic identity/renderer 与 cascade 证据

- Status: `completed`
- 依赖：`FOUND-01B` 完成。
- 方案：[Phase 8 Selector-aware Identity / Renderer 与 Cascade 方案](phase-8-selector-aware-identity-cascade-design.md)
- `FOUND-02-0` 执行方案：[Phase 8 Cascade Correctness Foundation 方案](phase-8-cascade-correctness-foundation-plan.md)
- 早期 probe 已证明 atomic-first/preserved-second 存在同 source class cascade 反转；
  已完成的 `FOUND-02-0` correctness 前置修复说明本工作不能只迁移 schema。
- 让 atomic identity 和 renderer 消费 selector rewrite plan 的稳定 identity/render 结果，不在 registry
  或 output 模块内重新解析 selector。
- 已确认使用必填 descriptor，把 `pseudo` 移出 `CssTransformContext`、把 `AtomicKeyInput` 收回 core internal；
  current selector 采用 clean replacement，不保留旧 codec 或 key/class 兼容。
- 已确认删除 `preserveResolvedClass`，始终保留 semantic scoped class。
- `FOUND-02-0` 已完成：registry mutation 前 class evidence preflight、affected class-wide
  preservation、semantic class invariant、selector evidence fail-fast 与 Vite/Rsbuild visual 对照均已收口。
- `FOUND-02-A` 已于 2026-07-22 完成基线与 consumer 盘点；当时的 versioned 提案
  已被 owner 后续确认的无版本、无兼容、Core-first 方案取代。
- `FOUND-02-B1` 已完成：Core descriptor clean replacement、无版本 identity/key/class、registry/renderer、
  manifest 和 semantic contract tests 已收口；Core verify 65 tests 通过。
- `FOUND-02-B2` 已完成：Analyzer 按 selector identity/media/supports/important 分组，
  conflict detail 必填 identity，不使用 descriptor CSS 分组；Analyzer verify 7 tests 通过。
- `FOUND-02-B3` 已完成：Devtools 两种 report 删除 `schemaVersion`，nested identity 透传，
  overlay 对展示必需字段严格校验；Devtools verify 17 tests 通过。
- `FOUND-02-B4` 已完成：Vite dev/build 只消费 descriptor CSS，manifest/report/dev envelope 与 HMR
  已迁移当前契约；Vite verify 37 tests 通过。
- `FOUND-02-B5` 已完成：Rsbuild renderer、browser `{ sources }` snapshot、manifest/report/dev envelope
  与 HMR 已迁移当前契约；Rsbuild verify 18 tests 通过。
- `FOUND-02-B6` 已完成：
  - static consumer：两套 fixture static 与 Rsbuild Playground inspector 只读当前 manifest
    selector descriptor 和 build report，exact selector rule、真实 JS suggested token mutation
    与 source-order parity 门禁通过；
  - visual consumer：两套 fixture visual 只读当前无版本
    `adapter/status/environments` dev envelope，并在 B6c 验证 overlay、HMR update/remove 与
    stale selector 清理；
  - static gate：五包 18 个 test files、144 项测试及全部 typecheck/build 通过，根 `pnpm verify`
    和两套 fixture static 通过；
  - visual：Vite 20 runs/100 cases/356 comparisons、Rsbuild 8 runs/80 cases/180 comparisons，
    两者均为 0 differences、`passed=true`。
- `FOUND-02-C1` 已完成：Core 新增 9 项专用 cascade oracle；最终 Core verify 为
  8 files/74 tests。
- `FOUND-02-C2` 已完成：Vite 增加 6 个 mixed case 与 2 个 existing same-value reuse case；
  canonical full visual 为 20 runs/132 cases/420 comparisons/0 differences，`passed=true`。
- `FOUND-02-C3` 已完成：Rsbuild 增加 6 个 mixed case 与 1 个 existing late-reuse case；
  canonical full visual 为 8 runs/108 cases/220 comparisons/0 differences，`passed=true`。
- `FOUND-02-C4` 已完成：根 `pnpm verify` 通过，Core 74、Analyzer 7、Devtools 17、
  Vite 37、Rsbuild 18 tests，共 19 files/153 tests，全部 typecheck/build 与两套 fixture
  static 通过；canonical reports 为
  `/private/tmp/gss-vite-cascade-oracle-closeout.json` 和
  `/private/tmp/gss-rsbuild-cascade-oracle-closeout.json`。
- `FOUND-02-C` 的绿色证据覆盖当前支持范围中的 importance、specificity、重复声明、
  shorthand/longhand、条件重叠、evidence preflight、稳定输出，以及真实 adapter 下的
  fixed winner、native token preservation 和精确 CSSOM atomic rule 绑定。
- `FOUND-02-D` 已完成：
  - [Selector 能力收益复盘](selector-capability-benefit-review.md) 已区分直接指标、派生指标、
    历史值、代理与未知因果收益；
  - Vite/Rsbuild Pilot 的 attribute exact-only class 为 `5 / 6`，对应 pseudo 代理均为 `1`；
    Vite 历史 exact-only atomic token links 为 attribute/pseudo `46 / 9`；
  - 跨 adapter authored rules 去重后为 attribute/pseudo `11 / 3`，attribute 分类稳定；
    Rsbuild pseudo 则规范化为 `:before` / `unsupported-pseudo`；
  - 六种 current selector contract 8 项测试通过，clean replacement diff 已固定；
  - demand-first 只选择 `SEL-02` 作为下一份待确认的设计方案对象，不授权实现。
- `FOUND-02-0/A/B/C/D` 已收口，`FOUND-02` 总体状态改为 `completed`。
- 不推测 DOM class 共现。不同 source class/module 在同一元素形成 atomic/fallback 等优先级
  顺序竞争，当前视为不受支持的 authoring pattern，记录到 `FOUND-05`；该边界没有阻塞后来
  分别完成的 C/D，也不阻塞后续单项 selector 评估，并且不在每个批次重复提请。
- C 完成时没有自动授权 D；D 后来经过单独 owner 确认才执行并已完成。C/D 完成都不开放
  pseudo element、attribute 或其他当前 unsafe selector，也不授权任何 `SEL-*`。
- D 的 exact-only class、历史 token links 与 authored rule count 只承担需求排序作用；`SEL-02`
  实施后的实际收益以后续同语料 Pilot artifact 差值为准，见
  [Selector 能力收益复盘](selector-capability-benefit-review.md)。

### FOUND-03：真实 unsafe corpus 与差分验证

- Status: `candidate`
- 把 fixture/Pilot 中的代表性 unsafe selector 整理为稳定、可审查的输入集。
- 记录 primary reason 与 details，避免只根据 primary reason 误判复杂度。
- 实施前生成 baseline report；实施后对比 unsafe/preserved/reuse/size 变化。
- 涉及浏览器语义时，将对应 case 加入 Vite 和 Rsbuild visual fixture，不只依赖字符串断言。

### FOUND-04：多 local anchor 与 semantic guard 模型

- Status: `closed-no-go`
- 评估：[Phase 8 多 Local Selector Foundation 评估](phase-8-multi-local-selector-foundation-evaluation.md)。
- one-shot shadow 分别评估 `compound`、`two-local-descendant`、`child` 与
  `single-local-descendant-tag`；门禁要求 Vite/Rsbuild 各至少 2 个 exact-only class，且
  estimated total diff 不恶化。
- compound 为 `1/+40 B`、`1/+16 B`；descendant 为 `6/+1176 B`、`6/+1170 B`；
  child 两端都是 `2/+173 B`；descendant-tag 两端 exact-only 都是 `0`。四项均 no-go。
- 6 个只属于本次研究的 Core shadow prototype/test/script 已删除；不接入正式 transformer，
  不新增公开 API/schema/diagnostic，不授权 `SEL-05` / `SEL-06` production rewrite。
- 独立 Test 与 Review 均已 PASS；Vite full visual 为 `64/228/676/0`，Rsbuild 为
  `8/204/464/0`，均 `passed=true`。adapter pre-image/hash 可独立复核；任务前正式 Core 完整
  checksum/pre-image 未持久化，故 Core byte-identical 独立比较为 `not_run`，只依赖开发阶段比对结论、
  当前无 shadow/正式入口未接入与全门禁。以后只有新真实 corpus 才能触发重评。

### FOUND-05：跨 class/module atomic/fallback occurrence 顺序

- Status: `deferred`
- Owner decision（2026-07-25）：不同 source class 或 module 的 class 在同一元素共现，且
  atomic/fallback 同属性、等 importance、等 specificity 竞争依赖原始顺序时，当前视为不受支持的写法。
- 当前不实现 usage metadata、import-order evidence、per-occurrence renderer、module-wide 或
  build-wide fallback。
- 该边界未阻塞已完成的 `FOUND-02-C/D`，也不阻塞后续单项 selector 实验；相关能力只需明确
  不承诺此模式。
- 只在项目进入最终 correctness 优化、或 owner 主动重启该事项时准备方案；此前不重复请求确认。

## Selector 能力待办

### SEL-01：单 local anchor pseudo element

- Status: `completed`。
- 设计：[Phase 8 Pseudo Element 设计](phase-8-pseudo-element-design.md)。
- 验收：[Phase 8 Pseudo Element 验收](phase-8-pseudo-element-acceptance.md)。
- 已支持单 local anchor 的 `.class::before`、`.class::after`、`.class:before` 和
  `.class:after`；identity 与 renderer 保留 Core 实际收到的 spelling，same-box cascade guard
  只在内部将 legacy/modern alias 归一为 `before` / `after`。
- pseudo element selector list 继续 whole-rule `selector-list` fallback；其他 pseudo element、
  多 pseudo、多 local class、tag/id/combinator、非 terminal 结构和与其他结构混用均未放宽。
- cascade guard 在 registry mutation 前阻止同 generated box 的等 specificity 重排风险，
  `before` 与 `after` 互不竞争；blocked pseudo candidate 使用既有 `pseudo-element`，attribute candidate
  继续使用 `attribute-cascade-order`，未新增公开 schema。
- 两个 Pilot 仅 `selectorValue` 获得新增 mapping：atomic definitions/reuse 均为
  `+4 / +7`，3 个旧 pseudo-element blocker 清零；files/sourceClasses/before CSS 与 frozen
  baseline 一致，native artifacts 逐文件一致。
- package、fixture static 与根 `pnpm verify` 已通过；独立 Test 使用
  `getComputedStyle(element, pseudo)` 验证 content、color、display、尺寸和 margin，并完成
  Vite/Rsbuild full visual；focused rereview 也已通过。

### SEL-02：单 local anchor attribute selector

- Status: `completed`
- 设计：[Phase 8 Attribute Selector 设计](phase-8-attribute-selector-design.md)。
- 验收：[Phase 8 Attribute Selector 验收](phase-8-attribute-selector-acceptance.md)。
- 已支持单 local anchor 同 compound 内的 presence 与 exact equality，包括 attribute-before-class；
  quoted、unquoted、escape、spacing 与 node order 由 selector AST 原样进入 identity/renderer。
- namespace、`i`/`s` flag、其他 operator、多个 attribute、`[class...]`、pseudo/tag/id/combinator、
  compound local class 等未批准结构继续 preserved，并保留可追踪 reason/report。
- same-class、等 specificity 且可能共现的 attribute/pseudo declaration 竞争由
  `attribute-cascade-order` 在 registry mutation 前整类 fallback；不会为了转换率猜测运行时共现。
- Vite/Rsbuild adapter 均复用 Core descriptor 与 guard；对应 package/static/full visual 验收已收口。
- 两个 Pilot 的同语料前后 artifact 都实际释放 5 个 class、52 个 declaration occurrences，
  即 15 个 atomic definitions 与 37 个 reused occurrences；preserved declarations 均减少 52。
  Vite/Rsbuild preserved ratio 分别为 `0.4101 → 0.3264`、`0.5158 → 0.4569`，
  estimated total diff 分别改善 `631 / 622` bytes。
- Vite 的 9 个旧 `attribute-selector` blocker 清零；Rsbuild 11 个中 9 个释放，剩余同 class
  两个 occurrence 继续 fallback。current report 只对真正触发 guard 的 risk arm 输出 1 条
  `attribute-cascade-order`，另一条是 class-wide follower，不伪造第二条 public diagnostic。
  上述收益来自同语料 report/manifest 差值，不使用 exact-only class 或历史 token links 代理替代。

### SEL-03：全分支可证明安全的 selector list

- Status: `completed`
- 设计：[Phase 8 SEL-03 Selector List 设计](phase-8-selector-list-design.md)。
- 验收：[Phase 8 SEL-03 Selector List 验收](phase-8-selector-list-acceptance.md)。
- 已支持由现有 base、5 个 pseudo class 和 SEL-02 presence/exact attribute 组成的全
  eligible list；任一 arm unsafe 仍完整 fallback，不做混合拆分。
- planner 统一产生有序 `arms[]`；每个 arm 独立 identity/renderer/registry occurrence，逗号不
  进入 descriptor。declaration 顺序优先、arm 顺序次之，同 identity 复用 token。
- registry mutation 前的当前 input 连接图传播 unsafe/nested/block、配置保留、non-exported
  和 SEL-02 cascade risk；传播不伪造 public reason。
- Vite baseline `3` 条 list 全部释放，`4/4` 目标 class 获得 mapping；Rsbuild `10`
  条全部释放，`15/15` 目标 class 获得 mapping。两端 files/sourceClasses/before CSS
  与 baseline 完全相同，semantic token 保留。
- 未引入公开 API/schema、组合 descriptor、adapter grammar、跨 input 回滚、跨 class 共现推断或
  semantic class 移除。

### SEL-04：更广的单 anchor selector template

- Status: `deferred`
- 依赖：`FOUND-02` 与已开放的单 anchor 能力验证结果。
- 候选子集：tag + local class、id + local class、更多单一 pseudo class、只包含一个可导出
  local anchor 的结构 selector。
- 每个子集必须分开批准，不引入“任意可解析 selector 都安全”的默认。
- 支持与否取决于等价证明、实际 fallback 分布和复用收益，不只看 parser 是否能处理。
- FOUND-04 的 descendant-tag policy 在两个 Pilot 都没有 exact-only 收益；其他子集仍缺新的真实需求证据，
  因此本轮不继续准备设计或实现。

### SEL-05：compound local classes

- Status: `deferred`
- 依赖：未来重新通过多 local foundation 门禁；本次 `FOUND-04` 为 `closed-no-go`。
- 代表输入：`.button.primary`。
- 必须决定唯一 atomic anchor、其余 semantic guard、多 token 注入、`composes` 闭包与
  non-exported class 保守路径。
- 必须证明不会把“两个 class 共现”降级为“任一 class 存在”。
- 如果保留 guard 后没有实质复用收益，应继续 fallback。
- 本次双 Pilot 各只有 1 个 exact-only class，estimated total diff 分别恶化 `40 / 16` bytes，
  不授权 production rewrite。

### SEL-06：descendant/child combinator

- Status: `deferred`
- 依赖：未来重新通过多 local foundation 门禁；本次 `FOUND-04` 为 `closed-no-go`。
- 代表输入：`.card .button` 和 `.list > .item`。
- 需要同时处理多 local anchor、结构 guard、scoped render、source order 和复用 identity。
- analyzer 不能在没有 usage evidence 时猜测 DOM class 共现。
- 实施前必须用真实 corpus 证明保留 guard 后仍有足够去重/体积收益。
- 本次 descendant 虽在两端各有 6 个 exact-only，但 estimated total diff 恶化
  `1176 / 1170` bytes；child 两端各有 2 个 exact-only，但都恶化 `173` bytes，均不授权正式改写。

### SEL-07：adjacent/sibling combinator

- Status: `candidate`
- 代表输入：`.item + .item` 和 `.trigger ~ .panel`。
- 依赖 `SEL-06` 的多 anchor/guard/cascade 设计，不单独提前实施。

### SEL-08：`:global` 与 local anchor 混合 selector

- Status: `candidate`
- 仅评估同时包含可导出 local anchor 的结构，例如 `:global(.theme) .button`。
- 只包含 global class 或无 local anchor 的 rule 继续 fallback，因为没有可证明的 atomic class 注入点。
- global node 不得进入 local resolver，现有 preserved scoping 行为必须回归。

### SEL-09：functional pseudo 与复杂 specificity

- Status: `candidate`
- 候选：`:not()`、`:is()`、`:where()`、`:has()`、`:nth-child(... of ...)` 等。
- 每一类需单独证明内部 selector scoping、specificity 与 relative selector 行为。
- 不采用“原字符串拼回即视为安全”的快捷路径。

## CSS 上下文与语法待办

### CSS-01：`@container`

- Status: `candidate`
- 需扩展 context/atomic key/renderer/manifest/report，并验证嵌套 `@media`/`@supports` 顺序。
- 必须通过真实浏览器 container 尺寸变化对照，不只断言 CSS 文本。

### CSS-02：原生 CSS nesting

- Status: `candidate`
- 当前 nested rule 整块 fallback 是正确性保护。
- 需区分构建工具已展开的 nesting 与 core 真正接收的标准 nested CSS。
- 必须先设计 nested selector 展开与 source location 映射，不对 preserved block 做字符串替换。

### CSS-03：`@layer` / `@scope`

- Status: `design-required`
- 它们直接改变 cascade 建模，不与普通条件 at-rule 合并处理。
- Phase 4 已证明 cascade layer 不能作为解决所有 atomic source-order 问题的通用工具。
- 没有完整的 layer/scope 顺序模型与浏览器验收前继续 preserved/fail-fast。

## 治理、分析与调试待办

### GOV-01：candidate/shadow analysis

- Status: `internal-study-completed; product-deferred`
- 在不改写 CSS 时报告某项能力理论上可减少的 fallback、可增加的复用和风险。
- candidate 不得计入已转换或 ready health，必须与当前稳定 report 字段区分。
- 如需改变 report 结构，必须同步迁移 producer、全部 consumers、contract tests 与验收证据；
  不引入版本化或旧 consumer 兼容。
- FOUND-04 已用一次性、隔离的 shadow 完成内部决策；正式 CSS、manifest、report、diagnostic 和 tokens
  均未接入 candidate 数据。研究原型已回滚，不据此新增生产 report/schema/consumer。

### GOV-02：strict 治理策略

- Status: `candidate`
- 候选：按 unsupported feature、unsafe reason、preserved ratio 或已验证 conflict 类型建立 CI 门禁。
- analyzer 只输出数据，是否失败由 adapter/integration layer 决定。
- 默认行为和 warning 升级规则需项目 owner 单独确认。

### GOV-03：完整 CSS source map

- Status: `design-required`
- 复用 Phase 7 已记录的 renderer map + preprocessor/CSS Modules map composition 方案。
- 必须覆盖 CSS/SCSS/Less、dev/build、Vite/Rsbuild、资源替换和跨文件去重。
- 组合 map 闭环完成前，不用 manifest location 或近似行号冒充完整 source map。

### GOV-04：dev report/overlay 强化

- Status: `candidate`
- 候选：按 unsafe reason 展开文件、显示 candidate/shadow 结果、定位高风险 class。
- 不在 UI 中复制 analyzer 风险模型；先扩展稳定 protocol，overlay 只消费和展示。
- 继续验证 Shadow DOM 隔离、请求不重叠和 semantic/native style 零差异。

## Adapter 与构建兼容待办

### ADP-01：CSS Modules named exports

- Status: `candidate`
- 分别对齐 Vite 和 Rsbuild 原生 named exports，不在 core 中实现第三套 CSS Modules 语义。
- 必须证明 default/named exports、locals convention、composes 和 atomic token 增强一致。
- 无法稳定继承的 adapter 继续 fail fast。

### ADP-02：CSS-only HMR

- Status: `candidate`
- 减少 CSS Module 变更时的 full reload，但不牺牲 current cache、dependency removal 和 stale CSS 清理。
- 分别验收 Vite virtual module 与 Rsbuild shared style owner 的真实浏览器生命周期。

### ADP-03：构建工具版本兼容矩阵

- Status: `candidate`
- 先定义锁定版本、支持区间和 fail-fast 策略，再评估 Vite 7 或新版 Rsbuild/Rspack。
- 版本升级涉及依赖变更，必须单独授权，不与 selector 批次混合。

### ADP-04：新 runtime/target 形态

- Status: `candidate`
- 候选：SSR/Node、worker、library mode 或 raw Rspack adapter。
- 它们是产品边界扩展，不属于普通稳健性修复；只有在有明确用户场景和独立方案时进入 `ready`。

## 性能与可复现性待办

### PERF-01：大规模 CSS Modules 基准

- Status: `candidate`
- 建立不进入默认门禁的可重复 benchmark，记录 parse、selector analysis、registry、render、
  manifest/report 和 adapter 聚合成本。
- 先建立 baseline 再优化，不用单次 wall-clock 抖动作为回归结论。

### PERF-02：稳定输出与增量状态压力验证

- Status: `candidate`
- 打乱文件发现、异步 transform 完成和 HMR 更新顺序，验证 class name、CSS、manifest、
  report 与 dev API 一致。
- 不依赖文件遍历或 Promise 完成顺序产生隐式稳定性。

## 单个批次的入口问题

将某个候选项改为 `ready` 前，必须在对应方案或 tracking 中回答：

1. **现状证据**：哪些真实输入当前 fallback/fail fast？频率和体积影响是什么？
2. **等价证明**：class mapping、selector、specificity、cascade、条件上下文和输出如何保持？
3. **保守边界**：哪些相似语法仍不支持？如何 fallback/fail fast？
4. **兼容性**：是否改变 API、atomic key、class name、manifest/report schema 或 adapter 配置？
5. **收益预估**：预计减少多少 unsafe/preserved CSS？是否有实质复用和体积收益？
6. **验收矩阵**：core、analyzer、adapter、static/visual fixture 和 Pilot 中哪些是必须的？
7. **回滚策略**：真实对照发现差异时，如何恢复为 preserved fallback？

## 单个批次的完成标准

1. 产品边界、等价依据和保守失败路径已写入对应设计文档。
2. core 实现与成功/fallback/cascade/稳定输出测试一致。
3. 受影响 adapter 的 tokens、CSS、manifest/report、dev/build/HMR 回归通过。
4. 涉及浏览器语义时，Vite 和 Rsbuild 对应 fixture `test:visual` 都通过。
5. `pnpm verify` 通过，且不把新增耗时 Pilot/benchmark 擅自加入默认门禁。
6. 重新记录 unsafe distribution、preserved ratio、reuse/size 收益和未验证风险。
7. README、core 设计、adapter 文档、tracking/acceptance 对同一行为描述一致。

## 不自动推进的范围

- 普通全局 CSS 自动 atomization。
- 移除 semantic class 或 fallback CSS。
- aggressive atomization 默认模式。
- JSX/TSX 改写或新 usage metadata 系统。
- 在缺少 usage evidence 时推测 DOM class 共现。
- 新构建工具、新 runtime target、公共 API 破坏性修改或新增生产依赖。

## 当前实施边界

`FOUND-02-0/A/B/C/D`、`FOUND-02`、`SEL-02` 与 `SEL-03` 已完成，没有引入 version/compatibility 机制，
也没有保留旧 browser snapshot、selector 拼接或旧 report consumer。
绿色 oracle 与 SEL-02/SEL-03 验收只覆盖当前支持范围和已列代表场景，不证明任意 DOM class/module 共现；
`FOUND-05` 所述跨 class/module、等 importance、等 specificity 且依赖原始顺序的竞争仍为
`deferred` 未覆盖边界。
`SEL-01` 已单独授权并完成实现、独立 Test/Review 与修复复验。`FOUND-04` 已按四项双 Pilot
门禁收口为 `closed-no-go`，可执行 shadow prototype 已回滚；`SEL-04` / `SEL-05` / `SEL-06`
均为 `deferred`，本结论不授权任何 production rewrite。GOV-01 只完成内部 one-shot 研究，产品化
report/schema/consumer 继续 deferred；`FOUND-05` 在最终 correctness 优化前不重复提请。
