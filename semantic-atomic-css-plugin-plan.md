# Semantic Atomic CSS Plugin 技术方案文档

## 1. 背景与目标

### 1.1 项目背景

当前前端样式开发中，Tailwind CSS / UnoCSS 这类 Atomic CSS 方案非常流行。它们的核心优势是：

- 样式声明复用率高
- CSS 产物较小
- 不需要大量手写 CSS class 命名
- 样式局部化心智较强
- 构建阶段按需生成 CSS

但这类方案也带来一些明显问题：

- JSX / HTML 中 `className` 过长
- 样式语义被大量 utility class 稀释
- 开发者需要学习新的 utility class 体系
- 复杂组件中可读性下降
- 多人协作时容易出现 arbitrary value 滥用
- 样式复用边界依赖团队规范

本项目希望探索一种依托 CSS Modules 的反向方案：

> 开发者仍然像传统 CSS Modules 一样写语义化 class，构建工具在打包阶段通过 CSS Modules export mapping
> 自动追加 atomic class，并生成可复用的 Atomic CSS 产物。

---

### 1.2 核心目标

开发时：

```css
.button {
  color: red;
  font-size: 16px;
}
```

业务代码中：

```tsx
import styles from './Button.module.css'

export function Button() {
  return <button className={styles.button}>Submit</button>
}
```

构建后生成：

```css
._a1b2c {
  color: red;
}

._d3e4f {
  font-size: 16px;
}
```

并将 CSS Modules mapping 改写为：

```js
export default {
  button: "Button_button__hash _a1b2c _d3e4f"
}
```

最终 DOM：

```html
<button class="Button_button__hash _a1b2c _d3e4f">Submit</button>
```

也就是说：

```txt
开发写语义 CSS Modules，产物生成 Atomic CSS。
```

---

## 2. 产品定位

### 2.1 推荐定位

本工具可以被定义为：

> 一个面向 CSS Modules 项目的 Semantic CSS Modules to Atomic CSS 编译器。

更准确地说，GSS 的产品主路径是：

> CSS Modules only + Safe Atomization + Preserve Semantic Class + Unsafe CSS Fallback。

这里的 CSS Modules only 不是单纯的 MVP 限制，而是项目成立的核心杠杆。CSS Modules 提供了
`styles.xxx` export mapping 这个稳定插入点，使工具可以在不改写 JSX / TSX 的前提下，把 atomic
class 安全追加到 DOM class string 中。

普通全局 CSS 没有这个插入点。如果要把普通 CSS 自动 atomic 化，通常必须改写 HTML / JSX / 模板、
引入 runtime class 注入，或继续保留原 selector 而失去主要复用收益。因此普通 CSS 不进入 GSS
主线能力；未来最多作为 analysis/report-only 或显式实验能力讨论。

---

### 2.2 和 Tailwind 的差异

| 维度 | Tailwind / UnoCSS | 本工具 |
|---|---|---|
| 开发方式 | 开发者直接写 atomic class | 开发者写语义 CSS Modules class |
| 样式组织 | utility-first | semantic-first |
| JSX 可读性 | className 可能很长 | className 保持简洁 |
| CSS 产物 | Atomic CSS | Atomic CSS |
| 学习成本 | 需要学习 utility class 体系 | 接近传统 CSS |
| 编译难点 | class 扫描、动态 class | CSS Modules mapping 与 CSS 语义安全转换 |
| 适合切入点 | 新项目、设计系统成熟项目 | 已使用 CSS Modules 的项目 |

---

## 3. 产品边界与 MVP 约束

### 3.1 强制产品边界

GSS 主路径明确限制：

```txt
只支持 CSS Modules。
```

即只处理：

```txt
*.module.css
```

主线不处理：

```txt
普通全局 CSS
Tailwind 输出
CSS-in-JS
第三方组件库样式
动态运行时注入样式
```

这些范围不是简单延后，而是与当前产品价值不同。尤其普通全局 CSS 缺少 CSS Modules export mapping，
无法在不改业务代码的前提下把 atomic class 追加到真实 DOM。

---

### 3.2 为什么 CSS Modules 是产品基础

CSS Modules 不只是降低实现复杂度，它提供了 GSS 的核心产品支点：

1. **有稳定 class 注入点**  
   业务侧使用 `styles.button`，插件可以改写 CSS Modules export mapping，让 DOM 同时获得 semantic
   scoped class 和 atomic classes，而不需要改写 JSX / TSX。

