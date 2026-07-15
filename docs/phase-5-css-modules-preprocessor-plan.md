# Phase 5 CSS Modules 预处理器支持

## 文档状态

- Status: completed
- 创建日期：2026-07-15
- 实施日期：2026-07-15
- 范围：Vite 6 下的 `.module.css`、`.module.scss` 和 `.module.less`

Phase 5 实现、包级测试、静态产物验收、连续构建稳定性检查和 visual/HMR 验收已完成。
自动验收已收敛到 `fixtures/vite-css-modules` workspace，根 `pnpm verify` 运行静态门禁，
fixture 包内 `test:visual` 显式运行 Chrome/localhost 验收。

## 长期目标与分层

GSS 不编译 Sass/Less，也不实现第二套 CSS Modules 或资源管线。长期责任分层为：

```txt
Vite / future Rspack adapter
  -> 调用构建工具原生预处理、CSS Modules、资源和 dependency graph
  -> 生成标准 scoped CSS + native tokens

@semantic-atomic-css/core
  -> safe atomization / conservative preservation
  -> atomic CSS / fallback / manifest / report

@semantic-atomic-css/analyzer
  -> 消费编译结果与 report，不依赖构建工具
```

Vite 包内部保留 `CompiledCssModule` 边界，但不在只有一个 adapter 时提前抽取公共
adapter-utils。Rspack/Webpack 将来应使用它们各自的原生 pipeline，只复用 core/analyzer 语义。

## Batch 0 验证结论

隔离 spike 已确认：

- Vite 6 `preprocessCSS` 能够编译 SCSS/Less，返回 scoped CSS、tokens 和 Sass/Less partial deps。
- `localsConvention`、`generateScopedName`、`composes` 和 `additionalData` 由 Vite 正确处理。
- 单独调用 `preprocessCSS` 不会把相对 `url(...)` 改写为最终资源 URL；手动 emit CSS 会产生
  build 404 风险。
- Vite 原生 `vite:css` 管线会负责 partial watch、asset emit 和 URL 占位符。
- build 资源的最终文件名只能在 generate 阶段通过 Rollup `getFileName` 取得；直接把早期
  reference id 写入 atomic key 会引入顺序不稳定。
- Vite 在移除 Sass import 后可能短暂保留 additional-watch 反向边。当前实现保守重验证这些
  dependent，而不自行解析 Sass/Less import；可能多一次重编译，但不会继续使用 stale CSS。

基于以上结论，Phase 5 已放弃“继续扩展手动 `preprocessCSS` Route A”，改为 Vite 原生管线接管。

## 实施设计

### Vite 原生管线

`semanticAtomicCss()` 返回 `PluginOption`，内含两个插件：

1. `semantic-atomic-css:vite-pipeline`
   - 普通顺序，位于 `vite:css` 与 `vite:css-post` 之间。
   - 包装 `css.modules.getJSON`，保留用户 callback 并捕获 Vite token 对象引用。
   - 消费 Vite 编译后的 scoped CSS，调用 core，原地增强 tokens。
   - 向 `vite:css-post` 返回空 CSS，让 Vite 继续生成原生 JS exports，但不重复输出 scoped CSS。
2. `semantic-atomic-css:vite-bridge`
   - `enforce: 'post'`。
   - dev 中向 Vite 生成的 CSS Module JS 前置 shared CSS owner import。
   - build 中不改写 Vite JS exports。

`configResolved` 会校验 Vite 6 插件顺序和默认 PostCSS transformer，不满足时 fail fast。

### 文件与配置边界

- 默认 include：`**/*.module.css`、`**/*.module.scss`、`**/*.module.less`。
- 后缀白名单不包含 `.module.sass`，也不处理普通 CSS/SCSS/Less。
- 未配置 GSS `modules` 时继承 Vite `css.modules`；显式 GSS modules 保持 Phase 4 覆盖语义。
- `css.preprocessorOptions` 完全由 Vite 消费，GSS 不新增预处理器配置。
- `sass` / `sass-embedded` / `less` 由使用项目按 Vite 规则安装。
- `modules.namedExports`、`diagnostics.strict` 和 Lightning CSS 仍明确失败。

### 资源与 class 级保留

- adapter 使用 `postcss-value-parser` 识别 declaration 中的 `url()`。
- 为保证 dev/build 在 asset inline limit 下也使用相同 tokens，任意 `url()` 都会标记 selector class；
  再通过 Vite tokens 扩展 `composes` 闭包。
- core `TransformCssInput.preserveClassNames` 使这些 class 的所有 safe rules 完整进入 fallback，
  diagnostic 为 `preserved-class / asset-reference`，manifest class 保留但 atomic list 为空。
- build 在 `generateBundle` 解析本地 `__VITE_ASSET__` 引用，支持默认 base、相对 base、query/hash。
- `publicDir` 内部占位符和资源 class 命中自定义 `experimental.renderBuiltUrl` 时 fail fast。

### Analyzer 口径

- analyzer before-size 使用 core 真实消费的 `scopedCss`。
- `sourceCss` 保留为原始 CSS/SCSS/Less 追踪信息，不参与体积收益计算。
- 该口径变化会让 Phase 4 Pilot 的 before/after 指标与旧 report 不可直接对比。

## 验收与剩余边界

已实现：

- core class preservation 成功/保守路径测试。
- CSS/SCSS/Less、Vite modules config、ICSS/composes、safe/fallback 和跨语言去重测试。
- direct module、shared partial、移除 import 后保守重验证的 HMR 测试。
- 本地 asset、relative base、query/hash、public/custom URL fail-fast 测试。
- 统一 `fixtures/vite-css-modules` workspace 中的 `preprocessor` suite。
- 根静态门禁 `pnpm verify` 与 fixture 包内 visual 入口。

非目标保持不变：普通 Sass/Less、`.module.sass`、CSS-only HMR、完整 source map、Vite 7、
Rspack adapter、named exports、strict mode 和新 selector/at-rule 范围。

详细验收命令与本次执行记录见 `docs/phase-5-css-modules-preprocessor-acceptance.md`。
