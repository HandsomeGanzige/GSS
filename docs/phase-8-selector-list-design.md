# Phase 8 SEL-03 Selector List 设计

## 状态与目标

- Status: `completed`
- 实施日期：2026-07-28
- 目标：转换所有 arm 都能由现有单-arm grammar 证明安全的 selector list，不放宽任何
  base、pseudo 或 attribute 边界。

SEL-03 首批可用 arm 仅包含 base、`:hover`、`:focus`、`:active`、`:disabled`、
`:focus-visible` 和 SEL-02 presence/exact-equality attribute。semantic scoped class 始终保留；
Vite/Rsbuild 只消费 Core descriptor，不复制 grammar、list planner 或 cascade guard。

## 核心模型

selector 只解析一次，planner 统一产生有序 `arms[]`；单 selector 是长度为 1 的同一
模型。每个 eligible arm 独立携带：

- 唯一 source class anchor；
- source-class-independent selector identity；
- 只替换该 arm anchor 的 atomic renderer；
- base/pseudo/attribute cascade occurrence 证据。

atomic identity 只包含单 arm AST serializer，不包含逗号或分隔空白。arm 内 spelling、
spacing、quote、escape 和 node order 保留；`originalSelector` 仍向 resolver/export callback
传入完整原 rule selector，因此没有公开回调契约变化。

## 全分支门槛

只有所有 arm 都安全、可导出且未被 class-wide evidence 阻断时才转换。任一 arm
失败时：

- 完整 rule 仅 preserved 一次，不做 safe/unsafe arm 混合拆分；
- primary reason 继续为 `selector-list`；
- 内部 details 按 arm 顺序记录并去重具体失败原因；
- preserved renderer 使用完整原 selector list，source/global class evidence 不丢失；
- `unsafeRules`、`preservedRules` 和 `preservedDeclarations` 仍按原 CSS rule/declaration 计数。

custom property 或不支持 declaration 在 eligible list 中也只保留完整 list 一次，
每个原 declaration 最多一个 warning；多 anchor 时不伪造单一 `sourceClassName`。

## Preflight 与 cascade

Core 在首次 registry mutation 前建立当前 input 的 selector-list class 连接图。
unsafe/nested/block evidence、SEL-02 cascade risk、`preserveClassNames` 和 non-exported
evidence 均可作为种子，再按 source order 做固定点传播。因此 `.a,.b` 与 `.b,.c`
中任一 class 被保留时，整个连接分量都进入内部 class-wide preservation。

传播不新增 public unsafe reason 或 diagnostic，也不推测跨 class DOM 共现。每个 eligible arm
作为独立 cascade occurrence 进入现有 attribute guard，顺序为 `rule.order + armIndex`。

## 注册与输出

成功转换按“declaration 顺序优先、arm 顺序次之”注册。同 identity arm 复用同一
atomic token，不同 pseudo/attribute identity 生成独立 token；每个 source class mapping 只追加
该 arm 对应 token，并保持首次出现顺序。

`reusedAtomicDeclarations` 按 registry occurrence 统计，因此额外 arm 是独立 reuse occurrence，
但不是新的 source declaration。收益报告必须分开记录 source rule/declaration 释放量与
registration/token-link 增量。

## 不变边界

- 不修改 `TransformCssInput/Result`、`AtomicSelectorDescriptor`、manifest、report 或
  diagnostic schema。
- 不支持 partial list splitting、组合 descriptor、跨 input/module 连接图、JSX usage evidence、
  跨 class 共现推断或 semantic class 移除。
- 多 local anchor、combinator、tag/id、global、pseudo element 和未支持 pseudo/attribute 继续
  完整 fallback。

## 实现入口

- planner：`packages/core/src/selector/planSelectorRewrite.ts`
- input preflight：`packages/core/src/engine/planInputClassPreservation.ts`
- transform/registry：`packages/core/src/engine/createTransformer.ts`
- Core 主契约：`packages/core/test/selectorList.test.ts`
- 验收：[SEL-03 验收](phase-8-selector-list-acceptance.md)
