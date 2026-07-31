# Phase 8 Selector Descriptor Clean Replacement 方案

## 文档状态

- Status: `completed`
- 生命周期：已完成的历史迁移方案；当前契约以 Core 设计与 public types 为准
- 对应批次：`FOUND-02-B1` 至 `FOUND-02-B6`
- 创建日期：2026-07-22
- 完成日期：2026-07-25
- 当前批次：`FOUND-02-B1` 至 `FOUND-02-B6` 全部完成
- 授权边界：只完成 `FOUND-02-B` descriptor clean replacement；未开放新 selector，
  `FOUND-02-C` cascade oracle 矩阵与 `FOUND-02-D` 收益复盘仍需单独确认

本方案把 selector identity、atomic key/class、registry、renderer 和 manifest 从
`context.pseudo` clean replacement 为必填 selector descriptor。项目仍是未投产的独立实验仓库，
所有包只支持当前最新契约，不保留旧产物、旧 package 或旧 runtime 兼容路径。

该变更不开放 pseudo element、attribute selector 或其他新 selector。

## 已确认原则

1. 代码类型、函数、方法、文件和 identity 只使用具体语义命名，不携带 `v1`、`v2`
   或 `phase*` 等生命周期命名。
2. 不引入 `keyVersion`、manifest/build report/analysis/snapshot schema version 或 compatibility branch。
3. 不建立 dual-write、legacy reader、旧 renderer 或过渡 public type。
4. 无类型边界只校验当前执行必需的具体字段，不根据 version 分流。
5. 实施时先完成 Core，再按 Analyzer、Devtools、Vite、Rsbuild、fixture/Playground 分批向外迁移；
   该顺序现已执行完毕。
6. 迁移期间曾允许 Core 批次结束后下游包暂时 typecheck 失败；没有为保持中间态根验证通过而
   保留旧字段，最终批次已同步完成全部下游迁移。
7. 各批次均单独验证并暂停，最后一批已恢复根 `pnpm verify` 和两个 adapter
   visual 的完整门禁。

## Core 目标契约

### Public atomic data

```ts
type AtomicSelectorDescriptor = {
  identity: string
  css: string
}

type CssTransformContext = {
  media?: string
  supports?: string
}

type AtomicDeclaration = {
  key: string
  className: string
  selector: AtomicSelectorDescriptor
  declaration: DeclarationMeta
  context: CssTransformContext
  sources: SourceLocation[]
}

type TransformManifest = {
  atomic: Record<string, AtomicManifestEntry>
  classes: Record<string, ClassManifestEntry>
}
```

`TransformManifest.atomic` 继续以 `className` 索引。`selector.css` 是不含 declaration block
或 at-rule wrapper 的完整 selector 文本。

`AtomicKeyInput` 不再从 Core package 导出；已无 runtime seam 的 `SelectorAnalysis` 也从
public type surface 删除。

### Selector identity

identity 直接是 selector AST 用稳定 anchor 渲染出的 canonical template：

```txt
.__GSS_ANCHOR__
.__GSS_ANCHOR__:hover
.__GSS_ANCHOR__:focus-visible
```

identity 不包含 codec/version 前缀。consumer 只能对其做等值比较、key 输入或诊断展示，
不得分割或反解其内容。

### Atomic key

```ts
stableStringify({
  selectorIdentity,
  prop: declaration.prop.trim().toLowerCase(),
  value: declaration.value.trim(),
  important: declaration.important === true,
  media: context.media ?? null,
  supports: context.supports ?? null
})
```

base `color: red` 的 exact key：

```txt
{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__","supports":null,"value":"red"}
```

该 key 只表达当前复用语义：

- normal declaration 的 `important` 固定为 `false`。
- 缺失 media/supports 固定为 `null`。
- selector identity 必填，base 和不同 pseudo 不得复用同一 atomic declaration。
- 不包含 version 或 compatibility 字段。

### Class name

readable strategy 统一使用 selector identity hash：

```ts
[
  media && `media_${hashString(media, 6)}`,
  supports && `supports_${hashString(supports, 6)}`,
  `selector_${hashString(selectorIdentity, 6)}`,
  sanitizedProp,
  sanitizedValue,
  important && 'important'
]
```

- base selector 也使用 selector hash，不建立 base 特殊分支。
- hash strategy 继续为 `prefix + hashString(key, 8)`。
- sanitize collision 使用完整 key 生成 5 位 suffix。