2. **作用域可控**  
   每个 class 属于当前 module，不需要担心全局同名 class 冲突。

3. **迁移成本低**  
   用户已有 CSS Modules 项目可以直接接入。

4. **回滚简单**  
   关闭插件后，项目仍然走原 CSS Modules 构建逻辑。

5. **可以保留 semantic hash class**  
   保证复杂 selector、调试、测试、兼容性更安全。

6. **可以安全回退到 fallback CSS**  
   unsafe selector 仍能依赖保留的 scoped class 命中 DOM，这是普通 CSS 自动 atomic 化难以同时满足的能力。

---

### 3.3 CSS Modules 主路径支持范围

当前主路径支持：

```txt
- .module.css
- 单 local class selector
- 普通属性 declaration
- 简单 pseudo class
- @media 下的单 local class
- @supports 下的单 local class
- Atomic CSS 生成
- CSS Modules mapping 改写
- 保留原 semantic hash class
- 保留 unsafe CSS
- Manifest 输出
- Size Report 输出
```

示例支持：

```css
.button {
  color: red;
  font-size: 16px;
}

.button:hover {
  color: blue;
}

@media (min-width: 768px) {
  .button {
    font-size: 18px;
  }
}

@supports (display: grid) {
  .layout {
    display: grid;
  }
}
```

---

### 3.4 Safe mode 暂不支持或默认保留

Safe mode 暂不转换：

```css
.card .button {}
.card > .button {}
.button.primary {}
button.button {}
.button[data-active='true'] {}
.button::before {}
.button + .desc {}
:global(.ant-btn) {}
```

原因：

- 依赖 DOM 上下文
- 依赖 class 组合
- 依赖 attribute 状态
- 依赖结构关系
- 涉及伪元素
- 涉及 global scope
- 无法在第一版安全证明语义等价

处理策略：

```txt
不转换，保留原 CSS，并输出 unsafe report。
```

---

### 3.5 普通 CSS 的定位

普通全局 CSS 不作为 GSS 主线转换对象。

如果未来探索普通 CSS，也应优先定位为：

```txt
analysis/report-only
显式 opt-in 实验能力
迁移辅助工具
```

不应把普通 CSS 自动 atomic 化作为默认产品承诺。原因是普通 CSS 没有 CSS Modules export mapping，
无法自然把 atomic class 追加到 DOM。若要做到语义等价，通常必须引入模板/JSX 改写、运行时 class
注入或全项目使用点分析，这会让问题域从 CSS Modules adapter 扩大为全栈样式重写系统。

---

## 4. 核心设计原则

### 4.1 正确性优先于压缩率

最重要原则：

```txt
无法证明安全转换的规则，不转换。
```

默认模式应该是：

```ts
semanticAtomicCss({
  mode: 'safe'
})
```

Safe Mode 中：

- 只转换可安全证明的规则
- 复杂 selector 全部保留
- 不确定规则全部保留
- 输出 warning / report
- 不因转换率低而破坏样式正确性

---

### 4.2 默认保留 CSS Modules semantic hash class

建议默认：

```ts
semanticAtomicCss({
  preserveSemanticClass: true
})
```

也就是说，不要把：

```js
button: "Button_button__hash"
```

直接替换成：

```js
button: "_a1 _b2"
```

而是替换成：

```js
button: "Button_button__hash _a1 _b2"
```

好处：

- 复杂 selector 仍然可以命中
- DevTools 中还能看到语义 class
- 测试如果依赖 class，不会完全失效
- 用户心理负担更低
- 回滚和排查更容易

---

### 4.3 unsafe CSS fallback

对于不能安全转换的 CSS，必须原样或等价保留。

例如输入：

```css
.card .button {
  font-weight: bold;
}
```

如果 CSS Modules 编译后是：

```css
.Card_card__hash .Button_button__hash {
  font-weight: bold;
}
```

那么 preserved CSS 中必须保留这条规则。

---

## 5. 总体架构

### 5.1 包结构建议

建议拆分为：

```txt
packages/
  core/
    src/
      compiler/
      parser/
      atomizer/
      report/
      manifest/
      utils/

  vite/
    src/
      plugin.ts

  rsbuild/
    src/
      plugin.ts

  playground/
    vite-react-css-modules/

  fixtures/
    basic/
    pseudo/
    media/
    unsafe-selector/
```

