# Phase 6 Rsbuild / Rspack CSS Modules Adapter 推进记录

## 当前状态

- Status: completed
- 开始日期：2026-07-15
- 完成日期：2026-07-15
- 生产入口：`packages/rsbuild` / `@semantic-atomic-css/rsbuild`
- 验收入口：`fixtures/rsbuild-css-modules` / `@semantic-atomic-css/rsbuild-fixture`

方案见 [Phase 6 方案](phase-6-rsbuild-rspack-adapter-plan.md)，官方资料与 Batch 0 证据见
[Phase 6 接入点研究](phase-6-rsbuild-rspack-research.md)，最终矩阵见
[Phase 6 验收](phase-6-rsbuild-rspack-adapter-acceptance.md)。

## Phase 9 css-loader shared seam 迁移（2026-08-24）

- rows/default-locals 的纯结构转换、stable artifact、canonical renderer 与 browser owner 已迁移到内部
  `@semantic-atomic-css/css-loader-bridge`，由 Rsbuild 与 Webpack 共同消费。
- Rsbuild 仍拥有 `importModule` request、synthetic Rspack URL、environment state、processAssets、HTML 与
  Rsbuild 2.1 版本保护；public factory、配置、asset 路径和 schema 不变。shared resolver 现在只设置环境
  默认：dev 使用 `readable-keyed`、build 使用 `compact-keyed`，显式策略原样保留。keyed 策略使用
  完整 canonical key 的 128-bit FNV-1a / 固定 25 位 lower-base36；显式旧策略恢复原 class 字节。
- package exact tests、fixture static/visual 继续作为字节与 cascade 回归门禁。build 默认从 32-bit `compact`
  迁移为 `compact-keyed` 后，Pilot atomic/manifest/report 新 baseline 为 `14540 / 652153 / 19865 B`，SHA-256 为
  `1497d1e8…942e / 747d23e1…b884 / db82175a…ed28`；这是 owner 明确批准的默认 class-byte 迁移。

## Build metadata 惰性 finalization（2026-08-17）

- `createBuildArtifactSnapshot` 新增内部 metadata selection，保留不传第三参时生成
  完整 snapshot 的既有内部调用契约；公共 Rsbuild options 和 asset schema 不变。
- build `PROCESS_ASSETS_STAGE_ADDITIONS` 根据 manifest/report 配置选择 metadata：
  默认关闭为 `getManifest/getReport/analyzeBuild = 0/0/0`，manifest-only 为
  `1/0/0`，report-only 与两者同时开启均为 `1/1/1`。report 内部需要
  manifest 作为 Analyzer 证据，但不会因同时输出 manifest asset 而重复 finalization。
- `outputCss` 是 Analyzer 的 atomic + preserved 完整 CSS 代理，不是 adapter 直接 emit
  的产物。默认关闭与 manifest-only snapshot 不再遍历、`trim()` 和拼接该字符串；
  report-only 与两者开启仍生成相同 `outputCss` 供体积分析使用。
- `buildArtifacts.test.ts` 锁定四种配置组合的 Core getter / Analyzer 调用次数，
  默认与 manifest-only 不含 `outputCss`，并证明 report-only 与两者开启时的
  `outputCss` / report snapshot 完全相同。
- Rsbuild package verify 通过：4 个 test files、32 项测试及 typecheck/build；根
  `pnpm verify` 通过，包含 Rsbuild 默认关闭 metadata 的真实 fixture 路径。
- 中型 Pilot 保持 manifest/report 同时开启，修改前后 atomic CSS、manifest、report
  字节数与 SHA-256 完全一致：`9087 / 590156 / 19731 B`，hash 分别为
  `3f694b1cd28db74f29c2cd4c88a90a5cdee2874a139e84d2d7b2b85c6115d7ab`、
  `52fcfa07bb40ddee6e280e32b693cc9b676994455e70fffb547f8808f10f1790`、
  `6150e8e6be17abb8ff18bed4f8ef8026cb420f8816adf7365b2ef6d20e9a3a7d`。

