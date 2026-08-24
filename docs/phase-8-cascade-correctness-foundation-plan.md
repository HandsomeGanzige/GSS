# Phase 8 Cascade Correctness Foundation 方案

## 文档状态

- Status: `completed`
- 对应批次：`FOUND-02-0`
- 创建日期：2026-07-21
- 前置设计：[Selector-aware Identity / Renderer 与 Cascade 方案](phase-8-selector-aware-identity-cascade-design.md)
- 实施状态：已于 2026-07-21 完成实现、验证与独立复核

本文档只定义 `FOUND-02-0` 的具体执行方案。该批次修复当前已存在的
atomic/preserved cascade 反转，并删除不安全的 `preserveResolvedClass` 选项；不实施 selector
descriptor/schema v2，不改变 atomic key/class 算法，也不开放任何新 selector。

## 已确认背景

- 当前输出固定为全局 atomic CSS 在前、preserved CSS 在后。
- 同一个 source class 可以同时参与 unsafe selector 与 eligible selector。
- engine 当前逐 rule 决策，无法在注册 atomic declaration 前知道同 class 后续是否需要 fallback。
- selector-list 在前、eligible `.button` 在后的反例已经通过只读 probe 复现 silent miscompile。
- semantic fallback 必须依赖 resolved scoped class 命中 DOM；删除 semantic token 会让 fallback 失效。
- 总体设计已确认始终保留 semantic scoped class，不保留 `preserveResolvedClass: false` 兼容路径。

## 目标

1. 在任何 registry mutation 前收集完整的当前 input class preservation evidence。
2. 同一 source class 只要参与 unsafe/preserved selector，其 eligible rules 也整类 preserved。
3. evidence 覆盖普通 rules、nested rules 与 unsupported at-rule preserved blocks。
4. selector evidence 无法完整解析时，在任何 registry mutation 前 fail fast，不输出未 scoped CSS。
5. 删除 `preserveResolvedClass`，保证所有 exported class mapping 始终保留 resolved semantic class。
6. 用 core static 与 Vite/Rsbuild semantic/native visual 对照证明 current regression 修复。

## 非目标

- 不建立 `AtomicSelectorDescriptor`，不删除 `context.pseudo`。
- 不升级 manifest/report/dev schema。
- 不改变现有 atomic key、readable/hash class 或 adapter renderer。
- 不修复跨独立 class/module、atomic-vs-atomic 且缺 usage evidence 的所有顺序风险。
- 不开放 pseudo element、attribute、selector list 或其他 selector。
- 不引入 JSX/TSX usage metadata、import-order graph 或 occurrence renderer。

## 推荐模块与 interface

新增 core internal preflight module，建议 seam 位于 `packages/core/src/engine/`，概念 interface：

```ts
type InputClassPreservationPlan = {
  preserveSourceClassNames: ReadonlyMap<string, InputPreservationReason>
}

function planInputClassPreservation(ir: CssIr): InputClassPreservationPlan
```

该 module 的职责：

- 通过 `planSelectorRewrite` 读取普通 rule 的 selector decision/evidence。
- 对 nested rule 的完整 `rule.css` 收集所有 source classes。
- 对 `preservedBlocks` 内全部 rules 收集 source classes。
- 为每个 class 保留首次出现的稳定 internal preservation reason，供 preserved rule 使用。
- 任一普通/nested/block selector 无法建立完整 evidence 时立即透传原 parser error，不返回 partial plan。

该 interface 不接收 registry、class mapping 或 adapter，也不执行 scoping/render。删除该 module 后，
preflight、evidence 合并与保守失败会重新散落到 engine 多个分支，因此它具备实际深度。

## Pipeline 调整

当前：

```txt
parse/collect IR
→ scope preserved blocks
→ 逐 rule analyze
→ 立即 registry.register
→ render atomic/preserved
```

调整后：

```txt
parse/collect IR
→ planInputClassPreservation（只读、无 registry mutation）
→ scope preserved blocks
→ 逐 rule analyze
   ├─ anchor class 在 preserve map：该 eligible rule preserved
   └─ 其他 eligible rule：允许 registry.register
→ render atomic/preserved
```

关键约束：