推荐包名：

```txt
@semantic-atomic-css/core
@semantic-atomic-css/vite
@semantic-atomic-css/rsbuild
```

---

### 5.2 模块职责

#### core

负责和构建工具无关的核心逻辑：

- CSS AST 解析
- selector 安全性判断
- declaration 抽取
- atomic key 生成
- atomic class name 生成
- class mapping 生成
- preserved CSS 生成
- manifest 生成
- report 生成

core 可以保持为通用 CSS transform engine，但这只是架构边界，不代表产品主线承诺普通 CSS 转换。
面向用户的稳定闭环仍然由 CSS Modules adapter 提供。

#### vite adapter

负责接入 Vite CSS Modules：

- 读取配置
- 接入 transform / generateBundle
- 处理 CSS Modules 相关文件
- emit atomic CSS asset
- emit manifest / report

#### rsbuild adapter

后续阶段接入 Rsbuild / Rspack 的 CSS Modules 构建流程：

- 复用 core
- 通过 Rsbuild plugin 生命周期处理 `.module.css`
- 必要时使用 Rspack loader / plugin 生成 CSS Modules tokens
- 不把普通 CSS 自动转换作为默认目标

---

## 6. 核心编译流程

### 6.1 CSS Modules 主路径 Pipeline

推荐主路径流程：

```txt
1. 读取 .module.css 文件
2. 解析 CSS AST
3. 遍历 rules
4. 判断 selector 是否安全
5. 对 safe rule 抽取 declarations
6. 为每个 declaration 生成 atomic key
7. 根据 atomic key 生成或复用 atomic class
8. 建立 local class -> atomic classes 映射
9. 对 unsafe rule 生成 preserved CSS
10. 生成最终 CSS Modules mapping
11. 生成 atomic CSS asset
12. 生成 manifest
13. 生成 size report
```

其中第 2 到第 9 步属于 core 可复用的 CSS transform 能力；第 1、10、11、12、13 步由具体
CSS Modules adapter / integration layer 负责组织。

---

### 6.2 输入输出示例

输入：

```css
/* Button.module.css */
.button {
  color: red;
  font-size: 16px;
}

.button:hover {
  color: blue;
}

.card .button {
  font-weight: bold;
}
```

CSS Modules 原 hash 假设为：

```txt
button -> Button_button__hash
card -> Button_card__hash
```

输出 mapping：

```js
export default {
  button: "Button_button__hash _a1 _b2 _c3",
  card: "Button_card__hash"
}
```

输出 atomic CSS：

```css
._a1 {
  color: red;
}

._b2 {
  font-size: 16px;
}

._c3:hover {
  color: blue;
}
```

输出 preserved CSS：

```css
.Button_card__hash .Button_button__hash {
  font-weight: bold;
}
```

---

## 7. 数据结构设计

### 7.1 CssContext

```ts
export type CssContext = {
  pseudo?: string
  media?: string
  supports?: string
  container?: string
  layer?: string
}
```

---

### 7.2 DeclarationMeta

```ts
export type DeclarationMeta = {
  prop: string
  value: string
  important: boolean
  loc?: SourceLocation
}
```

---

### 7.3 AtomicKey

```ts
export type AtomicKey = {
  prop: string
  value: string
  important: boolean
  context: CssContext
}
```

注意：

以下声明必须是不同 key：

```txt
color:red
color:red!important
hover|color:red
media(min-width:768px)|color:red
supports(display:grid)|display:grid
```

---

### 7.4 AtomicDeclaration

```ts
export type AtomicDeclaration = {
  key: string
  className: string
  prop: string
  value: string
  important: boolean
  context: CssContext
  sources: SourceLocation[]
}
```

---

### 7.5 ClassMapping

```ts
export type ClassMapping = {
  localName: string
  scopedName: string
  atomicClasses: string[]
  finalClassName: string
  unsafeReasons?: string[]
}
```

示例：

```json
{
  "localName": "button",
  "scopedName": "Button_button__hash",
  "atomicClasses": ["_a1", "_b2", "_c3"],
  "finalClassName": "Button_button__hash _a1 _b2 _c3"
}
```

---

### 7.6 CompileWarning

```ts
export type CompileWarning = {
  file: string
  selector?: string
  reason: string
  message: string
  loc?: SourceLocation
}
```

---

### 7.7 CompileResult

