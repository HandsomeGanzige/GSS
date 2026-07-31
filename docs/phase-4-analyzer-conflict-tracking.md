# Phase 4 Analyzer Declaration Conflict 推进记录

## 当前状态

- 状态：已完成
- 开始日期：2026-07-14
- 完成日期：2026-07-14
- 目标：把中型 Pilot 暴露的同属性 cascade 风险转化为 analyzer 中的结构化提示，
  不改写 CSS，不改变 core 编译语义。
- 2026-07-22 迁移：冲突 selector 维度已从 `context.pseudo` 切换为必填
  `selectorIdentity`，不保留旧读取路径。
- 2026-07-25 consumer contract：`attribute-cascade-order` 通过既有通用 unsafe reason
  分布、high-risk module 与 health 路径消费，不增加 reason whitelist 或专用 health 状态。

## 目标

- 识别同一 semantic class 内，在同一 selector identity / media / supports 上下文和同一
  `!important` 层级中的不同值同属性竞争。
- 以保守属性关系表识别明确的 shorthand / longhand 竞争，第一批覆盖
  `margin`、`padding`、`border`、`background`、`font`、`outline`、`inset`、`gap`。
- 在 Vite JSON report 的 `analysis.risk` 中输出稳定的冲突摘要和详情。
- 确定冲突存在时将 health 降为 `risky`，但不作为 `blocked` 或构建失败条件。

## 非目标

- 不从 JSX / TSX 推断两个独立 class token 是否同时出现在同一 DOM 元素上。
- 不将同模块多个 class 使用同一属性视为确定冲突。Pilot 中该策略会产生
  164 组高噪声候选。
- 不自动删除 atomic class，不调整 atomic 顺序，不展开所有 CSS shorthand。
- 不引入 React、Vite 或文件读取依赖到 `@semantic-atomic-css/analyzer`。

## 判定边界

确定冲突需要同时满足：

1. atomic declarations 属于同一 manifest class entry。
2. `selector.identity`、media、supports 上下文完全相同。
3. `important` 层级相同。
4. declaration 值不同。
5. 属性相同，或命中 analyzer 明确维护的 shorthand / longhand 关系。

该结果只说明 atomic 全局复用可能改变源 declaration 顺序，不猜测开发者的
最终视觉意图。

## 实施 Checklist

- [x] 用中型 Pilot manifest 校准跨 class 候选噪声。
- [x] 定义 conflict summary 与 detail 类型。
- [x] 实现同属性和保守 shorthand / longhand 检测。
- [x] 补充 analyzer 单元测试。
- [x] 接入 health 风险原因。
- [x] 验证 Vite report 输出与连续构建稳定性。
- [x] 通过 `pnpm verify:phase4:full`。

## 验收结果

- `@semantic-atomic-css/analyzer` 已在 `analysis.risk` 输出
  `declarationConflictSummary` 和 `declarationConflicts`。
- 冲突详情包含文件、scoped semantic class、冲突类型、cascade 上下文、
  selector identity、important 层级、属性和按 token 顺序排列的 atomic declarations。
- analyzer 当前为 9 项测试，覆盖同属性、shorthand / longhand、同 identity 不同
  class-specific selector CSS 仍分组，`attribute-selector` 与 `attribute-cascade-order`
  的通用聚合，以及不同 identity、media、supports、`!important` 和 semantic class 不误报的边界。
- 不同 attribute selector identity 的零 conflict 只证明 Analyzer 按 exact identity 隔离分组；
  Analyzer 不判断 attribute conditions 是否互斥，也不复制 Core 的 overlap guard。
- Vite adapter 当前为 24 项测试，新增 Route A 真实 build report 正向用例。
- 2026-07-14 已通过 `pnpm verify:phase4`、`pnpm verify:phase3:visual`以及 Pilot
  semantic/native build。首次在 sandbox 内的 visual 启动因不允许监听 `127.0.0.1`
  返回 `EPERM`，提升权限后同一 computed-style 验收通过。
- Pilot 当前确定冲突为 `1`，类型为 `SettingsRoute.module.css` 中 `fieldFrame` 的
  `border -> border-left-color` shorthand / longhand 顺序依赖。
- Pilot health 仍为 `risky`，原因包含预期 unsafe fallback 和上述 declaration 顺序依赖。
- 连续两次 Pilot semantic build 的 SHA-256 完全一致：atomic CSS 为
  `d9b50437dba36946e8fcb13081ba3ba5f61bb05fe5c8a4be5364ee1cc0eec0d0`，report 为
  `3592c989c70ef5b6ee4c33714ce2a5a5707908f12eb4818c7ae4d5111389a0cb`，manifest 为
  `1f6eafbe81b492c7bf9740a11b380773d556a367db6f9c8952c26b371308d48c`。

## 偏差与异常

- Pilot manifest 中同一 semantic class 的同属性重复为 `0`；纳入保守 shorthand 关系后，
  `SettingsRoute.module.css` 的 `fieldFrame` 准确命中 1 组 `border -> border-left-color`
  顺序依赖。
- 若仅按“同一 CSS Module 的多个 class 具有同属性不同值”统计，会产生 164 组
  候选，其中包含大量正常的布局、排版和互斥状态 class，因此不纳入第一版报告。
- Core 当前契约保证 `important` 必填 boolean；analyzer 直接消费该值，不再做
  `undefined` 或缺失字段的兼容归一化。

## 最终结论

当前 declaration conflict 提示只消费 core manifest，不读文件且不依赖
Vite。当同一 semantic class 的 declaration 顺序可能被全局 atomic 复用影响时，报告会
输出必填 selector identity 和确定的 `risky` 信号，但不替开发者改写 CSS。跨 semantic class 冲突仍需要来自 JSX / TSX
或其他 usage graph 的共现证据，本阶段继续保持为显式边界。
