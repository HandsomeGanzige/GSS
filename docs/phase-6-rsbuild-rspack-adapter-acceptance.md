# Phase 6 Rsbuild / Rspack Adapter 验收

## 验收状态

- Status: completed
- 验收日期：2026-07-15
- 最近完整回归：2026-09-01（css-loader shared seam 迁移、Webpack review 修复与跨 adapter 回归）
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

## css-loader shared seam 回归（2026-09-01）

- Rsbuild 的 rows/default-locals 纯转换、stable artifact、canonical renderer 和 browser owner 已迁移到
  `@semantic-atomic-css/css-loader-bridge`；Rsbuild request、Rspack compiler、HTML 与 dev-server 生命周期不变。
- shared bridge、Rsbuild、Webpack package verify 与根 `pnpm verify` 共同锁定 token/CSS closure、稳定顺序和
  manifest/report 行为；Webpack static fixture 覆盖真实绝对 include 与 cache replay。
- Rsbuild 与 Webpack fixture visual 均执行 semantic/native、响应式、资源和更新/移除回归；本迁移不改变
  Rsbuild public factory、asset schema 或已批准的 keyed class bytes。

## 当前 build metadata 惰性验收（2026-08-17）

- package exact test 覆盖 manifest/report 四种组合：默认关闭不读取 Core
  manifest/report 且不运行 Analyzer；manifest-only 调用次数为 `1/0/0`；
  report-only 和两者开启都为 `1/1/1`。
- 默认与 manifest-only 路径不生成 atomic + preserved `outputCss`；report-only 和两者
  开启生成的 `outputCss` 完全相同，Analyzer 仍消费完整 CSS 代理。
- 对应的 manifest-only/report-only snapshot 与两者开启时逐字段相等；没有改变
  public options、JSON schema、CSS 或 HTML 输出。
- `pnpm --filter @semantic-atomic-css/rsbuild verify` 通过：4 个 test files、32 tests、
  typecheck/build 通过；根 `pnpm verify` 及两套 static fixture 通过。
- 同时开启 metadata 的 Rsbuild Pilot 修改前后产物一致：atomic CSS
  `9087 B / 3f694b1c…d7ab`，manifest `590156 B / 52fcfa07…f1790`，report
  `19731 B / 6150e8e6…a3a7d`。本项的可证收益是关闭或只开 manifest 时消除不必要
  finalization/Analyzer，不宣称同时开启 metadata 的 Pilot 有端到端提速。

## 自动验收矩阵

| 维度 | 已验证场景 |
| --- | --- |
| 输入 | `.module.css`、`.module.scss`、`.module.less`、普通 CSS 对照 |
| tokens | default export、`camelCaseOnly`、custom ident、`composes`、`:export`、`@value`、class/value 完整同值保守保留 |
| selector | safe、hover/focus-visible/disabled、media/supports、presence/exact attribute、attribute-before-class、全 eligible selector list、unsafe mixed list/order-risk/descendant fallback |
| declaration | custom property、`var()`、`!important`、shorthand/longhand、重复属性 |
| 资源 | 阈值 inline、external、query/hash、asset prefix、publicDir URL 与文件复制 |
| output | atomic/fallback CSS、HTML link 顺序、manifest、report、analyzer analysis |
| graph | lazy chunk、Sass partial 更新、移除 import 后清除旧 fallback/atomic class |
| runtime | semantic/native dev 与 preview、desktop/narrow、hover/focus、lazy interaction、dev 单一 style owner |
| config | named exports、Node target、CSS source map、strict 与非法 asset filename fail fast |
| 稳定性 | base/preprocessor semantic 连续构建的相对文件名与内容全量 hash 一致 |

浏览器验收不是截图相似度比较；脚本逐项读取 computed style、CSS Modules tokens 和资源 HTTP 状态。
semantic token 必须以 native token 为前缀，差异只允许追加 atomic classes。

## 2026-08-17 production serialization owner 回归

- package snapshot 继续精确输出 readable rule、` !important`、空行分隔与缩进的
  supports-then-media wrapper，未新增 Rsbuild production serializer。
- fresh Pilot 以最终 `static/css/semantic-atomic.css` 逐字节对比 baseline/candidate；同时重测
  gzip/brotli、全部 CSS+JS 与连续构建 SHA-256，以证明 native minifier/lifecycle 无回退。
- fresh 结果 byte-equal：atomic raw/gzip/brotli 均为 `9087/3413/3038`，18 个 CSS+JS 总量均为
  `280236/93032/79106`；连续两次 candidate 的 24 个产物路径与 SHA-256 全等。

## 2026-07-28 SEL-03 selector list 回归

- production adapter 保持 generic Core descriptor consumer，未复制 selector grammar、list planner 或
  class 连接图/cascade guard。
- package verify 通过 4 files / 21 tests 与 typecheck/build；覆盖 base/pseudo/attribute list、
  unsafe mixed list、manifest 单-arm descriptor 和 selector-list update/remove/stale dispose。