## Production serialization owner（2026-08-17）

- Rsbuild 不引入 adapter-local production serializer；`atomicCss.ts` 继续为 dev/build snapshot 输出
  readable CSS，并在 `PROCESS_ASSETS_STAGE_ADDITIONS` 交给原生 optimize/minify 阶段。
- package exact test 锁定 readable rule、important、空行和 supports-then-media 套层；真实产物
  以 baseline/candidate byte equality 证明最终 serializer 仍归 native minifier 所有。

## SEL-02 attribute selector consumer（2026-07-27）

- Architecture 审计确认现有 build/dev renderer、manifest stabilizer、runtime snapshot 和 token augmentation
  已通用消费 Core selector descriptor；本批没有修改 `packages/rsbuild/src/**`，也没有在 adapter 复制
  attribute grammar、identity 或 cascade guard。
- package tests 新增 presence、exact equality、attribute-before-class、Rsbuild serializer spelling、
  `attribute-cascade-order` report/analyzer 以及 guarded selector HMR update/remove/stale dispose 契约；
  Rsbuild package 4 files/20 tests、typecheck/build 通过。
- base fixture 使用独立 `AttributeCase.module.css` 覆盖 absent → open → closed → removed、className 稳定、
  presence、两种 node order、order-risk hover 与 unsupported operator fallback。两个历史 cascade oracle
  改用明确不支持的 `^=`，继续承担原有 scoped fallback 角色，避免与 SEL-02 正向 case 混用。
- preprocessor fixture 新增 Sass nested exact attribute case；static 同时证明 Core identity/descriptor 保留
  双引号，而 Rsbuild/Lightning CSS 最终 stylesheet 可移除安全 ident quotes，token、完整 guarded selector
  和 computed style 仍自洽。partial 更新和移除 import 会清除 guarded atomic selector，不留下 stale CSS。
- `pnpm verify` 通过：五个产品包共 19 files/213 tests、全部 typecheck/build，以及 Vite/Rsbuild static
  fixture 均通过。
- base visual：4 runs、124 cases、296 comparisons、0 differences；full visual：8 runs、148 cases、
  360 comparisons、0 differences。报告分别为
  `/private/tmp/gss-rsbuild-attribute-selector-base.json` 和
  `/private/tmp/gss-rsbuild-attribute-selector-full.json`。

## 当前 selector descriptor consumer（2026-07-22）

- build/dev 共用 renderer 只消费 `selector.css`，继续保留 atomic key 去重、readable class collision、
  declaration/important、media/supports、base/context 分区和简单宽度断点顺序。
- build manifest 显式复制 selector descriptor；Analyzer conflict 保留 `selectorIdentity`；
  dev report 使用无 `schemaVersion` 的当前 envelope。
- runtime bridge 只序列化当前 `{ sources }` 对象及必填 descriptor，并调用
  `registerDevStyles(ownerId, { sources })`；不读取旧数组或版本字段。
- HMR update/remove 与 stale dispose 已覆盖旧 pseudo selector/class 清理；资源、ICSS、tokens、
  preservation 和 state reset 既有断言保持。
- 已删除已移除 core 配置的专用 tombstone guard；当前生产错误文本不再携带阶段生命周期。
- Rsbuild package verify 共 4 个测试文件、18 项测试，typecheck/build 通过；fixture、Playground、
  root 与 visual 不属于本批次。

## 总体进度

| Batch | 主题 | 状态 | 结果 |
| --- | --- | --- | --- |
| 0 | 官方接口研究与可行性 spike | completed | Route A `go`，Route B 不需要决策 |
| 1 | package 骨架与数据边界 | completed | public API、environment state、配置保护 |
| 2 | `.module.css` build 闭环 | completed | tokens、atomic/fallback CSS、manifest/report |
| 3 | ICSS、SCSS/Less 与资源 | completed | composes、preprocessor、inline/external/prefix/publicDir |
| 4 | dev 与失效模型 | completed | style injection + 单一共享 owner、HMR、partial、移除 import 无 stale state |
| 5 | fixture、visual 与文档 | completed | static/root 门禁与显式 Chrome 验收 |
| 6 | 中型 Rsbuild Pilot | completed | 双入口 React Pilot、ICSS 保守路径、preview 与 partial reload 已验收 |

