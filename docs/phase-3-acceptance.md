# Phase 3 Vite Adapter 验收记录

## 当前入口

从仓库根目录执行：

```bash
pnpm verify
pnpm --filter @semantic-atomic-css/vite-fixture verify

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual \
  -- --report /private/tmp/gss-vite-cascade-oracle-closeout.json
```

当前 fixture 同时覆盖 `base` 与 `preprocessor` suite。`pnpm verify` 运行包级门禁和 fixture
静态验收；visual 使用包内显式命令，不进入根默认门禁，并需要 localhost 与 Chrome 权限。

`verify:phase*` 命令已退役。以下内容保留 Phase 3/4 当时的实际验收记录。

## 历史验收命令

`pnpm verify:phase3` 当时会执行：

- `pnpm test`
- `pnpm typecheck`
- core package build
- analyzer package build
- Vite adapter package build
- `playground-vite-css-modules-acceptance` build
- `node scripts/verify-phase-3.mjs`

`pnpm verify:phase3:visual` 当时会执行：

- 构建 core、analyzer 和 Vite adapter package，确保 playground 使用最新 `dist`。
- 启动 `playground/vite-css-modules-acceptance` 的 semantic/native dev server。
- 分别构建 semantic/native 临时产物并启动 preview server。
- 使用 Playwright 驱动本机 Google Chrome，在桌面和窄屏视口下比对 computed style。
- 如果 Chrome 不在默认位置，可通过 `GSS_VISUAL_CHROME_EXECUTABLE` 指定可执行文件路径。

## 当前验收结果

### 2026-07-28 SEL-03 selector list Vite 收口

- production adapter 未新增 selector 解析、list 拼接或 cascade guard；继续通用消费 Core
  的单-arm descriptor。
- Vite package 通过 4 files / 39 tests 与 typecheck/build。新契约覆盖 base/pseudo/attribute
  list、unsafe mixed list、manifest 单-arm descriptor，以及 update/import-removal stale cleanup。
- fixture typecheck/static 通过；base/base 共享 token，unsafe arm 保持完整 fallback，旧的
  “全 eligible list 必然 fallback” oracle 已改为至少含一个 unsafe arm。
- full visual 通过 semantic/native dev + preview、desktop + narrow，覆盖 base、hover、focus-visible、
  attribute absent/open/change/remove、attribute-before-class、同元素多 arm winner、semantic token
  与单-arm CSSOM；报告为 `/private/tmp/gss-vite-selector-list-closeout.json`。
- Vite Pilot 同语料 baseline 的 3 条 `selector-list` 清零，4/4 目标 class 获得 mapping；
  Modules route 的 1280/390 preview computed style 与 native 一致。详见
  [SEL-03 验收](phase-8-selector-list-acceptance.md)。

### 2026-07-27 SEL-02 attribute selector Vite 批次

执行：

```txt
pnpm --filter @semantic-atomic-css/vite verify
pnpm --filter @semantic-atomic-css/vite-fixture verify

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual \
  -- --suite base --report /private/tmp/gss-vite-attribute-selector-base.json

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual \
  -- --report /private/tmp/gss-vite-attribute-selector-full.json

pnpm verify
```

结果：

- Vite package 4 files、38 tests、typecheck/build 通过；三个旧 exact-equality fallback false-red
  已替换为 eligible descriptor/token/CSS、order-risk report 与 HMR stale cleanup 契约。
- fixture typecheck/static 通过。base static 证明 presence/exact/node-order 使用 atomic token + attribute
  guard，eligible scoped selector 不重复 fallback；order-risk/`^=` near-miss 只有 scoped token 和 fallback CSS，
  默认仍无 manifest/report。
- base visual 为 32 runs、136 cases、444 comparisons、0 differences，`passed=true`。attribute state
  依次经过 absent、open、closed、removed；semantic/native 各自 className 全程不变，CSSOM 精确绑定
  guarded atomic selector；order-risk normal/hover 与 native 一致。
- full visual 为 40 runs、176 cases、596 comparisons、0 differences，`passed=true`。除 base 外还验证
  SCSS nested selector 经 Sass 编译为 `[data-state=ready]` 后的 manifest descriptor、CSS、tokens、
  computed style，以及既有 partial full reload/import removal。
