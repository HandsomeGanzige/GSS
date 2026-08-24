# Selector 能力收益复盘

## 文档状态

- Status: `completed`
- 对应批次：`FOUND-02-D` 需求排序、`SEL-01` / `SEL-02` / `SEL-03` 实施后收益收口、
  `FOUND-04` no-go 评估
- 初次复盘：2026-07-25
- 最近更新：2026-07-29
- 决策口径：先以 demand-first 排序，再以同语料 artifact 前后差验证实际收益
- 最新状态：`SEL-01` / `SEL-02` / `SEL-03` completed；`FOUND-04` closed-no-go，
  `SEL-04` / `SEL-05` / `SEL-06` deferred

## 结论

2026-07-25 的 `FOUND-02-D` 证据满足当时的 demand-first 门槛，因此只选择 `SEL-02`
作为下一份方案的准备对象：

- Vite Pilot 有 9 条 `attribute-selector` 与 3 条 `pseudo-element` authored rules；
  Rsbuild Pilot 有 11 条 `attribute-selector` 与 3 条被规范化为 `:before` 的
  `unsupported-pseudo` rules。跨 adapter 去重后，attribute/pseudo authored rules 为 `11 / 3`。
- current manifest 中 potentially unlockable exact-only class 代理：
  Vite Pilot 为 attribute/pseudo `5 / 1`，Rsbuild Pilot 为
  attribute/unsupported-pseudo `6 / 1`。
- Vite 同 corpus 历史 manifest 中，exact-only class 的旧 atomic token links 为
  attribute/pseudo `46 / 9`。
- attribute 在两个 adapter 中都保持 `attribute-selector` 分类；Rsbuild 会把源码 `::before`
  序列化为 `:before` 并归类为 `unsupported-pseudo`，若先准备 `SEL-01`，需要先扩展原候选的
  legacy single-colon 边界与 canonical identity 决策。

这些数字只证明 authored demand 与 potentially unlockable class/token-link 代理更偏向 attribute，
不证明实施收益。`SEL-02` 后来经 owner 单独确认、实施并完成；以下 2026-07-27 同语料
report/manifest 前后差才作为实际因果收益：

- Vite 与 Rsbuild 都实际释放 5 个 class、52 个 declaration occurrences，拆分为
  15 个 atomic definitions 与 37 个 reused occurrences；preserved declarations 均减少 52。
- Vite 的 9 个 `attribute-selector` blocker 清零；Rsbuild 的 11 个中 9 个释放，剩余同 class
  两个 occurrence 继续 fallback。当前 report 只把真正触发 guard 的 risk arm 记为 1 条
  `attribute-cascade-order` public diagnostic，另一条是 class-wide preservation follower。
- Vite/Rsbuild preserved CSS ratio 分别为 `0.4101 → 0.3264`、`0.5158 → 0.4569`；
  estimated total diff 分别改善 631 / 622 bytes。
- unsupported selector 与 same-class order-risk 继续 preserved；`SEL-01`、`SEL-04`
  状态不变，`FOUND-05` 继续 `deferred`。

## 证据口径

本文严格区分以下证据：

| 类型 | 含义 |
| --- | --- |
| 直接指标 | 当前或已封存 report/manifest 中可直接读取的字段 |
| 派生指标 | 由明确公式计算，未进入 public schema |
| 历史值 | 历史 tracking 或封存 artifact 的当时数字 |
| 代理 | exact-only class、历史 token links、authored rule count 等排序信号 |
| 未知 | 当前 schema 无法给出因果归属的 declaration/reuse/bytes 收益 |
| 同语料因果差值 | `files`、`sourceClasses`、`beforeRawCssBytes` 相同的实施前后 artifact 差值 |

派生的 report declaration atomization share 使用：

```txt
atomic occurrences = atomicDeclarations + reusedAtomicDeclarations
atomization share =
  atomic occurrences / (atomic occurrences + preservedDeclarations)
```

该 share 只描述 report 计数口径，不是浏览器语义证明，也不等于最终 gzip 收益。

## FOUND-02-D Artifact 隔离与 SHA-256

