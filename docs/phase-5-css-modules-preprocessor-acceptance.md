# Phase 5 CSS Modules 预处理器验收

## 验收命令

```bash
pnpm verify
pnpm --filter @semantic-atomic-css/vite-fixture test:visual
pnpm --filter @semantic-atomic-css/vite-fixture test:visual -- --suite preprocessor
```

- `pnpm verify`：运行产品包 test/typecheck/build，再验证 base/preprocessor semantic/native、
  资源、manifest/report、错误边界和连续构建 hash。
- fixture `test:visual`：启动 semantic/native dev 与 preview，对比 desktop/narrow computed style，
  并在临时 fixture 中更改 Sass partial 验证 full reload。
- visual 不在根 `verify` 中默认执行。

visual 验收默认使用本机 Chrome channel，也可指定：

```bash
GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual
```

## 自动覆盖

- `.module.css` / `.module.scss` / `.module.less` 的 scoped tokens 与 atomic 增强。
- Sass `@use` partial、Less `@import` partial、mixin/variables 与 Vite `additionalData`。
- safe pseudo、`@media`、`@supports`、unsafe descendant/attribute fallback。
- custom property、`var(...)`、`!important`、shorthand/longhand 和跨文件复用的 Phase 4 回归。
- `url()` class 级保留、`composes` token 闭包、Vite asset emit、relative base、query/hash。
- `publicDir` 内部占位符与 `experimental.renderBuiltUrl` 的 fail-fast。
- direct CSS Module 与 shared partial full reload，含移除 import 后的保守重验证。
- analyzer scoped transform input 体积基线，SCSS/Less source id 和稳定 manifest/report。
- semantic/native dev/build preview 的 computed style 对照。

## 2026-07-15 执行记录

已通过：

- core tests：31 tests。
- analyzer tests：5 tests。
- Vite adapter tests：30 tests。
- `pnpm typecheck`。
- `pnpm verify`，含包级回归、统一 fixture 静态验收和连续构建稳定性。
- `pnpm --filter @semantic-atomic-css/vite-fixture test:visual`，含 base/preprocessor semantic/native dev、
  preview、desktop/narrow computed style 和 Sass partial full reload。

visual 命令在默认沙箱中会因 localhost `EPERM` 失败；本次在获得 localhost/Chrome 权限后完整通过。

中型人工消费方的后续覆盖与指标见
[Phase 5 real-project Pilot tracking](phase-5-real-project-pilot-tracking.md)。该 Pilot 不复制本 fixture
的错误边界或自动 visual 职责。
