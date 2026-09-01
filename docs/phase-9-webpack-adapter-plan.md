# Phase 9 Webpack 5 Adapter 方案

## 状态与目标

- Status: completed
- 产品入口：`@semantic-atomic-css/webpack`
- 内部共享 seam：`@semantic-atomic-css/css-loader-bridge`

Webpack adapter 复用 css-loader 的 scoped CSS/default locals、预处理器、ICSS/composes、资源与 dependency
graph，只替换 integration layer，不改变 Core selector、atomic key、manifest/report 语义。全局 atomic CSS
采用 canonical source-id 顺序和 key 去重，不继承跨模块同权重 declaration 的 import-order winner。

## 数据流

```txt
preprocessor -> css-loader rows/locals
  -> Webpack public importModule bridge
  -> css-loader-bridge -> Core
  -> augmented locals + fallback rows
  -> MiniCssExtractPlugin / style-loader
```

build 在 `PROCESS_ASSETS_STAGE_ADDITIONS` 聚合 atomic CSS，内部 cache metadata 同轮消费后删除；
HtmlWebpackPlugin 在原生 CSS link 前注入 atomic link。dev 清空目标 native rows，生成模块向唯一
`data-semantic-atomic-css-webpack-dev` owner 注册当前快照。

## 公共接口

```ts
new SemanticAtomicCssWebpackPlugin({
  include, exclude, core, cssFilename,
  manifest, report, devtools, diagnostics
})
```

默认处理 CSS/SCSS/Less Modules；manifest/report/devtools 默认关闭。build 默认 `compact-keyed`，dev 默认
`readable-keyed`；所有显式策略原样优先，不再把显式 `readable` 或 `compact` 静默改写。两种 keyed 策略使用完整
canonical key 的 128-bit FNV-1a / 固定 25 位 lower-base36 摘要，独立 loader 与全局 registry 仍以
metadata closure 验证 key/class 一致。

静态 RuleSet condition 只在 `compiler.context`、绝对字符串目录和可执行 RegExp/数组 witness 能证明
`.module.css/.scss/.less` 命中或排除时接受；证据不足时 fail fast，不把 unknown 静默当作 disjoint。
`modules: false` pipeline 不安装 bridge，但仍参与后缀 overlap 分析。adapter 校验 rule 实际选择的
css-loader 与 style/extraction owner package identity/major，而不是工作区中另一份可解析依赖；bare request
存在自定义 `resolveLoader.alias/modules/plugins` 时因无法同步证明实际 package 而 fail fast。同一 plugin
实例可用于多个 compiler，每次 `apply` 的 mode、last-good report 和 pending compilation 状态互相隔离。

## 职责

`css-loader-bridge` 只拥有 rows/locals 校验、class evidence、Core identity transform、token augmentation、
stable artifact、canonical renderer、token/CSS 闭合校验和 browser owner。Webpack/Rsbuild 分别拥有 request spelling、synthetic
URL、compiler hook、配置保护、HTML 和 asset 生命周期；Vite 保持独立 native seam 与 production serializer。

## 非目标

普通 CSS atomization、named exports、strict、完整 CSS source map、builtin CSS、SSR/Node/worker/library、
Module Federation、CSS-only HMR 与公开 loader 不在本阶段。`modules: false` 普通 rule 旁路；modules 缺省、
函数型 use/entry、无法证明的静态 condition、全局或 per-entry library 以及显式/继承 CSS source map必须 fail fast。synthetic URL
恢复相对、根路径、父级相对 publicPath 与 query/hash，不得把相对资源改成根路径。
