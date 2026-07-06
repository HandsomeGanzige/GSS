# Phase 3 Vite Adapter 设计起草指导

## 文档定位

本文档用于指导后续 agent 在另一个上下文中起草 `@semantic-atomic-css/vite` adapter 设计方案。

当前任务不是实现 Vite adapter，而是先产出一份可讨论、可决策、可验收的设计草案。任何代码修改、
文件新增、依赖调整、构建产物更新或 git 操作，都必须在 owner 明确确认设计方案之后再进行。

## 起草前必须阅读

后续 agent 开始设计前，必须先阅读以下资料：

- `AGENTS.md`：仓库工作规则、中文文档和注释要求、正确性优先原则。
- `semantic-atomic-css-plugin-plan.md`：完整产品背景和 Phase 1 原型目标。
- `packages/core/CORE_DESIGN.md`：core v1 的职责边界、public API、行为契约和暂不支持项。
- `docs/phase-2-packages-architecture.md`：packages 分层、Phase 1 Vite 原型链路和 Phase 2 状态。
- `README.md`：当前仓库状态、命令和 `packages/vite` 暂不存在的事实。
- Vite 官方文档：
  - Plugin API：https://vite.dev/guide/api-plugin.html
  - CSS Modules / CSS Pre-processors：https://vite.dev/guide/features.html#css-modules

设计时必须以仓库当前实现和 Vite 当前官方文档为准，不要基于记忆假设 Vite hook、CSS Modules 或
HMR 行为。

## 当前已知状态

截至 2026-07-03：

- `packages/core` 已完成 Phase 2 core v1 收口。
- core 是纯 CSS transform engine，只接收标准 CSS 字符串和 `ScopeStrategy`。
- core runtime public API 只包含 `transformCss` 和 `createTransformer`。
- core 不负责 CSS Modules tokens、Vite 生命周期、文件读取写入、virtual module、HMR 或 asset emit。
- `createTransformer()` 当前是 append-only build collector，不支持同一 `id` 更新或失效。
- `packages/vite` 当前不在工作区内。
- playground 当前回退为普通 Vite React CSS Modules 示例，只用于维持项目级构建和类型检查。
- `pnpm verify:phase1` 当前是 `pnpm verify:core` 的兼容别名，不再验证旧 Vite adapter 产物。

## 本次设计目标

起草一份 `@semantic-atomic-css/vite` adapter 设计草案，用于回答：

```txt
用户在 Vite 项目中如何接入 GSS？
Vite adapter 如何把目标样式输入准备成 core 可以处理的标准 CSS？
Vite adapter 如何生成 CSS Modules tokens、virtual CSS、manifest/report 和 warning？
dev/build/HMR 分别采用什么状态模型？
哪些能力属于本轮 MVP，哪些只预留接口但暂不实现？
```

设计草案需要让 owner 能基于文档做决策，而不是让实现者边写边猜。

## 总原则

- 先讨论决策，再执行实现。
- core 边界不能后退，Vite adapter 不应把 Vite/CSS Modules 语义重新塞回 core。
- 正确性优先于压缩率，unsafe CSS 必须保留 fallback。
- 默认保留 semantic scoped class。
- 设计要支持未来扩展 `.css`、`.less`、`.scss`，但本轮实现目标可以继续保持 `.module.css`。
- Less/Sass 本轮不实现；如果设计中提到，只能作为未来 adapter/preprocessor 扩展点。
- 不要为了兼容所有 Vite CSS Modules 高级能力而牺牲 MVP 可验证性。
- 任何输出变化、CSS Modules tokens 变化、HMR 行为变化，都必须有明确验收方式。

## 推荐产出文件

建议后续 agent 新增或起草：

```txt
docs/phase-3-vite-adapter-design.md
```

该文件应是设计草案，不是实现记录。草案中必须显式标记：

- 已确认决策。
- 推荐方案。
- 可选方案。
- 待 owner 确认问题。
- 暂不支持项。
- 验收方式。

## 设计草案建议结构

### 1. 文档定位

说明该文档用于设计 `@semantic-atomic-css/vite`，不直接改变实现。

### 2. 目标与非目标

