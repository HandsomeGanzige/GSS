# Phase 6 Rsbuild / Rspack CSS Modules Adapter 方案

## 文档状态

- Status: completed
- 创建日期：2026-07-15
- 完成日期：2026-07-15
- 实施状态：生产实现与自动验收完成
- 产品入口：`@semantic-atomic-css/rsbuild`
- 构建基线：Rsbuild `2.1.6`、Rspack `2.1.4`、css-loader `7.1.4`

Phase 6 的目标是让 Rsbuild 项目复用 GSS 的 safe atomization 能力，并与 Rsbuild 原生 CSS Modules
行为保持可证明的一致。开始实现前必须先完成 Batch 0；如果没有稳定接入点，Phase 6 应以阻塞结论
收口，不能通过复制 CSS Modules 编译语义强行推进。

官方接口调研见 [Phase 6 Rsbuild / Rspack 官方接入点研究](phase-6-rsbuild-rspack-research.md)，
动态实施状态见 [Phase 6 推进记录](phase-6-rsbuild-rspack-adapter-tracking.md)。

## 最终实施结论

Batch 0 通过 Rspack 公开 loader `importModule` 与 css-loader 默认 array export 得到 Route A `go`。
adapter 在 runtime bridge 中执行原生 css-loader，取得预处理/scoping/ICSS/资源处理后的结构化 rows 和
最终 default-export locals；返回模块继续静态依赖原生 css-loader module，因此资源发布与 dependency
graph 仍归 Rspack 所有。未采用 `getJSON` 副作用、JS 文本解析、builtin CSS 或第二套 CSS Modules。

build 保持默认 extraction；dev 使用 Rsbuild 官方 `output.injectStyles` 形成单层 `importModule` 路线，
但目标 rows 不逐模块注入，而是把转换快照注册到单一共享 style owner。owner 按稳定 source order 输出、
按 atomic key 去重，并在 HMR dispose 时移除旧快照。这是 Rspack 2.1.4 增量编译和 cascade 的正确性
边界：extraction 内嵌套 `importModule` 会 panic，逐模块重复注入则会让后加载的同名原子类改变顺序；
共享 owner 已通过 direct module、Sass partial、移除 import 和跨模块 cascade 浏览器验收。完整结果见
[Phase 6 验收](phase-6-rsbuild-rspack-adapter-acceptance.md)。下文分批方案保留为实施历史。

## 背景与目标

Phase 5 已证明以下分层在 Vite 6 下可行：

```txt
构建工具原生 CSS Modules / 预处理器 / 资源 / dependency graph
  -> compiled scoped CSS + native tokens

@semantic-atomic-css/core
  -> safe atomization + conservative fallback

adapter
  -> tokens 增强 + CSS/manifest/report 输出 + dev/build 生命周期
```

Phase 6 只替换 integration layer，不改变 core selector、atomic key、cascade、manifest 或 report 语义。

成功结果应满足：

- Rsbuild 业务继续使用原生 `styles.xxx`，不改 JSX/TSX。
- `.module.css/.module.scss/.module.less` 由 Rsbuild/Rspack 原生管线完成预处理、scoping、ICSS、
  资源和 dependency graph。
- default export tokens 在原生 scoped class 后追加 atomic classes。
- unsafe selector、资源 class 和无法证明安全的内容保留为 scoped fallback CSS。
- build 输出稳定的 atomic/preserved CSS，并可选输出 manifest/report。
- report 的 analyzer 口径与 Vite adapter 一致，before-size 使用 core 实际消费的 scoped CSS。
- semantic/native build、dev 和 preview 的 computed style 在验收矩阵内一致。

## 范围与非目标

### Phase 6 范围

