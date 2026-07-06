# Phase 3 Vite Adapter 设计草案

## 文档定位

本文档是 `@semantic-atomic-css/vite` 的 Phase 3 设计草案，用于记录 Vite adapter
如何重新接入当前 Phase 2 core v1 的逐项决策。

截至 2026-07-06，本文档中的 12 个决策已逐项确认，并已按第一版路径落地实现。实现状态见
`docs/phase-3-vite-adapter-tracking.md`，验收记录见 `docs/phase-3-acceptance.md`。

本文档参考资料：

- `AGENTS.md`
- `semantic-atomic-css-plugin-plan.md`
- `packages/core/CORE_DESIGN.md`
- `docs/phase-2-packages-architecture.md`
- `README.md`
- Vite 6 Plugin API：https://v6.vite.dev/guide/api-plugin
- Vite 6 CSS Modules / CSS Pre-processors：https://v6.vite.dev/guide/features
- Vite 6 shared options / `css.modules`：https://v6.vite.dev/config/shared-options
- 最新 Vite Plugin API：https://vite.dev/guide/api-plugin.html

注意：当前仓库依赖为 `vite@^6.0.3`，因此第一版实现应优先按 Vite 6 文档复核 hook、CSS Modules
和 HMR 行为。最新 Vite 文档可能包含 Rolldown 或 Vite 8 相关变化，只能作为后续升级参考。

## 当前事实基线

已确认决策：

- `packages/core` 已完成 Phase 2 core v1 收口。
- core 是纯 CSS transform engine，只接收标准 CSS 字符串和 `ScopeStrategy`。
- core runtime public API 只包含 `transformCss` 和 `createTransformer`。
- core 不负责 CSS Modules tokens、Vite 生命周期、文件读取写入、virtual module、HMR 或 asset emit。
- `createTransformer()` 当前是 append-only build collector，不支持同一 `id` 更新或失效。
- `packages/vite` 已恢复为 `@semantic-atomic-css/vite`。
- `playground/vite-css-modules-acceptance` 已作为自动验收 fixture 接入 `semanticAtomicCss()`，用于验证核心
  React + Vite + CSS Modules 语义。
- `playground/vite-react-css-modules` 已接入 `semanticAtomicCss()`，用于人工观察较大业务场景。
- `pnpm verify:phase1` 当前是 `pnpm verify:core` 的兼容别名，不再验证旧 Vite adapter 产物。
- `pnpm verify:phase3` 是当前 Vite adapter 验收命令。
- `pnpm verify:phase3:visual` 是当前 semantic/native computed style 对照验收命令。

设计约束：

- 正确性优先于压缩率。
- MVP 范围默认只转换 `.module.css`。
- 不改写 JSX 或 TSX 中 CSS Modules 的使用方式。
- 默认保留 semantic scoped class。
- unsafe CSS 必须作为 scoped fallback CSS 保留。
- unsafe selector 必须输出 warning/report。
- 不为了提高 atomization rate 改变 cascade 语义。

## 目标与非目标

目标：

- 恢复 `packages/vite` 作为 `@semantic-atomic-css/vite` integration package。
- Vite adapter 调用 `@semantic-atomic-css/core` 的 `transformCss` / `createTransformer`。
- 支持 `.module.css` 的最小闭环。
- 输出兼容 CSS Modules 使用方式的 tokens，让业务代码继续使用 `styles.button`。
- 注入 atomic CSS + preserved CSS。
- build 阶段支持按配置输出 manifest/report asset。
- dev 阶段提供可调试 warning 和基础 HMR 策略。
- 为后续 `.module.scss`、`.module.less` 和普通 `.css` 扩展预留 adapter 边界。

非目标：

- 不实现 Less/Sass。
- 不实现 Rsbuild/Rspack/Webpack。
- 不实现 aggressive atomization。
- 不修改 JSX/TSX 中 CSS Modules 的使用方式。
- 不要求第一版覆盖 Vite CSS Modules 的全部高级选项。
- 不把 CSS Modules tokens、Vite hook、virtual module、HMR 或 asset emit 写回 core。
- 不复活旧 `compileCssModule` / `createCompiler` core API。

## 包职责边界

推荐方案是先保持两个 package：

```txt
@semantic-atomic-css/core
@semantic-atomic-css/vite
```

三层边界：

```txt
Vite Integration Layer
  负责 Vite hooks、文件匹配、virtual module、dev/build/HMR、asset emit、warning 展示。

CSS Modules Adapter Layer
  负责 scoped class name、tokens、localsConvention、named exports、ScopeStrategy。

Core Transform Layer
  负责纯 CSS transform，仅通过 transformCss/createTransformer 被调用。
```