目标建议包括：

- 恢复 `packages/vite` 作为 Vite integration package。
- 让 Vite adapter 调用 `@semantic-atomic-css/core`。
- 支持 `.module.css` 的最小闭环。
- 输出兼容 CSS Modules 使用方式的 tokens。
- 注入 atomic CSS + preserved CSS。
- 在 build 阶段输出 manifest/report。
- 在 dev 阶段提供可调试 warning 和基础 HMR 策略。

非目标建议包括：

- 不实现 Less/Sass。
- 不实现 Rsbuild/Rspack/Webpack。
- 不实现 aggressive atomization。
- 不修改 JSX/TSX 中 CSS Modules 的使用方式。
- 不要求一次性覆盖 Vite CSS Modules 的全部高级选项。

### 3. 包职责边界

需要明确三层边界：

```txt
Vite Integration Layer
  负责 Vite hooks、文件匹配、virtual module、dev/build/HMR、asset emit、warning 展示。

CSS Modules Adapter Layer
  负责 scoped class name、tokens、localsConvention、named exports、ScopeStrategy。

Core Transform Layer
  负责纯 CSS transform，仅通过 transformCss/createTransformer 被调用。
```

必须说明：

- `@semantic-atomic-css/vite` 可以内部包含 CSS Modules adapter 逻辑。
- CSS Modules adapter 逻辑不属于 `@semantic-atomic-css/core`。
- 未来若 CSS Modules adapter 可复用于其他构建工具，再考虑拆出独立包。

### 4. 用户配置设计

需要讨论并给出推荐配置模型。

建议先设计为：

```ts
semanticAtomicCss({
  include?: string | string[];
  exclude?: string | string[];
  modules?: {
    localsConvention?: 'asIs' | 'camelCase' | 'camelCaseOnly' | 'dashes' | 'dashesOnly';
    generateScopedName?: string | ((name: string, filename: string, css: string) => string);
    namedExports?: boolean;
  };
  core?: {
    preserveResolvedClass?: boolean;
    className?: {
      strategy?: 'readable' | 'hash';
      prefix?: string;
    };
  };
  report?: {
    enabled?: boolean;
    filename?: string;
  };
  manifest?: {
    enabled?: boolean;
    filename?: string;
  };
  diagnostics?: {
    warn?: boolean;
    strict?: boolean;
  };
})
```

注意：这是设计讨论用草案，不代表必须一次性实现全部配置。

需要 owner 确认的问题：

- 默认是否只处理 `.module.css`。
- `include/exclude` 使用 glob、regex，还是函数。
- 是否跟随 Vite `css.modules` 默认配置，还是维护 GSS 自己的 `modules` 配置。
- `strict` 本轮是否只设计不实现。

### 5. 文件匹配策略

需要明确：

- MVP 默认处理 `.module.css`。
- 未来可通过 include 扩展到 `.css`、`.module.scss`、`.module.less`。
- 非 CSS Modules 普通 CSS 的 class export 语义不同，不能和 `.module.css` 混为一谈。
- Less/Sass 输入必须先经过预处理得到标准 CSS，再交给 core。

需要特别说明：

```txt
core 不知道文件扩展名。
Vite adapter 决定哪些文件应该被 transform。
CSS Modules adapter 决定 source class 如何映射为 scoped class 和 tokens。
```

### 6. CSS Modules 兼容策略

这是本设计最关键部分，必须展开讨论。

需要回答：

- scoped class name 由谁生成。
- 是否完全复用 Vite `css.modules` 配置。
- 如何支持 `localsConvention`。
- 是否支持 named exports。
- default export tokens 的值应该是 `suggestedClassName`，还是只返回 scoped class。
- unsafe fallback 依赖 scoped class，tokens 中必须默认包含 semantic scoped class + atomic class。

推荐默认：

```txt
tokens[localName] = result.classes[localName].suggestedClassName
```

因为 core 默认 `preserveResolvedClass: true`，`suggestedClassName` 会包含：

```txt
resolved scoped class + atomic class list
```

这样 unsafe preserved CSS 仍能命中 resolved scoped class。

需要 owner 确认的问题：