- Rsbuild 项目的 web target。
- `.module.css`、`.module.scss`、`.module.less`。
- Rsbuild 默认 css-loader CSS Modules 管线优先；Rspack builtin CSS 只作为独立备选路线研究。
- default export tokens。
- `composes`、`:import(...)`、`:export`、`@value` 的继承分类。
- Sass `@use`、Less `@import`、additional data、partial dependency。
- 本地资源、内联阈值、asset prefix、query/hash。
- build CSS、manifest、report、warning。
- dev 先保证无 stale state，允许采用 full reload。
- 单 environment 先闭环，再验证 Rsbuild multi-environment 的状态隔离。

### 非目标

- 普通全局 CSS/SCSS/Less 自动 atomic 化。
- `.module.sass`、Stylus 或其他预处理器。
- 独立面向 raw Rspack 用户的 `@semantic-atomic-css/rspack` 公共包。
- 自行实现 CSS Modules scoping、ICSS、preprocessor 或 asset module。
- named exports 支持；Batch 0 未证明前必须 fail fast。
- strict mode、aggressive atomization、新 selector/at-rule 范围。
- CSS-only HMR、完整 source map、browser overlay。
- SSR、Node target、web worker、library output 和 Module Federation。

上述范围需要扩展时必须另行确认，不随 adapter 实现自动纳入。

## 已确认约束

### 正确性约束

- 无法从官方或锁定版本行为证明等价时，保留原 CSS 或 fail fast。
- 不通过读取最终聚合 CSS 猜测逐模块 tokens、source class 或 import 关系。
- 不把 loader/compilation 的临时 id、hash placeholder 或并发完成顺序写入 atomic key。
- build/dev 必须保留 semantic scoped class。
- 原子 CSS 与 fallback CSS 的聚合顺序必须可复现。
- 资源 class 在 URL 解析路径稳定前整体保留，不让 dev/build inline 差异进入 atomic key。

### 包职责

| 范围 | Phase 6 职责 | 禁止事项 |
| --- | --- | --- |
| `packages/core` | 标准 scoped CSS 的 AST 转换 | 不依赖 Rsbuild/Rspack/css-loader |
| `packages/analyzer` | 构建工具无关的风险、收益与体积分析 | 不读取 compilation、文件或 loader state |
| `packages/rsbuild` | Rsbuild plugin、Rspack hooks、tokens、assets、HMR | 不实现第二套 CSS Modules 或预处理器 |
| `fixtures/rsbuild-css-modules` | 小型 semantic/native 黑盒验收 | 不扩展为业务展示项目 |
| Phase 6 Pilot | 中型真实消费方人工验收 | 不进入第一批自动门禁 |

### 共享代码策略

Phase 6 开始时不立即创建 `@semantic-atomic-css/css-modules` 或 `adapter-utils` 包。

Batch 0/1 先按数据契约比较两种 adapter：

- 可直接复用：core、analyzer 及其公共类型。
- 候选共享：tokens class-string 增强、compiled CSS class evidence、资源 class 保留、稳定 report/manifest
  输出排序。
- 必须工具专属：Rsbuild config 继承、loader order、Rspack compilation、asset URL、HMR。

只有 Vite 与 Rsbuild 已出现相同输入输出和测试证据时，才抽取小型工具模块；不抽取完整 CSS Modules
compiler，也不让 Vite 依赖 Rsbuild 或反向依赖。

## 核心可行性问题

Rsbuild 当前默认 CSS Modules 基于 css-loader。公开 `modules.getJSON` 能观察 exports mappings，
但官方文档没有提供 Vite `vite:css` 与 `vite:css-post` 之间那种明确的中间 transform seam。

Phase 6 必须同时取得：

```ts
type CompiledCssModule = {
  id: string;
  sourceCss: string;
  scopedCss: string;
  tokens: Record<string, string>;
  dependencies: string[];
};
```

并证明：

1. `scopedCss` 已完成 Sass/Less、CSS Modules scoping、ICSS 与资源处理。
2. `tokens` 与 Rsbuild 最终 default export 是同一份可增强语义，而非只读旁路快照。
3. GSS 可以移除目标 CSS Modules 的原 scoped CSS，同时不删除普通 CSS 或其他 chunk CSS。
4. dev rebuild 能失效受影响模块和全局 registry，不使用 stale result。

