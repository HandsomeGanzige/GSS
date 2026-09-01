# @semantic-atomic-css/webpack

Webpack 5 原生 css-loader CSS Modules adapter。

```js
import { SemanticAtomicCssWebpackPlugin } from '@semantic-atomic-css/webpack';
plugins: [new SemanticAtomicCssWebpackPlugin()]
```

当前支持 web target、css-loader 7 array/default export。build 使用 MiniCssExtractPlugin 2 与
HtmlWebpackPlugin 5；dev 使用 style-loader 4，启用 devtools 时使用 webpack-dev-server 5。各模式未使用的 owner、
HtmlWebpackPlugin 和 WDS 是 optional peer，并由 plugin 按实际模式校验。css-loader 必须显式设置
`modules: { auto: /\\.module\\.(?:css|scss|less)$/, namedExport: false, ... }`；`modules: false` 的普通 CSS rule 完整旁路。`modules` 缺省会触发
css-loader 7 的 `.module.*` auto 语义，因此不能静默旁路，会要求改为显式受支持配置。顶层或 use 数组内的
函数型 loader、named exports、strict、builtin CSS、SSR/worker、全局或 per-entry library、动态 entry、
Module Federation 均 fail fast。

完整 CSS source map 不受支持。目标 css-loader 显式 `sourceMap: true`，或 `sourceMap` 缺省且 Webpack
`devtool` 为 CSS/all 的 `*source-map` 时会 fail fast；可对目标 css-loader 显式设置 `sourceMap: false`
关闭继承。普通 `modules: false` rule 的 source-map 配置不受 adapter 影响。

Webpack/Rsbuild 共用 class name resolver：未显式配置时 dev 使用 `readable-keyed`、build 使用 `compact-keyed`；
所有显式 strategy 与 prefix 原样保留。两种 keyed 策略都使用基于完整 canonical key 的 128-bit FNV-1a、
固定 25 位 lower-base36 摘要。显式 `readable`/`compact` 恢复原 class 字节，但独立 loader 间发生
基名碰撞时会由 token/CSS closure fail fast，应改用 keyed 策略。

metadata 记录实际 key/class 并在最终 emit 前验证 token/CSS 闭合。全局 atomic CSS 按 canonical source id
聚合并按 atomic key 去重，支持多入口与 lazy chunk，但不继承业务 CSS 的 import-order cascade。build 对
重复 source 合并 evidence；dev 中不同 owner 的同 source 快照必须完全一致，否则稳定抛出
`unstable-dev-source-snapshot`，不按异步注册顺序选择可能缺少 fallback 的结果。

Webpack synthetic `importModule` URL 只移除内部 scheme/marker，保留相对或根路径 publicPath、父级相对前缀、
protocol-relative/绝对 CDN、query/hash 和引号。visual 使用动态端口和 30 秒 readiness deadline；所有子进程 spawn 后立即
登记，部分启动失败也会在 finally 中执行 SIGTERM、有限等待和 SIGKILL 清理。

devtools 最近 compilation 失败时返回 `status: "error"` 并保留最后一次成功 environments；候选 snapshot
只在 compilation 成功后提交，下一轮成功的零目标编译恢复 `idle` 并清空旧 environments。
