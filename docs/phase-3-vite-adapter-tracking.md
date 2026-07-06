# Phase 3 Vite Adapter 实现追踪

## 当前状态

截至 2026-07-06，Phase 3 Vite adapter 第一版已落地。

已完成：

- 新增 `packages/vite`，包名为 `@semantic-atomic-css/vite`。
- 采用 Route B：Vite adapter 拦截 `.module.css`，返回内部 JS virtual module。
- core 仍然只接收标准 CSS 字符串和 `ScopeStrategy`，不感知 CSS Modules。
- adapter 内生成 scoped class、default export tokens、dev virtual CSS、build 全局聚合 CSS asset。
- playground 已接入 `semanticAtomicCss()`，并扩展为多路由、多组件业务仪表盘场景。
- root 新增 `pnpm verify:phase3`。

## 已确认实现范围

- 只处理 `.module.css`。
- scoped class 由 GSS 稳定生成，并预留 `modules.generateScopedName`。
- tokens 默认返回 `suggestedClassName`。
- `localsConvention` 第一版支持 `asIs` 和 `camelCaseOnly`。
- 第一版不支持 named exports。
- dev/HMR 允许 full reload。
- build 必须输出全局聚合 CSS asset。
- manifest/report 默认不输出。
- strict mode 只保留设计，不实现 fail build。
- 不修改 core，不实现 `invalidate(id)` 或 rebuild API。

## 实现说明

`packages/vite` 的主要模块：

- `src/plugin.ts`：Vite plugin 主流程，负责 resolve/load、dev virtual CSS、build 聚合 CSS、HTML 注入和 diagnostics warning。
- `src/cssModules.ts`：CSS Modules adapter 辅助逻辑，负责 scoped class、tokens、文件匹配和路径清理。
- `src/options.ts`：补齐用户配置默认值。
- `src/types.ts`：公开配置类型。

build 阶段：

- 每个 `.module.css` 通过 `createTransformer()` 写入全局 atomic registry。
- 最终 CSS asset 使用 `transformer.getAtomicCss()` 输出跨文件去重后的 atomic CSS。
- preserved fallback CSS 按模块 transform 顺序拼接，并放在 atomic CSS 之后。
- 输出文件为 `assets/semantic-atomic.css`。
- 默认不输出 manifest/report。

dev 阶段：

- 每个 CSS Module 使用 `transformCss()` 单文件转换。
- JS module 导入 per-file virtual CSS。
- virtual CSS 内容基于当前 `devResults` 生成全局 atomic CSS 快照：atomic declaration 按首次出现顺序聚合，并按
  atomic key 去重；preserved fallback CSS 按当前模块顺序拼接。
- 这样可以避免多个 `.module.css` 在 dev 下重复注入同名 atomic class，导致后加载模块覆盖前面模块的状态样式或
  `@media` 覆盖。
- virtual CSS id 的 source 使用 base64url 编码，避免 `.module.css` 源路径出现在 CSS id query 中，
  导致 Vite 把已生成的 atomic CSS 二次当作 CSS Modules scoped。
- 文件更新时清空缓存并触发 full reload。
- playground dev 分为两个对照模式：
  - `pnpm dev:semantic` 或 `pnpm dev`：传入 `GSS_PLAYGROUND_CSS_MODE=semantic`，启用 `semanticAtomicCss()`。
  - `pnpm dev:native`：传入 `GSS_PLAYGROUND_CSS_MODE=native`，关闭 GSS adapter，使用 Vite 原生 CSS Modules。

playground 场景：

- `vite-react-css-modules` 已从单卡片 demo 扩展为 `Semantic Ops Console` 多路由业务仪表盘。
- 路由使用无依赖 hash route，覆盖 `Overview`、`Modules`、`Diagnostics`、`Build` 四个视图。
- 页面由多个 route 文件、多个 React 组件和多个 `.module.css` 文件组成，用于观察跨模块 atomic CSS 聚合与去重。
- CSS 覆盖普通 class、`:hover`、`:focus-visible`、`:disabled`、`@media`、`@supports`。
- 保留少量 descendant、compound class、attribute selector、pseudo-element，验证 unsafe selector fallback。
- 页面内保留 tokens debug 面板，方便人工确认 default export 中同时包含 semantic scoped class 与 atomic classes。

问题复盘：

- dev 下 className 已变化但样式未生效的问题，记录在
  [Phase 3 Vite Dev CSS 注入问题修复笔记](phase-3-vite-dev-css-injection-fix-note.md)。
- 2026-07-06 使用 Codex 内置浏览器对比 `5173` 语义模式与 `5175` 原生 CSS Modules 模式时，发现 dev
  per-file atomic CSS 重复注入会造成渲染差异：
  - active route nav 的 `_background_ecfdf5` 被后续模块重复输出的 `_background_ffffff` 覆盖。
  - 窄屏下 `.topbar` 的 `@media (max-width: 900px)` `align-items: flex-start` 被后续模块重复输出的
    `_align-items_center` 覆盖。
  - 修复后 dev virtual CSS 改为基于当前已转换模块生成全局 atomic 去重快照，保持与 build 全局聚合模型一致。

## 风险与后续事项

- build 全局 CSS 注入目前面向 Vite app HTML build；library/SSR 产物还需要后续设计。
- scoped class name 不保证与 Vite 原生 CSS Modules 完全一致。
- `composes`、`:import`、`:export`、named exports、Less/Sass 暂不支持。
- dev 不是 CSS-only HMR，体验后续可通过 core invalidate/rebuild API 改进。
- manifest/report 默认关闭；如需要在 CI 中检查，需要显式开启配置。