任何一项缺失都不能进入生产 adapter 实现。

## 候选接入路线

### Route A：Rsbuild 默认 css-loader 管线

候选组合：

```txt
Rsbuild plugin
  -> modifyBundlerChain / modifyRspackConfig
  -> 包装 css-loader modules.getJSON 捕获 exports
  -> 自定义 loader 或受支持 hook 捕获 compiled scoped CSS
  -> Rspack plugin 在 processAssets 输出 GSS assets
```

优点：

- 对齐 Rsbuild 默认 CSS Modules 和用户配置。
- 可继承 css-loader 的 locals convention、local ident、ICSS 和 composes。
- Sass/Less 继续由官方插件负责。

待证明：

- `getJSON` 是否能安全增强最终 exports。
- compiled scoped CSS 的公开获取点。
- loader 顺序中 scoped CSS、URL replacement 和 extraction 的真实形态。
- 如何只替换目标模块 CSS，不破坏 code splitting/cascade。

Route A 是 Batch 0 第一优先级，但不是预设成功结论。

### Route B：Rspack builtin CSS

候选组合：

```txt
Rsbuild 配置切换到 Rspack css/module
  -> parser/generator 产生 CSS Modules exports
  -> Rspack plugin 观察 module/code generation 和 assets
```

优点：

- CSS 是 Rspack 原生 module type，理论上减少 css-loader JS wrapper。

风险：

- 不是 Rsbuild 默认路线。
- 不能与 css-loader/CssExtractRspackPlugin 混用。
- 会改变现有 `output.cssModules`、preprocessor、extract 和插件兼容预期。
- 官方 JavaScript hooks 多为只读，仍未证明能改写 exports 或取得逐模块 compiled CSS。

只有 Route A 被公开接口阻塞，且 Route B 能在 semantic/native fixture 中证明配置与行为等价时，
才提交 owner 选择；不得在 Batch 0 内静默切换。

### Route C：自行实现或 fork CSS Modules pipeline

不接受。以下任一条件意味着 Batch 0 blocked：

- 复制 css-loader/PostCSS Modules scoping。
- fork/patch css-loader 或依赖未导出的内部函数。
- 解析最终 JS/CSS 文本猜 tokens 或 module 边界。
- 依赖 Rspack Rust/JS bridge 未公开对象布局。

## Phase 6 分批推进

### Batch 0：可行性 spike（硬门禁）

目标：只回答“是否存在安全接入点”，不创建生产 package。

任务：

1. 锁定一组精确的 Rsbuild、Rspack、css-loader、Sass/Less plugin 版本并记录 Node/pnpm 基线。
2. 创建临时最小 fixture，分别输出 loader chain、`getJSON` 参数、module source、compilation assets 和
   dev invalidation 证据。
3. 验证 `.module.css` 的 native default export 是否可通过公开配置增强。
4. 验证能否取得预处理后的逐模块 scoped CSS，而不是原始 source 或最终聚合 CSS。
5. 验证 `composes`、`:import/:export`、`@value` 的 exports/replacements。
6. 验证 Sass partial、Less import、additional data 和 dependency graph。
7. 验证 asset inline/external、query/hash、asset prefix 和 publicDir。
8. 验证普通 CSS、多个 entry、lazy chunk 不被目标 CSS 替换误伤。
9. 对 Route A 给出 `go / blocked`；需要 Route B 时单独给出迁移影响和 owner 决策项。

退出条件：

- `go`：通过公开/稳定接口获得 `CompiledCssModule` 全部字段，tokens 增强进入最终 JS exports，
  semantic/native 最小 build computed style 一致。
- `blocked`：缺少 compiled scoped CSS、可增强 exports 或安全 CSS replacement 中任意一项；记录上游能力
  缺口、最小复现和可选路线，不开始 Batch 1。

### Batch 1：包骨架与数据边界