- base/full report 分别为 `/private/tmp/gss-vite-attribute-selector-base.json` 和
  `/private/tmp/gss-vite-attribute-selector-full.json`。
- 两次 visual 首次在受限 sandbox 监听 localhost 返回 `EPERM`；获得 localhost/Chrome 权限后通过，
  属运行环境权限，不是产品失败。
- 根 `pnpm verify` 唯一失败是 Rsbuild fixture 的 SEL-02 旧 token-count 预期：
  `oracleNonCompetingFallback` 实际为 scoped token + guarded atomic token。五个产品包测试、Vite fixture
  static 均通过；该失败按已确认批次边界留给后续 Rsbuild 迁移。

本节只收口 Vite adapter/fixture，不代表 SEL-02 全仓完成。

### 2026-07-25 C4 cascade oracle canonical 重验

在 C1 Core matrix、C2 Vite oracle 与 C3 Rsbuild oracle 的组合状态下，最终重验已通过：

- 根 `pnpm verify` 通过：Core 8 files/74 tests、Analyzer 1 file/7 tests、Devtools
  2 files/17 tests、Vite 4 files/37 tests、Rsbuild 4 files/18 tests，五个产品包合计
  19 files/153 tests；全部 typecheck/build 与 Vite/Rsbuild fixture static 通过。
- Vite full visual 覆盖 `base`、`preprocessor` 的 semantic/native dev 与 preview，共
  20 runs、132 cases、420 次属性比较、0 differences，`passed=true`。
- canonical report：
  `/private/tmp/gss-vite-cascade-oracle-closeout.json`。
- 绿色结果证明当前支持范围和已列代表场景中的 fixed winner、native token preservation 与
  精确 CSSOM atomic rule 绑定；不证明任意 DOM class/module 共现，不开放 pseudo element、
  attribute selector 或其他当前 unsafe selector。

### 2026-07-25 C2 Vite cascade oracle 实施批次历史结果

在真实 base CSS Modules fixture 中加入 6 个 atomic/fallback mixed case，并把两个已有
same-value duplicate 锚点纳入 computed-style 后已通过：

```txt
pnpm --filter @semantic-atomic-css/vite verify
pnpm --filter @semantic-atomic-css/vite-fixture verify

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual \
  -- --suite base --report /private/tmp/found-02-c2-vite-base.json

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual \
  -- --report /private/tmp/found-02-c2-vite-full.json
```

- Vite package：4 个 test files、37 项测试通过，typecheck/build 通过。
- fixture typecheck/static 通过；静态门禁证明 8 个锚点、safe atomic token、fallback selector/value、
  atomic-first/preserved-second、stable/media/supports 顺序，以及 duplicate same-value atomic
  rule 单次输出。
- base visual：12 runs、100 cases、300 次属性比较、0 differences，`passed=true`。
- full visual：覆盖 `base`、`preprocessor` 的 semantic/native dev 与 preview，共
  20 runs、132 cases、420 次属性比较、0 differences，`passed=true`。
- 6 个 mixed case 在 semantic/native 的 desktop/narrow 均命中固定 expected；native 元素恰有
  两枚 scoped token，semantic 保留两者并至少追加一枚 atomic token。
- `duplicate-base` 与 `duplicate-align` 已进入 computed-style capture，验证跨 module
  same-value atomic reuse 不丢失或错误移动。
- reports：
  `/private/tmp/found-02-c2-vite-base.json`、
  `/private/tmp/found-02-c2-vite-full.json`。
- 以上 C2 reports 是实施批次历史证据；当前 canonical 结果使用本节之前记录的 closeout report。
- 两条 visual 首次在受限 sandbox 监听 localhost 返回 `EPERM`；原命令获得 localhost/Chrome
  权限后通过，属运行环境权限，不是产品失败。

### 2026-07-25 selector descriptor 收口结果

selector descriptor consumer 与仓库静态门禁收口后已通过：

```txt
pnpm --filter @semantic-atomic-css/vite-fixture verify
pnpm verify
GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual \
  -- --report /tmp/gss-vite-selector-descriptor-style-diff.json
```

- fixture static 只消费当前 manifest selector descriptor 与当前 build report；manifest 的
  class mapping、atomic index、`selector.css` 和真实 bundle token 链路通过 exact rule 与
  mutation 门禁。
