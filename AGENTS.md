# AGENT.md

本文档是后续 agent 和维护者修改本仓库时必须遵守的工作指南。完整产品背景以
`semantic-atomic-css-plugin-plan.md` 为准；本文档负责把技术方案沉淀为日常工程规则。

## 项目使命

GSS 是一个 Semantic CSS Modules to Atomic CSS 原型项目。

项目探索的核心工作流是：

```txt
开发者编写语义化 CSS Modules。
构建产物生成可复用的 Atomic CSS。
```

MVP 定位是：

```txt
CSS Modules only + Safe Atomization + Preserve Semantic Class + Unsafe CSS Fallback
```

最重要的产品原则是正确性优先于压缩率。任何无法证明安全转换的 CSS 规则，都必须保留
为 fallback CSS，并在 warning/report 中说明原因。

## 开发硬性要求

- 相关文档必须使用中文，包括需求说明、设计说明、阶段追踪、验收说明和新增 README 内容。
- 代码注释必须使用中文。
- 每个类、函数、方法、导出类型、关键流程函数都需要补充中文注释，说明职责、输入输出或关键约束。
- 对复杂逻辑块需要补充中文注释，尤其是 selector 安全判断、atomic key 生成、CSS 保留策略、
  report/manifest 生成和构建工具适配逻辑。
- 每次推进项目时都要同步并沉淀文档。行为、配置、验收方式、风险或阶段状态发生变化时，
  必须同步更新相关文档。
- 文档更新优先选择已有文件：阶段进展写入 `docs/phase-1-vite-prototype-tracking.md` 或后续阶段文档，
  验收方式写入 `docs/phase-1-acceptance.md` 或对应阶段验收文档，长期产品原则写入本文件或方案文档。

## 当前状态

Phase 1 已经实现为 Vite 原型：

- `@semantic-atomic-css/core` 负责把 `.module.css` 编译为 tokens、atomic CSS、preserved CSS、
  manifest 数据和 report 数据。
- `@semantic-atomic-css/vite` 采用 Route B 原型路线：拦截 `.module.css`，生成虚拟 JS 模块，
  并导入虚拟 CSS。
- `playground/vite-react-css-modules` 用于验证 React + Vite 流程。
- `pnpm verify:phase1` 是当前端到端验收命令。

## 仓库结构

- `packages/core`：与构建工具无关的核心编译逻辑。
- `packages/vite`：Vite adapter。
- `playground/vite-react-css-modules`：手动验收和构建验收 playground。
- `docs/phase-1-acceptance.md`：Phase 1 验收清单。
- `docs/phase-1-vite-prototype-tracking.md`：Phase 1 实现记录和风险追踪。
- `scripts/verify-phase-1.mjs`：自动化构建产物验收脚本。
- `semantic-atomic-css-plugin-plan.md`：完整技术和产品方案。

## 不可妥协的规则

- MVP 范围内只转换 `.module.css`。
- 不改写 JSX 或 TSX 中 CSS Modules 的使用方式。
- 默认保留 semantic scoped class。
- unsafe CSS 必须作为 scoped fallback CSS 保留。
- unsafe selector 必须输出 warning/report。
- `core` 必须保持与 Vite、React、浏览器运行时无关。
- atomic class 顺序必须稳定；同一个 local class 内保持 declaration 原始顺序。
- `!important` 必须进入 atomic key。
- 默认保留 CSS custom property declaration；但允许使用 `var(...)` 的普通 declaration 被 atomize。
- 不允许为了提高压缩率而改变 cascade 语义。

## Safe Selector 范围

MVP 中 safe selector 范围必须保持克制：

```css
.button {}
.button:hover {}
.button:focus {}
.button:active {}
.button:disabled {}
.button:focus-visible {}

@media (min-width: 768px) {
  .button {}
}

@supports (display: grid) {
  .layout {}
}
```

selector 只有在满足以下条件时才是 safe：只有一个 local class、无 tag、无 id、无 attribute、
无 combinator、无额外 class、无 pseudo element、无 `:global`，并且最多只有一个受支持的
pseudo class。

## Unsafe Selector 策略

以下 selector 默认必须保留：

