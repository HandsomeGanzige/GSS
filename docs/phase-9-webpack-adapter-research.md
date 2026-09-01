# Phase 9 Webpack 5 Adapter 官方接入点与 Batch 0 研究

## 状态

- Status: completed / go
- 验证日期：2026-08-24
- 锁定基线：Webpack `5.109.2`、css-loader `7.1.4`、style-loader `4.0.0`、
  MiniCssExtractPlugin `2.10.2`、HtmlWebpackPlugin `5.6.8`、webpack-dev-server `5.2.6`、
  sass-loader `16.0.8`、less-loader `12.3.3`

## 官方接口

生产路线只使用以下公开接口：

- Webpack loader `this.importModule()` / `this.emitFile()`：https://webpack.js.org/api/loaders/
- `compilation.hooks.processAssets`：https://webpack.js.org/api/compilation-hooks/#processassets
- `emitAsset/getAsset/deleteAsset`：https://webpack.js.org/api/compilation-object/
- css-loader array export / CSS Modules：https://webpack.js.org/loaders/css-loader/
- HtmlWebpackPlugin hooks：https://github.com/jantimon/html-webpack-plugin#events
- webpack-dev-server `setupMiddlewares`：https://webpack.js.org/configuration/dev-server/#devserversetupmiddlewares

## 可执行结论

Batch 0 临时 spike 与正式 fixture 证明：

1. bridge 位于 CSS owner 与 css-loader 之间时，`importModule()` 返回 array rows 和 default `.locals`；row
   已包含 scoped CSS、资源 URL 与预处理结果。
2. 生成模块继续静态 import native css-loader request 后，MiniCssExtractPlugin 能提取替换后的 fallback，
   资源文件与 dependency graph 保持存在；style-loader dev 可由共享 owner 接管目标样式。
3. loader `emitFile()` 的内部 metadata 在第二个独立 Webpack 进程 filesystem-cache 命中时会重放；实测
   loader 执行计数保持 `1 -> 1`，metadata 仍被 processAssets 消费，随后 `deleteAsset()`，dist 无泄漏。
4. HtmlWebpackPlugin 可把 atomic link 放在 native CSS link 前，`output.publicPath` 为静态值时 URL 正确。
5. webpack-dev-server middleware、semantic/native dev 与 preview、desktop/narrow computed style 和单一
   browser style owner 已由 Webpack fixture 验证。
6. review 证明独立 readable registry 可能产生同名不同 key；正式实现改用 `readable-keyed` metadata schema 2
   并在 emit 前验证 token/CSS 闭合。跨模块同权重冲突采用 owner 确认的 canonical 全局 atomic 顺序，
   不把业务 import-order winner 纳入 native parity 契约。

因此 Route A 为 `go`。未采用 getJSON 修改副作用、生成 JS/CSS 文本解析、`NormalModule` 私有字段、
`loaderContext._module`、禁用缓存或 builtin CSS。

## 保护边界

首版只遍历静态 `rules` / `oneOf` / nested `rules` 与静态 `use`。函数型 use、多个 css-loader、未知 CSS
owner、named exports、非 array export、CSS source map、builtin CSS 和动态 `publicPath: "auto"` fail fast；
不把 raw Webpack 的任意第三方 rule 形态伪装成已支持。