```ts
export type CompileResult = {
  file: string
  atomicCss: string
  preservedCss: string
  classMap: Record<string, ClassMapping>
  atomicDeclarations: AtomicDeclaration[]
  warnings: CompileWarning[]
  manifest: AtomicManifest
  sizeReport: SizeReport
}
```

---

## 8. Selector 安全判断

### 8.1 Safe Selector

MVP 中可以安全转换的 selector：

```css
.button {}
.button:hover {}
.button:focus {}
.button:active {}
.button:disabled {}
```

在 at-rule 下也可以：

```css
@media (min-width: 768px) {
  .button {}
}

@supports (display: grid) {
  .layout {}
}
```

判断标准：

```txt
- 只包含一个 local class
- 不包含 global
- 不包含 id
- 不包含 tag
- 不包含 attribute selector
- 不包含 combinator
- 不包含多个 class
- 不包含 pseudo element
- pseudo class 必须在白名单内
```

---

### 8.2 Unsafe Selector

以下默认 unsafe：

```css
.card .button {}
.card > .button {}
.button.primary {}
button.button {}
#app .button {}
.button[data-state='open'] {}
.button::before {}
.button + .desc {}
:global(.ant-btn) {}
```

Unsafe reason 示例：

```txt
complex-selector
compound-class-selector
descendant-selector
child-selector
attribute-selector
tag-selector
id-selector
pseudo-element
global-selector
unsupported-pseudo
```

---

### 8.3 建议 API

```ts
type SelectorAnalyzeResult =
  | {
      safe: true
      localName: string
      pseudo?: string
    }
  | {
      safe: false
      reason: string
    }

function analyzeSelector(selector: string): SelectorAnalyzeResult
```

---

## 9. Declaration 转换规则

### 9.1 普通属性

普通 declaration 可以转换：

```css
.button {
  color: red;
  font-size: 16px;
}
```

转换为：

```css
._a1 {
  color: red;
}

._b2 {
  font-size: 16px;
}
```

---

### 9.2 `!important`

`!important` 必须进入 atomic key：

```txt
color:red
color:red!important
```

是不同 atomic class。

---

### 9.3 CSS Custom Properties

建议 MVP 策略：

```txt
普通属性使用 var()：允许转换
自定义属性声明 --xxx：默认不转换
```

允许：

```css
.button {
  color: var(--primary-color);
}
```

保留：

```css
.button {
  --button-color: red;
}
```

原因：

- custom property 有作用域
- custom property 会继承
- custom property 受 cascade 影响
- 转换后可能改变变量作用域

---

### 9.4 Shorthand / Longhand

MVP 可以先不做复杂属性展开，但需要注意顺序。

例如：

```css
.button {
  margin: 8px;
  margin-left: 16px;
}
```

如果直接生成：

```css
._margin_8 {
  margin: 8px;
}

._margin_left_16 {
  margin-left: 16px;
}
```

必须确保最终 CSS 中 `_margin_left_16` 在 `_margin_8` 后面，否则语义可能变化。

MVP 建议：

```txt
同一个 local class 内，按 declaration 原顺序为 atomic class 排序。
```

后续高级阶段再考虑：

```txt
- shorthand 展开
- property conflict graph
- declaration canonicalization
```

Phase 4 已先实现不改写 CSS 的 analyzer declaration conflict 提示：只报告同一
semantic class 内可从 manifest 证明的同属性或保守 shorthand / longhand 顺序依赖。跨 class
冲突必须先获得 JSX / TSX 或其他 usage graph 的共现证据，不得仅因同模块 class
共享属性而报告。

---

## 10. Atomic Class 生成

### 10.1 Class Name 策略

不建议真实使用：

```css
.class-color-red {}
```

因为 value 可能很复杂。

建议：

开发模式：

```css
._color_red {}
._fontSize_16px {}
._hover_color_blue {}
```

生产模式：

```css
._a1b2c {}
._d3e4f {}
```

配置：

```ts
className: {
  dev: 'readable',
  prod: 'hash',
  prefix: '_'
}
```

---

### 10.2 Atomic Key 生成

推荐将以下内容序列化后 hash：

```txt
prop
value
important
pseudo
media
supports
container
layer
```

伪代码：

```ts
function createAtomicKey(input: AtomicKey): string {
  return stableStringify({
    prop: normalizeProp(input.prop),
    value: normalizeValue(input.value),
    important: input.important,
    context: input.context,
  })
}
```

