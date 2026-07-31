# FOUND-04 非生产原型内部 Contract

> 状态：Development handoff；只授权 prototype/shadow，不授权任何正式 selector rewrite。本文不是公开设计、API 或 schema。

## 1. 冻结边界

- 原型 policy 只含四个互相独立的 flag：`compound`、`two-local-descendant`、`child`、`single-local-descendant-tag`；默认全关。
- multi-local 的 injection anchor 固定为 subject compound 中最右侧 local；single-local descendant-tag 固定为唯一 local ancestor。不得按 usage、fan-out 或收益动态选 anchor。
- 正式 CSS、semantic scoped token、完整 fallback、manifest、report、diagnostic、health、公开 API/schema、class-name 算法和生产依赖保持不变。
- adapter 只提供既有 post-CSS-Modules `scopedCss`、export evidence 与 `preserveClassNames`；selector grammar、anchor、identity、specificity、cascade 都归 Core。
- 不处理 JSX/DOM 共现、跨 class/module occurrence、跨 input 顺序推断或 FOUND-05；FOUND-05 继续 deferred。

## 2. Current seams 与必须保持的面

| Seam | 当前事实 | 原型约束 |
| --- | --- | --- |
| `planSelectorRewrite` | 一次 parse；eligible arm 含 `anchorClassName/identity/cascadeGuard/renderAtomicSelector`；multi-local/combinator preserved | structural/resolved 扩展只能留在 Core 内部；现有 base/pseudo/pseudo-element/attribute/list decision 逐字段、逐字符串不变 |
| `planInputClassPreservation` | 在首次 `registry.register` 前汇总 unsafe/nested/block/config/non-export/cascade evidence；当前 preserved multi-local 的全部 class 被无差别整类保留 | 正式 plan 不读取 candidate 结果；shadow 另建 role-aware preflight，不允许先注册再回滚 |
| `createTransformer` | parse/IR → preservation preflight → rule dispatch → registry/mapping → CSS/manifest/report | candidate evaluator 不接入 `runTransform/processRule`，不得改变 formal registry、mapping、stats 或 diagnostics |
| `AtomicRegistry` | append-only；key 含 selector identity/context/declaration；首次注册顺序决定 CSS 与 collision | shadow 使用独立实例/等价隔离状态；正式实例调用次数和顺序为 byte-identical 保持面 |
| `ClassMappingBuilder` | source class 是 mapping owner；resolved semantic class 永远保留；atomic class 首次顺序稳定 | candidate 只把 token 归给 injection anchor；guard 不得获得 token；正式 mapping 完全不变 |
| manifest/report/render | descriptor CSS 由 Core 预渲染；manifest 投影 registry/mapping；report 读取正式 stats/CSS bytes | candidate 数据只能写 Work Item material；不得进入 manifest/report/dev envelope/analyzer/overlay |

Byte-identical 面至少包括：已有 selector decision、identity/key/class、descriptor CSS、atomic/preserved CSS、token string、class mapping 顺序、diagnostics、manifest/report JSON 与 native artifacts。新 candidate 只能出现在 shadow artifact。

## 3. 内部两阶段 contract

```ts
type CandidatePolicy =
  | 'compound'
  | 'two-local-descendant'
  | 'child'
  | 'single-local-descendant-tag'

type StructuralSelectorArm = {
  policy: CandidatePolicy | 'current'
  sourceClassNames: readonly string[]
  injectionAnchorClassName: string
  semanticGuardClassNames: readonly string[]
  specificity: readonly [number, number, number]
  resolve(scope: ScopeStrategy, context: ResolveClassNameContext): ResolvedArmDecision
}

type ResolvedSelectorArm = {
  sourceClassNames: readonly string[]
  injectionAnchorClassName: string
  resolvedAnchorClassName: string
  resolvedGuardIdentity: string
  identity: string
  specificity: readonly [number, number, number]
  renderAtomicSelector(className: string): string
}

type ResolvedArmDecision =
  | { kind: 'resolved'; arm: ResolvedSelectorArm }
  | { kind: 'blocked'; reason: CandidateBlockedReason }
```

不变量：

1. structural 阶段只记录 AST node role/顺序/原 serializer spelling，不执行 scope，不生成 registry identity，不接触 adapter 类型。
2. resolved 阶段在任何 shadow registration 前一次性解析 anchor 与全部 local guards；resolver 抛错、空结果、anchor non-export、任一相关 class 命中 `preserveClassNames` 时 whole-rule blocked。
3. identity 必须在 guard resolve 后生成：clone selector，只有 injection anchor node 替换为现有 sentinel，其余 local guard 写入 resolved spelling，再由 AST serializer 输出。禁止把未解析 source guard 写入 identity。
4. renderer 复用同一 resolved AST，只替换 injection anchor；tag、attribute、combinator、spacing、node order 与 specificity 不变。anchor semantic class仍由 token mapping 保留在 DOM。
5. selector list 任一 arm 非 resolved、policy 不同或 preflight blocked 时 whole-rule blocked；不拆 list、不部分注册。
6. `sourceClassNames` 是 evidence；`injectionAnchorClassName` 是唯一 token/mapping owner；`semanticGuardClassNames` 只保留 selector 条件，不自动获得 token/export 身份。

