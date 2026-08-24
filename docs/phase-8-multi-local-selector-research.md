# Phase 8 多 Local 关系选择器原子化调研

## 文档状态

- 状态：调研讨论稿
- 日期：2026-07-30
- 目的：区分 DOM usage 推断、关系选择器语义保留和 declaration atomization，并与 Tailwind CSS 的处理方式对照
- 边界：本文不恢复 `FOUND-04` 原型，不授权 production rewrite，不修改现有公共 API 或产物

## 结论摘要

1. `.a .b` 可以在不推断 DOM 结构的前提下做“带语义 guard 的 declaration atomization”：只给最右侧目标 class 追加 atomic token，但在生成 CSS 中保留祖先条件。
2. `FOUND-04` shadow 原型已经评估过这个模型，不是只把 selector 换个名字。当时的 no-go 是当前语料和编码方案的净体积为负，不是证明关系选择器无法原子化。
3. CSS Modules export mapping 只提供 `local name -> class string`，不提供 JSX 使用点、元素身份或运行时 DOM 关系。想让同一个 `styles.b` 在不同使用点获得不同 token，必须新增 JSX/TSX transform 或 runtime 协议。
4. Tailwind CSS 不推断 DOM 结构。它让作者显式写出 `group-*`、`peer-*`、`in-*` 或 arbitrary variant，然后生成仍带关系条件的 CSS selector；运行时状态由浏览器重新匹配。
5. 下一轮目标应改为“在不删除运行时 guard 的前提下，降低 contextual atomization 的编码成本”，而不是先试图证明最终 DOM 拓扑。

## `FOUND-04` 实际评估了什么

原型 contract 已经规定：对 `.card .button` 选择最右侧 `.button` 作为 injection anchor，保留 `.card` 作为 semantic guard，并生成类似：

```css
.resolved_card ._atomic_color_red {
  color: red;
}
```

CSS Modules mapping 只给 `button` 追加 `._atomic_color_red`，`card` 仍使用原生 scoped class。因此它做的是 declaration atomization，而不是把 `.card .button` 整体换成另一个语义 class。原型 contract、门禁和回滚结论已收口到 [FOUND-04 评估](phase-8-multi-local-selector-foundation-evaluation.md)。

它的主要成本是：

- 一个多 declaration rule 会拆成多个 contextual atomic selector。
- 目标 class 的 export string 需要携带所有可能的 contextual token，不论某个 JSX 使用点当前是否位于对应祖先下。
- guard 必须进入 selector identity，否则会把不同运行时条件错误合并。这会降低跨 selector 的 class 复用率。
- 当多个 guard 可同时命中时，仍必须保留 specificity、source order、`!important` 和 shorthand/longhand 语义。

当时 descendant policy 在两个 Pilot 中都释放了 50 个 preserved declaration occurrence，但 atomic CSS 增加约 1.3 KB、class string 增加约 1.76 KB，抵消 preserved CSS 减少后仍恶化约 1.17 KB。这是“当前 contextual-token 编码不划算”的证据。

## 动态 `.a` / `.c` 不需要构建器实时判断

对于：

```css
.a .b { color: red; }
.c .b { color: blue; }
```

安全的 contextual output 可以是：

```css
.scoped_a .atomic_red { color: red; }
.scoped_c .atomic_blue { color: blue; }
```

`styles.b` 同时携带 `atomic_red` 和 `atomic_blue`。JS 切换祖先上的 `styles.a` / `styles.c` 时，浏览器会根据当前 DOM 重新匹配两个 selector。如果两者同时命中，生成器必须保持原 rule 的级联顺序。

不安全的是把 guard 删掉：

```css
.atomic_red { color: red; }
.atomic_blue { color: blue; }
```

