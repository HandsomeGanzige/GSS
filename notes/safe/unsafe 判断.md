Safe selector 的核心判断在 [`analyzeSelector.ts`](/Users/gan/Desktop/🥷/css-plugin/GSS/packages/core/src/selector/analyzeSelector.ts:22)。

调用入口在 [`processRule()`](/Users/gan/Desktop/🥷/css-plugin/GSS/packages/core/src/engine/createTransformer.ts:230)：

```ts
const selectorAnalysis = analyzeSelector(rule.selector);

if (selectorAnalysis.kind === 'unsafe') {
  preserveUnsafeRule(...);
  return;
}
```

## 为什么要这样判断

GSS 最终会把：

```css
.Button_button__abc:hover {
  color: red;
}
```

转换成：

```css
._color_red:hover {
  color: red;
}
```

并把 `_color_red` 追加到 `styles.button`。

这只有在 selector 依赖“同一个 DOM 元素上的一个 class，加上可保留的简单状态”时才能证明等价。

像下面这些 selector：

```css
.card .title
.card > .title
.button[data-state="open"]
.button::before
```

都包含额外结构。仅仅把 atomic class 追加到某个 token，无法完整表达原 selector 的匹配条件，所以必须保留原 scoped CSS。

## 第一层：解析 selector AST

GSS 使用 `postcss-selector-parser`，不是正则：

```ts
root = selectorParser().astSync(selector);
```

解析失败时：

```ts
{
  kind: 'unsafe',
  reason: 'unknown-selector'
}
```

这样不会因为无法识别 selector 而冒险转换。

## 第二层：只允许一个 selector

```ts
const selectors = root.nodes ?? [];

if (selectors.length !== 1) {
  return createUnsafe(selector, 'selector-list');
}
```

因此：

```css
.button
```

可以继续判断，而：

```css
.button,
.link
```

会得到：

```txt
selector-list
```

原因是 selector list 中各分支可能对应不同 class，不能用一组 atomic token 无条件替代。

## 第三层：遍历 AST 收集 unsafe 结构

具体实现在 [`collectUnsafeDetails()`](/Users/gan/Desktop/🥷/css-plugin/GSS/packages/core/src/selector/analyzeSelector.ts:81)。

它会递归遍历当前 selector 的所有节点。

### Combinator

遇到 combinator：

```ts
if (node.type === 'combinator') {
  details.add(combinatorReason(node.value));
}
```

对应关系：

| Selector | Reason |
|---|---|
| `.card .title` | `descendant-selector` |
| `.card > .title` | `child-selector` |
| `.label + .input` | `adjacent-selector` |
| `.item ~ .item` | `sibling-selector` |

### Tag 和通配符

```css
button.primary
*.primary
```

对应：

```txt
tag-selector
```

实现同时判断：

```ts
node.type === 'tag' || node.type === 'universal'
```

### ID

```css
#app.button
```

对应：

```txt
id-selector
```

### Attribute

```css
.button[data-state="open"]
.button[disabled]
```

对应：

```txt
attribute-selector
```

### Pseudo element

```css
.button::before
.button::first-line
```

因为 pseudo 以 `::` 开头，所以对应：

```txt
pseudo-element
```

pseudo element 不能通过给原元素追加 atomic class 来等价替换。

### `:global`

```css
:global(.external)
```

对应：

```txt
global-selector
```

位于 `:global(...)` 内部的节点会被 `isInsideGlobal()` 识别，不再作为普通 local class 处理。

不过在 Vite adapter 中，Vite 通常已经提前把 `:global(...)` 编译掉了。因此还有后面介绍的“token export evidence”第二道保护。

## 第四层：只允许一个 local/scoped class

实现会从 selector 的直接节点中取出不在 `:global` 内的 class：

```ts
const classNodes = selectorNode.nodes.filter(
  (node) => node.type === 'class' && !isInsideGlobal(node)
);
```

### 没有 class

```css
button
:hover
#app
```

返回：

```txt
missing-source-class
```

### 多个 class

```css
.button.primary
```

返回：

```txt
compound-class-selector
```

如果多个 class 之间存在 combinator，则优先返回更具体的结构原因：

```css
.card .title
```

返回：

```txt
descendant-selector
```

而不是笼统的 `compound-class-selector`。

## 第五层：Pseudo class 白名单

当前白名单定义在 [`analyzeSelector.ts`](/Users/gan/Desktop/🥷/css-plugin/GSS/packages/core/src/selector/analyzeSelector.ts:14)：

```ts
const supportedPseudoClasses = new Set([
  ':hover',
  ':focus',
  ':active',
  ':disabled',
  ':focus-visible'
]);
```

允许：

```css
.button:hover
.button:focus
.button:active
.button:disabled
.button:focus-visible
```

pseudo class 必须同时满足三个条件：