### Current selector exact contract

| selector | identity | readable class | hash class |
| --- | --- | --- | --- |
| base | `.__GSS_ANCHOR__` | `_selector_q0dmug_color_red` | `_0190kqgs` |
| `:hover` | `.__GSS_ANCHOR__:hover` | `_selector_qf5xvc_color_red` | `_00o6ut9w` |
| `:focus` | `.__GSS_ANCHOR__:focus` | `_selector_14ht6n_color_red` | `_00tqff7y` |
| `:active` | `.__GSS_ANCHOR__:active` | `_selector_1ahwsi_color_red` | `_012ucf90` |
| `:disabled` | `.__GSS_ANCHOR__:disabled` | `_selector_9t0oge_color_red` | `_00zf1yj6` |
| `:focus-visible` | `.__GSS_ANCHOR__:focus-visible` | `_selector_1qzezs_color_red` | `_00ipsc7t` |

其他 exact contract：

| 场景 | readable class | hash class / suffix |
| --- | --- | --- |
| `!important` | `_selector_q0dmug_color_red_important` | `_01xagzef` |
| `@media (min-width: 768px)` | `_media_6d102w_selector_q0dmug_color_red` | `_00ggji9i` |
| `@supports (display: grid)` | `_supports_1gj8cx_selector_q0dmug_color_red` | `_0047ykps` |
| media + supports | `_media_6d102w_supports_1gj8cx_selector_q0dmug_color_red` | `_001ci2dm` |
| `margin: a/b` 后 `margin: a b` | `_selector_q0dmug_margin_a_b`、`_selector_q0dmug_margin_a_b_150yz` | suffix 来自第二条完整 key |

## Registry 交接

registry 接收内部语义输入和一次性 renderer：

```ts
registry.register(
  { declaration, selectorIdentity, context },
  className => selectorRewrite.renderAtomicSelector(className),
  source
)
```

registry 必须：

1. 生成 atomic key。
2. 选择最终无冲突 class name。
3. 同步调用 renderer，只存储 `{ identity, css }` 纯数据。
4. 不存储 AST、rewrite plan 或 closure。
5. key reuse 时使用已有 class name 重新 render，与已存 `selector.css` 比较；不一致时
   fail fast，防止相同 identity 对应不同 renderer 而静默误编译。

## 分批实施

### `FOUND-02-B1`：Core

- Status: `completed`
- 一次贯通 selector plan → key/class → registry → renderer → manifest。
- 删除 `compatibilityPseudo`、public `context.pseudo`、public `AtomicKeyInput` / `SelectorAnalysis`。
- 旧 baseline 测试替换为语义命名的当前 contract 测试，不保留旧 key/class 兼容断言。
- 只要 Core verify 通过就暂停；下游包暂时失败是已接受中间态。
- 完成证据：Core 7 个测试文件、65 项测试、typecheck/build 通过；
  独立 Test 通过，Review 无剩余 actionable finding。

### `FOUND-02-B2`：Analyzer

- Status: `completed`
- conflict context 改为 selector identity + media + supports + important。
- conflict detail 输出 selector identity。
- 不读取旧 `context.pseudo`，不实施 manifest version guard。
- 分组仅读取 `atomic.selector.identity`；class-specific `selector.css` 不参与语义分组。
- 直接消费 Core 必填 `important` boolean，不保留兼容归一化。
- 完成证据：Analyzer 1 个测试文件、7 项测试、typecheck/build 通过。

### `FOUND-02-B3`：Devtools

- Status: `completed`
- dev envelope 保持 adapter/status/environments，style diff report 保持 labels/summary/runs/differences。
- 删除 dev report 与 computed-style report 的 `schemaVersion`，不保留旧 reader 或 dual-write。
- overlay 对展示必需字段做具体结构校验；非法 payload 进入 offline 并展示
  `invalid-dev-report-payload`。
- nested report 原样透传，Analyzer conflict `selectorIdentity` 不丢失。
- 完成证据：Devtools 2 个测试文件、17 项测试、typecheck/build 通过。

### `FOUND-02-B4`：Vite

- Status: `completed`
- dev/build 不再拼接 selector，只消费 descriptor CSS。
- 保留已验证的去重、base/context 分区、breakpoint 和稳定顺序。
- manifest 显式复制 descriptor；build conflict 保留 selector identity；dev report 使用当前无版本 envelope。
- HMR update/remove 清理旧 pseudo selector/class，stale async/import-removal 保护保持。
- 删除旧 factory alias 与已移除 core 配置的专用 tombstone guard；保留当前 unsupported 配置 fail-fast。
- 完成证据：Vite 4 个测试文件、37 项测试、typecheck/build 通过。