- scoped name 算法是否先采用 GSS 自己的稳定实现。
- 还是优先尝试与 Vite `css.modules.generateScopedName` 兼容。
- named exports 是否放到第一版。
- `localsConvention` 是否第一版只支持 `asIs` / `camelCaseOnly`。

### 7. 推荐技术路线

需要比较至少两条路线。

#### Route A：接入 Vite 原生 CSS pipeline 后处理

思路：

- 尽量让 Vite 先处理 CSS Modules。
- 插件读取或复用 Vite 已生成的 tokens/scoped name。
- 再调用 core 生成 atomic/preserved CSS。

优点：

- 更接近 Vite 官方行为。
- CSS Modules 配置兼容潜力更好。

风险：

- Vite 内部 CSS Modules 产物未必有稳定 public hook 可读取。
- 容易依赖内部实现。
- atomic CSS 注入顺序和原 CSS 移除策略复杂。

#### Route B：GSS 自己拦截 `.module.css`

思路：

- 类似 Phase 1 原型，拦截目标 CSS Modules 文件。
- 自己读取 CSS、生成 scoped class、调用 core。
- 返回虚拟 JS module，导入 virtual CSS module，并 export tokens。

优点：

- 控制清晰。
- 与 core v1 对接最直接。
- 容易写测试和验证。

风险：

- 需要自己补 CSS Modules 兼容行为。
- 容易和 Vite 原生 CSS Modules 行为不完全一致。

推荐：

```txt
第一版采用 Route B，但在文档中明确兼容边界。
不要依赖 Vite 内部未公开的 CSS Modules 中间状态。
```

### 8. Virtual Module 设计

需要参考 Vite 官方 virtual module 约定：

- 用户可见 id 使用 `virtual:` namespace。
- 内部 resolved id 使用 `\0` 前缀。
- 插件名应作为 namespace，避免与生态插件冲突。

设计草案需要定义：

- CSS module JS 虚拟 id 格式。
- CSS 内容虚拟 id 格式。
- report/manifest 虚拟读取能力是否需要。
- dev 与 build 是否使用同一套 virtual id 编码。

建议示例：

```txt
virtual:semantic-atomic-css/css?source={encodedFile}
\0semantic-atomic-css/css?source={encodedFile}
```

注意：如果虚拟模块可映射回真实文件，是否需要 `\0` 要结合 sourcemap 和 Vite 官方约定讨论，不要直接照搬 Phase 1。

### 9. Dev / Build 状态模型

需要明确区分 build 和 dev。

Build 推荐：

- 使用 `createTransformer()` 作为 append-only collector。
- 每个匹配文件 transform 一次。
- build 结束时通过 `getAtomicCss()`、`getManifest()`、`getReport()` 输出聚合数据。

Dev 必须讨论：

- `createTransformer()` 不能直接长期复用，因为同一 `id` 更新时没有 invalidate。
- 可选方案：
  - 每次请求重建全量 transformer。
  - 维护 per-file transform result，再重建 aggregate registry。
  - 后续为 core 增加 invalidate/rebuild API。

推荐第一版 dev 策略：

```txt
先做简单正确方案：文件变更后清空 adapter cache，让受影响模块重新 transform；
必要时触发 full reload，而不是假装支持精细 HMR。
```

需要 owner 确认：

- 第一版 dev 是否允许 full reload。
- 是否必须实现 CSS-only HMR。
- 是否要推动 core 增加 invalidate API。

### 10. CSS 输出策略

需要回答：

- atomic CSS 和 preserved CSS 如何拼接。
- CSS 注入顺序如何保证 atomic first、preserved second。
- build 时是否 emit 单独 CSS asset。
- dev 时是否通过 virtual CSS module 注入。
- 是否复用 Vite CSS pipeline 做 PostCSS/minify，还是直接返回 CSS 字符串。

推荐第一版：

- 单文件 virtual CSS 输出 `result.css.atomic + result.css.preserved`。
- build 阶段另行评估是否改为聚合 `transformer.getAtomicCss()`，以获得跨文件去重收益。
- manifest/report 使用 core 聚合结果，不放入 core 写文件。

需要特别注意：