已确认决策：

- `@semantic-atomic-css/vite` 可以内部包含 CSS Modules adapter 逻辑。
- CSS Modules adapter 逻辑不属于 `@semantic-atomic-css/core`。
- 如果未来 CSS Modules adapter 可复用于 Rsbuild/Rspack/Webpack，再考虑拆出独立包。

第一版推荐目录形态：

```txt
packages/vite/
  src/
    index.ts
    plugin.ts
    cssModules.ts
    options.ts
    types.ts
```

该目录已按第一版实现落地。

## 用户接入与配置设计

用户接入示例：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { semanticAtomicCss } from '@semantic-atomic-css/vite';

export default defineConfig({
  plugins: [
    semanticAtomicCss(),
    react()
  ]
});
```

推荐配置草案：

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

推荐默认值：

- `include` 默认只匹配 `.module.css`。
- `exclude` 默认排除 `node_modules`。
- `modules.localsConvention` 第一版默认 `asIs`。
- `modules.namedExports` 第一版默认 `false`。
- `core.preserveResolvedClass` 默认 `true`。
- dev 默认 readable atomic class name，build 默认 hash 或继续使用 core 默认值，具体以实现阶段确认。
- `report.enabled` 默认 `false`，显式开启后默认文件名 `semantic-atomic-report.json`。
- `manifest.enabled` 默认 `false`，显式开启后默认文件名 `semantic-atomic-manifest.json`。
- `diagnostics.warn` 默认 `true`。
- `diagnostics.strict` 第一版只设计不默认启用。

可选方案：

- `include/exclude` 可以使用 glob、RegExp 或函数。第一版推荐使用简单 glob/string 模型，减少行为面。
- `modules` 可以尝试读取 Vite `config.css.modules` 默认配置，也可以维护 GSS 自己的配置。第一版推荐 GSS
  显式配置优先，避免隐式继承 Vite 高级行为造成不可验收的兼容承诺。

待 owner 确认：

1. 第一版是否只允许 `.module.css`，还是允许通过 `include` 扩展到其他后缀。
2. `include/exclude` 第一版采用 glob、RegExp，还是函数。
3. 是否跟随 Vite `css.modules` 默认配置，还是只读取 GSS 自己的 `modules` 配置。
4. `diagnostics.strict` 第一版是否实现 fail build，还是只保留配置占位。

## 文件匹配与输入准备

推荐方案：

- MVP 默认只处理 `.module.css`。
- adapter 决定哪些文件进入 transform。
- core 不知道文件扩展名，只接收标准 CSS 字符串。
- CSS Modules adapter 负责把 source class 映射到 scoped class，并向 core 提供 `ScopeStrategy`。
- Less/Sass 输入必须先由未来 adapter/preprocessor 编译为标准 CSS，再交给 core。

文件匹配规则：

```txt
匹配：src/Button.module.css
不匹配：src/global.css
不匹配：src/Button.module.scss
不匹配：node_modules/pkg/style.module.css
```

未来扩展：

- `.module.scss` / `.module.less` 只作为未来能力，不在第一版实现。
- 普通 `.css` 的 class export 语义不同，不能和 `.module.css` 混为一谈。
- 如果未来支持普通 CSS，应使用 identity `ScopeStrategy` 或独立 adapter，不应复用 CSS Modules tokens 逻辑。

## CSS Modules 兼容策略

这是 Phase 3 最关键的设计点。

推荐默认：

```txt
tokens[localName] = result.classes[localName].suggestedClassName
```

因为 core 默认 `preserveResolvedClass: true`，`suggestedClassName` 会包含：

```txt
resolved scoped class + atomic class list
```

示例：

```txt
button -> "Button_button__hash _color_red _font_size_16px"
```

这样 preserved unsafe CSS 仍能命中 resolved scoped class，同时 DOM 上也带有 atomic class。

### scoped class name

推荐第一版：

- 由 `@semantic-atomic-css/vite` 内部生成 scoped class name。
- 默认生成稳定、可读、接近 CSS Modules 的 scoped class。
- 支持 `modules.generateScopedName` 的 string/function 草案，但第一版实现范围需 owner 确认。

可选方案：

- 完全复用 Vite `css.modules.generateScopedName` 语义。优点是用户心智更接近 Vite，风险是需要复核
  Vite 内部和 `postcss-modules` 行为细节。
- GSS 自己维护稳定 scoped name。优点是可控，风险是和 Vite 原生 CSS Modules 输出不完全一致。

推荐第一版采用 GSS 自己的稳定 scoped name，并明确兼容边界。

### localsConvention

推荐第一版支持：

- `asIs`
- `camelCaseOnly`

后续再扩展：

- `camelCase`
- `dashes`
- `dashesOnly`

示例：

```css
.primary-button {
  color: red;
}
```

`asIs`：

```ts
styles['primary-button']
```

`camelCaseOnly`：

```ts
styles.primaryButton
```

待 owner 确认：

- 第一版是否只支持 `asIs`。
- 如果支持 `camelCaseOnly`，是否需要同时保留原始 dashed key。

### named exports

推荐第一版：

- 默认只实现 default export tokens。
- `namedExports` 先作为配置草案保留。

原因：

- named exports 不是 core 能力，也不是 CSS 文件自身的语义；它是构建工具把 CSS Modules 编译成 JS module
  时选择的 export 形态。
- Route B 中 `.module.css` 会由 `@semantic-atomic-css/vite` 返回 JS module，因此如果支持 named exports，
  就必须由 Vite adapter 自己生成对应 exports。
- 如果后续改用 Route A 或深度复用 Vite 原生 CSS Modules pipeline，才可能更多借用 Vite 自带的 named
  exports 行为。
- named exports 需要处理非法 JS 标识符、保留字、localsConvention、类型声明和 HMR 行为。
- 对 MVP 闭环不是必须项。

待 owner 确认：

- named exports 是否必须进入第一版。

### 暂不支持项

第一版不承诺完整支持：

- `composes`
- `@value`
- CSS Modules `:import` / `:export`
- named exports
- 与 Vite 原生 CSS Modules 100% 一致的 hashing 和 edge case
- source map 精确映射
- Less/Sass CSS Modules

遇到不支持但无法安全处理的 CSS Modules 语义时，推荐保守失败或保留 CSS，并输出 diagnostic/report。

## 推荐技术路线

### Route A：接入 Vite 原生 CSS pipeline 后处理

思路：

```txt
Vite 原生 CSS Modules 编译
  -> 读取或复用 Vite 生成的 tokens/scoped name
  -> 调用 core
  -> 改写 CSS/tokens