- preflight 必须完成后才能第一次调用 `registry.register`。
- 不能先注册再从当前 transform snapshot 删除；共享 registry 是 append-only，回滚会污染跨文件复用。
- `input.preserveClassNames` 的 asset/ambiguous-export 证据继续生效，并与 preflight plan 合并。
- unaffected class 仍可 atomize，避免因一个 unsafe class 把整个正常 input 全部降级。
- evidence 解析失败意味着同一 parser 无法建立 scoped fallback 所需 AST，因此统一 fail fast，并保证
  抛错前 registry 零 mutation；不得原样输出未 scoped CSS，也不得静默丢弃 rule。

## Class-wide preservation 语义

代表输入：

```css
.button,
.link {
  color: blue;
}

.button {
  color: red;
}

.independent {
  padding: 8px;
}
```

预期：

- `button` 和 `link` 进入 preservation evidence。
- `.button { color: red }` 不再注册 `_color_red`，与 selector list 按原始 order 输出。
- `independent` 不在 evidence 中，仍生成 atomic padding class。
- `button` mapping 保留 selector-list unsafe reason，并保持 semantic class。

### Stable reason

整类 preservation 不新增 public unsafe selector reason。eligible rule 使用该 class 在 preflight 中记录的
首个 `InputPreservationReason` 作为内部 preserved reason；原 unsafe/nested/unsupported rule 继续产生
既有 diagnostic，只有既有 public unsafe reason 会写入 class mapping。无法解析的 selector 不产生
result-level `incomplete-selector-evidence` warning，因为 transform 不会伪造成功 result，而是在 registry
mutation 前透传原 parser error。

## Evidence 范围

### 普通 rule

- `planSelectorRewrite(rule.selector)` 为 `preserved` 时，收集其全部 `sourceClassNames` 与 primary reason。
- selector 无 class 时不会误保留其他 class，但该 rule 本身仍 preserved。

### Nested rule

- `rule.hasNestedNodes` 时，不只读取外层 selector；必须从完整 `rule.css` 收集 nested block 内所有
  source class。
- 任一 selector evidence 解析失败时在 registry mutation 前 fail fast。

### Unsupported preserved block

- 对 `@container`、`@layer`、未知 at-rule 等 `preservedBlocks` 使用 PostCSS + selector rewrite interface
  收集内部全部 source classes。
- 下面场景必须让 `.button` eligible rule 整类 preserved：

  ```css
  @container (min-width: 300px) {
    .button { color: blue; }
  }

  .button { color: red; }
  ```

- block CSS 或内部 selector 无法完整提取 evidence 时，在 registry mutation 前 fail fast。

## 删除 `preserveResolvedClass`

修改语义：

- 从 `TransformCssOptions` 删除 `preserveResolvedClass`。
- `ResolvedTransformOptions` 不再包含该字段。
- `ClassMappingBuilder` 删除对应构造参数，始终生成：

  ```txt
  resolved semantic class + atomic classes
  ```

- Vite/Rsbuild options normalization 不再补默认值或转发该字段。
- 文档、测试和配置示例删除该选项。
- JS 用户继续传入废弃字段时，core/adapter 配置 normalization 应显式报 unsupported option，
  不静默忽略，避免用户误以为 semantic class 已移除。

这属于已确认的 clean replacement，不提供 deprecation、false compatibility 或条件行为。

## 预期变更范围

Core：

- `packages/core/src/engine/createTransformer.ts`
- `packages/core/src/engine/planInputClassPreservation.ts`（建议新增）
- `packages/core/src/ir/types.ts`（只增加 internal preservation reason）
- `packages/core/src/registry/ClassMappingBuilder.ts`
- `packages/core/src/policies/defaultOptions.ts`
- `packages/core/src/public/types.ts`
- `packages/core/src/diagnostics/*`（仅当新增内部 preservation message 所需）
- `packages/core/test/*`

Adapters/devtools：

- `packages/vite/src/options.ts` 与相关配置测试
- `packages/rsbuild/src/options.ts` 与相关配置测试
- 不修改 analyzer/devtools runtime；它们只参与验证 current report/overlay 未回归

Fixtures/docs：

- Vite/Rsbuild fixture 各增加一个 same-class atomic/preserved visual case。
- 对应 static/visual assertion、CORE_DESIGN、Phase 8 tracking 与配置文档。

