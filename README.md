# GSS

Semantic CSS Modules to Atomic CSS 原型项目。

Vite 6 负责 CSS/SCSS/Less Modules 预处理、scoping、tokens、资源和 dependency graph；
GSS 消费编译后的 scoped CSS，生成 atomic/fallback CSS、manifest 和 report。当前提供 Vite 6 与
Rsbuild 2.1 两条原生 CSS Modules adapter。

## 仓库结构

```txt
packages/
  core/                         标准 CSS AST 转换与 manifest/report 数据
  analyzer/                     风险、收益、体积与 declaration 冲突分析
  devtools/                     computed style verifier、dev report 协议与 overlay runtime
  vite/                         Vite 6 原生 CSS 管线 adapter
  rsbuild/                      Rsbuild 2.1 / Rspack 原生 CSS 管线 adapter

fixtures/
  vite-css-modules/             自动化真实 Vite 消费方验收
    suites/base/                CSS Modules 基础语义
    suites/preprocessor/        SCSS/Less、partial 与资源
  rsbuild-css-modules/          自动化真实 Rsbuild semantic/native 验收
    suites/base/                CSS Modules、ICSS、lazy 与资源
    suites/preprocessor/        SCSS/Less、partial 与资源

playground/
  vite-react-css-modules/       Phase 5 Vite React 中型人工 Pilot
  rsbuild-react-css-modules/    Phase 6 Rsbuild React 双入口中型人工 Pilot
```

`packages/*/test` 保持快速的包内行为验证；`fixtures/` 使用真实构建工具进行黑盒验收；
`playground/` 只用于人工体验、调试和 Pilot。

## 根命令