```css
.card .button {}
.card > .button {}
.button.primary {}
button.button {}
#app .button {}
.button[data-state='open'] {}
.button::before {}
.button + .desc {}
:global(.ant-btn) {}
```

常见 unsafe reason 包括：

```txt
complex-selector
compound-class-selector
descendant-selector
child-selector
attribute-selector
tag-selector
id-selector
pseudo-element
global-selector
unsupported-pseudo
```

如果后续要支持任意 unsafe 类别，必须补充测试，并在文档中说明语义等价的证明方式。

## Core Compiler 期望

`packages/core` 负责：

- CSS AST 解析。
- selector 安全性判断。
- declaration 抽取。
- atomic key 和 class name 生成。
- local class 到 atomic classes 的映射。
- preserved CSS 生成。
- manifest 生成。
- report 生成。

结构化 CSS 和 selector 处理必须优先使用 PostCSS 与 `postcss-selector-parser`。不要用正则解析
结构化 CSS。

## Vite Adapter 期望

`packages/vite` 负责：

- 解析并加载 `.module.css` 文件。
- 调用 `core.compileCssModule`。
- 返回导出 CSS Modules tokens 的 JS 模块。
- 导入 virtual CSS。
- 在 build 阶段 emit manifest 和 report asset。

当前 Route B 实现有意近似 CSS Modules 行为。增加 `localsConvention`、自定义 scoped name 等
兼容能力时，需要格外小心，并同步更新测试和文档。

## 常用命令

从仓库根目录执行：

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm verify:phase1
pnpm dev
```

任何影响 compiler 行为、Vite 集成、生成 CSS、manifest 输出或 report 输出的改动，都需要运行：

```bash
pnpm verify:phase1
```

playground dev server 地址是：

```txt
http://127.0.0.1:5173/
```

## 测试要求

compiler 改动需要在 `packages/core/test` 中新增或更新 Vitest 覆盖。重点覆盖：

- 基础 safe rule atomization。
- pseudo class atomization。
- `@media` 和 `@supports` 处理。
- unsafe selector preservation。
- custom property preservation。
- `!important` key separation。
- manifest 和 report 稳定性。
- shorthand/longhand 等顺序敏感场景。

集成改动需要运行 `pnpm verify:phase1`。必要时检查生成产物：

- `playground/vite-react-css-modules/dist/semantic-atomic-report.json`
- `playground/vite-react-css-modules/dist/semantic-atomic-manifest.json`
- `playground/vite-react-css-modules/dist/assets/*.css`

## 下一步可能任务

Phase 1 已完成。适合继续推进的任务包括：

- 为 compiler 增加 fixture 或 snapshot tests。
- 提升 CSS Modules 兼容性，尤其是 `localsConvention` 和 scoped name 配置。
- 增加 gzip 和 brotli size report。
- 改进 Vite adapter 的 HMR 行为。
- 改进 source map 或 source location 信息。
- 构建 Playwright computed-style verifier，用于样式回归验证。
- 在 core 和 Vite 行为稳定后，再增加 Rsbuild/Rspack 支持。

在 safe CSS Modules 路径拥有更强测试前，不要优先启动 Rsbuild、预处理器或 aggressive atomization。

## 需要确认的产品预期

做以下较大产品决策前，需要先向项目 owner 确认：

- 仓库是否只使用 `AGENT.md`，还是也需要增加 `AGENTS.md` 兼容查找复数文件名的工具。
- 下一阶段优先级是 CSS Modules 兼容、verifier、report，还是 Rsbuild 支持。
- strict mode 遇到 unsafe selector 时应该 fail build，还是只输出 warning/report。
- 真实项目中需要达到怎样的输出体积收益，才算具备实用价值。
- 生产产物中 DevTools 可读性的优先级有多高。

## Agent 工作方式

- 修改 compiler 语义前必须阅读 `semantic-atomic-css-plugin-plan.md`。
- 改动范围保持聚焦，只处理当前任务需要的行为。
- 行为、报告、验收命令或阶段状态变化时，必须同步更新文档。
- 除非任务明确要求 aggressive mode，否则不要移除 semantic class preservation。
- 不要为了提升 atomization rate 削弱 unsafe fallback 行为。
- 优先做小而可验证的 compiler 改动，避免无必要的大范围重构。
- 不确定时，保留 CSS 并报告不确定原因。