---

### 10.3 Atomic CSS 排序

需要保证输出顺序稳定。

MVP 排序策略：

```txt
1. 按首次出现顺序注册 atomic declaration
2. 输出时保持注册顺序
3. 同一个 local class 内 atomic class 顺序保持原 declaration 顺序
```

后续如果要进一步压缩，可以再做全局排序，但必须有 computed style diff 验证。

---

## 11. CSS Modules Mapping 改写

### 11.1 推荐策略

假设原始 CSS Modules mapping：

```js
export default {
  button: "Button_button__hash"
}
```

插件生成：

```js
export default {
  button: "Button_button__hash _a1 _b2"
}
```

即：

```txt
finalClassName = scopedName + atomicClasses.join(' ')
```

---

### 11.2 为什么不删除 scopedName

默认不要删除 `Button_button__hash`。

原因：

- unsafe preserved CSS 可能依赖它
- 复杂 selector 需要它作为 hook
- DevTools 调试更友好
- 用户测试代码可能依赖它
- 降低破坏性

后续可提供 aggressive 配置：

```ts
preserveSemanticClass: false
```

但仅建议在所有 selector 都可安全转换时启用。

---

## 12. Preserved CSS 处理

### 12.1 需要保留哪些 CSS

Preserved CSS 包括：

```txt
- unsafe selector
- :global 规则
- pseudo element
- custom property declaration
- keyframes
- 无法识别的 at-rule
- 复杂组合选择器
```

---

### 12.2 Preserved CSS 与 scopedName

注意 preserved CSS 应该基于 CSS Modules 编译后的 scoped class。

例如源 CSS：

```css
.card .button {
  color: blue;
}
```

编译后 preserved CSS 应该是：

```css
.Card_card__hash .Button_button__hash {
  color: blue;
}
```

因此需要决定：

```txt
插件是在 CSS Modules 编译前做？
还是 CSS Modules 编译后做？
```

MVP 推荐有两种实现选择。

---

## 13. 实现路线选择

### 13.1 路线 A：复用 Vite CSS Modules 结果后处理

流程：

```txt
Vite 原生 CSS Modules 编译
  ↓
拿到 compiled CSS + modules mapping
  ↓
分析 compiled CSS
  ↓
生成 atomic CSS
  ↓
改写 modules mapping
```

优点：

- 不需要自己实现 CSS Modules hash
- 能复用 Vite / PostCSS / CSS Modules 配置
- Less / Sass 编译后也能逐步接入

缺点：

- source map 复杂
- compiled CSS 中 local class 已经变成 hash，不容易反查 localName
- 需要深入 Vite CSS pipeline

---

### 13.2 路线 B：自己处理 `.module.css`，生成虚拟 JS + CSS

流程：

```txt
读取 .module.css
  ↓
自己解析 CSS
  ↓
自己生成 scopedName
  ↓
自己生成 JS module export
  ↓
自己 emit atomic CSS / preserved CSS
```

优点：

- 可控性最高
- 逻辑更清晰
- 更容易做 MVP prototype
- 不依赖 Vite 内部 CSS Modules 流程

缺点：

- 需要兼容 CSS Modules 行为
- 需要处理 localsConvention
- 需要处理 generateScopedName
- 需要处理 HMR
- 需要和原 Vite CSS pipeline 避免冲突

---

### 13.3 MVP 建议

如果目标是快速给 code agent 做原型，推荐：

```txt
优先选择路线 B，做最小可运行 prototype。
```

第一版可以不追求完全兼容 Vite 原生 CSS Modules，只要在 playground 中证明：

```txt
.module.css -> JS mapping + atomic CSS
```

能跑通即可。

等 core 算法验证后，再考虑与 Vite 原生 CSS pipeline 深度兼容。

Phase 4 当前结论：

```txt
Vite adapter 已从路线 B 迁移到路线 A。
```

具体落地方式是使用 Vite 6 公开导出的 `preprocessCSS` 获取原生 CSS Modules scoped CSS 与
`modules` tokens；GSS 不再自行生成 scoped class 或自行实现 CSS Modules tokens，只在 Vite 结果基础上
执行 safe atomization、tokens atomic 增强、fallback CSS、asset/report 输出和 analyzer 集成。

---

## 14. Vite 插件实现草图

### 14.1 插件职责

MVP Vite 插件需要：