任何 build 前，ignored `dist` 中的已有 report/manifest 已先复制到
`/private/tmp/gss-selector-benefit-review`。Vite/Rsbuild preprocessor fixture 与 Vite Pilot
作为 baseline 封存；Rsbuild Pilot 原产物已经是 class-wide preservation 后结果，因此单独标为
`observed-current-before-rerun`，不冒充历史 baseline。

### 封存 artifact

| 集合 | 文件 | SHA-256 |
| --- | --- | --- |
| baseline/Vite fixture | report | `68ea26674a538eb21303b74da236d0be343250005a0f3d89befa32fb441697b6` |
| baseline/Vite fixture | manifest | `ef120dc9d24f8d761e3f013f87ae690695a67328556b14ca0486a744bc85a69b` |
| baseline/Rsbuild fixture | report | `564fe1c63046503185c4683165754a1fb61395fcb17f727d02dccdbcdc743f44` |
| baseline/Rsbuild fixture | manifest | `e7380fc898d4357d9c822e43e68ac2785e21a05b2dc44f8aba4971e658f1186b` |
| baseline/Vite Pilot | report | `9dcd70b07e06f47e6a2f80b8539f4e8abd88430e9b68c623aec7161ed9f0ac2b` |
| baseline/Vite Pilot | manifest | `40a83f4b4d019a7d1cdd86adaa74dbcbbdd542efa62494ca609af522cf44ef7a` |
| observed-current-before-rerun/Rsbuild Pilot | report | `38227f0355fda19c58d839ae29a8c000bc6c77cd35144dfa4997ff3408ff0386` |
| observed-current-before-rerun/Rsbuild Pilot | manifest | `2a83ca76f07aa73a25bfc5dd6bd68625f07e4e2d310435d172b37cb38b57c848` |

### 当前 artifact

| 集合 | 文件 | SHA-256 |
| --- | --- | --- |
| current/Vite fixture | report | `7da43695e2b1bcc79291d1d0230ba3051be209f781c87a1496ccfa2e0425ff1e` |
| current/Vite fixture | manifest | `78801c85549bb79251f4269482f432e2f00a909abcfacb85f2bcfc5ad162e8f1` |
| current/Rsbuild fixture | report | `0f33b562a4e4709d89c7ebe6a88e8b882a1d6b22d9810cba24fbefaf767c03c1` |
| current/Rsbuild fixture | manifest | `04af53fb32087692731ecc1a1b20f4fb68408b459ff159469f829bedf2af36d0` |
| current/Vite Pilot | report | `8ae80e1860d23afe3d7b90e27bba341f965db57baa1fa56b7ddcaa659fd0511b` |
| current/Vite Pilot | manifest | `a0ae65e5b8ff0e8f5fc7f9ecda1a6c6a4ae61a3c7b83720fb3ec7783c5ede445` |
| current/Rsbuild Pilot | report | `38227f0355fda19c58d839ae29a8c000bc6c77cd35144dfa4997ff3408ff0386` |
| current/Rsbuild Pilot | manifest | `2a83ca76f07aa73a25bfc5dd6bd68625f07e4e2d310435d172b37cb38b57c848` |

Rsbuild Pilot rerun 与 `observed-current-before-rerun` 的两个 hash 分别完全相同，证明这次临时
重建稳定复现了已有 current artifact；它仍不是 class-wide preservation 前的历史 baseline。

## Corpus 可比较性

| 目标 | files/sourceClasses | unsafe diagnostic 集合 | before raw | 结论 |
| --- | --- | --- | --- | --- |
| Vite preprocessor fixture | `3 / 6` 前后相同 | source id/selector/reason 前后相同 | `1080` 前后相同 | 同 corpus，可计算聚合 delta |
| Rsbuild preprocessor fixture | `3 / 5` 前后相同 | source id/selector/reason 前后相同 | `483` 前后相同 | 同 corpus，可计算聚合 delta |
| Vite Pilot | `17 / 212` 前后相同 | 23 条 source id/selector/reason 前后相同 | `44695` 前后相同 | 同 corpus，可计算聚合 delta |
| Rsbuild Pilot | current 为 `23 / 228` | 无同构历史 artifact 可复算 | 历史 tracking 未保存 | 只记录 current 快照与历史参考，不计算因果 delta |

fixture 数据只代表 preprocessor suite，因为 base suite 当前不 emit manifest/report。

## SEL-02 同语料实施收益