- static fixture 通过；真实 bundle 中的两个 base arm 保留 semantic token 并共享 atomic token，
  后置 same-class winner 不泄漏给 peer，unsafe mixed list 无 partial registry 污染。
- full visual 通过 semantic/native dev + preview、desktop + narrow、hover/focus-visible、attribute
  absent/open/change/remove、attribute-before-class、同元素多 arm winner、token/CSSOM 边界。
- Rsbuild preview 的原生 minifier 可将声明相同的单-arm descriptor 合并为一条 CSSOM
  selector-list；浏览器验收逐 arm 精确匹配，manifest/static 另外证明 Core descriptor
  不含逗号。
- 报告：`/private/tmp/gss-rsbuild-selector-list-closeout.json`。Rsbuild Pilot baseline 10 条
  `selector-list` 清零，15/15 目标 class 获得 mapping；详见
  [SEL-03 验收](phase-8-selector-list-acceptance.md)。

## 2026-07-27 SEL-02 attribute selector 回归

- production adapter 保持零修改；现有 consumer 直接复制/渲染 Core selector descriptor，不解析 identity、
  不重建 attribute selector，也不复制 Core same-class cascade guard。
- package verify 通过：4 个 test files、20 项测试、typecheck/build。契约覆盖 presence、exact、两种 node
  order、guarded token/manifest/CSS、`attribute-cascade-order` diagnostic/analyzer，以及 dev
  update/remove/stale dispose。
- static fixture 通过：eligible guarded selector 不再以 scoped class 重复输出；near-miss/order-risk 保持
  单 scoped token fallback；真实 bundle suggested token、manifest mapping、完整 selector rule 和 dev report
  reason 均有门禁。
- Sass nested case 证明 Core identity/descriptor 使用带双引号 spelling；Rsbuild/Lightning CSS 最终 minifier
  可移除安全 ident quotes。两层 serializer 输出分别被精确检查，adapter 没有 canonicalization，浏览器
  CSSOM 与 semantic/native computed style 保持一致。
- base visual 通过：4 runs、124 cases、296 comparisons、0 differences；覆盖 dev/preview、desktop/narrow、
  absent/open/closed/removed、className 稳定、guarded CSSOM 和 order-risk hover。
- full visual 通过：8 runs、148 cases、360 comparisons、0 differences；额外覆盖 preprocessor 与 Sass
  partial/import-removal 后 guarded selector stale cleanup。
- 根 `pnpm verify` 通过：五个产品包共 19 files/213 tests、全部 typecheck/build 与两套 static fixture。
- 报告：`/private/tmp/gss-rsbuild-attribute-selector-base.json`、
  `/private/tmp/gss-rsbuild-attribute-selector-full.json`。

## 验收命令

```bash
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm --filter @semantic-atomic-css/rsbuild-fixture verify

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual \
  -- --suite base --report /private/tmp/gss-rsbuild-attribute-selector-base.json

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual \
  -- --report /private/tmp/gss-rsbuild-attribute-selector-full.json

pnpm verify
```

## 2026-07-25 C4 cascade oracle canonical 重验

- 根 `pnpm verify` 通过：Core 8 files/74 tests、Analyzer 1 file/7 tests、Devtools
  2 files/17 tests、Vite 4 files/37 tests、Rsbuild 4 files/18 tests，五个产品包合计
  19 files/153 tests；全部 typecheck/build 与 Vite/Rsbuild fixture static 通过。
- Rsbuild full visual 覆盖 `base`、`preprocessor` 的 semantic/native dev、preview、desktop/narrow、
  交互与 partial reload，共 8 runs、108 cases、220 次属性比较、0 differences，`passed=true`。
- canonical report：
  `/private/tmp/gss-rsbuild-cascade-oracle-closeout.json`。
- 绿色结果证明当前支持范围和已列代表场景中的 fixed winner、native token preservation 与
  精确 CSSOM atomic rule 绑定；不证明任意 DOM class/module 共现，也不开放新的 selector。

## 2026-07-25 C3 Rsbuild cascade oracle 实施批次历史结果

- adapter：4 个 test files、18 项测试通过，typecheck/build 通过。
- fixture static：semantic atomic asset、Rspack extracted fallback CSS 与 HTML link 顺序分别通过；
  六个 mixed case 的 safe token、fallback 单 scoped token、media/supports 顺序与跨模块
  `#334155` 单次 atomic rule 复用均有真实 bundle/asset 证据。
- fixture base visual：dev/preview × desktop/narrow 共 4 runs、88 cases、172 次属性比较、
  0 differences，`passed=true`。
- fixture full visual：base/preprocessor 的 dev/preview/desktop/narrow/交互/partial reload 共
  8 runs、108 cases、220 次属性比较、0 differences，`passed=true`。
- 六个 mixed case 与现有 `duplicate-late-reuse` 均同时验证固定 computed winner、native scoped
  token 保留、semantic-only atomic token 数量，以及对应 property/value/priority/media 的递归
  CSSOM rule；这使 semantic/native 同时产生相同错误时也不能只靠 parity 通过。
