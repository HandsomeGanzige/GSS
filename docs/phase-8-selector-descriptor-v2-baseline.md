# Phase 8 Selector Descriptor 迁移前历史基线

## 文档状态

- Status: `completed`
- 生命周期：历史迁移证据；不代表当前 runtime/schema 契约
- 对应批次：`FOUND-02-A`
- 创建日期：2026-07-22
- 前置：`FOUND-02-0` 已完成
- 生产行为：本批次不修改 compiler、adapter 或 selector policy

本文档记录 selector descriptor clean replacement 前的可执行旧基线、跨包 consumer 和已发现的
breaking 边界。旧输出只用于解释迁移差异，不构成当前兼容承诺；当前契约以
`packages/core/CORE_DESIGN.md` 和对应 public types 为准。

## 基线范围

Core golden 固定同一 `color: red` declaration 在以下六种当前 eligible selector 中的输出：

- base `.class`
- `.class:hover`
- `.class:focus`
- `.class:active`
- `.class:disabled`
- `.class:focus-visible`

额外覆盖：

- readable 和 hash class name。
- atomic key、atomic CSS、manifest 和 report。
- `@media`、`@supports`、`!important`。
- readable class sanitize collision 与稳定 suffix。
- 去除 source location 排版噪声后的完整结构对比。

该可执行旧输出基线在 `FOUND-02-B1` clean replacement 时退役，不作为兼容测试长期保留。
当前契约测试位于
[`packages/core/test/selectorOutputContract.test.ts`](../packages/core/test/selectorOutputContract.test.ts)。

## 当前六种 selector 精确输出

| selector | selector identity | readable class | hash class | 最终 selector CSS |
| --- | --- | --- | --- | --- |
| base | `selector-v1\0.__GSS_ANCHOR__` | `_color_red` | `_01mcmyj1` | `._color_red` / `._01mcmyj1` |
| `:hover` | `selector-v1\0.__GSS_ANCHOR__:hover` | `_hover_color_red` | `_019u1usl` | class + `:hover` |
| `:focus` | `selector-v1\0.__GSS_ANCHOR__:focus` | `_focus_color_red` | `_0152kj87` | class + `:focus` |
| `:active` | `selector-v1\0.__GSS_ANCHOR__:active` | `_active_color_red` | `_003sl9e5` | class + `:active` |
| `:disabled` | `selector-v1\0.__GSS_ANCHOR__:disabled` | `_disabled_color_red` | `_011e3xk7` | class + `:disabled` |
| `:focus-visible` | `selector-v1\0.__GSS_ANCHOR__:focus-visible` | `_focus-visible_color_red` | `_018ffoba` | class + `:focus-visible` |

表中 `\0` 表示 identity 内部的 NUL code point。JSON 序列化时必须通过标准 round-trip 表示为
`\u0000`；consumer 不得 split 或解析 opaque identity。

### v1 key

`:hover` 的精确 key：

```txt
{"important":undefined,"media":undefined,"prop":"color","pseudo":":hover","supports":undefined,"value":"red"}
```

base 的 `pseudo` 同样是字面量 `undefined`。该 key 只是稳定文本，不是合法 JSON。

### 条件与 collision

| 场景 | v1 readable | v1 hash / suffix |
| --- | --- | --- |
| `!important` | `_color_red_important` | `_01wsuh4l` |
| `@media (min-width: 768px)` | `_media_6d102w_color_red` | `_01mi2t0e` |
| `@supports (display: grid)` | `_supports_1gj8cx_color_red` | `_00x8yvwe` |
| `margin: a/b` 后 `margin: a b` | `_margin_a_b`、`_margin_a_b_48foh` | suffix 来自 v1 key |

## 发现的 v1 契约不一致

### `important` 类型与 runtime 不一致

`DeclarationMeta.important` 声明为 `boolean`，但 PostCSS normal declaration 当前会把 `undefined`
透传到 IR、key 和 in-memory manifest。JSON manifest 又会省略该字段。v2 提案将 normal 值统一为
显式 `false`，但该改动只能与 schema v2 一起实施。

### manifest 索引注释与实现不一致

`TransformManifest` 注释说 `atomic` 以 atomic key 索引，实际 producer、analyzer 与 Playground
都使用 `className` 索引。v2 提案保持实际 className 索引，只修正错误注释，不在迁移中夹带
无收益的索引改造。

### 现有 version 不足

- core result、manifest 和 raw report 无 version。
- Vite/Rsbuild build manifest/report JSON 无 version。
- Rsbuild browser dev style snapshot 无 version。
- dev report envelope 是 `schemaVersion: 1`，但 overlay 没有 runtime guard。
- computed-style verifier 也使用 `schemaVersion: 1`，但它是不受 selector descriptor 影响的独立协议。

## Consumer 迁移地图

| 范围 | v1 consumer | v2 所需变更 |
| --- | --- | --- |
| Core selector/engine | `identity`、renderer、`compatibilityPseudo` | 删除 compatibility projection，交付 identity + 一次性 renderer |
| Core key/class/registry | public `AtomicKeyInput`、pseudo-aware key/class | internal key input，identity-aware key/class，registry 存纯数据 descriptor |
| Core output/manifest | core 自行拼 selector，manifest 深复制 context | 读取/深复制 descriptor，manifest 版本化 |
| Analyzer | `context.pseudo` conflict key | `selector.identity + media + supports + important` |
| Vite | dev/build 内自行拼 selector，稳定化 JSON | 只消费 descriptor CSS，保留去重、分区和 breakpoint 排序 |
| Rsbuild build | 自行拼 selector，稳定化 JSON | 与 Vite lockstep 迁移 |
| Rsbuild dev | loader 序列化 declaration/context 到 browser | 序列化 descriptor 和 versioned snapshot，先校验再 mutation owner/DOM |
| Devtools | envelope 1，overlay 盲读字段 | envelope 2，unknown/missing version 显式 incompatible |
| Fixtures | static 读 manifest/report，visual 读 dev envelope | 先校验 version，再验证 descriptor/HMR/visual |
| Playground | Rsbuild inspector 实际读 JSON；Vite UI 只展示文件名 | 只迁移真实 JSON consumer，不伪造 Vite reader |

## `FOUND-02-A` 交付物

- Core v1 selector output golden。
- consumer inventory 与 version boundary。
- v1 breaking 证据与两项已发现契约不一致。
- [Selector Descriptor Clean Replacement 方案](phase-8-selector-descriptor-migration-plan.md)。

`FOUND-02-A` 没有实施迁移方案。A 当时的 versioned 提案已被 owner 后续决策取代；
当前实施以无版本、无兼容、Core-first 的 clean replacement 方案为准。

## 验证结果

- `pnpm --filter @semantic-atomic-css/core verify` 通过：7 个测试文件、61 项测试，
  typecheck 与 build 通过。
- 独立 Test 复算 v1/v2 exact values，并确认 A 未将 descriptor/schema v2 引入生产源码。
- 独立 Review 发现的 runtime `undefined` 投影、A/B 授权边界和 version placement
  三项问题已修正，聚焦复核无剩余 actionable finding。

## `FOUND-02-D` 收口指向

历史六种 selector 输出继续保留在本文，且不构成 compatibility contract。当前无版本 clean
replacement 的 exact identity、canonical JSON key、readable/hash class、descriptor CSS，
以及 fixture/Pilot 收益复盘和 demand-first `SEL-02` 候选结论，见
[Selector 能力收益复盘](selector-capability-benefit-review.md)。

`FOUND-02-D` 没有恢复本文早期的版本化兼容提案，也没有新增 codec、dual-write、legacy reader
或 selector 实现。