例：`.card .button` 经 scope 后只允许生成 `.resolved_card ._atomic`，identity 为 `.resolved_card .__GSS_ANCHOR__`；不得生成 `._atomic .resolved_button` 或只生成 `._atomic`。

## 4. 四个 policy 的精确形状

| Policy | 首批允许形状 | Anchor / guards | 首批拒绝 |
| --- | --- | --- | --- |
| compound | 同一 compound 恰好两个 local class | 最右 local / 另一 local | 3+ local、tag/id/global/pseudo/attribute/其他 node 淕用 |
| two-local-descendant | 恰好一个 descendant、祖先与 subject 各一个 local；为覆盖真实 corpus，祖先 compound 可附一个当前已支持 presence/exact attribute | subject local / ancestor local + 原 attribute | 多 combinator、tag subject、child/sibling、pseudo/global、额外 local/attribute |
| child | 恰好两个 local，以单个 `>` 相连 | child local / parent local | descendant/sibling、额外结构 |
| single-local-descendant-tag | 唯一 local ancestor + 单个 descendant + 单一 tag subject | ancestor local / tag 结构 | tag+class、多个 tag、child/sibling、id/global/额外结构 |

上述是四份独立结果集和 gate；不得把 child 或 descendant-tag 计入 descendant，也不得用“组合总收益”替代单项判断。

## 5. Role-aware preflight 与 cascade oracle

shadow preflight 输入为完整当前 input IR、resolved arms、export/config evidence；必须在独立 shadow registry 第一次 mutation 前完成：

1. 建立 `anchor -> candidate occurrences`、`rule -> guards`、`class -> remaining formal preservation seeds`；accepted candidate 不再把 guard 无差别当 mapping owner。
2. 比较同 injection source class、可能 co-match、同 importance、等 specificity 的 occurrences；范围含 candidate↔candidate、candidate↔当前 eligible、candidate↔仍 preserved rule。media/supports 一律可能重叠。
3. property 竞争必须复用 `classifyPropertyCompetition` 口径，覆盖 same property、shorthand/longhand、重复与 A-B-A；相同 trimmed value 或 importance 不同按现有规则处理。
4. 只允许静态互斥证明：当前 exact lowercase `data-*` 同名不同 decoded value，以及不同 tag subject；不同 semantic guard class 不能因名称不同推断互斥。
5. 无法证明原 occurrence winner 在 atomic-first/preserved-second 下不变时，整个 injection anchor class blocked；不得部分注册。不同 injection class 的竞争明确越界到 FOUND-05。
6. guard-only class 是否解除当前 class-wide preservation必须通过“移除本 policy seed 后无剩余 seed”的 oracle；否则为 mixed，不得宣称 unlock。

内部 `CandidateBlockedReason` 至少区分：`policy-disabled`、`unsupported-shape`、`resolver-error`、`non-exported-anchor`、`adapter-preservation`、`selector-list-arm`、`same-anchor-cascade`、`remaining-class-evidence`、`found-05-out-of-scope`。这些字符串不是 public `UnsafeSelectorReason`。

## 6. Shadow evaluator 与零正式 mutation

数据流：

```txt
真实 adapter Core call input
  → deterministic capture(scopedCss + exportedClassNames + preserveClassNames)
  → Core-owned structural/resolved evaluator
  → role-aware preflight
  → isolated shadow registry/mapping/size model
  → Work Item candidate artifact only
formal createTransformer path ───────────────────────────────→ 原样输出
```

- shadow 必须在隔离 registry 中按与正式 build 相同的稳定 id/rule/declaration/arm 顺序模拟；不得调用正式 registry、`ClassMappingBuilder`、report accumulator 或 token augmenter。
- 为避免复制 key/class 算法，隔离 registry 可复用 Core 内部 `AtomicRegistry`，但实例绝不能传给 `createTransformer`。counterfactual 同时 replay 当前 eligible 与 candidate，才能计算 definitions/reuse/collision。
- 每项 policy 单独输出：candidate rules、direct declaration occurrences、token owners、guard-only classes、blocked reasons、exact-only classes、mixed classes、definitions/reused occurrences、preserved-declaration delta、class-string raw bytes、atomic/preserved raw 与 gzip/brotli、estimated total diff。
- `exact-only` = 该 class 的全部现存 selector preservation seed 都被该单项 policy 安全消除且无其他 seed；`mixed` = 至少一个 direct candidate，但仍有任一 seed。mixed 不计 unlock。
- source occurrence、unique atomic definition、token link 和字节必须分别报告；不得把 authored 上限当实际收益。