```txt
如果 build 中每个模块各自注入 atomic CSS，跨文件复用收益会下降。
如果改为全局聚合 CSS asset，需要解决模块 CSS import 与最终 asset 注入顺序。
```

### 11. Diagnostics / Warning / Strict Mode

需要设计：

- core diagnostic 如何转换为 Vite warning。
- warning 去重策略。
- build report 中如何保留完整 diagnostic。
- `strict` 是否遇到 unsafe selector 时 fail build。

推荐第一版：

- 默认 warning/report，不 fail build。
- `strict` 先作为设计项保留，不作为 MVP 默认行为。
- diagnostic message 可以展示，但决策和统计应依赖稳定 `code/reason`。

### 12. Manifest / Report 输出

需要设计：

- 默认是否输出。
- 输出文件名。
- dev 是否提供 virtual report。
- build 是否使用 `emitFile` 输出 JSON asset。
- JSON 结构是否直接使用 core `TransformManifest` / `TransformReport`。

推荐第一版：

```txt
semantic-atomic-manifest.json
semantic-atomic-report.json
```

输出内容优先复用 core 结构，不在 Vite adapter 中二次发明 schema。

### 13. 测试与验收计划

设计草案必须包含验收计划。

推荐测试分层：

- adapter 单元测试：id 解析、include/exclude、tokens 生成、localsConvention、virtual CSS。
- Vite 集成测试：React + Vite + CSS Modules build。
- playground smoke test：页面可以使用 `styles.button`，样式命中。
- manifest/report 验证：build 后生成 JSON asset，内容含 atomic/classes/diagnostics。
- dev/HMR 验证：至少证明修改 CSS 后不会使用过期 CSS 或过期 tokens。

推荐命令设计：

```bash
pnpm --filter @semantic-atomic-css/core test
pnpm --filter @semantic-atomic-css/vite test
pnpm typecheck
pnpm build
pnpm verify:phase3
```

注意：新增验收命令前必须先经 owner 确认。

### 14. 风险清单

设计草案必须至少覆盖以下风险：

- CSS Modules scoped name 与 Vite 原生行为不一致。
- `localsConvention` / named exports 行为不完整。
- dev/HMR 使用 append-only transformer 导致过期 atomic CSS。
- build 中 virtual CSS 按模块注入导致跨文件 atomic 去重收益下降。
- preserved fallback 顺序错误导致 cascade 语义变化。
- unsafe selector warning 过多影响开发体验。
- Less/Sass 支持被误解为本轮能力。
- Vite 官方 API 变化导致设计依赖不稳。

### 15. 待 owner 决策清单

设计草案最后必须列出待确认问题。建议至少包含：

1. 是否恢复 `packages/vite` 作为 `@semantic-atomic-css/vite`。
2. 第一版是否只处理 `.module.css`。
3. 第一版选择 Route A 还是 Route B。
4. scoped class name 是 GSS 自己生成，还是尽量兼容 Vite `css.modules`。
5. tokens 默认是否返回 `suggestedClassName`。
6. `localsConvention` 和 named exports 的第一版支持范围。
7. dev/HMR 第一版是否允许 full reload。
8. build CSS 输出采用 per-module virtual CSS 还是全局聚合 CSS asset。
9. manifest/report 是否默认 emit。
10. strict mode 是否只设计不实现。

## 不允许做的事

后续 agent 在起草设计阶段不允许：

- 新增 `packages/vite` 实现代码。
- 修改 `packages/core` 行为。
- 修改 playground 接入方式。
- 新增依赖。
- 修改 pnpm lockfile。
- 修改构建产物。
- 执行 git add、commit、checkout、reset 等操作。
- 把 CSS Modules、Vite hook 或 HMR 语义写入 core。
- 宣称 Less/Sass 已支持。

## 起草完成后的交付格式

后续 agent 完成草案后，应向 owner 输出：

- 新增或更新的文档路径。
- 推荐方案摘要。
- 关键取舍。
- 待确认问题。
- 没有做代码实现的说明。

如果草案中引用 Vite 官方行为，需要附上官方文档链接，便于 owner 和后续实现 agent 复核。