这会把 specificity 从两个 class selector 降为一个，而且两个 declaration 会无条件生效。构建期 DOM 推断即使对某个当前 JSX 快照成立，也不能代表运行时状态。CSS selector 本来就是由浏览器针对当前元素树匹配的条件，见 [Selectors Level 4](https://www.w3.org/TR/selectors-4/)。

## CSS Modules 能知道什么

[CSS Modules 官方说明](https://github.com/css-modules/css-modules) 定义的 JS 产物是 local name 到 global/scoped name 的 mapping。它可以证明 `styles.b` 有一个可导出 class string，但不包含：

- `styles.b` 最终放在哪个 DOM 元素上。
- 该元素的祖先、子元素或兄弟是谁。
- class 是否经过 `clsx` / props / spread / `composes` / re-export 传递。
- React component、`children`、slot、portal 或命令式 DOM API 最终产生的树。
- 运行时条件、异步数据、hydration 后 mutation 或用户交互。

额外的 JSX AST 分析可以识别局部、静态、同一 render 内的某些关系，但这是 usage evidence，不是 CSS Modules mapping 自带的语义。更重要的是，现有 mapping 中的 `styles.b` 只有一个固定字符串；若要按使用点注入不同 token，必须改写 JSX/TSX 或引入 runtime。

## Tailwind CSS 如何处理

Tailwind 的 source detection 将源文件当作普通文本扫描，不尝试解析 JSX/TSX 语义；动态拼接的 class 不能被识别，官方要求将所有候选 class 以完整字符串出现，见 [Detecting classes in source files](https://tailwindcss.com/docs/detecting-classes-in-source-files)。

对关系和状态，Tailwind 让作者在 markup 中显式提供 marker 和目标 utility：

```html
<div class="group">
  <span class="group-hover:text-white"></span>
</div>
```

它生成的 CSS 仍包含 `.group` 的祖先/状态条件。`peer-*` 生成兄弟关系，`in-*` 响应祖先，arbitrary variant 允许直接描述关系 selector。官方文档和实现都表明，这些 variant 是 selector rewrite，不是 DOM 推断：

- [Hover, focus, and other states](https://tailwindcss.com/docs/hover-focus-and-other-states)
- [Tailwind `group` / `peer` variant 实现](https://github.com/tailwindlabs/tailwindcss/blob/main/packages/tailwindcss/src/variants.ts)

对 GSS 而言，CSS Modules 的 scoped `.a` 可以天然扮演 Tailwind `group` marker，`.b` 上追加的 contextual atomic token 类似 `group-*` utility。两者的关键差异是：Tailwind 的作者显式选择每个 usage-site utility，GSS 当前则把该 local class 的所有 token 汇总到同一 export string。

## 可行路线对比

| 路线 | 运行时正确性 | 复用/体积潜力 | 产品成本 | 建议 |
| --- | --- | --- | --- | --- |
| 保留 guard 的 contextual atomic token | 可保证，前提是保持 specificity 与 occurrence order | 当前 Pilot 为负 | 主要在 Core/cascade 模型 | 作为安全 baseline |
| 删除 guard，依赖构建期 DOM 推断 | 不可一般保证 | 理论 class/CSS 更少 | 需要全程序证明 | 不进默认主线 |
| usage analysis 只做 report/shadow | 不改产物 | 可估算按使用点剪枝的上限 | 需 JSX 分析，但无运行时风险 | 适合下一次研究 |
| 受限 JSX usage-site transform | 只能对可证明的封闭子集保证 | 可减少无关 token | 新 framework/compiler 产品线 | 先看 shadow 收益再决定 |
| runtime DOM 检测/注入 | 可观察当前树，但有 SSR/HMR/FOUC 问题 | 可精确注入 | 运行时复杂度高 | 不建议 |
| 按 declaration 聚合 selector list | 需要新的级联顺序证明 | 可避免共享 token 导致的错误笛卡尔积 | 需分离 declaration identity 与 selector occurrence | 值得做小型 counterfactual |

## 建议的下一轮问题

不直接重开 `SEL-06`，先新建一个无 production mutation 的小型评估，回答：

> 在保留完整运行时 selector guard 的前提下，是否能通过 declaration grouping、更细的净收益门槛或 usage-site 上限分析，使真实 corpus 中的关系选择器取得稳定的净体积收益？

建议分三个互不混合的 counterfactual：

1. **Contextual baseline**：重放 `FOUND-04` 的安全模型，但只作为对照组。
2. **Declaration grouping**：相同 declaration 使用不同的 guard/target selector arm 聚合为一个 CSS rule，不共用会造成交叉误命中的目标 token；只对 occurrence order 可证明的子集计数。
3. **Usage upper bound**：扫描静态 JSX 直接使用，只计算“如果允许 per-usage injection，最多能节省多少 class-string”，不改写 JSX，不把未解析使用当成不存在。

只有 usage upper bound 显著优于 contextual baseline，才值得向 owner 提议新的 opt-in JSX transform 产品边界。否则应继续保持 fallback，不为扩大 atomization rate 引入全程序或 runtime 复杂度。

## StyleX 对关系样式的处理

截至 2026-08-18，StyleX 已提供 [`stylex.when.*`](https://stylexjs.com/docs/api/javascript/when/)
关系条件和 `stylex.defaultMarker()` / `stylex.defineMarker()` marker。它要求作者在被观察元素上显式应用 marker，
并在目标元素自己的 atomic style 中声明 ancestor、descendant 或 sibling 条件；编译结果仍依赖真实关系 selector，
不是从两个 class 名自动拼出第三个 token。该模型与 Tailwind `group` 类似，但由 StyleX 的 JSX/JS authoring point
显式提供关系证据。

StyleX 仍不把任意现有 `.a .b` CSS 自动推导成 marker pair。其
[encapsulation 原则](https://stylexjs.com/docs/learn/thinking-in-stylex/#encapsulation)要求 target 持有自己的
atomic class，并通过 marker 表达受控的“远距离样式”。这与 GSS 只拿到 CSS Modules 全局 export mapping 的情况不同：
GSS 不知道某个 `styles.b` 的具体 JSX 使用点，因此不能照搬 StyleX 的 authoring-time 证据。

对于适合继承表达的父状态，StyleX 也提供 CSS custom property 方案：

父元素的 CSS 状态影响后代时，官方推荐使用可继承的 CSS custom property：

```tsx
const vars = stylex.defineVars({ childColor: 'black' });

const styles = stylex.create({
  parent: {
    [vars.childColor]: {
      default: 'black',
      ':hover': 'blue',
    },
  },
  child: {
    color: vars.childColor,
  },
});
```

编译后的概念模型是：父元素的 atomic class 在默认态/`:hover` 下设置变量，子元素的 atomic class 使用 `color: var(...)`。父子之间没有生成 descendant selector，关系由 CSS 变量继承表达；子组件仍必须显式选择消费该变量。

当条件来自 props、state 或组件 context 时，也可以让目标组件读取条件，并在自己的
`stylex.props(...)` 中选择 atomic style。官方把 React Context 明确列为 descendant selector 的替代方案，见
[Context-driven styles](https://stylexjs.com/docs/learn/recipes/context-driven-styles)。
[Using styles](https://stylexjs.com/docs/learn/styling-ui/using-styles)
说明 `stylex.props` 会在元素使用点合并、条件应用 atomic styles，后传入的 style 优先。

StyleX 仍支持作用于当前元素的 pseudo-class、pseudo-element 和 media query，这些条件与 declaration 一起静态编译；
它们不等于允许任意 `.a .b`、`.a > .b` 或 sibling selector。相关约束与语法见
[Defining styles](https://stylexjs.com/docs/learn/styling-ui/defining-styles)。

因此 StyleX 与 Tailwind/GSS contextual selector 的差异是：

| 方案 | 关系条件放在哪里 | 是否生成 descendant selector |
| --- | --- | --- |
| Tailwind `group-*` | 父 marker + 目标 utility class | 是 |
| GSS `FOUND-04` | semantic ancestor guard + 目标 atomic class | 是 |
| StyleX `stylex.when.*` | 被观察元素 marker + 目标 atomic class | 是 |
| StyleX CSS variable recipe | 父级设变量，子级显式消费 | 否 |
| StyleX Context/props | JS 数据流把条件传给目标组件 | 否 |

这些 authoring 模式不能直接作为任意 CSS 的自动重写算法。例如把 `.a .b { color: red }`
机械改写为 `.b { color: var(--relation-color) }` 后，变量缺失时的 computed-value 语义、与其他 `color`
declaration 的级联、直接子代/兄弟限制和 `!important` 都需要单独证明。StyleX 之所以安全，是因为作者显式定义变量的 provider/consumer 和默认值，而不是编译器从任意 selector 推导它们。

GSS 自动生成 marker pair 时还会遇到 CSS Modules export 粒度和通用子 token 的交叉误命中；完整分析见
[Marker-Pair 方案调研](phase-8-marker-pair-selector-research.md)。
