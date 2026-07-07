# GSS

Semantic CSS Modules to Atomic CSS 原型项目。

## Phase 1

历史上已经跑通第一阶段 Vite 原型：

- `@semantic-atomic-css/core` 将 `.module.css` 编译为 tokens、atomic CSS、preserved CSS、manifest 和 report 数据。
- `@semantic-atomic-css/vite` 采用 Route B 拦截 CSS Modules，并注入 virtual CSS。
- `playground/vite-css-modules-acceptance` 用于自动验收 React + Vite + CSS Modules 核心语义。
- `playground/vite-react-css-modules` 用于人工观察较大场景下的 React + Vite 闭环。

Phase 2 core v1 后曾暂时移除 `packages/vite`。Phase 3 已按 Route B 恢复 Vite adapter。Phase 4
已迁移到 Route A：`@semantic-atomic-css/vite` 通过 Vite 6 `preprocessCSS` 复用原生 CSS Modules
pipeline 结果，在 Vite tokens 和 scoped CSS 基础上调用 core，并在 build 阶段输出全局聚合 CSS asset。

## 常用命令

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm verify:core
pnpm verify:phase1
pnpm verify:phase3
pnpm verify:phase3:visual
pnpm verify:phase4
pnpm verify:phase4:full
pnpm dev
pnpm dev:semantic
pnpm dev:native
pnpm dev:acceptance
pnpm dev:acceptance:native
```

playground 默认运行在 `http://127.0.0.1:5173/`。如果 5173 被占用，Vite 会自动切到下一个端口，例如 `http://127.0.0.1:5174/`。
`pnpm dev` 与 `pnpm dev:semantic` 等价，会通过 `GSS_PLAYGROUND_CSS_MODE=semantic` 启用
`semanticAtomicCss()`。`pnpm dev:native` 会通过 `GSS_PLAYGROUND_CSS_MODE=native` 关闭 GSS adapter，
用于和 Vite 原生 CSS Modules 行为对照。

`pnpm verify:phase1` 当前是 `pnpm verify:core` 的兼容别名，不再执行旧 Vite adapter 产物检查。
旧验收记录见 [docs/phase-1-acceptance.md](docs/phase-1-acceptance.md)。

Phase 3 自动验收使用精简 fixture：

```txt
playground/vite-css-modules-acceptance
```

该 fixture 只覆盖核心 CSS Modules 场景和历史高风险 bug。`playground/vite-react-css-modules` 继续作为
较大业务场景 playground，不作为自动验收基准。

## Phase 2 Core

`packages/core` 已按 [packages/core/CORE_DESIGN.md](packages/core/CORE_DESIGN.md) 落地为独立
CSS transform engine。当前 core 只暴露 `transformCss`、`createTransformer` 和相关类型，
不再兼容旧 `compileCssModule` API，也不负责 CSS Modules tokens、Vite virtual module 或文件 emit。

core 单独验收：

```bash
pnpm --filter @semantic-atomic-css/core test
pnpm --filter @semantic-atomic-css/core build
pnpm exec tsc -p packages/core/tsconfig.json --noEmit
```

## Phase 4 Vite Adapter

`packages/vite` 已恢复为独立 Vite integration package。当前 Phase 4 范围：

- 默认只处理 `.module.css`。
- 采用 Route A，CSS Modules 编译语义优先复用 Vite 原生 `preprocessCSS` pipeline。
- core 仍不感知 CSS Modules、tokens、Vite hook 或 virtual module，只接收 Vite scoped CSS 字符串。
- tokens 以 Vite 原生 CSS Modules `modules` 为基础，只对确认是 class token 的值追加 atomic class。
- `@value`、`:export` 等非 class export 保持 Vite 原生值。
- `composes`、`:import(...)`、`:export`、`@value` 由 Vite 原生 CSS Modules pipeline 处理。
- 未显式配置 GSS `modules` 时继承 Vite `css.modules`；显式配置 GSS `modules` 时，以 GSS modules
  配置作为覆盖源。
- `modules.namedExports: true` 和 `diagnostics.strict: true` 在 Phase 4 显式失败。
- 未显式配置 GSS `modules` 时，Vite `css.modules.namedExports: true` 也会显式失败。
- dev 默认 readable atomic class name，build 默认 hash atomic class name，可通过 `core.className` 覆盖。
- dev 使用当前已转换模块的全局 virtual CSS 快照，并采用 full reload 作为 Phase 3 HMR 策略。
- build 输出全局聚合 CSS asset：`assets/semantic-atomic.css`。
- manifest/report 默认不输出；显式开启 report 后，JSON 顶层保留 core report，并新增 `analysis` 字段。
- `@semantic-atomic-css/analyzer` 负责构建后风险、收益、体积和试用健康度分析。
- strict mode、named exports、CSS-only HMR 和 core invalidate API 暂不实现。

Phase 3 验收：

```bash
pnpm verify:phase3
pnpm verify:phase3:visual
pnpm verify:phase4
pnpm verify:phase4:full
```

`verify:phase3` 执行静态产物验收；`verify:phase3:visual` 会先构建 core、analyzer、vite package，
再使用 Playwright 驱动本机 Google Chrome
启动 semantic/native dev 与 build preview，对比精简 fixture 的 computed style。若 Chrome 不在默认位置，可通过
`GSS_VISUAL_CHROME_EXECUTABLE` 指定可执行文件路径，例如：

```bash
GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm verify:phase3:visual
```

`verify:phase4` 会先继承 `verify:phase3`，再构建临时 Route A fixture，检查 Vite 原生 CSS Modules
feature 继承、`:import(...)`、tokens atomic 增强、非 class export 保持、global fallback、Vite
`css.modules: false` 显式覆盖、Vite `css.modules.namedExports: true` 继承失败、普通 CSS 与 CSS Modules
CSS asset 分流和 analyzer `analysis` 输出。

`verify:phase4` 是静态验收；`verify:phase4:full` 会在此基础上继续执行 `verify:phase3:visual`，作为
Phase 4 完整验收入口。

验收记录见 [docs/phase-3-acceptance.md](docs/phase-3-acceptance.md)，实现追踪见
[docs/phase-3-vite-adapter-tracking.md](docs/phase-3-vite-adapter-tracking.md)。Phase 4 规划与执行记录见
[docs/phase-4-production-readiness-plan.md](docs/phase-4-production-readiness-plan.md)。