前置：Batch 0 `go`。

任务：

- 新增 `packages/rsbuild`，包名 `@semantic-atomic-css/rsbuild`。
- public factory 暂定 `pluginSemanticAtomicCss(options)`，返回 Rsbuild plugin。
- 建立 `CompiledCssModule`、environment state、build collector 和 diagnostics 边界。
- 只依赖 `core`、`analyzer` 和必要的 Rsbuild/Rspack peer API。
- 复用现有 public options 的 core/manifest/report/diagnostics 语义；CSS Modules 配置优先继承
  `output.cssModules`，不发明跨工具统一配置。
- 配置 `namedExport`、非 web target、未支持 environment 时 fail fast。

最低验证：package typecheck/build 和配置保护单测。

### Batch 2：`.module.css` build 闭环

任务：

- 消费 native scoped CSS/tokens，调用 core。
- default export 追加 atomic classes，保留 semantic class。
- 聚合 atomic/preserved CSS，保持稳定 source order 和条件分区。
- 使用 `processAssets` 输出 `semantic-atomic.css`。
- manifest/report 默认关闭，显式开启时输出稳定 JSON 和 analyzer analysis。
- 普通 CSS 保持由 Rsbuild 原生输出，目标 scoped CSS 不重复注入。

最低验证：package build tests + 精简 `.module.css` semantic/native fixture。

### Batch 3：CSS Modules 兼容、预处理器与资源

任务：

- 对齐 `exportLocalsConvention`、`localIdentName`、mode 和 `auto` 的支持/保护范围。
- 验证 `composes`、`:import(...)`、`:export`、`@value`。
- 接入 `.module.scss/.module.less`，覆盖 Sass/Less 官方 plugin 配置和 partial dependencies。
- 移植“资源 class 整体保留”的构建工具无关语义。
- 按 Rspack assets 和 Rsbuild asset prefix 解析最终 URL。
- publicDir、CDN/dynamic prefix 或无法证明的资源配置 fail fast。

最低验证：package tests + preprocessor/resource static fixture + 连续构建 hash。

### Batch 4：dev 与失效模型

任务：

- 每个 environment 独立维护 dev results 和 registry。
- direct CSS Module 与 Sass/Less partial 更新清理受影响 tokens/CSS。
- 第一版允许 full reload，不承诺 CSS-only HMR。
- 首次加载新 lazy module 后刷新 shared CSS owner 或等价单一 owner。
- 证明更新后不保留旧 atomic class、fallback 或 asset URL。

最低验证：adapter dev tests + 浏览器 partial full reload。

### Batch 5：统一验收与文档收口

任务：

- 新增 `fixtures/rsbuild-css-modules`，逻辑分为 `base` 与 `preprocessor` suites。
- semantic/native build 连续运行两次，比较 CSS、JS tokens、manifest 和 report hash。
- semantic/native dev 与 preview 对比 desktop/narrow computed style。
- 覆盖配置 fail-fast、错误 source location、资源和 HMR。
- 将稳定静态门禁接入根 `pnpm verify`；Chrome/localhost visual 继续显式运行。
- 更新 README、包 README、架构和 Phase 6 acceptance 文档。

### Batch 6：中型 Pilot

自动 fixture 完成后再建立 Rsbuild Pilot；不以 Pilot 代替稳定 fixture。

状态更新（2026-07-16）：双入口 React Pilot 已建立于 `playground/rsbuild-react-css-modules`，当前
`in_progress`。静态与浏览器结果、ICSS token 风险和剩余旅程见
[Phase 6 Rsbuild Pilot tracking](phase-6-rsbuild-real-project-pilot-tracking.md)。

观察项：

- 多 entry/lazy route 的 CSS chunk 与全局 atomic CSS 顺序。
- semantic/native tokens、computed style、资源和窄屏布局。
- analyzer 收益/风险指标与 Vite Pilot 是否可解释地不同。
- Sass/Less partial 更新与 Rsbuild multi-environment 状态隔离。

