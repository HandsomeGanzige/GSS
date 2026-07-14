# Phase 3 Vite Adapter 实现追踪

## 当前状态

截至 2026-07-06，Phase 3 Vite adapter 第一版已落地，CSS Modules 兼容收尾项已补齐。

2026-07-07 Phase 4 已在此基础上完成 Route A 迁移。本文前半部分保留 Phase 3 Route B 历史记录；
当前实现状态以本节补记和 `docs/phase-4-production-readiness-plan.md` 为准。

已完成：

- 新增 `packages/vite`，包名为 `@semantic-atomic-css/vite`。
- 采用 Route B：Vite adapter 拦截 `.module.css`，返回内部 JS virtual module。
- core 仍然只接收标准 CSS 字符串和 `ScopeStrategy`，不感知 CSS Modules。
- adapter 内生成 scoped class、default export tokens、dev virtual CSS、build 全局聚合 CSS asset。
- 新增 `playground/vite-css-modules-acceptance`，作为自动验收用的精简 React + Vite + CSS Modules fixture。
- `playground/vite-react-css-modules` 已接入 `semanticAtomicCss()`，并扩展为多路由、多组件业务仪表盘场景。
- root 新增 `pnpm verify:phase3`。
- root 新增 `pnpm verify:phase3:visual`，用于 Playwright computed style 对照验收。
- 补齐 `localsConvention` 全枚举：`asIs`、`camelCase`、`camelCaseOnly`、`dashes`、`dashesOnly`。
- 补充 `modules.generateScopedName` 字符串模板与函数形式测试，明确 GSS 只承诺自身 scoped name 稳定性。
- 固定 atomic class name 策略：dev 默认 readable，build 默认 hash，可通过 `core.className` 显式覆盖。
- 补充 manifest/report source location 验收，确认 `id`、`line`、`column` 可反查原 `.module.css`。
- 补充 dev HMR 写文件单元验收，确认 full reload 策略下不会继续使用过期 tokens、atomic CSS 或 fallback CSS。

## 已确认实现范围

- 只处理 `.module.css`。
- scoped class 由 GSS 稳定生成，并预留 `modules.generateScopedName`。
- tokens 默认返回 `suggestedClassName`。
- `localsConvention` 支持 `asIs`、`camelCase`、`camelCaseOnly`、`dashes`、`dashesOnly`。
- 第一版不支持 named exports。
- dev/HMR 采用 full reload 作为 Phase 3 最终策略，不承诺 CSS-only HMR。
- build 必须输出全局聚合 CSS asset。
- dev 默认 readable atomic class name，build 默认 hash atomic class name。
- manifest/report 默认不输出。
- strict mode 只保留设计，不实现 fail build。
- 不修改 core，不实现 `invalidate(id)` 或 rebuild API。

## Phase 4 Route A 迁移补记

已完成：

- Vite adapter 改为通过 Vite 6 公开导出的 `preprocessCSS` 获取原生 CSS Modules scoped CSS 和
  `modules` tokens。
- adapter 不再自行生成 scoped class，也不再自行实现 `localsConvention` tokens；GSS 显式
  `modules.localsConvention` / `modules.generateScopedName` 会覆盖传给 Vite preprocess 的 CSS Modules 配置。
- core 继续只接收标准 CSS 字符串和 `ScopeStrategy`。Route A 下传给 core 的 CSS 已是 Vite scoped CSS，
  scope 使用 identity class resolver。
- default export 以 Vite 原生 tokens 为基础，只对确认是 class token 且在 scoped CSS 中出现的 class
  追加 atomic class；`@value`、`:export` 等非 class export 保持原值。
- `composes`、`:import(...)`、`:export`、`@value` 已由 Route A 测试覆盖为可继承路径。
- `modules.namedExports: true`、`diagnostics.strict: true` 和未显式覆盖的 `css.modules: false` 会显式失败。
- core 新增 `non-exported-class` preserved reason，用于避免 Route A 下 `:global(...)` 等非 tokens class
  被误 atomize 后无法命中 DOM。
- 新增 `@semantic-atomic-css/analyzer`，显式开启 report 时在 JSON 中追加 `analysis` 字段，包含 unsafe
  reason 分布、preserved CSS 占比、高风险文件、atomic 复用、gzip/brotli 体积估算和 `ready` /
  `risky` / `blocked` 健康度。
- root 新增 `pnpm verify:phase4`，该命令继承 `pnpm verify:phase3` 并额外验证 Route A feature fixture
  和 analyzer report。
- 2026-07-07 第二批补强：build 测试与 `pnpm verify:phase4` 临时 fixture 显式覆盖 `:import(...)`，
  并验证 Vite `css.modules: false` 可由 GSS 显式 `modules` 配置重新启用 Route A preprocess 路径；
  report 断言补充 analyzer `health`、高风险文件和 gzip/brotli 字段。
- 2026-07-07 第三批补强：未显式配置 GSS `modules` 时，Vite `css.modules.namedExports: true`
  会显式失败；显式配置 GSS `modules` 时，以 GSS modules 配置覆盖 Vite `css.modules`，避免 named
  exports 语义漏进只支持 default export 的 Route A 输出。
- 2026-07-07 第四批补强：build 测试与 `pnpm verify:phase4` 临时 fixture 增加普通 CSS 对照，确认普通
  CSS 继续由 Vite 原生 CSS asset 输出，Route A 接管的 CSS Modules scoped CSS 不会重复进入该 asset。
- 2026-07-07 visual flake 修复：`dev/desktop/base/cascade-active` 曾出现 semantic 背景色偶发回退到
  `#ffffff`。根因是 dev 多个 virtual CSS style tag 可能带着 partial snapshot 后注入重复 atomic key。