2026-07-27 在 SEL-02 四个实现批次完成后，使用 2026-07-25 `FOUND-02-D` 直接生成的两个
Pilot semantic artifact 作为 baseline，并从同一份 Pilot source 重新构建 semantic/native。
两端前后的 `files`、`sourceClasses` 与 `beforeRawCssBytes` 完全相同，因此下表差值可以归因于
当前语料上的 SEL-02 行为变化。exact-only class、历史 token links 和 authored rule count 不参与计算。

### Artifact hash

| Adapter | Artifact | Baseline SHA-256 | Current SHA-256 |
| --- | --- | --- | --- |
| Vite | report | `8ae80e1860d23afe3d7b90e27bba341f965db57baa1fa56b7ddcaa659fd0511b` | `7759494b4b1ecd3af4699d88a024f550f7d1a0bacfa989c713af45a5c7ae4fa6` |
| Vite | manifest | `a0ae65e5b8ff0e8f5fc7f9ecda1a6c6a4ae61a3c7b83720fb3ec7783c5ede445` | `bc0fd8f1e4b942e82969d39fa9e7628f3ae9e575e0dfc37e4bffaf42a245388c` |
| Rsbuild | report | `38227f0355fda19c58d839ae29a8c000bc6c77cd35144dfa4997ff3408ff0386` | `a843b784051c5c204c27988ce1ee8cdc0b93825dba88e355f9c1b29d707cf4dd` |
| Rsbuild | manifest | `2a83ca76f07aa73a25bfc5dd6bd68625f07e4e2d310435d172b37cb38b57c848` | `598f416628e5b93c7a5f11665ac5e9275ac60ce9ba98b4c588508ebdeac7a4de` |

### 汇总差值

declaration occurrence 仍按 `atomicDefinitions + reusedAtomicDeclarations` 计算。

| 指标 | Vite baseline | Vite current | Delta | Rsbuild baseline | Rsbuild current | Delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| files | 17 | 17 | 0 | 23 | 23 | 0 |
| source classes | 212 | 212 | 0 | 228 | 228 | 0 |
| before raw CSS bytes | 44695 | 44695 | 0 | 46943 | 46943 | 0 |
| atomic definitions | 240 | 255 | +15 | 252 | 267 | +15 |
| reused atomic declarations | 821 | 858 | +37 | 751 | 788 | +37 |
| declaration occurrences | 1061 | 1113 | +52 | 1003 | 1055 | +52 |
| unsafe rules | 23 | 14 | -9 | 38 | 29 | -9 |
| preserved rules | 55 | 40 | -15 | 86 | 71 | -15 |
| preserved declarations | 206 | 154 | -52 | 324 | 272 | -52 |
| preserved CSS ratio | 0.4101 | 0.3264 | -0.0837 | 0.5158 | 0.4569 | -0.0589 |
| after raw CSS bytes | 19111 | 17960 | -1151 | 24285 | 23143 | -1142 |
| after gzip CSS bytes | 4326 | 4291 | -35 | 5078 | 5052 | -26 |
| after brotli CSS bytes | 3796 | 3771 | -25 | 4455 | 4436 | -19 |
| estimated class string bytes | 10610 | 11130 | +520 | 10030 | 10550 | +520 |
| estimated total diff bytes | -14974 | -15605 | -631 | -12628 | -13250 | -622 |

### 实际释放与保守路径

两个 adapter 在共享业务语料上释放同样 5 个 class：

| Source class | 新增 declaration occurrences |
| --- | ---: |
| `ModuleMatrix.surfaceCard` | 10 |
| `RuleInspector.ruleCard` | 10 |
| `ScenarioNotes.noteCard` | 9 |
| `SelectorMatrix.caseCard` | 10 |
| `Shell.topbar` | 13 |
| 合计 | 52 |

其中 6 个 unique atomic definitions 带 attribute guard；其余 9 个 definitions 是这 5 个 class
解除 class-wide preservation 后同时释放的 base declarations。全部 52 个 occurrence 都是 current
manifest 真实追加到 class mapping 的 atomic token。

- Vite 的 9 条旧 `attribute-selector` reason 全部消失；另 3 个共享 class 仍因 descendant、pseudo
  或 compound 等其他 evidence 整类 fallback。
