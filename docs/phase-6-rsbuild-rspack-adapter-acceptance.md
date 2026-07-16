# Phase 6 Rsbuild / Rspack Adapter 验收

## 验收状态

- Status: completed
- 验收日期：2026-07-15
- 最近回归：2026-07-16（dev 单一共享 style owner）
- 生产入口：`@semantic-atomic-css/rsbuild`
- 自动 fixture：`@semantic-atomic-css/rsbuild-fixture`
- 锁定基线：Node `22.22.3`、pnpm `8.6.2`、Rsbuild `2.1.6`、Rspack `2.1.4`、
  css-loader `7.1.4`、Sass/Less plugins `2.0.1`

## 接入结论

Route A 已通过硬门禁，不需要切换到 Rspack builtin CSS：

```txt
Rsbuild 原生 preprocessor + css-loader
  -> Rspack public loader importModule
  -> css-loader array rows + final default-export locals
  -> core safe transform
  -> 原生 module graph + augmented locals
```

runtime bridge 不解析 css-loader 生成的 JavaScript，也不实现 scoping、ICSS、预处理器或资源发布。
它执行原生 css-loader module，结构化替换 array rows，并继续静态依赖该原生 module，所以 asset module、
query/hash 和 dependency graph 不会被切断。

build 使用默认 extraction；dev 只在 `rsbuild dev` action 下启用官方 `output.injectStyles`，以保留
Rsbuild module graph、HMR/live-reload，并避免 Rspack 2.1.4 在 extraction 的 `importModule` 内再次执行
`importModule` 时出现的增量编译 panic。目标 CSS Modules rows 不逐模块注入；转换快照集中到一个浏览器
style owner，按稳定 source order 渲染并按 atomic key 去重。preview 使用 build extraction 产物。

## 自动验收矩阵

| 维度 | 已验证场景 |
| --- | --- |
| 输入 | `.module.css`、`.module.scss`、`.module.less`、普通 CSS 对照 |
| tokens | default export、`camelCaseOnly`、custom ident、`composes`、`:export`、`@value` |
| selector | safe、hover/focus-visible/disabled、media/supports、descendant fallback |
| declaration | custom property、`var()`、`!important`、shorthand/longhand、重复属性 |
| 资源 | 阈值 inline、external、query/hash、asset prefix、publicDir URL 与文件复制 |
| output | atomic/fallback CSS、HTML link 顺序、manifest、report、analyzer analysis |
| graph | lazy chunk、Sass partial 更新、移除 import 后清除旧 fallback/atomic class |
| runtime | semantic/native dev 与 preview、desktop/narrow、hover/focus、lazy interaction、dev 单一 style owner |
| config | named exports、Node target、CSS source map、strict 与非法 asset filename fail fast |
| 稳定性 | base/preprocessor semantic 连续构建的相对文件名与内容全量 hash 一致 |

浏览器验收不是截图相似度比较；脚本逐项读取 computed style、CSS Modules tokens 和资源 HTTP 状态。
semantic token 必须以 native token 为前缀，差异只允许追加 atomic classes。

## 验收命令

```bash
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm --filter @semantic-atomic-css/rsbuild-fixture verify

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual

pnpm verify
```

执行结果：

- adapter：4 个 test files、11 项测试通过，覆盖 dev atomic key 去重和 readable class 碰撞保护；
  typecheck/build 通过。
- fixture static：semantic/native、连续构建、资源、错误边界和配置保护通过。
- fixture visual：`base`、`preprocessor` 的 dev/preview/desktop/narrow/交互/partial reload 通过；跨模块
  cascade 回归证明 semantic/native 均由预期的后声明 class 获胜。
- 根静态门禁：`pnpm verify` 通过，包含 core/analyzer/Vite/Rsbuild 包门禁及两套 static fixture。

visual 需要本地端口和 Chrome，不进入根 `pnpm verify`；受限环境必须显式授权 localhost/Chrome。

## 当前公共边界

- 只支持 web target、default export、Rsbuild 2.1.x 默认 css-loader array 管线。
- 只转换 CSS/SCSS/Less Modules；普通样式原样留在原生管线。
- 资源 class 采用 class 级保守保留，不追求该 class 内的局部 atomization rate。
- manifest/report 默认关闭，CSS source map 当前 fail fast。
- named exports、strict、SSR/Node/worker/library/Module Federation 和 raw Rspack adapter 不在 Phase 6。
- CSS-only HMR 和完整 source map 留给后续独立工作。中型 Rsbuild Pilot 已在
  `playground/rsbuild-react-css-modules` 建立，但不进入本阶段自动 fixture 门禁；其 ICSS token probe 已
  发现非 class export 同值歧义，见
  [Phase 6 Rsbuild Pilot tracking](phase-6-rsbuild-real-project-pilot-tracking.md)。