- full visual 覆盖 `base`、`preprocessor` 的 semantic/native dev 与 preview，共
  20 runs、100 cases、356 次属性比较、0 differences，`passed=true`。
- fixture visual 消费当前无版本 `adapter/status/environments` dev envelope，并覆盖 overlay、
  HMR update/remove 与 stale selector 清理。
- visual report：`/tmp/gss-vite-selector-descriptor-style-diff.json`。
- 首次受限 sandbox 监听 localhost 返回 `EPERM`；原命令获得 localhost/Chrome 权限后通过，
  属运行环境权限，不是产品失败。

### 历史结果

2026-07-06 已通过：

```txt
pnpm verify:phase3
pnpm verify:phase3:visual
```

2026-07-07 Phase 4 Route A 迁移后已重新通过：

```txt
pnpm verify:phase3
pnpm verify:phase3:visual
pnpm verify:phase4
```

2026-07-07 Phase 4 visual flake 修复后已重新通过：

```txt
pnpm verify:phase4
pnpm verify:phase3:visual
```

其中 `pnpm verify:phase3:visual` 在修复后连续运行三次通过，覆盖此前不稳定的
`dev/desktop/base/cascade-active` 背景色用例。

2026-07-14 Phase 4 dev shared CSS owner 调整后已重新通过：

```txt
pnpm --filter @semantic-atomic-css/vite test
pnpm verify:phase3:visual
pnpm verify:phase4:full
```

覆盖范围：

- core 单元测试通过。
- Vite adapter 单元测试通过。
- Vite adapter tokens 测试覆盖 `asIs`、`camelCase`、`camelCaseOnly`、`dashes`、`dashesOnly`。
- Vite adapter Route A 测试覆盖 Vite 原生 `localsConvention`、`generateScopedName`、`composes`、
  `:import(...)`、`@value`、`:export` 继承，以及非 class export 不追加 atomic class。
- Vite adapter 保护测试覆盖 `modules.namedExports: true`、`diagnostics.strict: true` 和
  `css.modules: false` 显式失败；build 测试同时覆盖 Vite `css.modules.namedExports: true` 继承失败、
  GSS 显式 `modules` 配置重新启用或覆盖 Route A 的路径。
- Vite adapter fallback 测试覆盖非导出 class selector 的 `non-exported-class` 保留策略。
- analyzer 单元测试覆盖 unsafe 分布、体积估算、健康度 `risky` / `blocked` 状态。
- Vite adapter build 测试覆盖 dev/build atomic class name 策略约定：dev 默认 readable，build 默认 hash，
  且可通过 `core.className.strategy/prefix` 覆盖。
- Vite adapter build 测试覆盖显式开启 manifest/report 后的 source location 反查，包含 atomic source、
  class manifest id 和 diagnostic source。
- Vite adapter dev transform 覆盖 virtual CSS id 编码，确保 atomic CSS 不会被 Vite CSS Modules 二次 scoped。
- Vite adapter dev transform 覆盖 shared dev CSS owner，确保所有 CSS Module 导入同一个
  `virtual:semantic-atomic-css/dev.css`，并在单一 CSS 快照内按 atomic key 去重。
- Vite adapter dev transform 覆盖 shared CSS 已缓存后首次加载新 CSS Module 的时序，确保服务端缓存失效、
  浏览器收到 shared virtual CSS 模块更新，且再次请求 shared owner 时包含新旧模块的完整 CSS 快照。
- Vite adapter dev transform 覆盖全局 atomic CSS 去重顺序，确保重复 atomic class 不会覆盖 active 状态或
  `@media` 覆盖。
- visual computed style 覆盖 interaction button 的 `fontWeight: 800`，确保 GSS dev atomic rule 不会被未分层的
  全局 `button { font: inherit; }` 覆盖。
- Vite adapter dev transform 覆盖 CSS Module 写文件后 full reload、dev cache 失效和重新请求后的新 tokens、
  新 atomic CSS、新 fallback CSS。
- 根项目 TypeScript typecheck 通过。
- core、analyzer、vite package 和精简 acceptance fixture build 通过。
- 自动验收不再使用 `playground/vite-react-css-modules` 作为基准；该项目保留为较大场景人工观察 playground。
- `playground/vite-css-modules-acceptance` 覆盖重复 atomic declaration、media/supports、顺序敏感 declaration、
  custom property、状态伪类、dashed/camelCase export key 和 unsafe fallback。