- Rsbuild 的 11 条旧 `attribute-selector` 中 9 条释放；`InspectorApp.card` 的 risk arm 直接命中
  same-class 原始顺序竞争并报 1 条 `attribute-cascade-order`，pass arm 只因 class-wide 传播继续
  fallback，不伪造第二条 public diagnostic。另 3 个共享 class 同样受其他 evidence 阻塞。
- 两端都只生成 6 个 attribute-guarded atomic definitions；unsupported operator、flag、namespace、
  `[class...]`、组合结构与 order-risk 均未计为成功转换。

## SEL-03 同语料实施收益

2026-07-28 在 Core 首次支持 selector list 前，先将 Vite/Rsbuild 共享 Modules route
的三组完全重复 rule 合并为 list，再用旧 Core 封存四份 semantic/native baseline。
实施后使用同一 source 复建；两端 `files`、`sourceClasses`、`beforeCssBytes` 与
`beforeRawCssBytes` 完全相同。

| 指标 | Vite baseline | Vite current | Delta | Rsbuild baseline | Rsbuild current | Delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| selector-list unsafe rules | 3 | 0 | -3 | 10 | 0 | -10 |
| atomic definitions | 255 | 255 | 0 | 267 | 283 | +16 |
| reused occurrences | 826 | 858 | +32 | 788 | 907 | +119 |
| registration/token links | 1081 | 1113 | +32 | 1055 | 1190 | +135 |
| preserved rules | 43 | 40 | -3 | 71 | 48 | -23 |
| preserved source declarations | 170 | 154 | -16 | 272 | 178 | -94 |
| preserved CSS ratio | 0.3492 | 0.3264 | -0.0228 | 0.4569 | 0.3369 | -0.1200 |
| after raw CSS bytes | 18592 | 17960 | -632 | 23143 | 20082 | -3061 |
| after gzip CSS bytes | 4385 | 4291 | -94 | 5052 | 4773 | -279 |
| after brotli CSS bytes | 3845 | 3771 | -74 | 4436 | 4199 | -237 |
| class string increase | 10810 | 11130 | +320 | 10550 | 11900 | +1350 |
| estimated total diff | -14939 | -15251 | -312 | -13250 | -14961 | -1711 |

Vite 的 3 条 list 为 16 个原 source declaration，转换后增加 32 个 arm registration；所有
identity 均已在 registry 中存在，因此是 `0 definitions + 32 reuse`。Rsbuild 的原生 CSS
管线还产生 Inspector/Diagnostics/Overview 中的安全 list；连接分量传播同时解锁关联
eligible rules，最终释放 94 个 source declaration，增加 135 个 registration/token links。
这两类计数分开报告，不将每个 arm reuse 冒充新 source declaration。

baseline 的 Vite 4 个、Rsbuild 15 个 selector-list-only 目标 class 在 current manifest 中都保留
semantic token 并获得非空 atomic mapping。四个 Pilot preview 在 desktop/narrow 对照普通、
focus-visible computed style 和单-arm CSSOM，semantic/native 全部一致。完整口径与 hash 见
[SEL-03 验收](phase-8-selector-list-acceptance.md)。

## FOUND-02-D 实施前直接指标与派生指标

本节“current”均指 2026-07-25 `FOUND-02-D` 封存的实施前快照，不是 2026-07-27
SEL-02 完成后的最新值。

### Registry、preservation 与风险

| 目标 | atomic definitions | reused occurrences | reuse ratio | atomic occurrences（派生） | preserved rules/declarations | atomization share（派生） | preserved CSS ratio | unsafe rules |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Vite fixture | 8 | 0 | 0 | 8 | 8 / 15 | 34.78% | 0.7192 | 2 |
| Rsbuild fixture | 5 | 0 | 0 | 5 | 3 / 7 | 41.67% | 0.5556 | 1 |
| Vite Pilot | 240 | 821 | 0.7738 | 1061 | 55 / 206 | 83.74% | 0.4101 | 23 |
| Rsbuild Pilot | 252 | 751 | 0.7488 | 1003 | 86 / 324 | 75.58% | 0.5158 | 38 |

### CSS 与 class string 体积