### `FOUND-02-B5`：Rsbuild

- Status: `completed`
- build renderer 只消费 descriptor CSS。
- browser snapshot 使用当前 `{ sources }` 结构，不增 version。
- HMR update/remove 清理 stale descriptor/CSS。
- manifest 显式复制 descriptor，build conflict 保留 selector identity，dev report 使用当前无版本 envelope。
- 删除已移除 core 配置的专用 tombstone guard；保留 Rsbuild 2.1.x 和其他当前 unsupported fail-fast。
- 完成证据：Rsbuild 4 个测试文件、18 项测试、typecheck/build 通过。

### `FOUND-02-B6`：fixture、Playground 与仓库收口

- Status: `completed`

#### B6a：当前 consumer

- Vite/Rsbuild fixture static 与 Rsbuild Playground inspector 只读取当前 manifest selector
  descriptor 和当前 build report，不保留旧 reader、selector 拼接或 compatibility branch。
- 两套 fixture visual 脚本只消费当前无版本 `adapter/status/environments` dev envelope；
  overlay、HMR 与 stale selector 的运行时证据归入 B6c。
- manifest 门禁验证 class mapping → atomic index → 非空 opaque `selector.identity` /
  `selector.css` → exact stylesheet rule，并用真实 bundle suggested token mutation 证明
  缺少完整增强 token 时会失败。
- Rsbuild Playground acceptance 通过，source-order parity 为 `true`。
- 完成命令：

  ```bash
  pnpm --filter @semantic-atomic-css/vite-fixture verify
  pnpm --filter @semantic-atomic-css/rsbuild-fixture verify
  pnpm --filter playground-rsbuild-react-css-modules acceptance
  ```

#### B6b：静态仓库门禁

- Core 65、Analyzer 7、Devtools 17、Vite 37、Rsbuild 18，共 18 个 test files、144 项测试通过；
  所有产品包 typecheck/build 通过。
- 根 `pnpm verify` 通过，并包含两套 fixture static；验证前后 git status 一致。

  ```bash
  pnpm verify
  ```

#### B6c：浏览器对照

- Vite full visual 通过：`base`、`preprocessor`，20 runs、100 cases、356 次属性比较、
  0 differences，`passed=true`。
- Rsbuild full visual 通过：`base`、`preprocessor`，8 runs、80 cases、180 次属性比较、
  0 differences，`passed=true`。
- 两套 visual 均以当前无版本 `adapter/status/environments` dev envelope 驱动 overlay 状态检查，
  并验证 HMR update/remove 与 stale selector 清理。
- 报告：
  `/tmp/gss-vite-selector-descriptor-style-diff.json`、
  `/tmp/gss-rsbuild-selector-descriptor-style-diff.json`。

  ```bash
  GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    pnpm --filter @semantic-atomic-css/vite-fixture test:visual \
    -- --report /tmp/gss-vite-selector-descriptor-style-diff.json

  GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual \
    -- --report /tmp/gss-rsbuild-selector-descriptor-style-diff.json
  ```

`FOUND-02-B` 的完成没有开放 pseudo element、attribute selector、selector list 或其他新 selector，
也没有引入 schema/key version、legacy reader、dual-write 或其他兼容机制。

## Core 验收矩阵

- base + 五种 pseudo 的 exact identity/key/readable/hash/descriptor CSS。
- selector escaping、identity/render 一致性。
- key reuse 与 renderer mismatch fail-fast。
- readable/hash collision、media、supports、media + supports、`!important`。
- manifest descriptor 防御性 clone，manifest atomic 以 className 索引。
- public exports 不再包含 `AtomicKeyInput` / `SelectorAnalysis`。
- pseudo element、attribute、selector list 与其他未开放 selector 继续 fallback。
- `pnpm --filter @semantic-atomic-css/core verify` 通过。

## 非目标

- 不开放 `::before`、`::after`、attribute 或 selector list。
- 不改 `ScopeStrategy`。
- 不引入 compatibility codec、dual-write、schema version 或 legacy renderer。
- 不修改 manifest `atomic` 索引方式。
- 不在 Core 批次修改 Analyzer、Devtools、Vite、Rsbuild、fixture 或 Playground。