```txt
1. 拦截 .module.css
2. 使用 core 编译 CSS
3. 返回 JS module，导出 class mapping
4. 收集 atomic CSS / preserved CSS
5. 在构建阶段 emit CSS asset
6. 在 dev 阶段注入或提供虚拟 CSS
```

---

### 14.2 伪代码

```ts
import type { Plugin } from 'vite'
import { createCompiler } from '@semantic-atomic-css/core'

export function semanticAtomicCssPlugin(options = {}): Plugin {
  const compiler = createCompiler(options)

  return {
    name: 'vite-plugin-semantic-atomic-css',
    enforce: 'pre',

    configResolved(config) {
      compiler.setRoot(config.root)
      compiler.setMode(config.command)
      compiler.setDev(config.command === 'serve')
    },

    async transform(code, id) {
      if (!id.endsWith('.module.css')) {
        return null
      }

      const result = compiler.compileCssModule({
        id,
        code,
      })

      return {
        code: `
          import "${result.virtualCssId}";
          export default ${JSON.stringify(result.tokens)};
        `,
        map: null,
      }
    },

    resolveId(id) {
      if (compiler.isVirtualCssId(id)) {
        return id
      }
      return null
    },

    load(id) {
      if (compiler.isVirtualCssId(id)) {
        return compiler.loadVirtualCss(id)
      }
      return null
    },

    generateBundle() {
      const report = compiler.getReport()
      const manifest = compiler.getManifest()

      this.emitFile({
        type: 'asset',
        fileName: 'semantic-atomic-manifest.json',
        source: JSON.stringify(manifest, null, 2),
      })

      this.emitFile({
        type: 'asset',
        fileName: 'semantic-atomic-report.json',
        source: JSON.stringify(report, null, 2),
      })
    },
  }
}
```

---

## 15. Core Compiler API 草案

### 15.1 createCompiler

```ts
export function createCompiler(options: CompilerOptions): Compiler
```

---

### 15.2 Compiler

```ts
export type Compiler = {
  compileCssModule(input: CompileCssModuleInput): CompileCssModuleResult

  getAtomicCss(): string
  getPreservedCss(): string
  getManifest(): AtomicManifest
  getReport(): CompileReport

  setRoot(root: string): void
  setMode(mode: 'serve' | 'build'): void
  setDev(dev: boolean): void

  isVirtualCssId(id: string): boolean
  loadVirtualCss(id: string): string
}
```

---

### 15.3 CompileCssModuleInput

```ts
export type CompileCssModuleInput = {
  id: string
  code: string
}
```

---

### 15.4 CompileCssModuleResult

```ts
export type CompileCssModuleResult = {
  id: string
  tokens: Record<string, string>
  atomicCss: string
  preservedCss: string
  virtualCssId: string
  warnings: CompileWarning[]
}
```

---

## 16. 配置设计

### 16.1 MVP 配置

```ts
semanticAtomicCss({
  include: ['src/**/*.module.css'],
  exclude: ['node_modules'],

  mode: 'safe',

  preserveSemanticClass: true,

  className: {
    dev: 'readable',
    prod: 'hash',
    prefix: '_',
  },

  transform: {
    pseudoClasses: ['hover', 'focus', 'active', 'disabled', 'focus-visible'],
    media: true,
    supports: true,
    customProperties: false,
    pseudoElements: false,
  },

  report: true,
  manifest: true,
})
```

---

### 16.2 严格模式

后续可以支持：

```ts
semanticAtomicCss({
  mode: 'strict',
  failOnUnsafe: true,
})
```

strict mode 下：

- 复杂 selector 直接 warning 或 error
- 用于团队规范治理
- 不一定适合默认开启

---

## 17. Report 设计

### 17.1 Size Report

需要比较：

```txt
Before:
- original CSS size

After:
- atomic CSS size
- preserved CSS size
- generated mapping class string size
```

还需要比较：

```txt
raw
gzip
brotli
```

---

### 17.2 Report 示例

```json
{
  "summary": {
    "files": 12,
    "localClasses": 86,
    "atomicDeclarations": 124,
    "reusedAtomicDeclarations": 47,
    "unsafeRules": 18
  },
  "size": {
    "beforeCssBytes": 48210,
    "afterAtomicCssBytes": 15320,
    "afterPreservedCssBytes": 12800,
    "estimatedClassStringIncreaseBytes": 6100,
    "estimatedTotalDiffBytes": -13990
  },
  "unsafe": [
    {
      "file": "src/Button.module.css",
      "selector": ".card .button",
      "reason": "descendant-selector",
      "message": "包含后代选择器，已保留原 CSS"
    }
  ]
}
```