默认不修改：

- atomic key/class name/registry 数据结构
- manifest/report schema
- `planSelectorRewrite` capability policy
- Vite/Rsbuild selector renderer
- analyzer conflict schema

## 测试矩阵

### Core success / conservative paths

1. selector-list 在前、eligible rule 在后：整类 preserved，恢复后声明获胜。
2. eligible rule 在前、selector-list 在后：仍整类 preserved，原始 order 不变。
3. unsafe class 与 unrelated eligible class 共存：只保留受影响 class。
4. descendant/compound/global 等现有 unsafe reason 都能触发对应 source class 整类 preservation。
5. nested block 内 class 进入 evidence。
6. unsupported `@container` block 内 class 进入 evidence。
7. selector 或 block evidence 解析失败：在 registry mutation 前 fail fast，保留原 parser error；不输出未 scoped CSS、
   不丢弃 rule，并证明 stateful registry 没有当前 input 污染。
8. class-wide preservation 仍保留 eligible rule 原有的 declaration warning，且不重复 CSS 或计数。
9. adapter `preserveClassNames` 与 preflight evidence 合并，不重复 diagnostic/class token。
10. 全部 selector eligible 的 input 保持当前 atomization 行为。
11. class mapping 始终以 resolved semantic class 开头。
12. runtime 传入废弃 `preserveResolvedClass` 时 fail fast。

### Adapter/visual

- Vite、Rsbuild 分别加入 native/semantic 对照：selector-list 与 `.button` 同时命中，computed color 一致。
- dev 与 preview 都覆盖；确保 shared owner/build asset 均使用修复后的输出。
- 确认 unaffected atomic class 仍存在，避免测试只证明“全部 fallback”。
- manifest/report 连续构建稳定；允许 atomization/preserved 统计按设计变化。

## 验证命令

```bash
pnpm --filter @semantic-atomic-css/core verify
pnpm --filter @semantic-atomic-css/vite verify
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm verify
pnpm --filter @semantic-atomic-css/vite-fixture test:visual
pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual
```

## 完成标准

- 已复现 selector-list 反例在 core 与两个 adapter computed style 中恢复 native 结果。
- nested/unsupported block evidence 和解析失败 fail-fast 路径有回归。
- affected class 全量 preserved，unaffected class 仍可 atomize。
- shared registry 在 fallback 决策前没有 mutation，不残留当前 input 不应存在的 atomic declaration。
- `preserveResolvedClass` 从 public/config/interface 和实现中删除，semantic class 始终保留。
- core、Vite、Rsbuild、根 verify 与两套 visual 全部通过。
- 没有 descriptor/schema/key/class/new selector 等超出 `FOUND-02-0` 的改动。

## 实施与验收结果

- core preflight 已覆盖 normal/nested/unsupported block selector evidence；无法完整解析时透传
  selector/PostCSS 原始错误，并保证 registry、manifest 和 report 无当前 input 污染。
- affected class 整类 preserved，unaffected class 继续 atomize；declaration diagnostic、custom property
  静默契约、CSS 输出次数和 preserved 计数均有回归。
- `preserveResolvedClass` 已从 core 与两个 adapter 的当前 interface 删除，旧 runtime 字段明确拒绝。
- `pnpm --filter @semantic-atomic-css/core verify`：6 files / 55 tests 通过。
- `pnpm --filter @semantic-atomic-css/vite verify`：4 files / 36 tests 通过。
- `pnpm --filter @semantic-atomic-css/rsbuild verify`：4 files / 15 tests 通过。
- 根 `pnpm verify`、Vite/Rsbuild fixture static 与两套 base/preprocessor visual 验收通过。
- 独立 Test 复验通过；独立 Review 无 actionable finding。

## Owner 确认结果

项目 owner 已于 2026-07-21 确认按本文范围实施 `FOUND-02-0`，并在实现复核后进一步确认：所有真实
evidence parse failure 统一在 registry mutation 前 fail fast，删除不可达的 successful fallback warning
分支，不新增人为可恢复 seam。该授权只包含本 correctness 小批次，不授权后续 descriptor/schema v2
或任何 selector 能力。
