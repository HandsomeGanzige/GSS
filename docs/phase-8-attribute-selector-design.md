# Phase 8 SEL-02 Attribute Selector 设计

## 文档定位

本文档固定 SEL-02 已确认并实现的产品边界。Core 是 selector grammar、identity、renderer 与
same-class cascade guard 的唯一事实来源；Vite、Rsbuild、Analyzer 和 Devtools 只消费 Core 输出，
不得复制或放宽这些判断。

对应实现契约见 [Core 包设计决策](../packages/core/CORE_DESIGN.md)，验收命令与阶段证据见
[SEL-02 验收](phase-8-attribute-selector-acceptance.md)。

## 支持 grammar

eligible attribute selector 必须同时满足：

- 单一 selector arm，恰好一个非 global local class anchor；
- 恰好一个无 namespace attribute node，与 local class 位于同一 compound；
- operator 只能是 presence（无 operator/value）或 `=` exact equality；
- equality value 由 `postcss-selector-parser` 正常解析，可为 quoted、unquoted 或 escaped spelling；
- attribute 可位于 local class 前或后；
- 不含 flag、pseudo、tag、id、combinator、额外 class、额外 attribute、selector list 或 `:global`。

```css
.card[data-state] {}
.card[data-state=open] {}
.card[data-state='open'] {}
.card[data-state="open"] {}
[data-state].card {}
[data-state='open'].card {}
```

原 selector 与 guarded atomic selector 都由一个 class 和一个 attribute 组成，specificity 均为
`(0,2,0)`。Core 只替换唯一 local class node；semantic scoped class 始终保留在 CSS Modules
export 和 DOM token 中。

## 明确保守的边界

以下结构继续输出 scoped fallback，并使用可追踪 diagnostic/report：

- parser 解码后的 attribute name 按 ASCII case-insensitive 比较等于 `class` 的所有 `[class...]`；
- `~=`, `|=`, `^=`, `$=`, `*=` 等其他 operator；
- `i` / `s` flag、namespace、多 attribute；
- attribute 与 pseudo、tag、id、额外 class、combinator、selector list 或 `:global` 的组合；
- 缺失或不可 export 的 local anchor，以及其他既有 unsafe evidence。

纯 grammar 不受支持使用 `attribute-selector`。near-miss 保留更具体的既有 primary reason，例如
带 combinator 的 selector 使用 `descendant-selector`，selector list 使用 `selector-list`。
同一 class 另有 unsafe、nested 或 unsupported block evidence 时，class-wide preservation 不得因
其中一个 attribute candidate eligible 而解除。

`[class...]` 被整体排除，因为 GSS 会向 DOM `class` attribute 追加 atomic token，attribute 匹配
真假可能因此改变。首批不为 `[class]` presence 建立例外；未来若支持，必须先设计 DOM class
mutation 模型并重新完成等价性验收。

## Identity 与 renderer

```txt
.card[data-state='open']
→ .__GSS_ANCHOR__[data-state='open']
→ .<atomic-class>[data-state='open']
```

attribute name、operator、value、quote、escape、spacing 和 node order 采用 Core 实际收到的 selector
AST serializer 结果，不做语义 canonicalization：

- `.class[attr]` 与 `[attr].class` 保留不同 identity；
- 单引号、双引号、unquoted 与 escaped spelling 可以产生不同 identity 和 atomic class；
- identity 不承诺还原 preprocessor authored bytes，只保证 Core 输入到输出的 selector 语义等价；
- renderer 每次从 AST clone 生成结果，不共享 mutation。

`AtomicSelectorDescriptor { identity, css }`、atomic key 和 manifest/report schema 不新增 version、
alias、dual-write 或 compatibility reader。adapter 不重新拼接 attribute，也不统一不同构建工具
最终 minifier 的安全 spelling。

## Same-class cascade guard

attribute candidate 与受支持 pseudo 都是 `(0,2,0)`，两个 attribute 也可能同时匹配。global
atomic registry 按 key 首次注册并复用，可能把原始 `A → B → A` occurrence 折叠成 `A → B`，
从而改变等 specificity declaration 的 winner。单条 selector rewrite 等价不能独自证明全局
cascade 等价。

Core 必须在第一次 `registry.register` 前，按 source class 收集 attribute/pseudo guard、
parser-decoded attribute condition、declaration/importance、media/supports context 和原始 occurrence
order。检查只覆盖 same source class 且至少一侧为 attribute candidate 的关系，以及单条 attribute
rule 内部的 competing occurrence；不改变 pseudo-only 策略，不推断跨 class/module DOM 共现。

guard 可能共现时：

- importance 不同、同 property 同 value 或已知互不竞争的 property，可放行；
- same property 不同 value、shorthand/longhand、重复 property、未知 property 关系或其他无法证明安全的
  occurrence 必须 fallback；
- media/supports 不作为互斥证明。

首批唯一 attribute 互斥证明为：parser-decoded exact name 完全相同、name 以 lowercase `data-`
开头、两侧均为无 flag exact equality，且 decoded value 不同。attribute name 不做 case-fold；
presence、不同 name、attribute/pseudo，以及 decoded condition 相同但 quote/escape spelling 不同的
guard 均按可能共现处理。

若 preflight 无法证明安全，Core 输出 `attribute-cascade-order`，并在 registry 零部分注册状态下
整类 fallback。该 reason 只标记被 guard 阻塞的 attribute candidate；同 class 其他 eligible rule
只跟随 class-wide preservation，不伪造额外 unsafe reason。

## 跨包职责与非目标

- `packages/core`：唯一实现 grammar、AST clone renderer、guard overlap、declaration competition 与
  registry mutation 前 preflight。
- `packages/analyzer`：聚合现有 report；没有 usage evidence 时不猜测不同 selector identity 的共现。
- `packages/devtools`：透传并展示 diagnostic/report，不转换 CSS。
- `packages/vite`、`packages/rsbuild`：复用原生 CSS Modules 结果，追加 Core tokens、渲染 descriptor
  CSS 并保持 fallback/HMR/asset 语义，不复制 grammar 或 guard。

SEL-02 不引入 JSX/TSX usage evidence、公共 schema/version compatibility、adapter-specific grammar、
普通 CSS 转换或 semantic class 移除模式。扩展 `[class...]`、其他 operator、flag、namespace、
多 attribute 或 attribute+pseudo 前，必须新增独立设计决策与成功/保守路径测试；若要求通用 DOM
usage、通用 specificity/attribute overlap solver、Core 反向依赖 adapter，或无法在 registry mutation
前完成判断，应停止扩展并保持 fallback。
