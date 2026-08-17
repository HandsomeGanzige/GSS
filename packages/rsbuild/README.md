# @semantic-atomic-css/rsbuild

`@semantic-atomic-css/rsbuild` 把 GSS 接入 Rsbuild 2.1 的原生 css-loader CSS Modules 管线。adapter
通过 Rspack 公开 `importModule` API 消费预处理、scoping、ICSS/composes 和资源处理后的结构化 CSS rows
及 default-export locals，再调用 core 做 safe atomization。

## 使用

```ts
import { defineConfig } from '@rsbuild/core';
import { pluginSemanticAtomicCss } from '@semantic-atomic-css/rsbuild';

export default defineConfig({
  plugins: [
    pluginSemanticAtomicCss({
      manifest: { enabled: true },
      report: { enabled: true },
      devtools: { enabled: true }
    })
  ]
});
```

默认只处理 `.module.css`、`.module.scss` 和 `.module.less`。普通 CSS/SCSS/Less 仍由 Rsbuild 原生
管线处理；adapter 不改写 JSX/TSX，也始终保留 semantic scoped class。

## Build 与 dev

build 继续使用 Rsbuild 默认 extraction 管线：

- safe declaration 聚合到 `static/css/semantic-atomic.css`。
- 原生 CSS chunks 只保留 custom property、unsafe selector 和资源 class 等 fallback。
- atomic stylesheet 会在 HTML 中排在原生 fallback stylesheet 之前。
- manifest/report 默认关闭；显式开启后分别输出 `semantic-atomic-manifest.json` 和
  `semantic-atomic-report.json`，report 包含 analyzer `analysis`。
- build metadata 按配置惰性 finalization：两者都关闭时不读取 Core manifest/report，
  manifest-only 不生成 report 或运行 Analyzer，report-only 和两者同时开启都共享同一次
  稳定 manifest snapshot。仅 Analyzer 需要的 atomic + preserved `outputCss` 也只在 report
  开启时才拼接。
- build/dev 聚合 renderer 直接使用 Core 预渲染的 `selector.css`，不解析 selector identity，
  也不自行拼接 class 或 pseudo；manifest 保留必填 selector descriptor，analysis conflict
  保留 `selectorIdentity`。
- Core 判定 eligible 的基础 selector、五种 pseudo class、独立 before/after pseudo element 和全分支
  安全 selector list 直接复用同一 descriptor 链路；含 pseudo element arm 或任一 unsafe arm 的 list
  完整 fallback，adapter 不复制 grammar 或做混合拆分。
- Core 判定 eligible 的单一 presence / exact attribute guard 会随 native scoped token 一起输出；
  attribute-before-class node order 保持不变。unsupported operator 和同 class cascade 顺序风险继续整类
  fallback，并在 report 中保留 `attribute-selector` / `attribute-cascade-order`。
- Core identity 与 descriptor CSS 保留 Core 收到的 AST serializer spelling。build 的最终 stylesheet
  仍可由 Rsbuild/Lightning CSS 原生 minifier 移除安全 attribute value 的 quotes；adapter 不为此解析、
  canonicalize 或重建 selector，真实 fixture 会同时校验 descriptor、最终 CSSOM 与 runtime parity。
- `atomicCss.ts` 为 dev 与 build snapshot 共用同一 readable renderer；build 在
  `PROCESS_ASSETS_STAGE_ADDITIONS` 提交 snapshot 后，由已有 Rsbuild/Rspack native optimize/minify 阶段
  生成最终紧凑 asset。adapter 不复制 Vite production serializer，也不提前改写 value。

dev 只把当前 environment 切换到 Rsbuild 官方 `output.injectStyles` 管线，并保留项目已有的 HMR 和
live-reload 配置。目标 CSS Modules 的原生 style rows 会被清空，runtime bridge 把转换快照注册到单一
`style[data-semantic-atomic-css-rsbuild-dev]` owner；owner 按稳定 source order 渲染，并按 atomic key
全局去重，避免后加载模块再次注入同名原子类并改变 cascade。这样 bridge 仍只执行一层 `importModule`，
也避免 Rsbuild 2.1.6 / Rspack 2.1.4 在 extraction 嵌套 `importModule` 的增量编译路径上发生 panic。
runtime bridge 只调用 `registerDevStyles(ownerId, { sources })` 注册当前快照，每条 atomic declaration
携带 selector descriptor；不读取旧数组或版本字段。HMR dispose 会撤销旧快照；不同 atomic key
若碰撞到同一 readable class 则 fail fast。CSS-only HMR
不是当前公共承诺；direct module、Sass partial 和移除 import 的最终状态必须正确且无 stale CSS/tokens。

显式配置 `devtools: { enabled: true }` 后，dev server 提供
`GET /__semantic-atomic-css/report`，按 environment 返回当前 report/analyzer snapshot，并向 semantic dev HTML
注入 Shadow DOM overlay。API 只处理 GET，endpoint 不接受 dot-segment。`overlay: false` 可只启用 API；
该配置不影响 build/preview。

dev report 使用当前唯一的 `adapter/status/environments` envelope，不包含人为 `schemaVersion`。

## 配置与保护边界

- `include` / `exclude` 当前承诺普通文本、`*` 和 `**` glob。
- `core` 传递 safe transform 与 class name 配置；build 默认无 prefix 的 32-bit / 7 字符 lower-base36 `compact`，
  dev 默认 `readable + "_"`。显式 `readable` / `hash` / `compact` / `prefix` 始终覆盖环境默认，
  既有显式 `hash` 仍输出 `_` 加 8 位 base36。
- `cssFilename`、manifest/report 文件名必须位于 dist 内。
- 资源 class 及其 composed token 闭包整体保留；inline/external、query/hash、asset prefix 和 publicDir
  仍由 css-loader/Rspack 负责。
- 多个 default export 完整同值且包含已知 class 时，公开 css-loader array contract 无法区分 class export
  与 ICSS value；adapter 会按 `ambiguous-export-value` 整类保留，并让所有同值 export 保持原值。
- 当前锁定并验证 Rsbuild `2.1.x`；其他版本 fail fast。
- named exports、非 web target、CSS source map、strict mode 和非 array css-loader export fail fast。
- 不支持 SSR、Node target、worker、library output、Module Federation 或 raw Rspack 公共入口。

## 验证

```bash
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm --filter @semantic-atomic-css/rsbuild-fixture verify
pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual
```

设计、路线证据和验收结果见：

- [Phase 6 方案](../../docs/phase-6-rsbuild-rspack-adapter-plan.md)
- [Phase 6 acceptance](../../docs/phase-6-rsbuild-rspack-adapter-acceptance.md)
- [Phase 6 tracking](../../docs/phase-6-rsbuild-rspack-adapter-tracking.md)
- [Phase 7 verifier/devtools](../../docs/phase-7-verifier-devtools-plan.md)