- acceptance fixture build 输出 `dist/assets/semantic-atomic.css`。
- `dist/index.html` 注入全局聚合 CSS asset。
- unsafe selector fallback CSS 保留在全局 CSS asset 中。
- 静态验收脚本检查 atomic asset、media/supports、`!important`、custom property、attribute fallback、
  before/after pseudo-element atomic selector、unsupported fallback 和 scoped descendant fallback。
- 默认不输出 `semantic-atomic-manifest.json`。
- 默认不输出 `semantic-atomic-report.json`。
- visual 验收脚本对比 semantic/native dev 与 build preview 的 computed style，允许 className/token 字符串不同。
- visual 验收失败时会输出 semantic/native 截图、错误文本和 debug JSON，debug JSON 包含目标元素 className、
  computed style、style tag 与 stylesheet link 信息。
- Phase 4 静态验收脚本覆盖 report `analysis` 字段、Route A tokens 增强、`:import(...)`、非 class export
  保持、global fallback、Vite `css.modules: false` 显式覆盖和 Vite `css.modules.namedExports: true`
  继承失败。
- Phase 4 静态验收脚本覆盖普通 CSS asset 继续由 Vite 输出，CSS Modules scoped CSS 不重复进入 Vite
  原生 CSS asset。

## 手动检查重点

构建后可检查：

```txt
playground/vite-css-modules-acceptance/dist/index.html
playground/vite-css-modules-acceptance/dist/assets/semantic-atomic.css
```

期望：

- HTML 包含 `assets/semantic-atomic.css`。
- `semantic-atomic.css` 先输出 atomic CSS，再输出 preserved fallback CSS。
- 精简 fixture 页面包含 `data-gss-case` 验收锚点。
- dev 对照检查中，semantic/native computed style 应只允许 class token 字符串差异。
- build preview 对照检查中，semantic/native computed style 应只允许 CSS asset 与 class token 字符串差异。
- 重复 base atomic declaration 不应覆盖 active 状态或窄屏 `@media` 覆盖。
- descendant、attribute、pseudo-element 等 unsafe selector 对应 fallback 被 scoped 后保留。
- semantic 模式下 class 字符串包含 semantic scoped class 与 atomic classes。
- 默认没有 manifest/report JSON。
- 显式开启 report 时，JSON 顶层保留 core report，并包含 analyzer `analysis` 字段。

`playground/vite-react-css-modules` 仍可用于手动观察较大业务场景，但不作为自动验收基准。

## 历史 Phase 3 非目标

以下内容是 Phase 3 初始验收时的非目标，用于保留当时的范围边界；后续阶段与
2026-07-25 当前完整回归已经扩展了其中部分能力，因此不应把本节解读为当前 fixture
仍未覆盖这些场景。

- Less/Sass。
- named exports。
- strict mode fail build。
- CSS-only HMR。
- HMR 写文件 visual 验收。
- core `invalidate(id)` 或 rebuild API。
- 与 Vite 原生 CSS Modules hash 完全一致。

## 2026-07-29 SEL-01 Vite 验收增量

- Status: completed。
- package build/dev 测试证明生产 adapter 沿 generic descriptor 路径消费 modern/legacy before/after，
  mapping、alias cascade fallback、selector-list fallback 与 HMR stale cleanup 不复制 Core grammar。
- base fixture static 证明 semantic scoped token 始终保留，atomic selector 保留 Vite 传入 Core 的
  `::before`/`:after` spelling，且不重复输出 scoped fallback。
- visual 脚本覆盖 semantic/native dev + preview、desktop + narrow 的 before/after content、颜色、
  display、尺寸/间距、semantic-only token 与 CSSOM rule。首轮 Chrome legacy CSSOM canonicalization
  finding 修复后，Vite 首次 focused retest 又发现 guarded assertion 仍读取旧 `expectedSelector`；统一为
  严格 `expectedSelectors[]` matcher 并加入负向 mutation self-test 后，最终报告
  `/private/tmp/gss-vite-pseudo-element-final-retest.json` PASS：`64 / 228 / 676 / 0`。
- 双 Pilot 同语料证据见 [SEL-01 验收](phase-8-pseudo-element-acceptance.md)。