```

优点：

- 更接近 Vite 官方行为。
- CSS Modules 配置兼容潜力更好。
- 未来 Less/Sass 接入可能更自然。

风险：

- Vite 内部 CSS Modules 产物未必有稳定 public hook 可读取。
- 容易依赖内部实现。
- atomic CSS 注入顺序和原 CSS 移除策略复杂。
- compiled CSS 中 local class 已变为 scoped class，反查 source local name 更复杂。

### Route B：GSS 自己拦截 `.module.css`

思路：

```txt
拦截目标 .module.css
  -> 读取 CSS
  -> 生成 scoped class
  -> 创建 ScopeStrategy
  -> 调用 core
  -> 返回 JS module tokens
  -> import virtual CSS
```

边界说明：

- 这里的“GSS 自己拦截”只表示 `@semantic-atomic-css/vite` 在 Vite plugin 层拦截 `.module.css`。
- 该路线不允许把 CSS Modules 语义重新放回 `@semantic-atomic-css/core`。
- core 仍然只接收标准 CSS 字符串和通用 `ScopeStrategy`，不感知 `.module.css`、tokens、Vite hook 或 virtual module。
- scoped class name、tokens、localsConvention 和文件匹配全部属于 Vite adapter / CSS Modules adapter layer。

优点：

- 控制清晰。
- 与 core v1 对接最直接。
- 不依赖 Vite 内部未公开中间状态。
- 更容易写测试和验收。

风险：

- 需要自己补 CSS Modules 兼容行为。
- scoped name、localsConvention、named exports 可能与 Vite 原生行为不完全一致。
- dev/HMR 需要额外设计，不能直接复用 Vite 原生 CSS Modules HMR。

推荐方案：

```txt
第一版采用 Route B，并在文档和 README 中明确兼容边界。
不要依赖 Vite 内部未公开的 CSS Modules 中间状态。
```

## Virtual Module 设计

Vite 官方建议 virtual module 使用 `virtual:` namespace，内部 resolved id 使用 `\0` 前缀。第一版需要区分：

- 用户代码仍然 import 真实 `.module.css` 文件。
- GSS adapter 内部为 CSS 内容创建 virtual CSS module。
- 如果后续暴露 dev report，也使用独立 virtual id。

推荐 id 设计：

```txt
用户真实导入：
src/Button.module.css

内部 JS module id：
\0semantic-atomic-css/module?source={encodedFile}

用户可见 CSS virtual id：
virtual:semantic-atomic-css/css?source={encodedFile}

内部 CSS virtual id：
\0semantic-atomic-css/css?source={encodedFile}