| 目标 | before/after raw | before/after gzip | before/after brotli | estimated class string increase | estimated total diff |
| --- | ---: | ---: | ---: | ---: | ---: |
| Vite fixture | 1080 / 1111 | 494 / 530 | 399 / 428 | 80 | +111 |
| Rsbuild fixture | 483 / 585 | 262 / 276 | 202 / 216 | 146 | +248 |
| Vite Pilot | 44695 / 19111 | 5191 / 4326 | 4371 / 3796 | 10610 | -14974 |
| Rsbuild Pilot | 46943 / 24285 | 5742 / 5078 | 4887 / 4455 | 10030 | -12628 |

### Unsafe reason distribution

| 目标 | distribution |
| --- | --- |
| Vite fixture | `descendant-selector: 1`、`attribute-selector: 1` |
| Rsbuild fixture | `descendant-selector: 1` |
| Vite Pilot | `attribute-selector: 9`、`pseudo-element: 3`、`descendant-selector: 6`、`compound-class-selector: 3`、`child-selector: 1`、`non-exported-class: 1` |
| Rsbuild Pilot | `attribute-selector: 11`、`unsupported-pseudo: 3`、`selector-list: 10`、`descendant-selector: 9`、`compound-class-selector: 3`、`child-selector: 1`、`non-exported-class: 1` |

## 同 corpus 聚合 delta

以下 delta 是同 corpus 下的聚合变化。它们与 class-wide preservation 同期出现，但还同时包含
selector-aware key/class clean replacement 和 serializer/output 差异；没有 rule-level provenance，
因此不能把每个变化全部归因于 class-wide preservation。

### Vite preprocessor fixture

| 指标 | baseline | current | delta |
| --- | ---: | ---: | ---: |
| atomic definitions | 14 | 8 | -6 |
| reused occurrences | 1 | 0 | -1 |
| atomic occurrences（派生） | 15 | 8 | -7 |
| preserved rules | 5 | 8 | +3 |
| preserved declarations | 8 | 15 | +7 |
| atomization share（派生） | 65.22% | 34.78% | -30.43 pp |
| preserved CSS ratio | 0.4715 | 0.7192 | +0.2477 |
| after raw/gzip/brotli | 1088 / 550 / 450 | 1111 / 530 / 428 | +23 / -20 / -22 |
| estimated class string increase | 150 | 80 | -70 |
| estimated total diff | +158 | +111 | -47 |

### Rsbuild preprocessor fixture

| 指标 | baseline | current | delta |
| --- | ---: | ---: | ---: |
| atomic definitions | 8 | 5 | -3 |
| reused occurrences | 0 | 0 | 0 |
| atomic occurrences（派生） | 8 | 5 | -3 |
| preserved rules | 2 | 3 | +1 |
| preserved declarations | 4 | 7 | +3 |
| atomization share（派生） | 66.67% | 41.67% | -25.00 pp |
| preserved CSS ratio | 0.4059 | 0.5556 | +0.1497 |
| after raw/gzip/brotli | 547 / 276 / 225 | 585 / 276 / 216 | +38 / 0 / -9 |
| estimated class string increase | 124 | 146 | +22 |
| estimated total diff | +188 | +248 | +60 |

### Vite Pilot

| 指标 | baseline | current | delta |
| --- | ---: | ---: | ---: |
| atomic definitions | 264 | 240 | -24 |
| reused occurrences | 944 | 821 | -123 |
| reuse ratio | 0.7815 | 0.7738 | -0.0077 |
| atomic occurrences（派生） | 1208 | 1061 | -147 |
| preserved rules | 26 | 55 | +29 |
| preserved declarations | 59 | 206 | +147 |
| atomization share（派生） | 95.34% | 83.74% | -11.60 pp |
| preserved CSS ratio | 0.2055 | 0.4101 | +0.2046 |
| after raw/gzip/brotli | 15571 / 4152 / 3624 | 19111 / 4326 / 3796 | +3540 / +174 / +172 |
| estimated class string increase | 12080 | 10610 | -1470 |
| estimated total diff | -17044 | -14974 | +2070 |

### Rsbuild Pilot 历史参考

[Phase 6 Rsbuild Pilot tracking](phase-6-rsbuild-real-project-pilot-tracking.md) 记录的历史值为：
source classes 228、atomic definitions 289、reused occurrences 923、reuse ratio 0.7616、
unsafe rules 38、preserved CSS ratio 0.3009、estimated total diff -15658。

