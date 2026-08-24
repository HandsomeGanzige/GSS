# Phase 6 Rsbuild / Rspack 官方接入点研究

## 文档状态

- Status: completed
- 调研日期：2026-07-15
- 目的：为 Phase 6 Batch 0 可行性 spike 提供官方资料基线
- 资料范围：Rsbuild、Rspack、css-loader 官方文档；未把第三方教程作为设计依据

本文先记录官方接口能够证明的事实，再补充锁定版本的 Batch 0 结论。官方资料本身不直接保证
adapter 可行；生产路线由本地 spike 与真实 fixture 共同证明。
Phase 6 的实施边界与推进顺序见：

- [Phase 6 Rsbuild / Rspack CSS Modules adapter 方案](phase-6-rsbuild-rspack-adapter-plan.md)
- [Phase 6 推进记录](phase-6-rsbuild-rspack-adapter-tracking.md)

## Batch 0 结果补充

在 Node `22.22.3`、pnpm `8.6.2`、Rsbuild `2.1.6`、Rspack `2.1.4`、css-loader `7.1.4`
上，Route A 得到 `go`：

- Rspack loader public `importModule()` 可以编译并执行右侧原生 css-loader module。
- css-loader 默认 array export 提供完整 scoped CSS rows，array 的 `locals` 是最终 default-export tokens。
- bridge 结构化替换 rows 并增强 `locals`，不解析生成的 JavaScript。
- 返回模块继续 import 同一原生 css-loader module，保留 asset module 和 dependency graph。
- build 可由原生 extraction 接收替换后的 rows；普通 CSS 和 lazy chunk 不被误删。
- dev 必须使用 Rsbuild 官方 style injection，避免 extraction 嵌套 `importModule` 的增量编译 panic。

因此 `getJSON` 仅作为已排除的候选观察点：锁定版本中修改 callback 参数不会进入最终 exports，生产
实现不依赖该副作用。Route B builtin CSS 不再需要 owner 决策。

## 已确认事实

### 1. Rsbuild 默认 CSS Modules 路线基于 css-loader

当前 Rsbuild 官方文档明确说明：

- Rsbuild 默认使用 `css-loader` 处理 CSS 资源，`tools.cssLoader` 可以修改其 options。
- `output.cssModules` 基于 `css-loader` 的 `modules` option，提供 `auto`、
  `exportLocalsConvention`、`localIdentName`、`mode` 和 `namedExport` 等配置。
- 默认 CSS Modules 识别范围比 GSS 当前边界更宽，Rsbuild 可以识别 Sass、Less、Stylus 等 module；
  GSS Phase 6 仍必须主动限制为 `.module.css/.module.scss/.module.less`。

官方资料：

