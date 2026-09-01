# Webpack React CSS Modules Pilot

该 Pilot 使用 Webpack `5.109.2`、css-loader `7.1.4`、MiniCssExtractPlugin/style-loader 与
HtmlWebpackPlugin，对比 `@semantic-atomic-css/webpack` semantic 模式和原生 CSS Modules 模式。

## 场景

- `index.html`：React 懒加载路由，混用 CSS/SCSS/Less Modules、additionalData、本地 SVG、composes、
  safe/unsafe selector 与响应式布局。
- `inspector.html`：独立 entry，观察跨模块 cascade、ICSS class/value 同值、多入口 link 和 lazy chunk。
- semantic build 输出 `static/css/semantic-atomic.css`、manifest/report；native build 只输出 Webpack 原生产物。

## 命令

```bash
pnpm --filter playground-webpack-react-css-modules dev
pnpm --filter playground-webpack-react-css-modules dev:native
pnpm --filter playground-webpack-react-css-modules build:semantic
pnpm --filter playground-webpack-react-css-modules build:native
pnpm --filter playground-webpack-react-css-modules acceptance
```

`acceptance` 检查类型、semantic/native 真实构建、双 HTML atomic link 顺序和 metadata assets；不进入根
`pnpm verify`。稳定自动 computed-style/cache/HMR 回归由 `fixtures/webpack-css-modules` 承担。全局 atomic
cascade 使用 canonical source-id/key 顺序；Pilot 不把多个 Modules token 的同权重 winner 交给 import 顺序。
