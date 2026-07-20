# Phase 8 能力强化待办

## 文档状态

- Status: backlog
- 建立日期：2026-07-19
- 当前阶段：候选能力收集与优先级排序
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

Vite 中型 Pilot 当前记录的 23 条 unsafe warning 可作为第一份优先级证据：

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
| 0 | `FOUND-01` | selector 等价改写与 cascade 证据基础 | `design-required` | 先确认 IR/atomic key 边界与输出顺序反例 |
| 1 | `SEL-01` | 单 local anchor pseudo element | `candidate` | 仅限可证明模板，不顺带开放任意 pseudo |
| 2 | `SEL-02` | 单 local anchor attribute selector | `candidate` | 属性条件必须原样保留并进入 atomic identity |
| 3 | `SEL-03` | 全分支可证明安全的 selector list | `candidate` | 不做 safe/unsafe 混合分流 |
| 4 | `SEL-04` | 更广的单 anchor selector template | `candidate` | 以真实分布决定子集 |
| 5 | `GOV-01` | candidate/shadow analysis 与收益报告 | `candidate` | 不改写 CSS，先用报告决定后续投入 |

`SEL-01` 与 `SEL-02` 的顺序可根据 `FOUND-01` 的 cascade 反例结果互换；
不应在同一批中同时实现。

## 正确性基础待办

### FOUND-01：selector 等价改写模型

- Status: `design-required`
- 把“白名单 pseudo”扩展为可结构化证明的 selector rewrite plan。
- 建议内部概念为 `anchorClassName` + selector AST/template，而不是把 attribute 或 pseudo element
  继续塞入现有 `pseudo` 字段。
- 必须证明 atomic class 只替换一个可导出 local class anchor，其余 selector AST、specificity
  和条件不变。
- 必须决定 selector template 是否进入 context、atomic key 和 manifest/report，以及如何处理兼容性。
- 解析失败、无 anchor、anchor 不可导出或多 anchor 不在当前批次时继续 fallback。

### FOUND-02：cascade 与输出顺序反例矩阵

- Status: `candidate`
- 证明规则从 preserved CSS 转入 atomic CSS 后，不会因“atomic first、preserved second”改变
  与剩余 fallback rule 的 cascade 结果。
- 最少覆盖同属性、重复声明、shorthand/longhand、不同 specificity、`!important`、
  `@media`/`@supports` 以及同元素同时命中 safe/fallback selector。
- 无法在无 usage evidence 时证明安全，就缩小范围或继续 class/rule 级 fallback，
  不推测 DOM class 共现。

### FOUND-03：真实 unsafe corpus 与差分验证

- Status: `candidate`
- 把 fixture/Pilot 中的代表性 unsafe selector 整理为稳定、可审查的输入集。
- 记录 primary reason 与 details，避免只根据 primary reason 误判复杂度。
- 实施前生成 baseline report；实施后对比 unsafe/preserved/reuse/size 变化。
- 涉及浏览器语义时，将对应 case 加入 Vite 和 Rsbuild visual fixture，不只依赖字符串断言。

## Selector 能力待办

### SEL-01：单 local anchor pseudo element

- Status: `candidate`
- 初始范围候选：`.class::before` 和 `.class::after`。
- 其他 pseudo element 只在有真实需求和验收样例时单独扩展。
- 首批不同时支持多 pseudo 组合、多 local class 或 selector list。
- atomic identity 必须区分 element declaration 与各 pseudo element declaration。
- visual 必须使用 `getComputedStyle(element, pseudo)` 验证 `content`、color 和代表性布局属性。

### SEL-02：单 local anchor attribute selector

- Status: `candidate`
- 初始范围候选：`.class[attr]`、`.class[attr='value']` 等与 local class 处于同一 compound
  selector 的属性条件。
- 属性名、operator、value、引号与 case-sensitivity flag 由 selector AST 结构化保留。
- 首批不处理 attribute + descendant/child/compound local class 混合结构。
- 必须覆盖属性状态变化，以及与基础 `.class`/fallback selector 重叠的 cascade 反例。

### SEL-03：全分支可证明安全的 selector list

- Status: `candidate`
- 只有每个 selector arm 都能独立生成 safe rewrite plan 时才转换。
- 任一 arm 为 unsafe 时整条 rule 继续 fallback；首批不做 safe/unsafe 混合拆分。
- 必须保留 arm 顺序、声明顺序、pseudo/context 差异和稳定 class mapping。
- 实施前先确认真实 report 中的出现频率。

### SEL-04：更广的单 anchor selector template

- Status: `candidate`
- 候选子集：tag + local class、id + local class、更多单一 pseudo class、只包含一个可导出
  local anchor 的结构 selector。
- 每个子集必须分开批准，不引入“任意可解析 selector 都安全”的默认。
- 支持与否取决于等价证明、实际 fallback 分布和复用收益，不只看 parser 是否能处理。

### SEL-05：compound local classes

- Status: `design-required`
- 代表输入：`.button.primary`。
- 必须决定唯一 atomic anchor、其余 semantic guard、多 token 注入、`composes` 闭包与
  non-exported class 保守路径。
- 必须证明不会把“两个 class 共现”降级为“任一 class 存在”。
- 如果保留 guard 后没有实质复用收益，应继续 fallback。

### SEL-06：descendant/child combinator

- Status: `design-required`
- 代表输入：`.card .button` 和 `.list > .item`。
- 需要同时处理多 local anchor、结构 guard、scoped render、source order 和复用 identity。
- analyzer 不能在没有 usage evidence 时猜测 DOM class 共现。
- 实施前必须用真实 corpus 证明保留 guard 后仍有足够去重/体积收益。

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

- Status: `candidate`
- 在不改写 CSS 时报告某项能力理论上可减少的 fallback、可增加的复用和风险。
- candidate 不得计入已转换或 ready health，必须与当前稳定 report 字段区分。
- 如需改变 report schema，先设计版本化和 adapter/devtools 消费兼容。

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

## 下一次决策点

开始任何代码实施前，从近期队列中只选择一项。当前建议的第一个决策是：

```txt
是否先进入 FOUND-01/FOUND-02，
为单 local anchor pseudo element 或 attribute selector 建立 selector rewrite 与 cascade 证据基础？
```

该决策只授权建立第一个小批次方案，不授权后续 selector、at-rule、adapter 或治理能力连续实施。
