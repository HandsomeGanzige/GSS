# Phase 1 Vite 原型跟进

## Phase 1 目标

Status: done

跑通一个 Vite React playground，将语义化 CSS Modules 转换为 atomic CSS，同时保留 semantic scoped class 和 unsafe CSS fallback。

## 非目标

- 不做 npm 发布。
- 不支持 Sass、Less、Rsbuild、source map、完整 HMR、`composes` 或 CSS Modules named exports。
- 本阶段不完整兼容 Vite CSS Modules 配置。
- 除 compiler report 外，不做跨文件全局 atomic CSS dedupe。

## 状态枚举

- pending
- in_progress
- done
- blocked

## 里程碑

| 里程碑 | 状态 | 预期结果 | 验证方式 |
| --- | --- | --- | --- |
| 1. 工程骨架 | done | pnpm monorepo，包含 core、vite 和 playground packages | `pnpm install` |
| 2. Core compiler | done | `.module.css` 编译为 tokens、atomic CSS、preserved CSS、warnings、manifest 和 report | `pnpm test` |
| 3. Vite plugin | done | `.module.css` 被拦截，返回 JS tokens 并导入 virtual CSS | `pnpm build` |
| 4. Playground 验收 | done | React 页面渲染基础样式、hover 和 unsafe fallback | `pnpm dev`，Chrome 验收 |
| 5. 最小测试和报告 | done | core 行为被测试覆盖，并输出 report summary | `pnpm verify:phase1` |

## 验收标准

- `styles.button` 同时包含 semantic scoped class 和 atomic classes。
- safe declarations 被转换为 atomic CSS rules。
- unsafe selectors 被 scoped 后作为 fallback CSS 保留。
- playground 可以成功构建。
- report 包含 files、local classes、atomic declarations 和 unsafe rules。

## 风险

- Route B 有意近似 CSS Modules scoping，并不追求完整兼容。
- 如果 atomic CSS 顺序偏离原 declaration 顺序，可能改变 CSS cascade。
- unsafe CSS emit 前必须完成 scoped class 替换。
- virtual CSS 解析不一致时，dev/build 行为可能分裂。

## 进度记录

- 2026-07-01: 创建阶段跟进文档，开始 Phase 1 实现。
- 2026-07-01: 实现 pnpm workspace、core compiler、Vite adapter 和 React playground。
- 2026-07-01: 验证 `pnpm test`、`pnpm typecheck` 和 `pnpm build`。
- 2026-07-01: 启动 dev server，并确认页面可访问。
- 2026-07-01: 新增自动验收命令 `pnpm verify:phase1` 和手动验收指南。
- 2026-07-01: Chrome 验收 `http://127.0.0.1:5174/` 通过，确认 atomic CSS、hover CSS、preserved fallback 和 console 状态。
- 2026-07-01: 新增 compiler fixture snapshot tests，覆盖 basic、pseudo/media/supports、unsafe/custom property/important。

## 命令验证结果

- `pnpm install`：通过。
- `pnpm test`：通过，9 个 core tests。
- `pnpm typecheck`：通过。
- `pnpm build`：通过，其中 `.card .button` 的 unsafe selector warning 符合预期。
- `pnpm verify:phase1`：检查 tests、typecheck、build、manifest、report、atomic CSS、hover CSS 和 preserved fallback CSS。
- Report summary：1 file，5 local classes，30 atomic declarations，1 unsafe rule。

## 浏览器验证结果

- URL: `http://127.0.0.1:5174/`
- Browser: Chrome via Codex Chrome Extension。
- Title: `Semantic Atomic CSS Playground`
- Button class：包含 semantic scoped class `button_button__...` 和 atomic classes。
- 默认按钮背景：`rgb(37, 99, 235)`
- Hover 按钮背景：`rgb(29, 78, 216)`
- Preserved fallback：`.card .button` 阴影生效。
- Console：无 error / warning。