- visual 初次在受限环境绑定 `127.0.0.1` 时得到 `listen EPERM`；授权 localhost/Chrome 后，base
  与 full 两轮均通过。这是环境权限限制，不是产品或 fixture 失败。
- 报告：
  `/private/tmp/found-02-c3-rsbuild-base.json`、
  `/private/tmp/found-02-c3-rsbuild-full.json`。
- 以上 C3 reports 是实施批次历史证据；该批次当时没有重跑根 `pnpm verify`。随后 C4 已在同一
  组合状态下完成根总门禁与 canonical full visual，不改写这里的历史事实。

## 2026-07-25 selector descriptor 完整回归（此前基线）

- adapter：4 个 test files、18 项测试通过，覆盖 descriptor renderer/manifest/report、当前 browser
  snapshot、HMR update/remove/stale dispose、ICSS 同值 preservation、dev atomic key 去重和 readable
  class 碰撞保护；typecheck/build 通过。
- fixture static：semantic/native、连续构建、资源、错误边界和配置保护通过。
- fixture visual：`base`、`preprocessor` 的 dev/preview/desktop/narrow/交互/partial reload 通过；跨模块
  cascade 回归证明 semantic/native 均由预期的后声明 class 获胜；该批次当时报告为
  8 runs、80 cases、180 次属性比较、0 differences，`passed=true`。
- fixture current descriptor static：exact selector rule、manifest class mapping → atomic index →
  `selector.css` → stylesheet 与真实 JS suggested token mutation 门禁通过。
- 根静态门禁：`pnpm verify` 通过，包含五个产品包 18 个 test files、144 项测试、全部
  typecheck/build 及两套 current static fixture。
- visual report：`/tmp/gss-rsbuild-selector-descriptor-style-diff.json`。

visual 需要本地端口和 Chrome，不进入根 `pnpm verify`；受限环境必须显式授权 localhost/Chrome。

## 历史验收结果

### 2026-07-15 初始验收

- adapter：4 个 test files、12 项测试通过，覆盖 ICSS 同值 preservation、dev atomic key 去重和
  readable class 碰撞保护；typecheck/build 通过。
- fixture static：semantic/native、连续构建、资源、错误边界和配置保护通过。
- fixture visual：base/preprocessor 的 dev/preview/desktop/narrow/交互/partial reload 通过；
  跨模块 cascade 回归中 semantic/native 均由预期的后声明 class 获胜。
- 根静态门禁：`pnpm verify` 通过，包含当时的 core、analyzer、Vite、Rsbuild package 门禁及
  两套 static fixture。

### 2026-07-22 selector descriptor package-only 回归

- 该 consumer 批次只运行 Rsbuild package verify：4 个 test files、18 项测试及
  typecheck/build 通过。
- fixture、根门禁和 visual 未在该批次重跑；这些门禁随后于 2026-07-25 按当前 descriptor
  契约完成完整收口。

## 当前公共边界

- 只支持 web target、default export、Rsbuild 2.1.x 默认 css-loader array 管线。
- 只转换 CSS/SCSS/Less Modules；普通样式原样留在原生管线。
- 资源 class 采用 class 级保守保留，不追求该 class 内的局部 atomization rate。
- manifest/report 默认关闭，CSS source map 当前 fail fast。
- named exports、strict、SSR/Node/worker/library/Module Federation 和 raw Rspack adapter 不在 Phase 6。
- CSS-only HMR 和完整 source map 留给后续独立工作。多个 default export 完整同值且包含已知 class 时，
  adapter 会按 `ambiguous-export-value` 整类保留；因为公开 contract 无法区分 class/value，这也会保守
  覆盖 `camelCase` alias。中型 Rsbuild Pilot 不进入自动 fixture 门禁，其完整验收见
  [Phase 6 Rsbuild Pilot tracking](phase-6-rsbuild-real-project-pilot-tracking.md)。

## 2026-07-29 SEL-01 Rsbuild 验收增量

- Status: completed。
- package build/dev 测试证明生产 adapter 继续只消费 Core descriptor；mapping、alias/list fallback 与
  HMR stale dispose 均无需复制 selector grammar 或 cascade guard。
- 真实 Rspack compiled CSS 会把 authored `::before` 序列化为 `:before`；fixture static 锁定 Core
  identity、atomic selector 与最终 CSS 使用该实际输入 spelling，而非从业务源码反向恢复。
- visual 脚本覆盖 semantic/native dev + preview、desktop + narrow 的 before/after computed style、
  semantic token 与 CSSOM。首轮 full visual 因 Chrome 将 legacy selector 标准化为双冒号而失败；
  CSSOM assertion 修复未改变 Core/static input spelling contract，最终报告
  `/private/tmp/gss-rsbuild-pseudo-element-retest.json` PASS：`8 / 204 / 464 / 0`。
- 双 Pilot 同语料证据见 [SEL-01 验收](phase-8-pseudo-element-acceptance.md)。