## Batch 0 路线结论

锁定版本：

```txt
Node 22.22.3
pnpm 8.6.2
@rsbuild/core 2.1.6
@rspack/core 2.1.4
css-loader 7.1.4
@rsbuild/plugin-sass 2.0.1
@rsbuild/plugin-less 2.0.1
```

最小 spike 证明：

- css-loader `modules.getJSON` 可观察 exports，但修改 callback 参数不会进入最终 export。
- bridge 位于 style/extract 与 css-loader 之间，可用公开 `importModule` 执行右侧原生 loader chain。
- default array export 同时给出 scoped CSS rows 与最终 `.locals`，覆盖 composes/ICSS、预处理器与资源。
- 结构化替换 rows 可以只清空目标 safe CSS；普通 CSS、fallback 与 lazy chunk 保持原生边界。
- 返回模块必须继续 import 原生 css-loader module，否则已解析 URL 会失去 asset module 发布依赖。
- 自定义执行 base URI 必须用 value AST 只去除 synthetic scheme，保留 pathname/query/hash/CDN URL。

Route A 因此 `go`。未使用 css-loader 私有 PostCSS plugin、生成 JS 文本解析、Rspack Rust/JS 私有对象
布局或 builtin CSS。

## 生产实现

`@semantic-atomic-css/rsbuild` 当前包含：

- `runtimeBridgeLoader.ts`：消费原生 rows/locals、资源 class preservation、tokens 增强。
- `devStyles.ts`：浏览器单一 style owner、模块快照失效、atomic key 去重与 class collision fail-fast。
- `atomicCss.ts`：build/dev 共用的 base/context 分区和简单宽度断点渲染。
- `buildArtifacts.ts`：environment 独立 collector、source 排序、
  manifest/report/analyzer 稳定化。
- `plugin.ts`：Rsbuild 2.1/config/pipeline fail-fast、build assets、HTML link 顺序和 dev config seam。
- `options.ts` / `types.ts`：公开选项及默认值。

build 继续走 CssExtractRspackPlugin；dev 只在 `api.context.action === 'dev'` 时设置
`output.injectStyles: true`，项目原有 `dev.hmr` / `dev.liveReload` 不被覆盖。原因是 Rspack 2.1.4 的
extraction 会先执行一次 `importModule`，bridge 再嵌套执行时初次构建成功、增量构建 panic；style-loader
路线只有 bridge 的单层执行。目标 module rows 在 dev 中清空，转换快照注册到单一共享 style owner；owner
按 source id 稳定排序并按 atomic key 去重，HMR dispose 撤销旧快照。partial、移除 import 和跨模块
cascade 已通过浏览器验收。

## 关键修复记录

1. 初版 bridge 直接序列化 evaluated rows，CSS URL 正确但资源文件未发布。修复为返回模块继续静态依赖
   原生 css-loader module，并在其 runtime array 上替换 rows。
2. synthetic `baseUri` 曾残留为 `rspack-semantic-atomic-css:///...`。修复使用 PostCSS/value parser 只
   还原 synthetic URL 的 pathname/search/hash，绝对 CDN URL 不变。
3. atomic 聚合补齐 Vite 已验证的 base-first、supports/media 分区和简单 min/max-width 顺序。
4. dev extraction 增量更新触发 Rspack panic。修复为 dev 官方 style injection；build/preview extraction
   不变，未引入私有 invalidation API。
5. 中型 Pilot 暴露 dev 中每个 module 都注入完整 atomic CSS：后加载模块会重复输出同名原子类，把该类
   移到 cascade 尾部并覆盖本应生效的 class。参考 Vite 的 shared CSS owner，将 dev 转换快照集中到一个
   style owner，按 atomic key 去重并复用 build renderer；另以跨模块相同 readable class 碰撞 fail fast
   防止不同 key 静默共用选择器。
