# Phase 2 Packages 架构梳理与决策记录

## 文档定位

本文档用于 Phase 2 开始前的维护者共识梳理。它不改变当前 MVP 行为，只记录
`packages/core` 与 `packages/vite` 的现有实现链路、关键不变量、风险点和后续架构决策入口。

Phase 2 的工作原则是：

```txt
先讨论决策，再执行改动。
先锁定 core 正确性，再扩大项目边界。
先做少包多模块，再评估是否拆更多 npm package。
```

## 2026-07-15 Workspace 测试分层更新

当前生产包为 `packages/core`、`packages/analyzer`、`packages/vite` 和 `packages/rsbuild`。真实构建工具
消费方验收分别收敛到 `fixtures/vite-css-modules` 与 `fixtures/rsbuild-css-modules` workspace，fixture
不是生产 adapter 包；
`playground/vite-react-css-modules` 与 `playground/rsbuild-react-css-modules` 分别承担两个 adapter 的中型
人工 Pilot，不进入自动门禁。

两个 adapter 的依赖方向均为 `adapter -> core/analyzer`，互不依赖：Vite 使用其 CSS plugin seam；
Rsbuild 使用公开 loader `importModule`、css-loader array export 和 Rspack asset hooks。Rsbuild build 保持
原生 extraction；dev 切换到官方 style injection 维持模块图，并将目标模块快照注册到单一共享 style
owner，按稳定 source order 输出且按 atomic key 去重。这既避免 Rspack 2.1 extraction 的嵌套
`importModule` 增量编译 panic，也避免逐模块重复注入同名原子类改变 cascade。两者都不复制
CSS Modules、ICSS、预处理器或资源编译实现。

包内自行定义 build/test/typecheck/verify，根 `package.json` 只通过 workspace 递归提供
`pnpm build`、`pnpm test`、`pnpm typecheck` 和 `pnpm verify` 四个仓库级入口。

## 2026-07-03 状态更新

`packages/core` 已按 `packages/core/CORE_DESIGN.md` 落地 Phase 2 core v1：

- core 当前定位为独立 CSS transform engine。
- public API 为 `transformCss`、`createTransformer` 和相关类型。
- 旧 `compileCssModule` API 不再兼容。
- core 不负责 CSS Modules tokens、Vite virtual module、文件读取写入或 asset emit。
- `analysis` mode 暂不暴露，后续语义定案后再加入。
- `packages/vite` 当前不在工作区内；root build 和 playground 已移除对
  `@semantic-atomic-css/vite` 的直接依赖，避免项目级回归被缺失 adapter 阻断。
- `TransformCssResult` 表示当前输入的转换快照；`createTransformer().getAtomicCss()` 和
  `getReport()` 才表示跨文件聚合视图。
- `createTransformer().getManifest()` 的 atomic 数据来自 registry 快照，classes 数据来自每次
  transform 的 class manifest 合并，避免复用 atomic 的 sources 被后一次输入覆盖。
- unsupported at-rule preserved block 会被尝试 scoped，block 内 source class 也会进入 class mapping，
  让后续 CSS Modules adapter 可以保留 `styles.xxx` fallback hook。
- `createTransformer()` 当前是 append-only build collector，不支持同一 `id` 更新/失效；Vite dev/HMR
  adapter 后续需要补充 invalidate 或重建 registry 策略。
- nested rule 当前整体 preserved 为 scoped CSS block，并记录 `nested-rule` diagnostic，避免丢失
  无法安全证明的 fallback 内容。

当前 core 验收命令：

```bash
pnpm --filter @semantic-atomic-css/core test
pnpm --filter @semantic-atomic-css/core build
pnpm typecheck
pnpm build
```

下文保留 Phase 1 原型链路记录，用作历史背景和 adapter 后续迁移参考。

## Phase 1 packages 结构记录

Phase 1 原型时期 packages 有两个正式包：

```txt
packages/
  core/
    src/index.ts
    test/compiler.test.ts
    test/fixtures.test.ts

  vite/
    src/index.ts
```

Phase 1 职责记录：