```ts
supportedPseudoClasses.has(node.value)
pseudoClassCount <= 1
node.nodes.length === 0
```

所以以下都是 unsafe：

```css
.button:visited
.button:checked
.button:hover:focus
.button:not(.disabled)
.button:is(.primary, .secondary)
```

对应：

```txt
unsupported-pseudo
```

其中 `:not()`、`:is()` 即便名字将来进入白名单，当前也会因为带嵌套 selector，即 `node.nodes.length > 0`，被拒绝。

## 最终 safe 结果

只有满足所有约束时，才返回：

```ts
{
  kind: 'safe',
  selector,
  sourceClassName,
  sourceClassNames: [sourceClassName],
  pseudo
}
```

例如：

```css
.Button_button__abc:hover
```

得到：

```ts
{
  kind: 'safe',
  selector: '.Button_button__abc:hover',
  sourceClassName: 'Button_button__abc',
  sourceClassNames: ['Button_button__abc'],
  pseudo: ':hover'
}
```

随后 `pseudo` 会进入 atomic context：

```ts
const context = {
  ...rule.context,
  pseudo: selectorAnalysis.pseudo
};
```

所以它也是 atomic key 的一部分。

## 判断结果速查

| Selector | 结果 | 原因 |
|---|---|---|
| `.button` | safe | 单 class |
| `.button:hover` | safe | 单 class + 一个白名单 pseudo |
| `.button:focus-visible` | safe | 单 class + 一个白名单 pseudo |
| `.button, .link` | unsafe | `selector-list` |
| `.button.primary` | unsafe | `compound-class-selector` |
| `.card .title` | unsafe | `descendant-selector` |
| `.card > .title` | unsafe | `child-selector` |
| `button.primary` | unsafe | `tag-selector` |
| `#app.button` | unsafe | `id-selector` |
| `.button[data-open]` | unsafe | `attribute-selector` |
| `.button::before` | unsafe | `pseudo-element` |
| `.button:checked` | unsafe | `unsupported-pseudo` |
| `.button:hover:focus` | unsafe | `unsupported-pseudo` |
| `.button:not(.disabled)` | unsafe | `unsupported-pseudo` |
| `:global(.external)` | unsafe | `global-selector` |

## Safe selector 不等于一定会 atomize

`analyzeSelector()` 只完成“selector 结构安全”判断。后面还有三道保护。

### 1. CSS nesting 保护

即使 selector 本身 safe，只要 rule 中包含嵌套节点：

```css
.button {
  color: red;

  & .icon {
    opacity: 0.8;
  }
}
```

`rule.hasNestedNodes` 就会让整块进入 preserved path：

```ts
if (rule.hasNestedNodes) {
  preserveNestedRule(...);
  return;
}
```

### 2. Adapter 整类保留

Vite adapter 可以通过 `preserveClassNames` 指定整个 class 不转换。

当前主要用于包含 `url()` 的资源 class：

```ts
const preservationReason =
  preserveClassNames?.[selectorAnalysis.sourceClassName];

if (preservationReason) {
  preserveConfiguredSafeRule(...);
  return;
}
```

因此：

```css
.hero {
  background: url("./hero.svg");
}
```

selector `.hero` 在结构上是 safe，但 class 会按 `asset-reference` 整体保留。

### 3. Vite token export evidence

结构安全的 class 还必须能够进入真实 DOM class string：

```ts
if (!shouldTransformSafeClass(...)) {
  preserveNonExportedSafeRule(...);
  return;
}
```

Vite adapter 的判断是：

```ts
shouldExportClassName(className) {
  return exportedClassNames.has(className);
}
```

见 [`createCssModulesScopeStrategy()`](/Users/gan/Desktop/🥷/css-plugin/GSS/packages/vite/src/cssModules.ts:25)。

`exportedClassNames` 必须同时有两类证据：

- class 出现在 Vite token value 中；
- class 出现在 Vite scoped CSS selector 中。

例如 Vite 已经把：

```css
:global(.external) {
  color: red;
}
```

编译成：

```css
.external {
  color: red;
}
```

从纯 selector 结构看，`.external` 可能被判断为 safe。但它不会出现在 CSS Modules tokens 中，因此 export evidence 返回 `false`，最终以：

```txt
non-exported-class
```

保留。

完整决策顺序可以概括为：

```txt
Selector AST 是否安全？
  ├─ 否 → unsafe fallback
  └─ 是
      ↓
Rule 是否含 nesting？
  ├─ 是 → nested fallback
  └─ 否
      ↓
Adapter 是否要求整类保留？
  ├─ 是 → preserved-class fallback
  └─ 否
      ↓
Class 是否有 Vite token export evidence？
  ├─ 否 → non-exported fallback
  └─ 是
      ↓
逐条判断 declaration 是否可以 atomize
```