---

## 18. Manifest 设计

Manifest 需要用于：

- 调试
- report
- 后续 browser overlay
- source map 辅助
- className 反查

示例：

```json
{
  "atomic": {
    "_a1": {
      "prop": "color",
      "value": "red",
      "important": false,
      "context": {},
      "sources": [
        {
          "file": "src/Button.module.css",
          "line": 2,
          "column": 3
        }
      ]
    }
  },
  "classes": {
    "src/Button.module.css::button": {
      "scopedName": "Button_button__hash",
      "atomicClasses": ["_a1", "_b2"],
      "finalClassName": "Button_button__hash _a1 _b2"
    }
  }
}
```

---

## 19. Computed Style Verifier

### 19.1 作用定位

`getComputedStyle` / Playwright / Chrome DevTools Protocol 不适合作为默认编译依据，但非常适合做验证器。

推荐作为后续能力：

```txt
原始版本页面
  ↓
采集 computed style snapshot A

转换版本页面
  ↓
采集 computed style snapshot B

比较 A / B
  ↓
输出样式差异报告
```

---

### 19.2 为什么不作为核心编译依据

因为它依赖：

- 真实 DOM
- 真实路由
- 真实 props / state
- viewport
- theme
- hover / focus 等状态
- 页面覆盖率

它只能覆盖被真实渲染的页面，不能覆盖所有组件和所有状态。

---

### 19.3 推荐用途

```txt
- CI 样式回归验证
- playground 测试
- atomic 转换正确性验证
- 未来高级优化模式
```

---

## 20. 测试策略

### 20.1 Unit Test

测试 core：

```txt
- selector analyze
- atomic key 生成
- className 生成
- safe rule 转换
- unsafe rule 保留
- pseudo class 转换
- media query 转换
- important 转换
- custom property 保留
```

---

### 20.2 Fixture Test

准备 fixture：

```txt
fixtures/
  basic/
  pseudo/
  media/
  supports/
  unsafe-descendant/
  unsafe-compound/
  custom-property/
  important/
```

对以下内容做 snapshot：

```txt
- tokens
- atomicCss
- preservedCss
- manifest
- report
```

---

### 20.3 Browser Regression Test

后续用 Playwright：

```txt
1. 启动原始版本
2. 采集 computed style
3. 启动转换版本
4. 采集 computed style
5. 对比关键元素关键属性
```

---

## 21. 开发阶段规划

### 21.1 阶段一：Core Prototype

目标：

```txt
证明 CSS Modules safe atomization 可行。
```

任务：

```txt
- 使用 PostCSS 解析 .module.css
- 实现 selector 安全判断
- 实现 atomic key / className 生成
- 实现 tokens 生成
- 实现 atomicCss / preservedCss 输出
- 实现 manifest / report 输出
```

暂不接 Vite。

---

### 21.2 阶段二：Vite MVP

目标：

```txt
在 Vite React playground 中跑通。
```

任务：

```txt
- 实现 Vite plugin
- 拦截 .module.css
- 返回 JS module export
- 加载 virtual CSS
- 页面样式正常渲染
- 生成 manifest / report
```

---

### 21.3 阶段三：完善 CSS Modules 兼容

任务：

```txt
- 支持 camelCase localsConvention
- 支持 scopedName 配置
- 支持 dev / prod className 策略
- 支持 source map 基础信息
- 优化 HMR
```

---

### 21.4 阶段四：真实项目试用稳固

任务：

```txt
- 强化 CSS Modules only 产品边界
- 检测暂不支持的 CSS Modules 语义，避免 silent miscompile
- 改进 report，让用户理解 atomic 收益、fallback 占比和 unsafe reason 分布
- 评估并规划可复用的 CSS Modules adapter 能力
- 评估并规划构建工具无关的 report / size report 能力
- 扩展 acceptance fixture 和 computed style verifier 的高风险覆盖
```

---

### 21.5 阶段五：CSS Modules 预处理器支持

任务：

```txt
- 支持 .module.scss
- 支持 .module.less
- 先由 adapter / 构建工具把预处理器输入编译为标准 CSS
- 继续通过 CSS Modules mapping 追加 atomic class
- 尽量保留 source location / source map 辅助信息
```

