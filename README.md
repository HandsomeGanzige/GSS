# GSS

Semantic CSS Modules to Atomic CSS 原型项目。

Vite 6 负责 CSS/SCSS/Less Modules 预处理、scoping、tokens、资源和 dependency graph；
GSS 消费编译后的 scoped CSS，生成 atomic/fallback CSS、manifest 和 report。当前提供 Vite 6 与
Rsbuild 2.1 与 Webpack 5 三条原生 CSS Modules adapter。

## 仓库结构

```txt
packages/
  core/                         标准 CSS AST 转换与 manifest/report 数据
  analyzer/                     风险、收益、体积与 declaration 冲突分析
  devtools/                     computed style verifier、dev report 协议和 overlay runtime
  css-loader-bridge/            Rsbuild/Webpack 内部 rows/locals 与聚合共享 seam
  vite/                         Vite 6 原生 CSS 管线 adapter
  rsbuild/                      Rsbuild 2.1 / Rspack 原生 CSS 管线 adapter
  webpack/                      Webpack 5 原生 css-loader adapter

fixtures/
  vite-css-modules/             自动化真实 Vite 消费方验收
    suites/base/                CSS Modules 基础语义
    suites/preprocessor/        SCSS/Less、partial 与资源
  rsbuild-css-modules/          自动化真实 Rsbuild semantic/native 验收
    suites/base/                CSS Modules、ICSS、lazy 与资源
    suites/preprocessor/        SCSS/Less、partial 与资源
  webpack-css-modules/          自动化真实 Webpack semantic/native、cache 与浏览器验收

playground/
  vite-react-css-modules/       Phase 5 Vite React 中型人工 Pilot
  rsbuild-react-css-modules/    Phase 6 Rsbuild React 双入口中型人工 Pilot
  webpack-react-css-modules/   Phase 9 Webpack React 双入口中型人工 Pilot
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

- `test`：运行 core、analyzer、devtools、css-loader bridge、Vite、Rsbuild 和 Webpack adapter 的包内测试。
- `typecheck`：检查全部产品/内部包、fixtures 和 Pilot。
- `build`：按 workspace 依赖顺序构建产品包、fixture semantic suites 和 Pilot。
- `verify`：运行各包 test/typecheck/build，再运行 fixture 静态黑盒验收；
  不含需要 Chrome/localhost 的 visual 测试，也不构建 Pilot 作为门禁。

定向验证单个包时使用 workspace filter：

```bash
pnpm --filter @semantic-atomic-css/core verify
pnpm --filter @semantic-atomic-css/analyzer verify
pnpm --filter @semantic-atomic-css/devtools verify
pnpm --filter @semantic-atomic-css/vite verify
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm --filter @semantic-atomic-css/css-loader-bridge verify
pnpm --filter @semantic-atomic-css/webpack verify
pnpm --filter @semantic-atomic-css/webpack-fixture verify
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

## Webpack 5 adapter

Raw Webpack 项目使用标准 css-loader 7，并在 build 配置 MiniCssExtractPlugin 2 / HtmlWebpackPlugin 5，
dev 配置 style-loader 4 / webpack-dev-server 5：

```js
import { SemanticAtomicCssWebpackPlugin } from '@semantic-atomic-css/webpack';

export default {
  plugins: [new SemanticAtomicCssWebpackPlugin()]
};
```

css-loader 必须使用 array/default locals（`modules.namedExport: false`）；普通 `modules: false` rule 完整旁路。
Webpack/Rsbuild 的 readable token 使用 canonical-key hash 并验证最终 CSS 闭合。全局 atomic cascade 按
canonical source-id/key 顺序去重，不继承跨模块同权重 declaration 的业务 import 顺序。验证入口：

```bash
pnpm --filter @semantic-atomic-css/webpack-fixture verify
pnpm --filter @semantic-atomic-css/webpack-fixture test:visual
pnpm --filter playground-webpack-react-css-modules acceptance
```

设计、研究和验收见 `docs/phase-9-webpack-adapter-*.md`。

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

- class name 在 dev 默认 `readable + "_"`，build 默认无 prefix 的 32-bit / 7 字符 lower-base36 `compact`；
  显式 `readable` / `readable-keyed` / `hash` / `compact` / `compact-keyed` / `prefix` 始终优先，既有显式 `hash` 精确输出不变。
- 默认处理 `.module.css`、`.module.scss` 和 `.module.less`，不处理普通 CSS/SCSS/Less。
- safe selector 支持单 local anchor 的基础 class、五种 pseudo class、独立 before/after pseudo element，
  以及一个 attribute presence / exact equality；全分支安全且不含 pseudo element arm 的 selector list
  也可以转换。其他 operator、flag、namespace、多个 attribute、复合结构及同 class 顺序风险继续 fallback。