current 直接值为：source classes 228、atomic definitions 252、reused occurrences 751、
reuse ratio 0.7488、unsafe rules 38、preserved CSS ratio 0.5158、estimated total diff -12628。
两组算术差分别是 -37、-172、-0.0128、0、+0.2149、+3030，但由于历史 tracking 没有保存
同构 report、diagnostic 集合、before raw、preserved rules/declarations，本文只把这些差值标为
**历史参考 difference**，不称为同 corpus delta，也不补算历史 atomization share。

## FOUND-02-D 候选代理

### Exact-only class

只有 `unsafeReasons` 恰好等于候选 reason 的 class 才进入 potentially unlockable class 代理；
混合 reason class 不计入。

| corpus | attribute exact-only | pseudo exact-only |
| --- | ---: | ---: |
| Vite fixture current | 1 | 0 |
| Rsbuild fixture current | 0 | 0 |
| Vite Pilot current | 5 | 1 个 `pseudo-element` |
| Rsbuild Pilot current | 6 | 1 个 `unsupported-pseudo` |

这些 class 只表示没有其他**已知** unsafe reason 阻止其退出 class-wide fallback；仍不能据此推断
其中有多少 declaration 会恢复 atomization。

### 历史 token links

Vite Pilot 封存历史 manifest 中：

| 候选 | exact-only classes | historical atomic token links |
| --- | ---: | ---: |
| attribute | 5 | 46 |
| pseudo element | 1 | 9 |

current manifest 中这些 affected class 的 `atomicClassNames` 均为 0，这是 class-wide preservation
当前保守结果。历史 token links 只是旧机会代理，不是当前损失、可恢复 occurrence、reuse 或字节。

### Authored rule 与 adapter 稳定性

| 候选 | Vite Pilot 直接计数 | Rsbuild Pilot 直接计数 | 跨 adapter 去重代理 | 分类稳定性 |
| --- | ---: | ---: | ---: | --- |
| `SEL-02` attribute | 9 | 11 | 11 | 两端均为 `attribute-selector` |
| `SEL-01` pseudo element | 3 | 3 | 3 | Vite 为 `pseudo-element`；Rsbuild 为 `:before` / `unsupported-pseudo` |

跨 adapter 去重值以共享业务 source rule 只计一次、Rsbuild Inspector 特有 attribute rule 单列；
它是 authored frequency 代理，不是转换收益。

## FOUND-02 基础六种 selector clean replacement

聚焦命令 `pnpm --filter @semantic-atomic-css/core test -- selectorOutputContract.test.ts`
通过：1 个 test file、8 项测试。

### 当前 exact contract

| selector | canonical identity | canonical JSON key | readable class | hash class | descriptor CSS |
| --- | --- | --- | --- | --- | --- |
| base | `.__GSS_ANCHOR__` | `{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__","supports":null,"value":"red"}` | `_selector_q0dmug_color_red` | `_0190kqgs` | `._selector_q0dmug_color_red` / `._0190kqgs` |
| `:hover` | `.__GSS_ANCHOR__:hover` | `{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__:hover","supports":null,"value":"red"}` | `_selector_qf5xvc_color_red` | `_00o6ut9w` | `._selector_qf5xvc_color_red:hover` / `._00o6ut9w:hover` |
| `:focus` | `.__GSS_ANCHOR__:focus` | `{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__:focus","supports":null,"value":"red"}` | `_selector_14ht6n_color_red` | `_00tqff7y` | `._selector_14ht6n_color_red:focus` / `._00tqff7y:focus` |
| `:active` | `.__GSS_ANCHOR__:active` | `{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__:active","supports":null,"value":"red"}` | `_selector_1ahwsi_color_red` | `_012ucf90` | `._selector_1ahwsi_color_red:active` / `._012ucf90:active` |
| `:disabled` | `.__GSS_ANCHOR__:disabled` | `{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__:disabled","supports":null,"value":"red"}` | `_selector_9t0oge_color_red` | `_00zf1yj6` | `._selector_9t0oge_color_red:disabled` / `._00zf1yj6:disabled` |
| `:focus-visible` | `.__GSS_ANCHOR__:focus-visible` | `{"important":false,"media":null,"prop":"color","selectorIdentity":".__GSS_ANCHOR__:focus-visible","supports":null,"value":"red"}` | `_selector_1qzezs_color_red` | `_00ipsc7t` | `._selector_1qzezs_color_red:focus-visible` / `._00ipsc7t:focus-visible` |