6. 中型 Pilot 证明 class export 与 ICSS value 可能拥有完全相同的最终字符串，而 css-loader array
   contract 不携带 export 类型。adapter 现在识别完整同值 exports，把其中的已知 class 按
   `ambiguous-export-value` 整类保留；相关 class/value 都保持原生 token，不进行顺序猜测。

## 验收结果

已通过：

```bash
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm --filter @semantic-atomic-css/rsbuild-fixture verify
GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual
```

- adapter：当前 4 个 test files、18 项测试，typecheck/build 通过。
- static fixture：CSS/SCSS/Less、semantic/native、连续 build、lazy、ICSS/composes、inline/external、
  query/hash、asset prefix、publicDir、manifest/report/analysis、原生 Sass 错误和 config fail-fast 通过。
- visual fixture：base/preprocessor 的 semantic/native dev/preview、desktop/narrow、hover/focus、lazy、
  asset HTTP、Sass partial 更新和移除 import 通过。
- 根 `pnpm verify`：通过；包含 core 32、analyzer 5、Vite 30、Rsbuild 12 项测试及两套 static
  fixture。visual 因 localhost/Chrome 要求保持显式命令。

## 当前决策

| 决策 | 结论 |
| --- | --- |
| 产品入口 | `@semantic-atomic-css/rsbuild` |
| raw Rspack 包 | 不提供 |
| CSS Modules 路线 | Rsbuild 默认 css-loader Route A |
| builtin CSS | 未采用 |
| dev CSS owner | 官方 style injection 维护模块图；目标快照由浏览器单一共享 owner 输出并按 atomic key 去重 |
| build CSS owner | 默认 extraction + 共享 semantic atomic asset |
| named exports / strict / source map | fail fast |
| 版本范围 | Rsbuild 2.1.x；升级需重新跑契约验收 |
| shared adapter package | 已抽取内部 `@semantic-atomic-css/css-loader-bridge`；request、compiler、HTML 与 dev-server 生命周期仍归具体 adapter |
| 中型 Pilot | `playground/rsbuild-react-css-modules` 已建立，不替代稳定 fixture |

当前 css-loader adapter 的 dev 默认 `readable-keyed + "_"`，build 默认无 prefix、固定 `c` 起始与
25 位 lower-base36 摘要的 `compact-keyed`；显式 `readable`、`readable-keyed`、`hash`、`compact`、`compact-keyed` 与 `prefix` 原样优先。
`readable-keyed` 的 128-bit / 25 位 suffix 会改变既有 keyed bytes；显式 `readable` 保持原字节，但若独立
loader 出现可读基名碰撞会由 closure fail fast，需切换 keyed。不同 owner 的重复 dev source 只接受一致
快照，冲突 fail fast；build preserve evidence 使用稳定优先级合并，不依赖回调完成顺序。

## 后续风险

- Rspack `importModule` / css-loader array contract 升级时需要重新验证版本门禁。
- CSS source map、named exports、multi-environment、SSR/worker/library 与 Module Federation 尚未支持。
- dev 浏览器 owner 与 build extraction owner 的生命周期不同，必须继续保留 semantic/native visual 对照；
  跨模块同权重 declaration 使用 canonical atomic 顺序，不测试依赖业务 import-order winner 的反模式。
- 中型真实 Rsbuild Pilot 已覆盖多 entry、lazy routes、SCSS/Less、资源和窄屏；source-order 与
  semantic/native preview 保持一致，ICSS class/value 同值已按整类 fallback 收口。该策略会同时保守处理
  `camelCase` 等产生的同值 alias，牺牲少量 atomization rate 以避免污染非 class export。

Batch 6 的实现、指标、浏览器旅程和收口结果见
[Phase 6 Rsbuild Pilot tracking](phase-6-rsbuild-real-project-pilot-tracking.md)。
