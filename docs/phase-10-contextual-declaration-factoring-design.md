# Phase 10 跨 Module 上下文声明聚合设计

## 文档状态

- Work Item：`P5-CDF-STAGE-0`
- 状态：`closed-no-go; product-deferred`
- 产品授权：未授权 production rewrite、公共 API/schema 或 adapter 行为
- 与既有工作关系：独立于 `FOUND-04`；`FOUND-04` 的 `closed-no-go` 不因本实验恢复

## 目标与边界

本实验比较：

- `P0`：保留完整 CSS Modules scoped relation rules；
- `P5`：仅把完整、有序且逐字相同的 declaration block 聚合为 selector list。

```css
/* P0 */
.A_f .A_s { color: red }
.B_f .B_s { color: red }

/* P5 */
.A_f .A_s,
.B_f .B_s { color: red }
```

P5 保留每条被 source CSS 授权的完整 selector arm，不生成父/子 token，不修改 exports，也不把多个父、子集合展开为笛卡尔积。它是 declaration factoring，不是 class atomization。

Stage 0 只识别恰好两个 class 与一个 descendant combinator 构成的 scoped selector arm；只允许 declaration-only rule 与有序的 `@media` / `@supports` path。child、sibling、多层关系、tag、id、attribute、pseudo、`:global`、nested、未知 at-rule 和非 declaration 子节点都不建模，必须成为 barrier。

## Shadow IR 与确定性

Evaluator 维护独立 occurrence 流，不复用 append-only `AtomicRegistry`：

```txt
canonical source id
→ source 内 node order
→ wrapper path
→ 完整 selector arms
→ 完整 declaration block
```

输入先按 canonical source id 排序，并拒绝重复 canonical id；输出位置固定为 group 最后一个 member。两次 replay（包括反转输入到达顺序）必须得到相同 CSS、指标和 SHA-256。P0 直接序列化未修改的 PostCSS roots；P5 在对应 shadow AST 上移除早期 member、改写最后 anchor，并清理因此变空的受支持 wrapper，避免按 occurrence 重包 wrapper 虚增 P0 或 P5 字节。

Group identity 为：

```txt
ordered wrapper path
+ ordered declaration serialization
```

selector 不进入 declaration identity，但完整 selector arms 必须原样进入输出 selector list。只有 serializer dry-run 证明 P5 raw bytes 小于对应 P0 members 时才应用 group。

## Barrier oracle

Stage 0 的主要正确性风险是把早期 occurrence 移到后期 occurrence 时跨过 competing declaration，而非只有 marker cross-product。

以下内容禁止跨越：

- 任意无法建模的 selector、node 或 wrapper；
- 相同 property；
- 已知 shorthand/longhand family；
- `A → B → A` 中的 B；
- 不同或未知 wrapper path；
- 注释等非 declaration 节点。

Stage 0 复用 Core 现有 property competition oracle；只有它明确返回 `disjoint` 才允许跨越，`same-property`、`shorthand-longhand` 和 `unknown` 都作为 competing barrier。这不把 shadow planner接入 production pipeline；未知情况不推断安全，不做 group。

## 指标

每次 evaluation 输出：

- `eligible`、`grouped`、`groups`、`skipped`；
- 稳定排序的 `skipReasons`；
- `maxArms`、`maxSelectorBytes`；
- P0/P5 的 raw、gzip、brotli bytes 与 SHA-256；
- P0/P5 shadow CSS（仅测试内存结果，不进入 manifest/report）。

## Stage 0 门禁

1. adversarial corpus 使用 selector AST 提取 wrapper + selector-arm multiset，证明 P0/P5 授权边完全一致；
2. same-property、shorthand/longhand、`A → B → A`、unsafe/unsupported barrier 均阻止移动；
3. wrapper path 必须完整相同，包含多 rule 的共享 wrapper 不得被拆成重复容器；
4. `!important` 进入完整 block identity，normal/important 不得混组；
5. 同时命中多个 relation 时仍输出原始 arms，不构造父子集合的笛卡尔积；
6. replay hash 稳定，重复 canonical source id 必须 fail fast；
7. Vite、Rsbuild、Webpack Pilot 分别记录 raw/gzip/brotli，任一端恶化则不得推进；
8. computed-style/visual 必须零差异；未运行不得写为通过。

## Stage 0 决策与回滚

真实 Vite、Rsbuild、Webpack Pilot 各只有 3 个 eligible occurrence，且全部为 singleton，三端均为 `grouped=0`。P0/P5 raw、gzip、brotli 与 SHA-256 因没有实际 group 而完全相同。零 delta 不构成收益证据，因此本次 Stage 0 判定 `closed-no-go; product-deferred`；详细指标、capture 口径和命令见 [`phase-10-contextual-declaration-factoring-tracking.md`](phase-10-contextual-declaration-factoring-tracking.md)。

按既定回滚约束，test-only executable evaluator、runner、fixtures/tests 与临时 instrumentation 已删除或恢复；production transformer、Adapter、manifest/report、CSS Modules mapping、package 与 lockfile 均保持不变。visual/computed-style 未运行，因为没有生成与 P0 不同的 candidate；不得把逐字节相同冒充 visual 通过。

本次不授权 Stage 1 Core planner、跨包 finalizer API、公共 schema、dev/HMR 或 runtime。只有未来新真实 corpus 出现至少两个可复用的完整 block，才可重新申请 shadow evaluation；本次 no-go 不自动恢复任何 production capability。