未来 dev report 用户可见 id：
virtual:semantic-atomic-css/report

未来 dev report 内部 id：
\0semantic-atomic-css/report
```

设计约束：

- virtual id 必须包含插件 namespace，避免和生态插件冲突。
- encoded file path 必须稳定，不能因 query 顺序导致 cache miss。
- dev/build 使用同一套编码规则。
- virtual CSS 的内容必须保持 atomic first、preserved second。
- 如果 virtual module 需要 sourcemap，是否使用 `\0` 要结合 Vite 官方 sourcemap 约定再次复核。

待 owner 确认：

- 第一版是否需要 virtual report 读取能力。
- 是否需要把 JS module id 暴露为 `virtual:`，还是只作为内部 resolved id。

## Dev / Build 状态模型

### Build

推荐方案：

- build 开始时创建一个 `createTransformer()` 实例。
- 每个匹配文件 transform 一次。
- 每个 CSS Module 返回 JS tokens；build 阶段不以 per-module CSS 作为最终优化目标。
- build 结束时通过 `getAtomicCss()`、`getManifest()`、`getReport()` 输出聚合数据。
- build 阶段输出全局聚合 CSS asset，其中 atomic CSS 来自 `getAtomicCss()` 的跨文件去重结果。
- manifest/report 仅在配置显式开启时通过 Vite/Rollup `emitFile` 输出 JSON asset。

必须解决的问题：

- 全局 CSS asset 必须被构建入口稳定引入或 emit，并保证浏览器实际加载。
- 全局 atomic CSS 必须保持 registry 首次出现顺序。
- preserved CSS 必须按文件 transform 结果保留，并在最终 CSS 中位于 atomic CSS 之后。
- 需要避免同时注入 per-module atomic CSS 和全局 atomic CSS，造成重复输出。

推荐第一版 build 策略：

```txt
transform 所有匹配 .module.css
  -> 聚合 atomic registry
  -> 聚合 preserved fallback CSS
  -> 输出一个全局 CSS asset：atomic first, preserved second
  -> 按配置输出 manifest/report