## 7. 真实 post-CSS-Modules 语料入口

已证明的现有入口：Vite `transformCompiledCssModule` 在构造 `coreInput` 时持有 `compiled.scopedCss`、由 native tokens + scoped CSS 得到的 exported set、asset preserve evidence；Rsbuild `createBuildArtifactSnapshot` 的稳定排序 `CompiledCssInput` 持有 `scopedCss/exportedClassNames/preserveClassNames`，并原样传给 Core identity scope。

原型 capture 方案只能是临时、同包 instrumentation：

1. 在上述两个既有 Core call site、调用 Core 之前，以单次环境变量指向 Work Item capture 目录；每个 id 写独立、稳定 JSON，重复 id payload 不同则 fail fast。
2. adapter 不导入 Core internal，不解析 selector；capture 只复制它已拥有的三个 evidence 字段并按 id/export 名排序。
3. instrumentation 前记录目标文件当前工作树 SHA-256；完成双 Pilot semantic build 后只反向移除注入 hunk，逐文件校验回到记录 hash。禁止 `git checkout/reset`，以保护 dirty worktree。
4. 最终 diff 中 adapter、config、package、schema、public export 和 instrumentation 必须为零；capture/evaluator/output 只能留在 Work Item materials 或 Core 自包测试原型。

如果 Development 无法在不改公开 config/schema、不跨包导入 internal 且最终零 instrumentation 的前提下取得上述逐 module evidence，立即停止；不得用最终 bundle CSS、现有 report/manifest 或 authored source 猜测替代。

## 8. Development 最小切片与文件边界

1. **Freeze**：保存目标 call-site 当前 hash、四份 frozen report/manifest hash、已有 selector contract snapshots。
2. **Core structural/resolved prototype**：限 `packages/core/src/selector/planSelectorRewrite.ts` 或一个同目录内部模块；不从 `packages/core/src/index.ts` 导出，不接 adapter。
3. **Shadow preflight/evaluator**：新建 Core 自包内部/测试原型文件；不得从 `createTransformer.ts` 正式路径调用。可复用 declaration competition 与隔离 `AtomicRegistry`。
4. **Core tests**：覆盖四 policy 成功与 near-miss、resolved guard identity、anchor ownership、whole-list fallback、resolver/export/config failure、zero formal registry mutation、current outputs byte-identical。
5. **Temporary capture**：只改两个 call site，采完立即还原并验证 hash；生成双 Pilot corpus material。
6. **Evaluation**：四 policy 分跑，产出可复算 JSON/Markdown；不修改 Pilot source、fixture、权威 docs、report/manifest。
7. **Closeout**：最终 diff 仅保留已批准的 Core 原型/测试与 Work Item materials；若 Main 将“非生产”解释为不得保留 `src` 代码，则只保留 tests/material prototype，Core `src` 同样还原。

## 9. 验证矩阵、停止与回滚

| Gate | 必须验证 |
| --- | --- |
| current contract | `pnpm --filter @semantic-atomic-css/core verify`；base/pseudo/pseudo-element/attribute/list identity/key/class/CSS/manifest/report snapshot 不变 |
| formal isolation | shadow 开/关前后正式 Core result 深相等；正式 registry register count/order、tokens、adapter artifacts byte-identical |
| policy | 四项分别覆盖 success/near-miss；resolved guards 保留；只 anchor 得 token；任一 arm 失败 whole-rule blocked |
| cascade | same/different guard、A-B-A、重复、shorthand/longhand、important、media/supports、specificity、guard-only exact/mixed、零部分注册 |
| corpus | capture 可回放且与 frozen files/sourceClasses/before bytes 对齐；Vite/Rsbuild 分类稳定；四项单列收益 |
| repository | `pnpm verify`；最终 adapter instrumentation hash/diff 为零；无 public schema/config/export/dependency 变化 |

成功门槛：formal artifact 全部 byte-identical；每个 direct blocker 有可解释 outcome；至少一个双 Pilot 共享 policy 各有 `>=2` exact-only class 且 estimated total diff 不恶化；无 silent miscompile、非确定输出或 stale capture。

停止条件：需要 JSX/DOM 共现、跨 class/module order、FOUND-05、移除 semantic/fallback、新 public schema/config、多-selector registry，或现有能力输出变化；只有 mixed/fixture 收益、双 adapter 分类不稳定、字节恶化、真实 capture 不可证明也必须停止。

回滚：policy 默认关闭；删除 shadow evaluator/capture material hook 即回到当前 planner 和 class-wide fallback。任何正式 registry/mapping/report mutation 都视为原型越界，不进入修复循环，直接撤回该切片。