- 2026-07-14 追加修正：旧 cascade layer 方案会让 GSS atomic normal declaration 输给未分层普通 author
  CSS，例如全局 `button { font: inherit; }`。当前 dev 改为单一 shared CSS owner，在同一个
  `virtual:semantic-atomic-css/dev.css` 中聚合并去重 atomic CSS，不再使用 layer；`pnpm verify:phase3:visual`
  会覆盖 interaction button 的 `fontWeight: 800`。
- root 新增 `pnpm verify:phase4:full`，用于串联 Phase 4 静态验收和 visual computed style 对照。

仍然不做：

- 不支持普通全局 CSS 自动 atomic 化。
- 不支持 `.module.scss` / `.module.less`。
- 不实现 named exports 和 strict mode。
- 不做 CSS-only HMR、完整 source map 或 browser overlay。

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
- JS module 统一导入 `virtual:semantic-atomic-css/dev.css`，由单一 dev CSS owner 持有当前全局快照。
- virtual CSS 内容基于当前 `devResults` 生成：atomic declaration 按首次出现顺序聚合并按 atomic key 去重；
  preserved fallback CSS 按当前模块顺序拼接。
- 这样可以避免多个 `.module.css` 在 dev 下重复注入同名 atomic class，同时避免 cascade layer 让 atomic
  normal declaration 输给未分层普通 author CSS。
- shared virtual CSS id 不包含 `.module.css` 源路径，避免 Vite 把已生成的 atomic CSS 二次当作 CSS Modules
  scoped。
- shared owner 已加载后首次转换新 CSS Module 时，通过 Vite `reloadModule()` 使 owner 的 transform 缓存失效
  并通知浏览器重新执行该 virtual CSS 模块，避免只更新 `devResults` 而遗漏新模块样式。
- 文件更新时清空缓存并触发 full reload。
- 较大场景 playground dev 分为两个对照模式：
  - `pnpm dev:semantic` 或 `pnpm dev`：传入 `GSS_PLAYGROUND_CSS_MODE=semantic`，启用 `semanticAtomicCss()`。
  - `pnpm dev:native`：传入 `GSS_PLAYGROUND_CSS_MODE=native`，关闭 GSS adapter，使用 Vite 原生 CSS Modules。
- 自动验收 fixture dev 分为两个对照模式：
  - `pnpm dev:acceptance`：传入 `GSS_ACCEPTANCE_CSS_MODE=semantic`，启用 `semanticAtomicCss()`。
  - `pnpm dev:acceptance:native`：传入 `GSS_ACCEPTANCE_CSS_MODE=native`，关闭 GSS adapter。

自动验收 fixture：

- `vite-css-modules-acceptance` 是测试用例式页面，不承载业务仪表盘职责。
- 页面使用稳定 `data-gss-case` 锚点，供 visual verifier 采集 computed style。
- CSS 覆盖重复 atomic declaration、`:hover`、`:focus-visible`、`:disabled`、`@media`、`@supports`、
  shorthand/longhand 顺序、`!important`、custom property、descendant、compound class、attribute selector 和
  pseudo-element。
- `pnpm verify:phase3` 的静态产物验收已改为检查该 fixture 的 build 输出。
- `pnpm verify:phase3:visual` 使用 Playwright 驱动本机 Google Chrome 启动 semantic/native dev 和 build preview，对比桌面与窄屏
  computed style。HMR 写文件验收暂不纳入本次范围。

较大 playground 场景：

- `vite-react-css-modules` 已从单卡片 demo 扩展为 `Semantic Ops Console` 多路由业务仪表盘。
- 路由使用无依赖 hash route，覆盖 `Overview`、`Modules`、`Diagnostics`、`Build` 四个视图。
- 页面由多个 route 文件、多个 React 组件和多个 `.module.css` 文件组成，用于观察跨模块 atomic CSS 聚合与去重。
- CSS 覆盖普通 class、`:hover`、`:focus-visible`、`:disabled`、`@media`、`@supports`。
- 保留少量 descendant、compound class、attribute selector、pseudo-element，验证 unsafe selector fallback。
- 页面内保留 tokens debug 面板，方便人工确认 default export 中同时包含 semantic scoped class 与 atomic classes。
- 该 playground 用于人工观察较大场景，不再作为 Phase 3 自动验收基准。

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
- dev 不是 CSS-only HMR，体验后续可通过 core invalidate/rebuild API 改进；Phase 3 仅保证 full reload 下缓存失效正确。
- manifest/report 默认关闭；如需要在 CI 中检查，需要显式开启配置。
- Playwright visual verifier 第一版只覆盖本机 Google Chrome；跨 Firefox/WebKit 差异后续再评估。
- HMR 写文件已有 adapter 单元验收；visual 验收暂不实现，避免自动验收脚本修改 tracked source。

## Phase 3 收尾 checklist

- [x] 补齐 `localsConvention` 全枚举和重复导出 key 冲突测试。
- [x] 补齐 `modules.generateScopedName` 字符串模板与函数形式测试。
- [x] 明确 dev/build atomic class name 默认策略，并覆盖 readable/hash/prefix。
- [x] 验收 manifest/report 中的基础 source location。
- [x] 补充 HMR 写文件单元验收，证明 full reload 策略不会保留过期 CSS 结果。
- [x] 在 acceptance fixture 中增加 dashed 与 camelCase CSS Modules export key 场景。
- [x] 明确 named exports、`composes`、`:import`、`:export`、Less/Sass、CSS-only HMR、完整 source map 进入后续阶段。
