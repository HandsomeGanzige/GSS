# Rsbuild React CSS Modules Pilot

该 Pilot 使用 Rsbuild `2.1.6` / Rspack `2.1.4` 的原生 React、CSS Modules、Sass、Less 与资源管线，
对比 `@semantic-atomic-css/rsbuild` 的 semantic 模式和不注册 adapter 的 native 模式。

## 场景

- `index.html`：5 个 React 懒加载路由，混用 CSS/SCSS/Less Modules、Sass `@use`、Less `@import`、
  `additionalData`、本地 SVG、`composes`、safe/unsafe selector 和响应式布局。
- `inspector.html`：独立 entry，观察跨模块 cascade、ICSS class/value 同值、多入口 HTML link 和 lazy CSS chunk。
- semantic build 输出 `static/css/semantic-atomic.css`、manifest 和 report；native build 仅保留 Rsbuild 原生产物。

## 命令

```bash
pnpm --filter playground-rsbuild-react-css-modules dev
pnpm --filter playground-rsbuild-react-css-modules dev:native
pnpm --filter playground-rsbuild-react-css-modules build:semantic
pnpm --filter playground-rsbuild-react-css-modules build:native
pnpm --filter playground-rsbuild-react-css-modules acceptance
pnpm --filter playground-rsbuild-react-css-modules preview
pnpm --filter playground-rsbuild-react-css-modules preview:native
```

`acceptance` 只检查类型、真实构建和静态产物结构，不进入根 `pnpm verify`；ICSS class/value 完整同值
必须走保守 fallback，并由静态检查硬断言。artifact inspector 直接使用 manifest 中必填的
`selector.css` 定位 atomic rule，并只把非空 `selector.identity` 作为 opaque identity 校验，不从
`className` 重建 selector。computed style、交互、窄屏和 partial 更新仍属于人工 Pilot；
2026-07-17 的收口结果记录在 Phase 6 Pilot tracking，稳定自动回归继续属于 `fixtures/rsbuild-css-modules`。