### 相对历史输出的 breaking diff

历史值保留在 [Selector Descriptor v2 基线](phase-8-selector-descriptor-v2-baseline.md)。

- identity 删除历史 `selector-v1\0` 前缀，只保留 canonical selector template。
- key 从 pseudo 投影与字面量 `undefined` 改为合法 canonical JSON，字段使用
  `selectorIdentity`，normal important 为显式 `false`，无 media/supports 为 `null`。
- readable class 对 base 与五种 pseudo 统一包含 selector identity hash，不再用旧 pseudo 名称前缀。
- hash class 随 canonical key 全部改变。
- descriptor `css` 保存完整 atomic class + pseudo 结构；adapter 不再拼接 pseudo。
- 这些都是无版本 clean replacement 的 breaking output，不建立 codec、dual-write 或 legacy reader。

## SEL-02 / SEL-03 完成边界与下一步

- 已批准并完成 presence、exact equality 与 attribute-before-class；name、operator、value、quote、
  escape、spacing 和 node order 保留在 selector identity/renderer 中。
- 不支持的 operator、namespace、flag、多 attribute、`[class...]` 与复合结构继续 fallback；
  same-class 等 specificity order-risk 使用 `attribute-cascade-order` 整类保留。
- 设计与验收分别见 [SEL-02 设计](phase-8-attribute-selector-design.md) 与
  [SEL-02 验收](phase-8-attribute-selector-acceptance.md)。
- SEL-03 仅支持全 arm 符合已有 grammar 的 list；unsafe mixed list 仍完整 fallback。
  设计与验收分别见 [SEL-03 设计](phase-8-selector-list-design.md) 与
  [SEL-03 验收](phase-8-selector-list-acceptance.md)。
- 两批都没有引入新 schema、usage metadata 或跨 class/module 推断；`FOUND-05`、`SEL-04`
  当时状态不变。`SEL-01` 后续已单独确认，并完成实现、独立 Test/Review 与修复复验；
  再后续的 FOUND-04 结论见下节。

## FOUND-04 双 Pilot no-go 评估

2026-07-29 使用两个 Pilot 的真实 post-CSS-Modules capture，对四个互相独立的 policy 做
zero-production-mutation replay。门禁要求每个 policy 在 Vite/Rsbuild 各至少 2 个 exact-only class，
且 estimated total diff 不恶化；mixed、组合 policy 与 authored 上限不计。

| Policy | Vite exact-only / total delta | Rsbuild exact-only / total delta | 决策 |
| --- | ---: | ---: | --- |
| compound | `1 / +40 B` | `1 / +16 B` | no-go |
| two-local-descendant | `6 / +1176 B` | `6 / +1170 B` | no-go |
| child | `2 / +173 B` | `2 / +173 B` | no-go |
| single-local-descendant-tag | `0 / 0 B` | `0 / 0 B` | no-go |

Vite 两次 evaluation SHA-256 均为
`d6d7f011e72b5428d30aaa3dd11138c4197006e7599a8de3728a2766cb2deebb`；Rsbuild 两次均为
`c402d38773f06dd1b33248f50b86d30dda160a0d46089380a1e5cf5ed3695466`。结果不能把 descendant
的 6 个 exact-only 或 child 的 2 个 exact-only 解读为 go，因为 total delta 都恶化。

Rsbuild current report 相对旧 frozen report 只刷新 direct attribution：当前是 1 条 direct
`attribute-cascade-order` risk，加 1 条 class-wide preservation follower，而不是 2 条 public
diagnostic；CSS、manifest 与 tokens 不变。当前 report hash 为
`c0b811dbf8003982a3fbf474fad690321b8b11d0c0f3ec4c3d86c7cf850b8e87`，manifest 仍为
`b6b538561f32916ac57e56aed19c15283dfaa28cdb890d22b85b428c82426e92`，该刷新不是 FOUND-04 收益。