- `@semantic-atomic-css/core`：负责 CSS Modules 编译、atomic CSS 生成、preserved CSS、manifest 和 report。
- `@semantic-atomic-css/vite`：负责 Vite 插件接入，拦截 `.module.css`，返回虚拟 JS 模块，并注入虚拟 CSS。

当时实现是 Phase 1 原型形态，行为链路完整，但模块边界还没有按长期架构拆开。

## Phase 1 Core 实现链路记录

`packages/core/src/index.ts` 当时同时承担类型定义、编译流程、selector 处理、atomic 生成、
manifest/report 生成和工具函数职责。

核心流程如下：

```txt
compileCssModule(input)
  ↓
清理 id query，使用 PostCSS 解析 CSS AST
  ↓
遍历 root nodes
  ↓
遇到 rule：分析 selector safe / unsafe
  ↓
safe rule：抽取 declaration，注册 atomic declaration，记录 local class 到 atomic class 的映射
  ↓
unsafe rule：生成 warning，scope selector，写入 preserved CSS
  ↓
遇到 @media / @supports：写入 CssContext 后递归处理子节点
  ↓
生成 tokens、classMap、atomicCss、preservedCss
  ↓
生成 manifest、sizeReport，并缓存到 compiler results
```

### Selector 判断

Phase 1 当时 selector 使用 `postcss-selector-parser` 做结构化解析，不使用正则解析结构化 CSS。

safe selector 需要满足：

- 只有一个 local class。
- 没有 id、tag、attribute、combinator、额外 class。
- 没有 pseudo element。
- 没有 `:global`。
- 最多一个受支持 pseudo class。

Phase 1 当时默认支持的 pseudo class：

```txt
hover
focus
active
disabled
focus-visible
```

不满足 safe 条件时，规则不会 atomize，而是进入 preserved CSS，并输出 warning/report。

### Atomic 生成

每个可转换 declaration 会生成 atomic key。Phase 1 当时 key 内容包括：

- `prop`
- `value`
- `important`
- `context.pseudo`
- `context.media`
- `context.supports`

`!important` 会进入 key，因此 `color: red` 和 `color: red !important` 是不同 atomic declaration。

开发模式默认生成可读 class name，例如：

```txt
_color_red
_hover_color_blue
_media_49f627_font_size_18px
```

生产模式配置上支持 hash class name，但 Phase 1 playground 主要验证 readable 输出。

### Class mapping

Phase 1 当时默认保留 semantic scoped class：

```txt
finalClassName = scopedName + atomicClasses
```

示例：

```txt
input_button__fb7c04 _color_red _font_size_16px
```

这样 preserved unsafe CSS 仍能依赖 scoped class 命中，同时保留 DevTools 可读性和回滚安全感。

### Preserved CSS

以下内容默认会保留：

- unsafe selector。
- custom property declaration，例如 `--button-color: red`。
- 未支持或无法证明安全的 at-rule。
- safe selector 中混入 nested node 的规则。

保留前会尽量把 local class 替换为当时 compiler 生成的 scoped class。

### Manifest 与 Report

Phase 1 manifest 当时包含：

- atomic class 到 declaration、context、sources 的映射。
- `file::localName` 到 `ClassMapping` 的映射。

Phase 1 report 当时包含：

- 文件数、local class 数、atomic declaration 数、复用数量、unsafe rule 数。
- 原始 CSS、atomic CSS、preserved CSS 和 class string 增量的粗略 size 统计。
- unsafe warning 列表。

## Phase 1 Vite 接入链路记录

`packages/vite/src/index.ts` 当时采用 Route B 原型路线，绕开 Vite 原生 CSS Modules pipeline，
自行读取 `.module.css` 并返回 JS module。

Phase 1 流程如下：

```txt
resolveId(.module.css)
  ↓
解析为内部 module id：\0semantic-atomic-css-module/{encoded-file}.js
  ↓
load(内部 module id)
  ↓
readFile(file)
  ↓
compiler.compileCssModule({ id: file, code })
  ↓
输出 warning
  ↓
返回虚拟 JS：import virtualCssId + export default tokens
  ↓
load(virtualCssId)
  ↓
返回 atomicCss + preservedCss
  ↓
generateBundle()
  ↓
emit manifest/report assets
```