```

### Dev

已知约束：

- `createTransformer()` 当前是 append-only collector。
- 同一 `id` 更新时没有 invalidate。
- dev server 中长期复用单个 transformer 会产生过期 atomic CSS、manifest 或 report 风险。

推荐第一版 dev 策略：

```txt
每次 CSS module 请求以 transformCss 做单文件转换；
adapter cache 只缓存当前文件的最新 result；
文件变更时清空相关 cache；
必要时触发 full reload；
不假装提供精细 CSS-only HMR。
```

可选方案：

- 每次请求重建全量 transformer。正确但可能慢。
- 维护 per-file transform result，再重建 aggregate registry。更接近长期方案，但实现复杂。
- 推动 core 增加 `invalidate(id)` 或 `rebuild(files)` API。需要先设计 core 行为，不属于本轮默认实现。

待 owner 确认：

1. 第一版 dev 是否允许 full reload。
2. 是否必须实现 CSS-only HMR。
3. 是否要在 Phase 3 同步推动 core 增加 invalidate API。

## CSS 输出策略

推荐拼接顺序：

```txt
atomic CSS first
preserved CSS second
```

原因：

- preserved fallback 必须有机会覆盖 atomic CSS。
- custom property、unsafe selector、unsupported at-rule 等保留内容不应被 atomic 输出重排破坏语义。

dev 推荐：

- virtual CSS module 返回当前文件的 `result.css.atomic + result.css.preserved`。
- dev warning 通过 Vite plugin context 输出。
- 文件变更时清空相关 virtual CSS cache。

build 推荐：

- 第一版 build 必须输出全局聚合 CSS asset。
- atomic 部分使用 `createTransformer().getAtomicCss()`，获得跨文件去重收益。
- preserved 部分按模块 transform 顺序聚合，并整体放在 atomic CSS 之后。
- build 结束时按配置 emit manifest/report。
- build 产物不得同时包含重复的 per-module atomic CSS 和全局 atomic CSS。

实现阶段需要细化：

- adapter 如何把全局 CSS asset 稳定接入 Vite build 输出。
- preserved CSS 聚合顺序是否以模块 transform 顺序为准。

## Diagnostics / Warning / Strict Mode

推荐方案：

- core diagnostic 不直接打印，由 Vite adapter 转换为 warning 或 error。
- 默认输出 warning/report，不 fail build。
- warning 展示依赖 `code/reason/id/selector/source`，message 只作为人类可读文案。
- 同一文件同一 selector 同一 reason 的 warning 应去重，避免 dev 时刷屏。
- report 中保留完整 diagnostic 列表。

`strict` 设计：

- `diagnostics.strict` 第一版建议只作为设计项保留。
- 如果 owner 决定实现，strict 遇到 `unsafe-selector` 或 `parse-error` 时可 fail build。
- strict 的 fail 条件必须基于稳定 `code/reason`，不能依赖 message 文案。

待 owner 确认：

1. strict mode 第一版是否实现。
2. unsafe selector 在 strict 下是否 fail build。
3. parse error 在默认模式下是 warning 还是 error。

## Manifest / Report 输出

默认行为：

```txt
默认不输出 manifest/report。
用户显式开启后，输出 semantic-atomic-manifest.json 和 semantic-atomic-report.json。
```

推荐方案：

- manifest/report 结构优先复用 core `TransformManifest` / `TransformReport`。
- Vite adapter 不二次发明 JSON schema。
- build 阶段仅在配置开启时使用 `emitFile` 输出 JSON asset。
- dev 阶段第一版不强制提供 virtual report；可以在后续添加。

默认配置：

```ts
semanticAtomicCss({
  manifest: {
    enabled: false,
    filename: 'semantic-atomic-manifest.json'
  },
  report: {
    enabled: false,
    filename: 'semantic-atomic-report.json'
  }
})
```

验收方式：

- 默认 build 产物中不出现 manifest/report JSON。
- 开启 `manifest.enabled` 和 `report.enabled` 后，build 产物中存在对应 JSON。
- manifest `atomic` 能反查 atomic class 的 declaration、context、sources。
- manifest `classes` 能反查 source class 的 resolved class、atomic classes、suggested class。
- report summary 包含 files、sourceClasses、atomicDeclarations、unsafeRules 等统计。
- report diagnostics 包含 unsafe selector reason。

## 测试与验收计划

文档自身验收：

- 包含“已确认决策”。
- 包含“推荐方案”。
- 包含“可选方案”。
- 包含“待 owner 确认”。
- 包含“暂不支持项”。
- 包含“验收方式”。
- 记录 12 个决策点的确认状态。

已落地验收覆盖：

- adapter 单元测试：id 解析、include/exclude、tokens 生成、localsConvention、virtual CSS。
- CSS Modules adapter 测试：scoped name、`ScopeStrategy`、`suggestedClassName` tokens。
- Vite 集成测试：React + Vite + CSS Modules build。
- 精简 acceptance fixture：覆盖重复 atomic declaration、media/supports、顺序敏感 declaration、状态伪类、
  custom property 和 unsafe fallback。
- Playwright visual verifier：对比 semantic/native dev 与 build preview 的 computed style。
- manifest/report 验证：显式开启配置后，build 生成 JSON asset，内容含 atomic/classes/diagnostics。
- dev 验证：virtual CSS id 编码、全局 atomic 去重顺序和 full reload 行为有单元覆盖；HMR 写文件视觉验收暂不覆盖。
- warning 验证：unsafe selector 输出 warning/report，且 dev 重复请求不会无限刷屏。

已落地命令：

```bash
pnpm --filter @semantic-atomic-css/core test
pnpm --filter @semantic-atomic-css/vite test
pnpm typecheck
pnpm build
pnpm verify:phase3
pnpm verify:phase3:visual
```

注意：`verify:phase3` 已新增，当前验收细节见 `docs/phase-3-acceptance.md`。

## 风险清单

- CSS Modules scoped name 与 Vite 原生行为不一致。
- `localsConvention` / named exports 行为不完整。
- `composes`、`:import`、`:export` 等 CSS Modules 高级能力暂不支持。
- dev 仍采用 full reload，尚未提供 CSS-only HMR。
- build 全局 CSS 注入目前面向 Vite app HTML build，library/SSR 产物仍需后续设计。
- build 中全局聚合 CSS asset 可能引入注入顺序和 cascade 风险。
- preserved fallback 顺序错误导致 cascade 语义变化。
- unsafe selector warning 过多影响开发体验。
- Less/Sass 支持被误解为本轮能力。
- Vite 官方 API 变化导致设计依赖不稳。
- source map 不精确会影响调试体验。

风险处理原则：

- 不确定时保留 CSS 并报告不确定原因。
- 不以压缩率为理由削弱 unsafe fallback。
- 不在 core 中增加 Vite 或 CSS Modules 生命周期语义。
- 所有输出变化必须有测试或验收命令覆盖。

## 逐项决策议程

本节是 owner 讨论用议程。决策必须一个个来：每次只讨论当前编号的议题，确认后再进入下一项。
后文的推荐选项只是草案默认建议，不代表已经决策通过。

### 决策 1：是否恢复 `packages/vite`

状态：

- 已确认：恢复 `packages/vite`，作为 Phase 3 的主线目标。

讨论目标：

- 确认 Phase 3 是否以恢复 `@semantic-atomic-css/vite` 为主线。

背景：

- 决策前 `packages/vite` 不在工作区内。
- core v1 已经稳定为纯 CSS transform engine。
- playground 当前只是普通 Vite React CSS Modules 示例。

选项：

- A：恢复 `packages/vite`，作为 Phase 3 的唯一实现目标。
- B：暂不恢复 Vite adapter，继续补 core 测试、report 或 verifier。

推荐：

- 选择 A。Vite adapter 是验证 core v1 能否进入真实构建链路的最短路径。

确认后影响：

- 若选择 A，后续决策继续讨论 Vite adapter 的范围、路线和验收。
- 若选择 B，本文档后续 Vite 设计只保留为未来资料，不进入实现。

进入下一项条件：

- owner 明确确认 Phase 3 是否恢复 `packages/vite`。

### 决策 2：第一版处理哪些文件

状态：

- 已确认：第一版只处理 `.module.css`。

讨论目标：

- 确认第一版 adapter 的文件匹配范围。

背景：

- MVP 原则是 CSS Modules only。
- Less/Sass 需要先经过预处理，普通 CSS 没有 CSS Modules tokens 语义。

选项：

- A：只处理 `.module.css`。
- B：允许通过 `include` 扩展到 `.module.scss` / `.module.less`，但先不保证完整支持。
- C：同时支持普通 `.css`。

推荐：

- 选择 A。只处理 `.module.css` 最容易证明语义正确性和验收闭环。

确认后影响：

- 若选择 A，第一版不会实现预处理器接入。
- 若选择 B/C，需要新增输入准备、错误策略和验收场景，Phase 3 范围会明显变大。

进入下一项条件：

- owner 确认第一版默认匹配范围，以及 `include/exclude` 是否只作为未来扩展点。

### 决策 3：选择 Route A 还是 Route B

状态：

- 已确认：第一版采用 Route B，由 `@semantic-atomic-css/vite` 拦截 `.module.css`。
- 已确认：Route B 不改变 core 边界，core 仍然不感知 CSS Modules、tokens、Vite hook 或 virtual module。

讨论目标：

- 确认 adapter 是复用 Vite 原生 CSS pipeline，还是自行拦截 `.module.css`。
- 确认无论选择哪条路线，CSS Modules 语义都不会回流到 core。

背景：

- Route A 兼容潜力更好，但可能依赖 Vite 内部中间状态。
- Route B 与 core v1 对接最直接，但 CSS Modules 兼容需要 GSS 自己维护。
- Route B 的拦截范围仅限 `@semantic-atomic-css/vite`，core 仍然只知道标准 CSS 和 `ScopeStrategy`。

选项：

- A：Route A，接入 Vite 原生 CSS pipeline 后处理。
- B：Route B，GSS 自己拦截 `.module.css`，生成 JS tokens 和 virtual CSS。

推荐：

- 选择 B。第一版优先保证可控、可测、少依赖 Vite 内部实现；同时把“core 不感知 CSS Modules”列为不可破坏的实现约束。

确认后影响：

- 若选择 B，后续必须单独讨论 scoped name、localsConvention、virtual module 和 HMR。
- 若选择 B，后续实现不得新增 core `compileCssModule`、tokens、文件匹配或 Vite 生命周期能力。
- 若选择 A，需要先调研 Vite 6 是否有稳定 public hook 能读取 tokens/scoped CSS。

进入下一项条件：

- owner 确认第一版技术路线。

### 决策 4：scoped class name 由谁生成

状态：

- 已确认：第一版由 GSS 自己生成稳定 scoped class name。
- 已确认：预留 `modules.generateScopedName` 配置入口，但第一版不承诺与 Vite 原生输出完全一致。

讨论目标：

- 确认 CSS Modules scoped class name 的生成权归属。

背景：

- core 只通过 `ScopeStrategy.resolveClassName` 消费最终 class name。
- preserved CSS 必须使用 scoped class 才能命中 DOM。

选项：

- A：GSS 自己生成稳定 scoped name。
- B：尽量兼容 Vite `css.modules.generateScopedName`。
- C：强依赖 Vite 原生生成结果。

推荐：

- 选择 A，并为 B 预留配置接口。这样第一版可控，后续再逐步兼容 Vite 配置。

确认后影响：

- 若选择 A，需要在文档和 README 中明确 scoped name 不保证与 Vite 原生完全一致。
- 若选择 B/C，需要增加兼容测试，并复核 Vite 6 `css.modules` 行为。

进入下一项条件：

- owner 确认 scoped name 策略。

### 决策 5：tokens 默认值使用什么

状态：

- 已确认：tokens 默认返回 `result.classes[localName].suggestedClassName`。
- 已确认：默认 class string 包含 resolved scoped class 和 atomic class list，以保留 unsafe fallback hook。

讨论目标：

- 确认 `styles.button` 最终返回 scoped class，还是 scoped class + atomic classes。

背景：

- core 的 `suggestedClassName` 默认包含 resolved class 和 atomic class list。
- unsafe preserved CSS 依赖 resolved semantic class 命中。

选项：

- A：tokens 返回 `result.classes[localName].suggestedClassName`。
- B：tokens 只返回 scoped class。
- C：tokens 只返回 atomic classes。

推荐：

- 选择 A。这是“默认保留 semantic scoped class + 注入 atomic class”的最小安全路径。

确认后影响：

- 若选择 A，DOM class 会变长，但 fallback 和 DevTools 可读性更安全。
- 若选择 C，unsafe fallback 可能无法命中，除非证明所有相关规则都可安全转换。

进入下一项条件：

- owner 确认 tokens 默认输出策略。

### 决策 6：`localsConvention` 第一版支持范围

状态：

- 已确认：第一版支持 `asIs` 和 `camelCaseOnly`。

讨论目标：

- 确认第一版 CSS Modules tokens key 的转换规则。

背景：

- 完整 `localsConvention` 会扩大测试矩阵。
- MVP 只需要让普通 `styles.button` 可用。

选项：

- A：只支持 `asIs`。
- B：支持 `asIs` 和 `camelCaseOnly`。
- C：一次性支持 `asIs`、`camelCase`、`camelCaseOnly`、`dashes`、`dashesOnly`。

推荐：

- 选择 B。`asIs` 覆盖基础场景，`camelCaseOnly` 覆盖常见 dashed class 习惯。

确认后影响：

- 若选择 A，第一版最简单，但 dashed class 用户需要 `styles['primary-button']`。
- 若选择 C，兼容更完整，但需要更多 named export、类型和冲突测试。

进入下一项条件：

- owner 确认第一版 `localsConvention` 支持列表。

### 决策 7：named exports 是否进入第一版

状态：

- 已确认：第一版不支持 named exports，只支持 default export tokens。
- 已确认：named exports 如后续支持，应由 Vite adapter 生成，不允许把该能力放入 core。

讨论目标：

- 确认是否支持 `import { button } from './Button.module.css'`。

背景：

- named exports 是 CSS Modules 经构建工具转换后的 JS export 形态，不是 CSS 文件自身能力。
- 当前已确认 Route B，因此 `.module.css` 的 JS module 由 `@semantic-atomic-css/vite` 生成；若要 named
  exports，就需要 adapter 自己实现。
- named exports 需要处理非法 JS 标识符、保留字、localsConvention 和 HMR。
- default export tokens 已能满足 MVP。

选项：

- A：第一版不支持 named exports，只保留配置草案。
- B：第一版支持 named exports。

推荐：

- 选择 A。先把 default export 闭环做稳。

确认后影响：

- 若选择 A，文档需要明确暂不支持 named exports。
- 若选择 B，需要补充更多 tokens export 规则和测试。

进入下一项条件：

- owner 确认 named exports 是否进入第一版。

### 决策 8：dev/HMR 是否允许 full reload

状态：

- 已确认：第一版 dev/HMR 允许 full reload。
- 已确认：不在第一版假装支持精细 CSS-only HMR，优先避免过期 CSS 或过期 tokens。

讨论目标：

- 确认第一版 dev 更新策略。

背景：

- core `createTransformer()` 当前没有 invalidate。
- 精细 CSS-only HMR 可能因过期 registry 产生错误 CSS。

选项：

- A：允许 full reload，优先正确性。
- B：必须实现 CSS-only HMR。
- C：先推动 core 增加 invalidate，再做 dev HMR。

推荐：

- 选择 A。第一版不要假装支持精细 HMR，避免过期 CSS 风险。

确认后影响：

- 若选择 A，dev 体验稍弱，但实现和验收更稳。
- 若选择 B/C，Phase 3 需要扩大到状态失效模型和更多 runtime 验证。

进入下一项条件：

- owner 确认 dev/HMR 第一版是否接受 full reload。

### 决策 9：build CSS 输出采用 per-module 还是全局聚合

状态：

- 已确认：build 第一版必须采用全局聚合 CSS asset。
- 已确认：全局聚合是该工具体现 atomic 复用价值的必要能力，不作为后续优化项延后。

讨论目标：

- 确认 build 阶段 CSS 注入和去重策略。

背景：

- per-module virtual CSS 最容易保留模块关系和注入闭环。
- 全局聚合 CSS 能提升跨文件 atomic 去重收益，但需要解决注入顺序。

选项：

- A：per-module virtual CSS。
- B：全局聚合 atomic CSS asset + preserved CSS 处理。
- C：第一版 per-module，后续再升级全局聚合。

推荐：

- 选择 B。build 必须输出全局聚合 CSS asset，否则跨文件 atomic 复用收益无法体现，工具价值会被显著削弱。

确认后影响：

- 需要提前设计入口注入、CSS 顺序和 Vite asset 输出关系。
- 需要验证最终产物中没有重复注入 per-module atomic CSS。
- dev 阶段仍可使用 per-file virtual CSS 或保守 full reload，build 阶段必须全局聚合。

进入下一项条件：

- owner 确认 build CSS 输出策略。

### 决策 10：manifest/report 是否默认 emit

状态：

- 已确认：manifest/report 默认不 emit。
- 已确认：用户显式开启 `manifest.enabled` / `report.enabled` 后才输出 JSON asset。
- 已确认：验收命令或集成测试如果要检查 manifest/report，必须显式开启配置。

讨论目标：

- 确认 build 产物是否默认输出 manifest/report。

背景：

- manifest/report 是判断 unsafe fallback、atomic 复用和调试反查的核心证据。
- 输出 JSON asset 会增加构建产物文件。

选项：

- A：默认 emit manifest/report。
- B：默认不 emit，只在配置开启时输出。

推荐：

- 选择 B。生产默认行为不应额外污染构建产物；Phase 3 验收可以显式开启 manifest/report。

确认后影响：

- 默认 build 不输出 report/manifest。
- 验收命令必须显式开启 report/manifest。
- 仍需明确开启后的文件名和 JSON schema 使用 core 结构。

进入下一项条件：

- owner 确认 manifest/report 默认行为。

### 决策 11：strict mode 第一版如何处理

状态：

- 已确认：strict mode 第一版只设计不实现。
- 已确认：默认只 warning/report，不因 unsafe selector fail build。

讨论目标：

- 确认 unsafe selector、parse error 等 diagnostic 是否会 fail build。

背景：

- MVP 原则是保留 unsafe CSS 并 warning/report。
- strict mode 更像团队治理能力，不一定适合默认启用。

选项：

- A：strict 只设计不实现。
- B：实现 strict，但默认关闭。
- C：默认 strict，unsafe selector fail build。

推荐：

- 选择 A 或 B。不要默认 fail build。

确认后影响：

- 若选择 A，第一版只输出 warning/report。
- 若选择 B，需要定义 fail 条件和测试。
- 若选择 C，会明显提高接入门槛。

进入下一项条件：

- owner 确认 strict mode 第一版范围。

### 决策 12：是否同步设计 core invalidate API

状态：

- 已确认：Phase 3 第一版不改 core，不实现 `invalidate(id)` 或 rebuild API。
- 已确认：dev 阶段由 Vite adapter 使用保守策略处理，core 状态 API 演进后续单独设计。

讨论目标：

- 确认 Phase 3 是否同时推动 core 状态 API 演进。

背景：

- `createTransformer()` append-only 适合 build，不适合长期 dev server 状态。
- adapter 可以用 full reload 绕开第一版 dev registry 失效问题。

选项：

- A：Phase 3 不改 core，adapter 自己用保守 dev 策略。
- B：Phase 3 同步设计并实现 core `invalidate(id)`。
- C：只写 core invalidate 设计，不实现。

推荐：

- 选择 A 或 C。不要把 Vite adapter 第一版和 core 状态 API 改造绑死。

确认后影响：

- 若选择 A，adapter 实现更聚焦。
- 若选择 B，必须补充 core contract tests 和文档更新。
- 若选择 C，需要新增 core 状态设计文档或在本文档补充附录。

进入下一项条件：

- owner 确认 Phase 3 是否包含 core 状态 API 设计或实现。

## 已确认第一版路径

以下路径已经按上方 12 个决策逐项确认，可作为后续实现阶段的 Phase 3 第一版目标。

```txt
packages/vite + Route B + .module.css only
+ GSS stable scoped name
+ default export tokens = suggestedClassName
+ first localsConvention = asIs + camelCaseOnly
+ named exports deferred
+ dev virtual CSS 注入 atomic + preserved
+ build = global aggregate CSS asset
+ manifest/report disabled by default
+ dev full reload fallback
+ strict mode deferred
+ core invalidate API deferred
```
