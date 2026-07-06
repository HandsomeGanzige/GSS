# Phase 3 Vite Adapter 验收记录

## 验收命令

从仓库根目录执行：

```bash
pnpm verify:phase3
```

该命令会执行：

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `node scripts/verify-phase-3.mjs`

## 当前验收结果

2026-07-06 已通过：

```txt
pnpm verify:phase3
```

覆盖范围：

- core 单元测试通过。
- Vite adapter 单元测试通过。
- Vite adapter dev transform 覆盖 virtual CSS id 编码，确保 atomic CSS 不会被 Vite CSS Modules 二次 scoped。
- Vite adapter dev transform 覆盖全局 atomic CSS 去重顺序，确保后加载模块不会用重复 atomic class 覆盖
  active 状态或 `@media` 覆盖。
- 根项目 TypeScript typecheck 通过。
- core、vite package 和 playground build 通过。
- playground 已扩展为多路由、多组件业务仪表盘，覆盖多个 `.module.css` 文件的全局 CSS 聚合。
- playground build 输出 `dist/assets/semantic-atomic.css`。
- `dist/index.html` 注入全局聚合 CSS asset。
- unsafe selector fallback CSS 保留在全局 CSS asset 中。
- 验收脚本检查多路由文案、模块矩阵、selector 矩阵、业务场景 declaration、attribute fallback、pseudo-element fallback 和 scoped descendant fallback。
- 默认不输出 `semantic-atomic-manifest.json`。
- 默认不输出 `semantic-atomic-report.json`。

## 手动检查重点

构建后可检查：

```txt
playground/vite-react-css-modules/dist/index.html
playground/vite-react-css-modules/dist/assets/semantic-atomic.css
```

期望：

- HTML 包含 `assets/semantic-atomic.css`。
- `semantic-atomic.css` 先输出 atomic CSS，再输出 preserved fallback CSS。
- `Semantic Ops Console` 的 `Overview`、`Modules`、`Diagnostics`、`Build` 四个 hash route 均可访问。
- 页面在桌面和窄屏下布局可读，不出现文字重叠。
- dev 对照检查中，`pnpm dev:semantic` 与 `pnpm dev:native` 的 computed style 应只允许 class token 字符串差异；
  active nav 高亮、窄屏 topbar、窄屏卡片网格不应出现视觉差异。
- descendant、attribute、pseudo-element 等 unsafe selector 对应 fallback 被 scoped 后保留。
- tokens debug 面板展示的 class 字符串包含 semantic scoped class 与 atomic classes。
- 默认没有 manifest/report JSON。

## 非目标确认

本阶段不验收：

- Less/Sass。
- named exports。
- strict mode fail build。
- CSS-only HMR。
- core `invalidate(id)` 或 rebuild API。
- 与 Vite 原生 CSS Modules hash 完全一致。