## 公开 API 草案

仅用于明确方向，Batch 0/1 可根据原生配置证据调整：

```ts
import { defineConfig } from '@rsbuild/core';
import { pluginSemanticAtomicCss } from '@semantic-atomic-css/rsbuild';

export default defineConfig({
  plugins: [
    pluginSemanticAtomicCss({
      manifest: { enabled: true },
      report: { enabled: true }
    })
  ]
});
```

原则：

- include 默认只覆盖 `.module.css/.module.scss/.module.less`。
- 不复制 `output.cssModules` 全量配置；优先继承 Rsbuild 原生配置。
- core、manifest、report、diagnostics 的含义与 Vite adapter 一致。
- 工具特有配置使用 Rsbuild 术语，不伪装成 Vite `generateScopedName`。
- public API 在 Batch 1 前仍为草案，不修改现有包。

## 验收矩阵

| 维度 | 必须覆盖 |
| --- | --- |
| 输入 | CSS、SCSS、Less Modules；普通 CSS 对照 |
| tokens | default export、locals convention、custom ident、composes/ICSS |
| selector | safe、pseudo、media/supports、unsafe fallback |
| declaration | custom property、`var()`、`!important`、shorthand/longhand、重复属性 |
| assets | inline/external、query/hash、asset prefix、public asset 保护 |
| output | CSS、manifest、report、analysis、稳定 source order |
| graph | direct module、shared partial、移除 import、lazy module |
| runtime | semantic/native dev、build preview、desktop/narrow、focus/hover |
| config | named export、unsupported target/environment、非默认 CSS pipeline |

## 验证命令

以下命令已经是仓库稳定入口：

```bash
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm --filter @semantic-atomic-css/rsbuild-fixture verify
pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual
pnpm verify
```

Phase 6 不恢复 `verify:phase6` 这类阶段脚本，继续使用能力/包级命令。

## 风险与处理

| 风险 | 处理 |
| --- | --- |
| 无 compiled scoped CSS hook | Batch 0 blocked，不解析最终聚合 CSS猜测模块 |
| `getJSON` 不能改最终 exports | Batch 0 blocked 或提交 Route B owner 决策 |
| Rspack hook 修改不回写 Rust state | 只使用官方可写 API；只读 hook 不承担 transform |
| loader 顺序随版本变化 | 锁定版本、验证 rule/loader order、启动时 fail fast |
| chunk/cascade 顺序偏差 | build/dev 共用 atomic renderer；dev 单一 owner、atomic key 去重、稳定 source order、computed style 对照 |
| asset prefix/inline 差异 | class 级保留，最终 asset stage 解析，未知配置 fail fast |
| multi-environment 状态串扰 | environment key 隔离 collector/diagnostics/assets |
| 过早共享抽象 | 第二 adapter 证明相同契约后再抽小工具 |

## Phase 6 完成标准

只有同时满足以下条件，tracking 才能标记 `completed`：

1. Batch 0 以公开/稳定接口得到 `go` 结论，路线和锁定版本有文档证据。
2. `@semantic-atomic-css/rsbuild` build/dev 均消费原生 CSS Modules 结果，不实现第二套 scoping。
3. CSS/SCSS/Less Modules、ICSS/composes、资源和 partial graph 有成功及保守失败测试。
4. semantic/native default export 与 computed style 在自动 fixture 中一致，差异只允许追加 atomic classes。
5. 普通 CSS、unsupported target/config 不会 silent miscompile。
6. atomic CSS、manifest、report 和 analysis 连续构建稳定。
7. package verify、根 `pnpm verify` 和显式 visual 验收通过。
8. README、架构、acceptance 和 tracking 对当前边界描述一致。

如果 Batch 0 blocked，Phase 6 可以标记 `blocked`，但必须附官方接口缺口、最小复现、上游 issue/提案和
备选路线影响；不能把“写出一个近似 adapter”当作完成。