- [Rsbuild `tools.cssLoader`](https://rsbuild.rs/config/tools/css-loader)
- [Rsbuild `output.cssModules`](https://rsbuild.rs/config/output/css-modules)
- [Rsbuild CSS Modules guide](https://rsbuild.rs/guide/styling/css-modules)

因此 Phase 6 的默认研究对象应是“Rsbuild 的 css-loader + Rspack extraction 管线”，不能把
Rspack builtin CSS 当作 Rsbuild 当前默认行为。

### 2. Rsbuild 提供配置和 compiler 生命周期入口

Rsbuild plugin 可以通过以下官方入口扩展构建：

- `modifyEnvironmentConfig`：按 environment 修改 Rsbuild 配置。
- `modifyBundlerChain`：通过 chain API 修改 Rspack 配置和 loader rule。
- `modifyRspackConfig`：修改最终 Rspack 配置。
- `onAfterCreateCompiler`：取得 Rspack compiler，注册更细的 Rspack plugin hooks。
- `onBeforeEnvironmentCompile` / `onAfterEnvironmentCompile`：按 environment 观察编译。
- dev 下有 `onBeforeDevCompile` / `onAfterDevCompile`，build 下有 `onBeforeBuild` / `onAfterBuild`。

官方资料：

- [Rsbuild plugin hooks](https://rsbuild.rs/plugins/dev/hooks)
- [Rsbuild plugin development](https://rsbuild.rs/plugins/dev/)
- [Rspack plugin API](https://rspack.rs/api/plugin-api/)

这些入口足以安装 loader、注册 Rspack plugin 和 emit 额外 assets，但官方文档没有因此承诺
“可取得每个 CSS Module 的 compiled scoped CSS”或“可改写 css-loader 最终 exports”。

### 3. css-loader `modules.getJSON` 能观察 mappings，但不是完整的 GSS 接口

`css-loader` 官方 `modules.getJSON` callback 能取得：

```txt
resourcePath
imports
exports
replacements
```

其中 `exports` 包含 export name 与 scoped/composed value，`replacements` 可用于解析跨文件
`composes`。官方定位是“输出 CSS Modules mapping JSON”。

官方资料：

- [css-loader `modules.getJSON`](https://webpack.js.org/loaders/css-loader/#getjson)

当前不能从文档直接推出以下结论：

- callback 中原地修改 `exports` 会稳定改变最终 JS default/named exports。
- callback 能取得 css-loader 内部已经 scoping、ICSS 和 URL 处理后的完整 CSS 文本。
- callback 的调用时机允许 GSS 在同一 module 内同时完成 tokens 增强和 CSS 替换。

这三点是 Phase 6 最大的可行性风险，必须由 Batch 0 在锁定版本上验证；不得依赖未记录的对象引用
副作用或 css-loader 私有实现细节。

### 4. Sass / Less 应继续由 Rsbuild 官方插件处理

Rsbuild 的预处理器支持由官方插件和对应 loader 提供：

- `@rsbuild/plugin-sass` 基于 `sass-loader`，支持 `.module.scss`、additional data、source map 和 URL rewrite。
- `@rsbuild/plugin-less` 基于 `less-loader`，支持 `.module.less`、loader options 和并行编译。

官方资料：

- [Rsbuild Sass plugin](https://rsbuild.rs/plugins/list/plugin-sass)
- [Rsbuild Less plugin](https://rsbuild.rs/plugins/list/plugin-less)

Phase 6 不自行调用 Sass/Less，也不解析 `@use` / `@import` dependency；adapter 必须消费原生 loader
完成后的标准 CSS 和 Rspack dependency graph。

### 5. Rspack 可以 emit/update assets，但多数模块阶段 hook 是只读的

Rspack `Compilation` 提供 `emitAsset`、`updateAsset`、`deleteAsset` 和 `getAssets`；
`processAssets` 允许在明确 stage 添加或更新构建产物。因此 atomic CSS、manifest 和 report 可以在
Rspack compilation 中输出，而不需要 adapter 直接写文件。

同时，Rspack 官方提醒 Rust compilation state 暴露到 JavaScript 后，许多 hook 和对象是只读的，
JavaScript 侧修改不一定同步回 Rust。因此不能假设 `succeedModule`、`finishModules` 等观察 hook 能改写
最终 CSS Modules code generation。

官方资料：

- [Rspack compilation hooks](https://rspack.rs/api/plugin-api/compilation-hooks)
- [Rspack Compilation API](https://rspack.rs/api/javascript-api/compilation)
- [Rspack compiler hooks](https://rspack.rs/api/plugin-api/compiler-hooks)

### 6. Rspack builtin CSS 是独立备选路线，不是默认管线的透明替换

Rspack builtin CSS 支持 `css/auto`、`css/module` 等 module type，也能输出 CSS Modules exports。
但官方明确说明：`CssExtractRspackPlugin` / `css-loader` 路线不能与 builtin CSS module type 混用。

官方资料：

- [Rspack CSS guide](https://rspack.rs/guide/tech/css)
- [Rspack `experiments.css`](https://rspack.rs/config/experiments)

因此 Batch 0 可以把 builtin CSS 作为独立 Route B 调研，但不能为了取得内部数据而无证据替换
Rsbuild 默认 CSS pipeline。切换路线会改变 CSS Modules、预处理器、extract、配置和兼容预期，必须单独
证明 semantic/native 等价。

### 7. 资源语义必须按 Rsbuild / Rspack 重新验证

Rsbuild 会根据 `output.dataUriLimit` 决定资源内联，使用 `output.assetPrefix` / `dev.assetPrefix`
控制资源 URL，并通过 Rspack asset module 与 extraction pipeline 生成最终文件名。

官方资料：

- [Rsbuild `output.dataUriLimit`](https://rsbuild.rs/config/output/data-uri-limit)
- [Rsbuild `output.assetPrefix`](https://rsbuild.rs/config/output/asset-prefix)
- [Rsbuild `dev.assetPrefix`](https://rsbuild.rs/config/dev/asset-prefix)
- [Rspack asset modules](https://rspack.rs/guide/features/asset-module)

Vite 的 `__VITE_ASSET__` placeholder、`getFileName` 和 `base` 处理不能复制到 Rsbuild adapter。
Phase 6 仍可沿用“含 `url()` 的 class 整体保留”这一 core/产品语义，但最终 URL 的生成、public asset、
query/hash 和 asset prefix 必须重新取证。

## Batch 0 必须回答的问题

| 编号 | 问题 | 当前证据 | 通过条件 |
| --- | --- | --- | --- |
| R1 | 如何取得预处理、CSS Modules scoping 和 ICSS 后的逐模块 CSS？ | 官方 hook 未直接提供 | 使用公开/稳定接口取得，与 native build CSS 可逐规则对照 |
| R2 | 如何增强 default export tokens？ | `getJSON` 可观察 exports | 官方支持的改写点，或 spike 证明稳定且有版本保护的公开行为 |
| R3 | named exports 如何处理？ | Rsbuild 原生支持 `namedExport` | 能同步增强，或配置命中时 fail fast |
| R4 | 如何只移除目标 CSS Modules 原输出？ | `processAssets` 只能看到聚合 assets | 不影响普通 CSS、chunk CSS、懒加载和顺序 |
| R5 | 如何取得资源最终 URL？ | compilation 可读写 assets | 默认/relative/CDN prefix、inline、query/hash 均可证明 |
| R6 | 如何响应 direct module 和 partial 更新？ | compiler 有 invalid/watch hooks | 不复用 stale tokens、atomic CSS 或 fallback CSS |
| R7 | multi-environment 如何隔离状态？ | Rsbuild hooks 按 environment 执行 | 每个 environment 独立 registry、assets 和 diagnostics |

## 研究结论

官方接口研究与 Batch 0 合并后的结论是：Rsbuild 默认 css-loader Route A 可用公开 loader API 实现，
并能同时取得 compiled scoped CSS、最终 tokens、可写回 exports、资源/dependency evidence 和安全 CSS
replacement。生产 adapter 仍需要锁定 Rsbuild 2.1.x 并对 pipeline/version fail fast，不能把该结论
外推到其他版本、named exports、CSS source map、非 web target 或 raw Rspack。