这个路线的优点是实现清晰、可控，适合 MVP；缺点是需要后续逐步补齐 CSS Modules 兼容行为。

## Phase 1 核心不变量记录

以下规则在 Phase 2 之前不应被打破：

- 只处理 `.module.css`。
- 不改写 JSX / TSX 使用方式。
- 默认保留 semantic scoped class。
- unsafe CSS 必须作为 scoped fallback CSS 保留。
- unsafe selector 必须输出 warning/report。
- `core` 不应依赖 Vite、React 或浏览器运行时。
- atomic class 顺序必须稳定。
- 同一个 local class 内必须保持 declaration 原始顺序。
- `!important` 必须进入 atomic key。
- 默认保留 CSS custom property declaration。
- 允许使用 `var(...)` 的普通 declaration 被 atomize。
- 不为了提升 atomization rate 改变 cascade 语义。

## Phase 1 主要风险记录

### Core 单文件职责过重

当时 `packages/core/src/index.ts` 同时包含多类职责：

- 公共类型。
- compiler 状态管理。
- PostCSS AST 遍历。
- selector safe 判断。
- selector scoping。
- atomic key / class name 生成。
- CSS render。
- manifest/report/size 生成。
- hash、sanitize、路径处理等工具函数。

这不影响 MVP 正确性，但会提高后续维护、测试和 API 稳定成本。

### Core 混入 adapter 语义

当时 `Compiler` 暴露：

- `isVirtualCssId`
- `loadVirtualCss`
- `virtualCssId`

这些能力更接近 Vite adapter 的 virtual module 管理职责。长期看，`core` 应尽量只返回编译结果，
由 adapter 决定 virtual module id、加载策略和构建工具生命周期。

### CSS Modules 兼容不足

当时 scoped name 是 core 自己生成的近似 CSS Modules 名称，尚未完整支持：

- Vite `css.modules.localsConvention`。
- 自定义 `generateScopedName`。
- named exports。
- `composes`。
- 与 Vite 原生 CSS pipeline 的 source map 和 HMR 行为一致性。

这些不是 Phase 1 目标，但进入真实项目前需要逐步补齐或明确不支持。

### Unsafe reason 颗粒度不足

当时部分 reason 还偏粗，例如后代选择器会归为 `complex-selector`。后续如果 report 要用于治理，
需要稳定 reason taxonomy，并补充测试覆盖。

### 测试矩阵仍偏少

当时已有 core 单测和 3 组 fixture snapshot，覆盖了 basic、pseudo/media/supports、
unsafe/custom property/important。但以下场景仍需要补强：

- selector reason 全量覆盖。
- selector list。
- tag、id、attribute、pseudo element、`:global`。
- shorthand/longhand 顺序敏感场景。
- manifest/report 稳定性。
- Vite dev/build 行为一致性。
- computed style 回归验证。

## Phase 2 推荐架构方向

Phase 2 默认建议先保持两个 npm 包：

```txt
@semantic-atomic-css/core
@semantic-atomic-css/vite
```

不立即拆出更多 npm package，而是在 `core` 内部先拆模块：

```txt
packages/core/src/
  index.ts
  types.ts
  compiler/
  selector/
  atomizer/
  css/
  manifest/
  report/
  utils/
```

推荐目标：

- public API 尽量稳定。
- 内部模块职责清晰。
- selector、atomizer、report 可以独立测试。
- core 尽量保持 adapter-agnostic。
- Vite adapter 独立管理 virtual module、文件读取、warning 和 bundle asset。

## 下一步决策入口

进入 Phase 2 架构改动前，需要先确认以下决策：

1. 分包策略：先少包多模块，还是现在就拆更细 npm package。
2. public API：是否允许在 `0.0.0/private` 阶段做一次 breaking clean-up。
3. core 边界：是否优先把 virtual CSS id / load 迁移到 Vite adapter。
4. 测试策略：是否先补 fixture 和 selector tests，再做模块拆分。
5. report 策略：unsafe reason taxonomy 是否现在固定下来。
6. 验收策略：是否先修复 pnpm 基线，再恢复 `pnpm verify:phase1` 作为长期 smoke test。

未确认上述决策前，不应开始重构或扩大项目边界。
