# Phase 8 SEL-01 单 local anchor 伪元素设计

## 状态

- Status: completed
- 日期：2026-07-29
- 范围：Core selector policy、generic adapter consumption、fixture/Pilot 验收

## 已确认边界

- 只支持 `.class::before`、`.class::after`、`.class:before`、`.class:after`。
- selector 必须只有一个 local class，并以唯一伪元素结尾；tag、id、combinator、额外 class、attribute、
  pseudo class、多个 pseudo 或其他伪元素继续 fallback。
- identity 与 renderer 保留 Core 实际收到的 AST serializer spelling；因此 `:before` 与 `::before`
  是不同 identity/token。adapter 不 canonicalize，也不从源码猜测被构建工具改写前的 spelling。
- cascade preflight 只把 legacy/modern alias 归一到同一 `before` 或 `after` generated box；两个 box
  互相独立。可能改变 winner 的重复属性、A-B-A、shorthand/longhand 和条件上下文整类 fallback。
- alias cascade guard 复用既有 `pseudo-element` public reason；attribute candidate 继续使用
  `attribute-cascade-order`，不增加公开 reason 或 schema。preflight 额外保存具体 rule/arm 的内部风险证据，
  class-wide 传播本身不生成 diagnostic 或 `unsafeReasons`。
- 任一 selector-list arm 含伪元素时，整条 rule 以 `selector-list` fallback，不做部分 registry mutation。

## 数据流

`planSelectorRewrite` 生成单 arm descriptor 和内部 `pseudo-element` cascade guard；input preflight 在
`registry.register` 前收集同 class occurrence。Vite/Rsbuild 继续只消费 Core descriptor、mapping 与
report，不复制 grammar、alias 或 guard。

Vite 当前向 Core 保留 authored modern/legacy spelling；Rsbuild/Rspack 的真实 compiled CSS 会把
`::before` 序列化为 `:before`，Core 与最终 atomic CSS 应保留该实际输入，不能反向恢复 authored spelling。
浏览器验收读取 `CSSStyleRule.selectorText` 时允许 Chrome 将 legacy `:before` / `:after` canonicalize
为 `::before` / `::after`；该兼容只存在于 CSSOM assertion，fixture static 仍严格检查构建产物和 Core
descriptor 的实际输入 spelling。

## 保守边界

unsupported pseudo element 继续使用 `pseudo-element`；含伪元素 selector list 使用 `selector-list`；
non-exported、adapter preserve、nested 与其他 unsafe evidence 继续走既有 class-wide preservation。
semantic scoped class 永远保留。

## 实施结果

Core planner、registry mutation 前的 input preflight、package consumer、fixture static/HMR/visual 脚本与
双 Pilot 同语料 artifact 均已完成。首轮 Review 的 P2 reason finding 已修复：pseudo alias guard 使用
既有 `pseudo-element`，attribute candidate 继续使用 `attribute-cascade-order`；focused rereview 通过。
首轮 visual 的 Chrome CSSOM legacy canonicalization finding 与随后 Vite stale `expectedSelector` finding
也已分别修复，严格 matcher 的负向 mutation self-test 不接受错误 pseudo box、selector list、token 或
property。Rsbuild/Vite 最终 full visual 均通过；公共 schema、生产 adapter source 和依赖未变化。