根 `package.json` 只保留仓库级聚合入口：

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm verify
```

- `test`：运行 core、analyzer、devtools、Vite 和 Rsbuild adapter 的包内测试。
- `typecheck`：检查五个产品包、fixtures 和 Pilot。
- `build`：按 workspace 依赖顺序构建产品包、fixture semantic suites 和 Pilot。
- `verify`：运行五个产品包的 test/typecheck/build，再运行 fixture 静态黑盒验收；
  不含需要 Chrome/localhost 的 visual 测试，也不构建 Pilot 作为门禁。

定向验证单个包时使用 workspace filter：

```bash
pnpm --filter @semantic-atomic-css/core verify
pnpm --filter @semantic-atomic-css/analyzer verify
pnpm --filter @semantic-atomic-css/devtools verify
pnpm --filter @semantic-atomic-css/vite verify
pnpm --filter @semantic-atomic-css/rsbuild verify
```

## Vite fixture

`@semantic-atomic-css/vite-fixture` 包含两个逻辑隔离的 suite：

- `base`：CSS Modules tokens、safe/fallback、pseudo、media/supports、cascade 和默认输出边界。
- `preprocessor`：`.module.scss/.less`、Sass `@use`、Less `@import`、additionalData、资源发布和 partial HMR。

开发入口默认为 `base + semantic`，可通过参数选择 suite 与模式：

```bash
pnpm --filter @semantic-atomic-css/vite-fixture dev
pnpm --filter @semantic-atomic-css/vite-fixture dev -- --suite preprocessor --mode native
pnpm --filter @semantic-atomic-css/vite-fixture build
pnpm --filter @semantic-atomic-css/vite-fixture preview -- --suite preprocessor --mode semantic
```

visual 验收会启动 semantic/native dev 与 preview，对比 computed style，并检查 Sass partial full reload：

```bash
pnpm --filter @semantic-atomic-css/vite-fixture test:visual
pnpm --filter @semantic-atomic-css/vite-fixture test:visual -- --suite base
pnpm --filter @semantic-atomic-css/vite-fixture test:visual -- --report /tmp/gss-vite-style-diff.json
```

若 Chrome 不在默认位置：

```bash
GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual
```

## 人工 Pilot

### Vite React Pilot

`playground/vite-react-css-modules` 用于较大业务场景下的人工观察，不是稳定自动 fixture。当前 Pilot
保持 5 个懒加载路由，并混用 CSS、SCSS 与 Less Modules，覆盖 Sass `@use`、Less `@import`、
`additionalData`、本地资源、`composes` 闭包和 semantic/native token 对照：

```bash
pnpm --filter playground-vite-react-css-modules dev
pnpm --filter playground-vite-react-css-modules dev:native
pnpm --filter playground-vite-react-css-modules build
pnpm --filter playground-vite-react-css-modules build:native
pnpm --filter playground-vite-react-css-modules preview
pnpm --filter playground-vite-react-css-modules preview:native
```

Build route 会直接展示当前 CSS 模式、三种输入语言和代表性 token。partial full reload、桌面/窄屏、
semantic/native computed style 仍属于人工 Pilot 验收，不进入根 `verify`。

### Rsbuild React Pilot

`playground/rsbuild-react-css-modules` 使用同类 5-route React 业务界面，并增加独立 `inspector` entry，
观察多入口 HTML、lazy chunk、跨模块 cascade、ICSS tokens、CSS/SCSS/Less Modules 和全局 atomic asset：

```bash
pnpm --filter playground-rsbuild-react-css-modules dev
pnpm --filter playground-rsbuild-react-css-modules dev:native
pnpm --filter playground-rsbuild-react-css-modules build:semantic
pnpm --filter playground-rsbuild-react-css-modules build:native
pnpm --filter playground-rsbuild-react-css-modules acceptance
pnpm --filter playground-rsbuild-react-css-modules preview
pnpm --filter playground-rsbuild-react-css-modules preview:native
```

主入口为 `index.html`，契约检查入口为 `inspector.html`。Pilot 的静态检查不进入根 `verify`；当前推进与
ICSS 保守边界、preview/partial reload 验收结果见
[Phase 6 Rsbuild Pilot tracking](docs/phase-6-rsbuild-real-project-pilot-tracking.md)。

## Rsbuild fixture

`@semantic-atomic-css/rsbuild-fixture` 同样分为 `base` 与 `preprocessor`，使用锁定的 Rsbuild 2.1.6 /
Rspack 2.1.4 原生管线做 semantic/native 对照：

```bash
pnpm --filter @semantic-atomic-css/rsbuild-fixture dev
pnpm --filter @semantic-atomic-css/rsbuild-fixture dev -- --suite preprocessor --mode native
pnpm --filter @semantic-atomic-css/rsbuild-fixture build
pnpm --filter @semantic-atomic-css/rsbuild-fixture preview -- --suite base --mode semantic
pnpm --filter @semantic-atomic-css/rsbuild-fixture verify
pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual
pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual -- --report /tmp/gss-rsbuild-style-diff.json
```

静态验收覆盖连续构建稳定性、tokens、CSS、manifest/report、inline/external/publicDir 资源和配置保护；
visual 对比 dev/preview、桌面/窄屏、交互、lazy chunk，并修改 Sass partial 和移除 import 检查 stale CSS。

## Vite adapter 当前边界

- 默认处理 `.module.css`、`.module.scss` 和 `.module.less`，不处理普通 CSS/SCSS/Less。
- adapter 位于 Vite 6 `vite:css` 与 `vite:css-post` 之间，不单独调用 `preprocessCSS`。
- tokens 由 Vite `css.modules.getJSON` 捕获并原地增强；Vite 继续生成默认 JS exports。
- `composes`、`:import(...)`、`:export`、`@value`、预处理器和资源由 Vite 原生管线处理。
- 包含 `url()` 的 class 及其 `composes` 闭包完整保留为 fallback，build 在 generate 阶段解析最终资源 URL。
- manifest/report 默认不输出；显式开启 report 后附带 analyzer `analysis`。
- `devtools.enabled` 默认关闭；开启后提供版本化 report API 和 Shadow DOM browser overlay。
- strict mode、named exports、CSS-only HMR、Vite 7 和 raw Rspack adapter 仍非当前范围。

## Rsbuild adapter 当前边界

- 默认处理 `.module.css`、`.module.scss` 和 `.module.less`，复用 Rsbuild 原生 css-loader 结果。
- build 保持 extraction；dev 使用 Rsbuild 官方 style injection 维持模块图与 HMR，并把目标 CSS Modules
  快照聚合到单一共享 style owner，按稳定 source order 输出且按 atomic key 去重；这同时避免 Rspack 2.1
  增量编译的嵌套 `importModule` panic 和后加载模块重复同名原子类造成的 cascade 覆盖。
- tokens 在原生 scoped/composed class 后追加 atomic classes；资源 class 与 composed 闭包保守保留。
- 支持可选 manifest/report 与 analyzer；输出顺序和条件分区可复现。
- `devtools.enabled` 默认关闭；开启后按 environment 提供 dev report API 和 Shadow DOM overlay。
- 当前锁定 Rsbuild 2.1.x、web target、default exports 和 css-loader array pipeline。
- named exports、strict、CSS source map、Node/SSR/worker/library 与 raw Rspack adapter fail fast 或不在范围。

## 设计与历史

- 长期方案：[semantic-atomic-css-plugin-plan.md](semantic-atomic-css-plugin-plan.md)
- core 设计：[packages/core/CORE_DESIGN.md](packages/core/CORE_DESIGN.md)
- Vite adapter 设计：[docs/phase-3-vite-adapter-design.md](docs/phase-3-vite-adapter-design.md)
- 预处理器设计与验收：[docs/phase-5-css-modules-preprocessor-plan.md](docs/phase-5-css-modules-preprocessor-plan.md)、
  [docs/phase-5-css-modules-preprocessor-acceptance.md](docs/phase-5-css-modules-preprocessor-acceptance.md)
- 中型 Phase 5 Pilot：[docs/phase-5-real-project-pilot-tracking.md](docs/phase-5-real-project-pilot-tracking.md)
- 中型 Phase 6 Rsbuild Pilot：
  [docs/phase-6-rsbuild-real-project-pilot-tracking.md](docs/phase-6-rsbuild-real-project-pilot-tracking.md)
- Rsbuild adapter：[packages/rsbuild/README.md](packages/rsbuild/README.md)、
  [docs/phase-6-rsbuild-rspack-adapter-acceptance.md](docs/phase-6-rsbuild-rspack-adapter-acceptance.md)
- Phase 7 verifier 与调试体验：[packages/devtools/README.md](packages/devtools/README.md)、
  [docs/phase-7-verifier-devtools-plan.md](docs/phase-7-verifier-devtools-plan.md)、
  [docs/phase-7-verifier-devtools-acceptance.md](docs/phase-7-verifier-devtools-acceptance.md)
- Phase 8 能力强化待办：
  [docs/phase-8-capability-hardening-backlog.md](docs/phase-8-capability-hardening-backlog.md)

`verify:phase*` 和 `dev:phase*` 等阶段命令已退役。历史 tracking 文档仍保留当时实际执行记录，
当前开发与验收以本 README 中的能力命令为准。