注意：本阶段仍然是 CSS Modules 预处理器支持，不是普通 `.scss` / `.less` 全局 CSS 转换。

---

### 21.6 阶段六：Rsbuild / Rspack CSS Modules 支持

任务：

```txt
- 实现 rsbuild adapter
- 复用 core 和可复用 CSS Modules adapter 能力
- 接入 Rsbuild / Rspack CSS Modules 构建流程
- 输出 atomic CSS asset / manifest / report
- 与 Vite adapter 保持一致的 safe fallback 和 report 语义
```

---

### 21.7 阶段七：验证器与调试体验

任务：

```txt
- Playwright computed style verifier
- 样式 diff report
- Dev server report API
- Browser overlay
```

验证器默认围绕 CSS Modules 原生构建与 GSS 构建做对照，不扩展为任意普通 CSS 页面转换验证器。

---

## 22. 主要风险

### 22.1 技术风险

```txt
- CSS cascade 语义被破坏
- shorthand / longhand 顺序错误
- CSS Modules 行为兼容不完整
- Vite CSS pipeline 接入复杂
- source map 不准确
- unsafe CSS 与 atomic CSS 顺序冲突
- dev / build 行为不一致
```

---

### 22.2 产品风险

```txt
- 用户不接受构建后 className 变化
- 产物不一定总是更小
- 保留 semantic class 后收益下降
- 限制过多导致用户觉得不实用
- 如果调试体验差，用户不敢在生产使用
```

---

### 22.3 落地风险

```txt
- 真实项目中复杂 selector 占比高
- CSS Modules 中大量 :global 或 composes
- 项目混用 Tailwind / CSS-in-JS
- 多主题 / dark mode / token 变量复杂
- 老项目测试依赖具体 class
```

---

## 23. Code Agent 当前优先任务清单

### 23.1 第一优先级

```txt
1. 准备 Phase 4 真实项目试用稳固规划文档
2. 将 CSS Modules only 产品边界沉淀到 README、AGENTS 和阶段文档
3. 设计暂不支持 CSS Modules 语义的检测和失败策略
4. 设计 report / size report 的构建工具无关共享能力
5. 补充对应 acceptance fixture 和验收命令规划
```

---

### 23.2 第二优先级

```txt
1. 评估 CSS Modules adapter 共享包边界
2. 收敛 named exports、strict mode、composes 等后续兼容策略
3. 扩展 unsafe reason 分布、fallback 占比和压缩体积报告
4. 强化 computed style verifier 的高风险 CSS Modules 场景
5. 校准较大 playground 与精简 acceptance fixture 的职责边界
```

---

### 23.3 暂缓优先级

```txt
1. 普通全局 CSS 自动 atomic 化
2. aggressive atomization
3. Less / Sass 非 CSS Modules 输入
4. Rsbuild / Rspack adapter 实现
5. CSS-only HMR 和完整 source map
```

---

## 24. 最小验收标准

第一版 prototype 只要满足以下条件即可认为可用：

```txt
1. Vite React playground 可以正常启动
2. .module.css 被插件拦截
3. styles.button 返回 semantic hash + atomic classes
4. atomic CSS 被正确注入页面
5. unsafe selector 被保留
6. 页面视觉效果和原始 CSS 基本一致
7. manifest 能反查 atomic class 来源
8. report 能展示转换数量和 unsafe 数量
```

---

## 25. 结论

当前方案的最佳切入点是：

```txt
CSS Modules only + Safe Atomization + Preserve Semantic Class + Unsafe CSS Fallback
```

这条路线能避开普通 CSS 全项目重写的复杂度，同时保留真实项目可落地性。

最重要的原则是：

```txt
不要追求第一版完全原子化。
先保证不破坏样式，再逐步提升优化率。
```

最终目标可以分阶段演进：

```txt
阶段一：CSS Modules Safe Compiler
阶段二：Vite CSS Modules 插件
阶段三：CSS Modules 兼容与 computed style verifier
阶段四：真实项目试用稳固与 report 能力
阶段五：CSS Modules 预处理器与 Rsbuild / Rspack adapter
阶段六：样式治理与可视化分析工具
```

一句话总结：

> 本项目不是 Tailwind 的直接替代，而是为 CSS Modules 项目提供一条“开发保持语义 CSS，产物获得 Atomic CSS 优化”的新路径。