因此 `FOUND-04` 为 `closed-no-go`，研究 prototype/test/script 已回滚；`SEL-04` / `SEL-05` /
`SEL-06` deferred，GOV-01 只记 `internal-study-completed; product-deferred`，`FOUND-05` 继续 deferred。
本结论不授权 production rewrite。完整口径见
[Phase 8 多 Local Selector Foundation 评估](phase-8-multi-local-selector-foundation-evaluation.md)。
本 Work Item 的独立 Test 与 Review 均已 PASS。Vite full visual 为 `64/228/676/0`，Rsbuild 为
`8/204/464/0`，均为 `passed=true`。adapter pre-image/hash 已独立复核；任务前正式 Core 完整
checksum/pre-image 未持久化，所以 Core byte-identical 的独立比较为 `not_run`，不能由当前 hash 或
绿色测试替代。当前无 executable shadow、正式入口未接入 candidate 且 package/root/static/full visual
全绿；该限制不改变 no-go、semantic fallback、no FOUND-05 或无 production rewrite 授权的结论。

## SEL-01 实际收益复盘

冻结 SEL-03 后的同语料 baseline 证明 Vite 的 3 条 `pseudo-element` 与 Rsbuild 的 3 条
`unsupported-pseudo` 是同一组 authored before rules。SEL-01 实施后两组旧 blocker 都归零，但
class-wide evidence 使实际收益只来自 `SelectorMatrix.selectorValue`：

| 指标 | Vite | Rsbuild |
| --- | ---: | ---: |
| 新 atomic definitions / reuse | `4 / 7` | `4 / 7` |
| 目标 mapping | `selectorValue: 11` | `selectorValue: 11` |
| 仍保留 | `taskCard`、`diagnosticProbe` | `taskCard`、`diagnosticProbe` |
| preserved declarations | `154 → 143` | `178 → 167` |
| after raw bytes | `17960 → 17794` | `20082 → 19915` |
| class-string increase | `+110` | `+110` |
| estimated total diff 改善 | `56 bytes` | `57 bytes` |

结果验证了 demand-first 判断：grammar 能识别三条规则不等于三个 class 都可释放；完整 class evidence
继续优先于 atomization rate。详细 artifact 与 SHA 见
[SEL-01 验收](phase-8-pseudo-element-acceptance.md)。独立 Test/Review、修复复验与最终 visual 均通过，
当前状态为 `completed`。

## 执行命令与验收

以下第一组命令是 2026-07-25 `FOUND-02-D` 的 baseline 生成与 contract 检查：

```bash
GSS_FIXTURE_SUITE=preprocessor GSS_FIXTURE_CSS_MODE=semantic \
  pnpm --dir fixtures/vite-css-modules exec vite build \
  --outDir /private/tmp/gss-selector-benefit-review/current/vite-fixture --emptyOutDir

GSS_FIXTURE_SUITE=preprocessor GSS_FIXTURE_CSS_MODE=semantic \
  GSS_FIXTURE_OUT_DIR=/private/tmp/gss-selector-benefit-review/current/rsbuild-fixture \
  pnpm --dir fixtures/rsbuild-css-modules exec rsbuild build

GSS_PLAYGROUND_CSS_MODE=semantic \
  pnpm --dir playground/vite-react-css-modules exec vite build \
  --outDir /private/tmp/gss-selector-benefit-review/current/vite-pilot --emptyOutDir

GSS_PLAYGROUND_CSS_MODE=semantic \
  pnpm --dir playground/rsbuild-react-css-modules exec rsbuild build \
  --dist-path /private/tmp/gss-selector-benefit-review/current/rsbuild-pilot

pnpm --filter @semantic-atomic-css/core test -- selectorOutputContract.test.ts
```

四个 build 与聚焦 Core contract 当时均通过。SEL-02 完成后，两个 Pilot 的 semantic/native
分别输出到 `/private/tmp/gss-attribute-selector-pilot-closeout/current` 与 `native`，四次 build 均通过。
最终根 `pnpm verify` 通过 19 files / 213 tests；Vite full visual 为
40 runs / 176 cases / 596 comparisons / 0 differences，Rsbuild full visual 为
8 runs / 148 cases / 360 comparisons / 0 differences，均为 `passed=true`。详细 adapter 门禁见前述
SEL-02 验收文档。