- adapter 位于 Vite 6 `vite:css` 与 `vite:css-post` 之间，不单独调用 `preprocessCSS`。
- tokens 由 Vite `css.modules.getJSON` 捕获并原地增强；Vite 继续生成默认 JS exports。
- dev 保持 readable atomic CSS；build 由 adapter 对结构化 declaration 使用生产 grammar，只收紧
  rule/wrapper 结构字节，不改写 selector、property 或 value。
- `composes`、`:import(...)`、`:export`、`@value`、预处理器和资源由 Vite 原生管线处理。
- 包含 `url()` 的 class 及其 `composes` 闭包完整保留为 fallback，build 在 generate 阶段解析最终资源 URL。
- manifest/report 默认不输出；显式开启 report 后附带 analyzer `analysis`。
- `devtools.enabled` 默认关闭；开启后提供当前无版本 `adapter/status/environments` report envelope
  和 Shadow DOM browser overlay。
- strict mode、named exports、CSS-only HMR、Vite 7 和 raw Rspack adapter 仍非当前范围。

## Rsbuild adapter 当前边界

- class name 在 dev 默认 `readable-keyed + "_"`，build 默认无 prefix 的 32-bit / 7 字符 lower-base36
  `compact`；所有显式 strategy 与 prefix 原样保留。`readable-keyed` 使用完整 canonical key 的 128-bit
  FNV-1a / 固定 25 位 lower-base36 suffix；显式 `readable` 的独立 loader 碰撞会 fail fast。
- 默认处理 `.module.css`、`.module.scss` 和 `.module.less`，复用 Rsbuild 原生 css-loader 结果。
- SEL-02 attribute selector 直接复用 Core descriptor 与 class-wide cascade guard；adapter 不解析 selector
  identity，也不自行重建 attribute selector。
- build/dev snapshot 保持 readable renderer；Rsbuild production 最终 atomic asset 由既有 native
  minifier 收紧，adapter 不引入第二套 production serializer。
- build 保持 extraction；dev 使用 Rsbuild 官方 style injection 维持模块图与 HMR，并把目标 CSS Modules
  快照聚合到单一共享 style owner，按稳定 source order 输出且按 atomic key 去重；这同时避免 Rspack 2.1
  增量编译的嵌套 `importModule` panic，并建立跨模块 canonical atomic cascade。该顺序不继承业务 CSS 的
  import-order winner；同权重冲突不属于 semantic/native parity 契约。
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
- Webpack adapter：[packages/webpack/README.md](packages/webpack/README.md)、
  [docs/phase-9-webpack-adapter-plan.md](docs/phase-9-webpack-adapter-plan.md)、
  [docs/phase-9-webpack-adapter-acceptance.md](docs/phase-9-webpack-adapter-acceptance.md)
- Phase 7 verifier 与调试体验：[packages/devtools/README.md](packages/devtools/README.md)、
  [docs/phase-7-verifier-devtools-plan.md](docs/phase-7-verifier-devtools-plan.md)、
  [docs/phase-7-verifier-devtools-acceptance.md](docs/phase-7-verifier-devtools-acceptance.md)
- Phase 8 当前状态与研究入口：
  [能力强化 backlog](docs/phase-8-capability-hardening-backlog.md)、
  [收益复盘](docs/selector-capability-benefit-review.md)、
  [多 local foundation 评估](docs/phase-8-multi-local-selector-foundation-evaluation.md)、
  [关系选择器研究](docs/phase-8-multi-local-selector-research.md)
- Phase 8 当前设计与验收：
  [selector rewrite foundation](docs/phase-8-selector-rewrite-foundation-design.md)、
  [selector-aware identity/cascade](docs/phase-8-selector-aware-identity-cascade-design.md)、
  [attribute 设计](docs/phase-8-attribute-selector-design.md) / [验收](docs/phase-8-attribute-selector-acceptance.md)、
  [pseudo element 设计](docs/phase-8-pseudo-element-design.md) / [验收](docs/phase-8-pseudo-element-acceptance.md)、
  [selector list 设计](docs/phase-8-selector-list-design.md) / [验收](docs/phase-8-selector-list-acceptance.md)
- Phase 8 历史迁移证据：
  [cascade correctness foundation](docs/phase-8-cascade-correctness-foundation-plan.md)、
  [descriptor 迁移前基线](docs/phase-8-selector-descriptor-v2-baseline.md)、
  [descriptor clean replacement](docs/phase-8-selector-descriptor-migration-plan.md)

`FOUND-04` 多 local selector foundation 已按双 Pilot 门禁评估为 `closed-no-go`；相关 shadow prototype
已回滚，`SEL-04` 至 `SEL-09` 的所有未开放 selector 扩展继续 deferred。本结论不授权
production rewrite，正式 Core
仍保持 single-local anchor safe selector 边界与 unsafe scoped fallback。

`verify:phase*` 和 `dev:phase*` 等阶段命令已退役。历史 tracking 文档仍保留当时实际执行记录，
当前开发与验收以本 README 中的能力命令为准。
