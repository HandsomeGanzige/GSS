# Phase 8 关系选择器 Marker-Pair 方案调研

## 文档状态

- 状态：研究结论，未授权 production rewrite
- 日期：2026-08-18
- 研究问题：能否把 `.a .b { color: red }` 拆成父元素 marker 与子元素 atomic token，并在浏览器中恢复原关系语义
- 边界：本文不修改 Core、adapter、manifest/report schema 或正式产物

## 结论摘要

1. **浏览器不能把父、子元素上的两个 class token 自动拼成第三个 class token。**
   `father_son` 与 `_color_red` 只是两个不透明标识符；Selectors 的匹配模型没有 token concatenation 操作。
   `father_son_color_red` 若要作为 class selector 命中，就必须真的出现在被匹配元素的 `class` 属性中。
2. **`.father_son ._color_red { color: red }` 是可工作的 CSS。**它不是“运行时拼接”，而是浏览器按
   descendant combinator 实时检查父子关系。JS 动态增删 class 或移动 DOM 时，浏览器会重新匹配，构建产物
   不需要自己持续判断结构。
3. **对当前 GSS，新增 father marker 通常是冗余的。**CSS Modules 已经把 `.a` 解析成父元素上的唯一
   semantic scoped class；它可以直接充当 marker：`.scoped_a .u_relation_red`。这正是 `FOUND-04`
   已评估过的安全 baseline。
4. **父 marker + 全局通用 declaration token 并不普遍安全。**多个关系共享 `_color_red` 时会产生未授权的
   关系笛卡尔积。marker 名字即使编码了 `father`、`son`、property 和 value，浏览器也不会理解名字内部的语义。
5. **真正可能有新收益的 marker 变体，是把它当作长 scoped ancestor class 的短别名。**它不承载关系语义，
   只压缩生成 CSS 中反复出现的长 guard；semantic class 仍保留，target token 仍需关系安全。该变体是否获利
   取决于同一 guard 的复用次数，必须在 compact atomic class 新基线上重新测量。
6. 若继续设计，应该把 **marker alias、atomic declaration、selector occurrence** 分开建模；不要把无 declaration
   的 marker 塞进当前 `atomicClassNames`。

## 1. 浏览器实际能识别什么

