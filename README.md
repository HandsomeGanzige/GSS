# GSS

Semantic CSS Modules to Atomic CSS 原型项目。

Vite 6 负责 CSS/SCSS/Less Modules 预处理、scoping、tokens、资源和 dependency graph；
GSS 消费编译后的 scoped CSS，生成 atomic/fallback CSS、manifest 和 report。

## 仓库结构

```txt
packages/
  core/                         标准 CSS AST 转换与 manifest/report 数据
  analyzer/                     风险、收益、体积与 declaration 冲突分析
  vite/                         Vite 6 原生 CSS 管线 adapter

fixtures/
  vite-css-modules/             自动化真实 Vite 消费方验收
    suites/base/                CSS Modules 基础语义
    suites/preprocessor/        SCSS/Less、partial 与资源

playground/
  vite-react-css-modules/       中型人工 Pilot，不进入自动门禁
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

- `test`：运行 core、analyzer 和 Vite adapter 的包内测试。
- `typecheck`：检查三个产品包、统一 fixture 和 Pilot。
- `build`：按 workspace 依赖顺序构建产品包、fixture semantic suites 和 Pilot。
- `verify`：运行三个产品包的 test/typecheck/build，再运行 fixture 静态黑盒验收；
  不含需要 Chrome/localhost 的 visual 测试，也不构建 Pilot 作为门禁。

定向验证单个包时使用 workspace filter：

```bash
pnpm --filter @semantic-atomic-css/core verify
pnpm --filter @semantic-atomic-css/analyzer verify
pnpm --filter @semantic-atomic-css/vite verify
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
```

若 Chrome 不在默认位置：

```bash
GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual
```

## 人工 Pilot

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

## Vite adapter 当前边界

- 默认处理 `.module.css`、`.module.scss` 和 `.module.less`，不处理普通 CSS/SCSS/Less。
- adapter 位于 Vite 6 `vite:css` 与 `vite:css-post` 之间，不单独调用 `preprocessCSS`。
- tokens 由 Vite `css.modules.getJSON` 捕获并原地增强；Vite 继续生成默认 JS exports。
- `composes`、`:import(...)`、`:export`、`@value`、预处理器和资源由 Vite 原生管线处理。
- 包含 `url()` 的 class 及其 `composes` 闭包完整保留为 fallback，build 在 generate 阶段解析最终资源 URL。
- manifest/report 默认不输出；显式开启 report 后附带 analyzer `analysis`。
- strict mode、named exports、CSS-only HMR、Vite 7 和 Rspack adapter 仍非当前范围。

## 设计与历史

- 长期方案：[semantic-atomic-css-plugin-plan.md](semantic-atomic-css-plugin-plan.md)
- core 设计：[packages/core/CORE_DESIGN.md](packages/core/CORE_DESIGN.md)
- Vite adapter 设计：[docs/phase-3-vite-adapter-design.md](docs/phase-3-vite-adapter-design.md)
- 预处理器设计与验收：[docs/phase-5-css-modules-preprocessor-plan.md](docs/phase-5-css-modules-preprocessor-plan.md)、
  [docs/phase-5-css-modules-preprocessor-acceptance.md](docs/phase-5-css-modules-preprocessor-acceptance.md)
- 中型 Phase 5 Pilot：[docs/phase-5-real-project-pilot-tracking.md](docs/phase-5-real-project-pilot-tracking.md)

`verify:phase*` 和 `dev:phase*` 等阶段命令已退役。历史 tracking 文档仍保留当时实际执行记录，
当前开发与验收以本 README 中的能力命令为准。