[Selectors Level 4](https://www.w3.org/TR/selectors-4/#structure) 把 class selector 定义为元素必须属于指定
class，把 complex selector 定义为若干 compound selectors 通过 combinator 表达的元素关系；
[descendant combinator](https://www.w3.org/TR/selectors-4/#descendant-combinators) `A B` 表示匹配某个 `A`
祖先下的 `B` 元素。

因此下面的 DOM 与 CSS 可以直接工作：

```html
<div class="father_son">
  <span class="_color_red"></span>
</div>
```

```css
.father_son ._color_red {
  color: red;
}
```

浏览器做的是：

1. 目标元素是否真实包含 `_color_red` token；
2. 它是否有一个真实包含 `father_son` token 的祖先；
3. 两个元素是否满足空格 combinator 表示的后代关系。

浏览器不会由这两个 token 合成：

```text
father_son + _color_red -> father_son_color_red
```

也不会因为 class 名的字符串前后缀看起来相关，就赋予它们额外语义。Selectors 4 的
[class selector](https://www.w3.org/TR/selectors-4/#class-html) 是对独立 class 标识符的匹配，规范中的
selector 匹配过程也没有跨元素字符串拼接步骤。

若一定要让 `.father_son_color_red` 自身命中，只有三类办法：

- 构建期把完整 token 无条件追加给某个 CSS Modules export；这会丢失使用点关系，不能证明它只在目标父级下出现；
- JSX/模板编译器根据一个可证明的封闭使用点，给目标元素追加完整 token；这是新的 framework compiler 边界；
- 浏览器 runtime 观察 DOM 并增删完整 token；它会带来 SSR/hydration、FOUC、MutationObserver、HMR 和时序成本。

其中后两种都不属于当前纯 CSS/Core + adapter 模型；runtime 方案也没有必要，因为原生关系 selector 已经能让
浏览器实时匹配。

## 2. 四种候选形态

以下例子都假设 `.a`、`.b` 最终会由 CSS Modules 解析为 scoped class。

### 2.1 保留 semantic guard：当前安全 baseline

```css
/* source */
.a .b { color: red; }

/* candidate */
.scoped_a .u_a_b_color_red { color: red; }
```

class mapping 只需给 `b` 追加 `.u_a_b_color_red`；父元素上已有 `.scoped_a`，无需新 marker。token identity
包含 guard/关系 occurrence，避免与别的 descendant 关系错误共享。

这与 [`FOUND-04`](phase-8-multi-local-selector-foundation-evaluation.md) 的安全模型一致。该实验的 no-go
原因不是语义不可实现，而是当时 descendant policy 在两个 Pilot 中都造成约 `+1.17 KB` estimated total delta；
详见 [原始复算表](phase-8-multi-local-selector-foundation-evaluation.md#原始复算口径)。旧数据是在 compact atomic
class 当前改动之前产生的，只能说明旧编码方案未过门槛，不能替代新基线复算。

### 2.2 新父 marker + 关系专用子 token：可行但通常被 baseline 支配

```css
.m_a .u_a_b_color_red { color: red; }
```

mapping：

```text
a -> scoped_a m_a
b -> scoped_b u_a_b_color_red
```

它与 2.1 的命中语义相同，`.m_a` 与 `.scoped_a` 同时随 `styles.a` 进入 DOM。但是当前产品仍要求保留
semantic scoped class，所以它比 2.1 多付出了父 export 的 marker token。除非 `.m_a` 足够短、且在很多生成
selector 中反复替代一个很长的 `.scoped_a`，否则不会形成收益。

### 2.3 关系父 marker + 通用 declaration token：一般不安全

```css
.m_a_b .u_color_red { color: red; }
```

表面上把“关系”和“声明”拆开了，但只要 `.u_color_red` 被多个 target class 共享，就可能错误命中。

反例：

```css
.a .b { color: red; }
.c .d { color: red; }
```

若输出：

```css
.m_ab .u_red,
.m_cd .u_red { color: red; }
```

且 mapping 为：

```text
a -> scoped_a m_ab
b -> scoped_b u_red
c -> scoped_c m_cd
d -> scoped_d u_red
```

那么下面未被 source CSS 授权的 `.a .d` 也会变红：

```html
<div class="scoped_a m_ab">
  <span class="scoped_d u_red"></span>
</div>
```

`m_ab` 的名字中即使含有 `a_b`，浏览器也不会据此要求 target 必须是 `b`。从 CSS 匹配角度看，它只看见
`.m_ab` 祖先和 `.u_red` 后代。

### 2.4 父、子双关系 marker：正确但不再是 declaration 原子复用

```css
.m_ab_parent .m_ab_target { color: red; }
```

mapping：

```text
a -> scoped_a m_ab_parent
b -> scoped_b m_ab_target
```

该形态能够阻止 2.3 的交叉命中，并保持两个 class selector 的 specificity。但每条关系至少产生一对子 token；
若每个 declaration 再生成不同 pair，父、子 export 都会迅速增长。若一对 marker 复用整个 source rule 的多个
declaration，则输出实际上接近把原 `.scoped_a .scoped_b` 换了短名字，而不是按 declaration 原子化。

在必须保留 semantic class 的前提下，直接保留或按 declaration 聚合原 scoped selector，通常比额外注入一对
marker 更简单：

```css
.scoped_a .scoped_b,
.scoped_c .scoped_d { color: red; }
```

这个方向本质是 declaration factoring / selector-list grouping，不是 class atomization。

## 3. 通用 token 的安全条件：关系图不能被扩成笛卡尔积

对同一个 `(declaration, @media/@supports context, combinator, selector state)` 建立二部图：

- 左侧 `L`：父/guard class；
- 右侧 `R`：target class；
- 边集 `E`：source CSS 明确授权的关系。

当多个父 marker 与多个 target 共享一个 child token 时，生成 selector 实际可能覆盖 `L x R`。只有满足：

```text
L x R ⊆ E
```

才能避免未授权交叉命中。寻找体积最优的 marker/token 分组，本质接近一个带权 biclique cover 问题：权重同时包括
CSS selector bytes、父/子 export string、manifest/report 元数据和压缩后体积。

第一轮实验不应直接做全局最优化，可以只研究两个易证明子集：

1. **singleton target**：一个 child token 只注入一个 target source class，可由多个已授权父关系共享；
2. **identical neighbor set**：只有父邻接集合完全相同的多个 target 才共享 child token。

另一种阻止交叉的方法，是在 target compound 中保留 semantic target guard：

```css
.m_a :where(.scoped_b).u_red { color: red; }
```

`:where(.scoped_b)` 能约束目标身份且不增加 specificity，`.m_a` + `.u_red` 仍是 `(0,2,0)`。但该 selector 更长，
而且 `_u_red` 对已知 `.scoped_b` 常常是冗余条件；最终仍需要与直接 declaration grouping 比较，不应假设有收益。

## 4. Specificity、级联与动态关系

`.a .b` 含两个 class selectors，specificity 为 `(0,2,0)`；`.m_a .u_x` 同样是 `(0,2,0)`。
[Selectors 4 的 specificity 规则](https://www.w3.org/TR/selectors-4/#specificity-rules) 明确 class selector 计入
`B` 分量。只保留 `._color_red` 会降为 `(0,1,0)`；在 target 上再叠加多个普通 marker，又可能升到 `(0,3,0)`。

除了 specificity，还必须保留：

- `!important`；
- 最终 stylesheet 的 order of appearance；
- 同属性重复声明；
- shorthand/longhand 覆盖；
- selector list 的逐 arm specificity；
- `@media`、`@supports` 上下文；
- descendant、child、adjacent、subsequent-sibling combinator 的方向和范围。

[CSS Cascade 规范](https://www.w3.org/TR/css-cascade-6/#cascade-sort) 将 origin/importance、layer、specificity、
scope proximity 和 order of appearance 都列入优先级计算。因此仅保证 selector 能命中，还不足以证明转换等价。
GSS 当前 registry 又以首次注册顺序输出、且不支持失效；关系 occurrence 必须继续在第一次 registry mutation 之前
完成 class-wide/cascade preflight。

动态 class 并不是额外障碍。例如：

```css
.m_a .u_red { color: red; }
.m_c .u_blue { color: blue; }
```

当 JS 切换祖先上的 `styles.a` / `styles.c`，只要 mapping 同步携带 `m_a` / `m_c`，浏览器会依据当前 DOM
重新匹配。构建器不需要实时知道当前结构。只有“动态合成第三个完整 token”方案才需要 runtime。

## 5. Tailwind 和 StyleX 的对应关系

### Tailwind CSS

Tailwind 的官方文档要求作者在父元素显式添加 `group`，在目标元素显式添加 `group-*` utility；嵌套 group 可用
`group/{name}` 区分。它的 [variant quick reference](https://tailwindcss.com/docs/hover-focus-and-other-states#appendix)
把 `group-[...]` 表达为 `&:is(:where(.group)... *)`，`peer-[...]` 表达为
`&:is(:where(.peer)... ~ *)`。这说明它仍生成并依赖关系 selector，没有把两个 DOM token 拼成第三个 token。

其安全性与成本模型和 GSS 有一个关键差异：Tailwind 的 marker 与关系 utility 由作者在具体 markup 使用点显式选择；
GSS 当前只能增强整个 CSS Modules export。一个 `styles.b` 在所有使用点都会得到相同追加 token，粒度更粗。

### StyleX

截至 2026-08-18，StyleX 官方已经提供 `stylex.when.*` marker API。其
[encapsulation 原则](https://stylexjs.com/docs/learn/thinking-in-stylex/#encapsulation) 明确用类似
`.marked:hover .btn` 的 selector 替代没有 target class 的“远距离样式”；target 必须显式持有自己的 atomic class。
[stylex.when.* API](https://stylexjs.com/docs/api/javascript/when/) 要求被观察的祖先、后代或兄弟元素应用
`stylex.defaultMarker()`，并允许 `stylex.defineMarker()` 建立相互独立的 marker。

它与用户提出的 `.father ._color_red` 在结构上同构：

```text
被观察元素 marker + combinator/state + 目标 atomic class
```

但 StyleX 仍不能直接证明 GSS 自动转换是安全的，因为：

- StyleX 在 JSX/JS authoring point 显式放 marker 和目标 style；GSS 的 CSS Modules mapping 没有 usage-site DOM 证据；
- StyleX 为 `ancestor`、`descendant`、不同 sibling 条件定义了自己的 priority ranking；GSS 必须保留输入 CSS 原有级联，
  不能直接采用另一套排序；
- GSS 默认保留 source semantic class，父 `.a` 已经天然提供一个可观察 marker，StyleX 的 authoring model 则需要显式 marker API。

[`phase-8-multi-local-selector-research.md`](phase-8-multi-local-selector-research.md) 原先“StyleX 不允许该类
marker 关系样式”的段落反映的是此前官方能力；本次调研发现当前官方文档已经新增 `stylex.when.*`，旧文档已同步
修正并链接到本文，避免两个研究入口给出互相矛盾的现状描述。

## 6. CSS Modules 能承载 marker，但不提供关系证据

[CSS Modules 官方说明](https://github.com/css-modules/css-modules) 将 JS 产物定义为 local name 到 global name
的 mapping；[ICSS `:export`](https://github.com/css-modules/icss#export) 的值本质是可包含空格的导出字符串；
[CSS Modules composition](https://github.com/css-modules/css-modules/blob/master/docs/composition.md) 也说明一个 local
class 可以导出多个 class names。

所以 adapter 在机制上可以生成：

```js
styles.a = 'scoped_a m_a'
styles.b = 'scoped_b u_x'
```

但该 mapping 只证明 token 会随 local class 一起出现，不告诉 GSS：

- 某次 `styles.b` 使用是否位于某次 `styles.a` 下；
- React component、slot、portal、`children` 或命令式 DOM 最终形成什么树；
- 哪些关系在运行时同时存在。

此外 `composes` 可能让同一个 marker 传播到多个 export，增加下面 break-even 公式中的 export 成本；adapter 当前对
ambiguous export value 的保守证据也不能因为引入 marker 而绕开。

## 7. 真正值得实验的变体：父 scoped class 的短 alias

父 marker 不一定要表达 `father + son + property + value`。更有潜力的定义是：

```text
markerAlias(resolved ancestor class) = 一个 bundle 内稳定、无碰撞的短 class
```

例如：

```css
/* baseline */
.ButtonPanel_module__container__8f21a .a3 { color: red; }
.ButtonPanel_module__container__8f21a .b7 { opacity: .6; }
.ButtonPanel_module__container__8f21a .c2 { margin: 0; }

/* alias candidate */
.m0 .a3 { color: red; }
.m0 .b7 { opacity: .6; }
.m0 .c2 { margin: 0; }
```

父 export 变为：

```text
ButtonPanel_module__container__8f21a m0
```

semantic scoped class 仍保留；`m0` 只是在 GSS 生成的 contextual selectors 中替代长 guard。target atomic token
仍必须是 guard/关系安全的，不能因为用了 alias 就无条件退化成跨 target 共享的 `_color_red`。

### 粗略 raw break-even

定义：

- `g`：原 resolved guard class 在 selector 中的字节长度；
- `m`：短 marker alias 的字节长度；
- `n`：同一个 guard 在生成 contextual selector 中出现的次数；
- `e`：需要追加 marker 的序列化 CSS Modules export string 数量，包含 compose/alias 传播；
- `h`：marker registry、manifest/report、分隔符和 collision metadata 的额外字节。

忽略双方相同的 `.`、空格和 target selector，raw 近似净收益为：

```text
gain_raw ≈ n * (g - m) - e * (m + 1) - h
```

只有 `gain_raw > 0` 才值得进入后续验证。这个公式仍偏乐观：

- gzip/brotli 很擅长压缩重复长 guard，实际压缩收益会小于 raw；
- SSR/HTML 中每个父元素实例都会多一个 marker，构建产物的静态 token 统计未必覆盖运行时传输成本；
- 多 chunk、HMR state 和 manifest 可能重复携带 alias metadata；
- 若 `g` 已被 CSS Modules 配置压得很短，alias 很难回本。

因此 marker alias 适合设置按 class 的收益门槛：只有同一个长 guard 被足够多的 contextual occurrence 引用时生成，
而不是对每条关系一律生成。

对当前 Vite Pilot 已有 `semantic-atomic.css` 做只读方向估算：7 条双 local descendant/child rule 共包含
12 个 declaration occurrence、6 个唯一 ancestor guard。假设每个 contextual declaration 都重复一次 guard，且
marker 固定为 7 字符，则短 alias 相对 semantic-guard baseline 可少写约 `370 B` selector guard；再按每个父 export
追加一次 `7 字符 + 空格` 粗扣 `48 B`，得到约 `322 B raw` 的理论改善。该数字未计 target token、manifest/report、
compose/chunk 重复或 gzip/brotli，只能说明 `P2` 可能优于 `P1`，不能证明它已经优于 preserved fallback。

## 8. 对现有 Core seam 的影响

当前 `TransformClassMapping.atomicClassNames` 中的每个 class 都应能反查到一条 atomic declaration；Vite 与 Rsbuild
adapter 也只遍历这个数组追加 token。marker alias 没有 `prop/value/important`，不应伪装成 atomic declaration。

若实验通过，内部至少应区分：

```ts
type MarkerAlias = {
  className: string;
  sourceClassName: string;
  resolvedClassName: string;
};

type AtomicDefinition = {
  className: string;
  declaration: DeclarationMeta;
  context: CssTransformContext;
};

type SelectorOccurrence = {
  markerOrSemanticGuard: string;
  targetClassName: string;
  combinator: ' ' | '>' | '+' | '~';
  sourceOrder: number;
};
```

公开 mapping 可以新增独立的 `markerClassNames`，或把注入 token 改为带 role 的判别联合；不应直接把 marker 混入
`atomicClassNames`，否则 manifest、report、devtools 和 analyzer 会误认为它对应可统计的 declaration。

同时需要：

- 独立、确定性的 marker collision registry；
- marker alias 与 atomic definition 分离的 manifest 反查；
- HMR 时 stale marker 的清理；
- Vite/Rsbuild 对 compose/同值 export 的一致传播；
- selector occurrence 与 declaration identity 分离，才可能做安全 selector-list grouping；
- 保持 adapter 不复制 selector grammar，由 Core 输出完整 selector descriptor。

这是一处公共 schema/registry seam 变化，不属于简单增加 selector grammar，实施前仍需 owner 确认。

## 9. 建议实验

建议新建一次无 production mutation 的 shadow experiment，先验证编码模型，不直接开放 multi-local selector。

### 9.1 对照方案

| 方案 | 输出核心 | 目的 |
| --- | --- | --- |
| `P0` scoped fallback | `.scoped_a .scoped_b { ... }` | 当前正确性和体积基线 |
| `P1` semantic guard | `.scoped_a .u_relation { declaration }` | 重放 `FOUND-04` 安全 baseline |
| `P2` short guard alias | `.m_a .u_relation { declaration }` | 验证长 guard 字典压缩是否回本 |
| `P3` generic utility | `.m_relation .u_declaration` | 只作交叉误命中反例，不作为候选 |
| `P4` exact graph grouping | singleton-target / identical-neighbor-set | 验证有限共享是否安全且有收益 |
| `P5` declaration grouping | 原 semantic selector arms 聚合为 selector list | 判断收益是否其实来自 factoring 而非 token |

### 9.2 必测语料

1. 单一 `.a .b`，包含一个和多个 declarations；
2. `.a .b` 与 `.c .d` 共享相同 declaration，专门捕获错误笛卡尔积；
3. `.a .b` 与 `.c .b`，共享 target；
4. `.a .b` 与 `.a .d`，共享 ancestor；
5. nested 同 marker、不同 marker 以及同时命中多个 guard；
6. descendant 与 child 分开评估；首轮不混入 sibling、tag、compound；
7. JS 动态切换 ancestor class、移动 target 节点；
8. 同 specificity 的 `A -> B -> A`、重复属性和 shorthand/longhand；
9. `!important`、`@media`、`@supports`；
10. CSS Modules `composes`、同值 exports、HMR 删除/重命名 relation。

### 9.3 指标与门禁

同时记录：

- preserved CSS、atomic CSS、selector bytes、export class-string、manifest/report metadata 的 raw bytes；
- gzip 与 brotli；
- 最大单 export token 数、父 marker 数、target relation token 数；
- marker alias 每个 class 的 `n/g/m/e/h` 与估算/实际偏差；
- Vite/Rsbuild 两端的 computed-style/visual 对比；
- 动态状态矩阵中的任何误命中或漏命中。

建议门禁：

1. `P3` 反例必须稳定证明测试可以捕获 cross-product；
2. `P1/P2/P4/P5` 必须与 `P0` computed style 完全一致；
3. 两个 Pilot 的 raw 与压缩 total delta 都不得恶化；
4. alias 必须在 deterministic replay、chunk 顺序变化和 HMR 后保持稳定；
5. 未证明安全的关系整条 fallback，不允许用更高 atomization rate 抵消 correctness 风险。

## 10. 建议决策

用户提出的思想应拆成两个判断：

- **作为关系表达模型：成立。**`.marker .atomic` 正是浏览器、Tailwind 和当前 StyleX 都能使用的模式；动态 DOM
  由浏览器重新匹配。
- **作为当前 GSS 的新压缩算法：尚未成立。**已有 semantic scoped ancestor 本身就是 marker，新增关系 marker
  容易重复；generic child token 又有笛卡尔积风险。

因此不建议实现 `father_son_color_red` 字符串拼接，也不建议让父 marker 同时编码 son/property/value。优先级应为：

1. 在 compact class 新基线上复算 `P1`；
2. 做 `P2` 长 guard 短 alias 的 counterfactual；
3. 做 `P5` declaration grouping 对照；
4. 只有前三者显示稳定净收益，再研究 `P4` 的有限关系图 grouping；
5. 未达到门禁则维持 scoped fallback，不扩大 production selector 范围。
