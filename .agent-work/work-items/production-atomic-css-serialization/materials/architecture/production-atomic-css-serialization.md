# 生产 Atomic CSS 结构级紧凑序列化契约

## 结论

采用 **Adapter 内部、生产专用的 compression-aware 结构 serializer**：Vite build 在已有
atomic declaration renderer 中选择 `production` grammar，dev 继续使用当前 `readable` grammar；Rsbuild
不增加第二套生产 serializer，继续在 Rspack `PROCESS_ASSETS_STAGE_ADDITIONS` 提交 readable
snapshot，由已在生产链路中的 native minifier 生成最终紧凑 asset。

不采用“删除所有可选空白”的密集写法。当前 Vite Pilot 上，该写法虽然将 emitted
asset 从 17,276 B 降到 14,595 B，但 gzip 从 4,272 B 回退到 4,302 B，brotli 从
3,726 B 回退到 3,801 B。推荐 grammar 有意保留高度重复、极易压缩的 ` {\n  `、
`: ` 和末尾分号，只删除压缩后仍有净开销的结构字节。

Owner 已根据生命周期证据确认门禁收窄为：Vite 最终 atomic asset raw 必须严格下降；
Rsbuild 最终 asset 因 native minifier 已达到同等紧凑形态，要求 byte-equal/no-regression。两个
Adapter 的 gzip/brotli、总 CSS+JS、确定性和语义均不得回退。

## 现状与生命周期证据

### Vite：自定义 asset 绕过了原生 CSS minification

`packages/vite/src/plugin.ts` 的 build 路径先由 `createBuildCss()` 组装 readable atomic/preserved
CSS，再在 `generateBundle` 中通过 `this.emitFile({ type: 'asset', source: css })` 直接发布
`assets/semantic-atomic.css`。这个 source 没有重新进入 Vite CSS transform/minify 管线；插件本身还
对 Lightning CSS transformer fail fast，因此不能把此 asset 暗中当作会被后续 CSS minifier 处理。

同一份当前 Vite Pilot build 提供了直接对照：

- Vite 原生 `assets/index-XWZUkUVF.css` 只有 1 行，如 `:root{...}*{...}`；
- 插件发布的 `assets/semantic-atomic.css` 有 1,373 行，以 `.akckq66 {\n  display: grid;\n}`
  开头。

因此 Vite 修复点必须在 Adapter 的 build renderer，而不是期待 Rollup asset emission 之后的
原生 minifier。

### Rsbuild：已明确复用 native minifier

`packages/rsbuild/src/buildArtifacts.ts` 使用 `packages/rsbuild/src/atomicCss.ts` 生成与 dev 共用的
readable `snapshot.atomicCss`。`packages/rsbuild/src/plugin.ts` 在
`PROCESS_ASSETS_STAGE_ADDITIONS` 以 `RawSource` 发布该快照；该 stage 早于生产 optimize/minify
阶段。当前 Rsbuild Pilot 的最终 `static/css/semantic-atomic.css` 为 0 换行、9,087 B，并已出现
`#ffffff -> #fff`、`1 / -1 -> 1/-1` 等 native minifier 的 value/spacing canonicalization。

这一“源 snapshot 可读，最终 asset 紧凑”对照证明 Rsbuild 的后续原生阶段已接管生产
serialization。Adapter 不应为追求一个无意义的“再下降”数字而改写 value、绕开 native minifier
或对 dev/build snapshot 制造双重语义。

## 可选方案对比

| 方案 | 项目适配 | 压缩表现 | 风险/维护 | 结论 |
| --- | --- | --- | --- | --- |
| 密集 structured writer：`S{P:V}` | 不解析 selector/value，语义可证 | Vite raw -2,681 B，但 gzip +30 B、brotli +75 B | 违反已确认压缩门禁 | 拒绝 |
| compression-aware structured writer | 只处理已有结构化 declaration/context | Vite emitted asset raw -1,127 B、gzip -19 B、brotli -16 B | grammar 看似不如全密集，但稳定且可直测 | **推荐** |
| 把 Vite asset 重塞回原生 CSS 管线 | 可借用原生 minifier | 可能进一步 canonicalize/group/merge | 需新 lifecycle seam，容易改变 value/selector 和 asset reference 边界 | 拒绝 |
| 在 Core 增加 compact public output | 两 Adapter 形式统一 | 不解决 Rsbuild 已被 native minify 的事实 | 破坏 Core 公共输出/report bytes/dev 可读契约 | 拒绝 |

不引入 CSS minifier 依赖。结构化 IR 已经足以安全写出目标 grammar，额外依赖只会带来
canonicalization 和升级面。

## 精确 serializer grammar

下列 `selector` 为 Core 已渲染的 `AtomicDeclaration.selector.css`，`prop` / `value` / `media` /
`supports` 为当前结构化字段的**原字节序列**。grammar 不 trim、parse 或重新序列化这些
字段。

### `readable`（Core 公共输出、Vite dev、Rsbuild dev/build snapshot）

```txt
ReadableRule      := selector " {\n  " prop ": " value ReadableImportant? ";\n}"
ReadableImportant := " !important"
ReadableEntries   := ReadableEntry ("\n\n" ReadableEntry)*
ReadableSupports  := "@supports " supports " {\n" indent2(inner) "\n}"
ReadableMedia     := "@media " media " {\n" indent2(inner) "\n}"
```

单个 entry 先包 `supports`，再包 `media`；因此两者同时存在时为 media 外层、supports
内层：

```css
@media (min-width: 600px) {
  @supports (display: grid) {
    .a123456 {
      display: grid !important;
    }
  }
}
```

### `production` Vite grammar（推荐）

```txt
ProductionRule      := selector " {\n  " prop ": " value ProductionImportant? ";}"
ProductionImportant := "!important"
ProductionEntries   := ProductionEntry*                 # entry 之间无 separator
ProductionSupports  := "@supports " supports "{" inner "}"
ProductionMedia     := "@media " media "{" inner "}"
```

同样先包 supports，再包 media：

```css
@media (min-width: 600px){@supports (display: grid){.a123456 {
  display: grid!important;}}}
```

具体决策：

- selector 与 `{` 之间保留一个空格，`{` 后保留 `\n  `；
- declaration 保留 `: ` 和终止分号，但去掉 `!important` 前的空格与关闭 `}` 前的换行；
- 顶层 entry 直接连接，不插入换行或空格；`}` 已是完整 token 边界；
- `@supports` / `@media` 与 params 之间保留一个 token-separating 空格，params 后直接 `{`；
- 末尾分号在单 declaration rule 中语法上可省，但本 grammar **必须保留**。Pilot A/B 表明它作为
  高重复模式可改善 gzip/brotli；“可省”不等于“压缩后更小”。

这个 grammar 是稳定契约，不得在不重跑双 Pilot 门禁的情况下根据“看起来更短”继续
删空白。

## 安全性证明与禁止范围

1. serializer 遍历已有排序后的 `AtomicDeclaration[]`，不对最终 CSS 做 regex 替换；因此不会
   误伤 string、URL、function 或 selector token。
2. `selector.css`、`prop`、`value`、`media`、`supports` 原样拷贝。只由 serializer 生成
   结构空白、花括号、冒号、分号和 IR 中已单独建模的 `!important`。
3. `!` delimiter 可在任何 declaration value token 之后开始 important annotation，不需要前置空格；
   终止分号仍保留。
4. 每条 rule 及 wrapper 都以 `}` 完整关闭，因此相邻 entry 不需要 separator。
5. supports-then-media 的包装次序、base/context 分区、简单断点排序及同值稳定顺序均在
   serializer 之前完成，format mode 不参与任何顺序决策。

明确禁止：

- 不 canonicalize selector、attribute quotes、property 或 value，不做颜色/数值/空格缩写；
- 不合并 selector、declaration、rule 或 context，不共享 `@media` / `@supports` wrapper；
- 不改变 atomic key/class name/registry、manifest/report schema、tokens 或 preserved CSS；
- 不改变 Core `transformCss().css.atomic`、`getAtomicCss()` 和 Core report byte 计数的 readable 公共契约；
- 不改变 Vite/Rsbuild dev CSS，不为dev 引入 production format；
- 不新增依赖，不将 serializer 上移到 Core，不为 Rsbuild 重复 native minifier。

Vite `analysis.size.afterRawCssBytes/afterGzipCssBytes/afterBrotliCssBytes` 继续使用传入
`analyzeBuild()` 的最终 emitted CSS，因此会如实反映生产 serializer。Core 的
`report.size.afterAtomicCssBytes` 继续表示 Core readable 输出；不为让两个字段数值相同而改
schema 或 Core 行为。

## Pilot A/B 投影

数据来自当前工作树的真实 production Pilot 产物。投影按 manifest 中 259 条 Vite atomic
declaration 在现有 asset 中的实际顺序重渲染，preserved suffix 和其他 CSS/JS 原样保留。
gzip/brotli 使用与 Analyzer 相同的 Node `gzipSync` / `brotliCompressSync` 默认参数；总量是对
每个 `.css` / `.js` 文件分别压缩后求和。

### Vite Pilot

| 口径 | 当前 raw | 当前 gzip | 当前 brotli | 推荐投影 raw | 推荐投影 gzip | 推荐投影 brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 259 条 atomic declaration 区域 | 11,715 | 3,324 | 2,881 | 10,588 | 3,291 | 2,843 |
| 最终 `semantic-atomic.css`（含 preserved） | 17,276 | 4,272 | 3,726 | 16,149 | 4,253 | 3,710 |
| 全部 CSS+JS（10 文件） | 254,644 | 80,947 | 69,886 | 253,517 | 80,928 | 69,870 |

推荐 grammar 在三个最终门禁上分别取得 asset `-1,127/-19/-16 B`，总 CSS+JS
`-1,127/-19/-16 B`。相比之下，全密集 `S{P:V}` 的 asset 为 `14,595/4,302/3,801 B`，
确实违反 gzip/brotli 门禁。

### Rsbuild Pilot

| 口径 | 当前/预期 raw | gzip | brotli |
| --- | ---: | ---: | ---: |
| 最终 `static/css/semantic-atomic.css` | 9,087 | 3,413 | 3,038 |
| 全部 CSS+JS（18 文件） | 280,236 | 93,032 | 79,106 |

Rsbuild 开发后的期望值是上表的 byte equality，不是人为制造 raw 降幅。若 fresh build 最终
asset 发生字节变化，必须先解释 native minifier/lifecycle 差异，不得把 value canonicalization 移入
Adapter 来“修复”数据。

## 实施分层与最小改动

### Vite

`packages/vite/src/plugin.ts` 是唯一必需的生产代码改动：

1. 增加仅文件内可见的 `type AtomicCssSerialization = 'readable' | 'production'`。
2. `renderAtomicDeclarations(declarations, serialization = 'readable')` 只执行一次已有排序，再将 mode
   传给同一个 `renderAtomicDeclaration` / `renderCssRule` / `wrapAtomicAtRules` 链。不复制排序、
   wrapper 或 declaration 遍历逻辑。
3. `createDevAtomicCss()` 继续使用默认 `readable`；`createBuildCss()` 显式传入
   `production`。preserved CSS 仍由 `joinCss()` 在 atomic 后原样拼接。
4. `resolveBuildAssetReferences()` 和 report 继续消费该最终 CSS，不增加第二次字符串
   minify pass。

一个 Vite adapter-local 的小 mode-aware helper 优于两套独立字符串 renderer：它使 readable 和
production 共享 declaration 字段、包装顺序和 cascade order。但不应为“跨 Adapter 复用”抽新包或
上移 Core：Rsbuild 的生产 owner 是 native minifier，两条 lifecycle 并非同一问题。

### Rsbuild

生产代码不需行为改动：

- `packages/rsbuild/src/atomicCss.ts` 继续作为 build snapshot 和 dev 的 readable renderer；
- `packages/rsbuild/src/plugin.ts` 继续在 `PROCESS_ASSETS_STAGE_ADDITIONS` 发布源 asset，明确把最终
  production formatting 留给已有 native optimize/minify 阶段；
- 只补充代码注释、集成断言和文档，不在 `buildArtifacts.ts` 提前 compact，不影响 dev report/
  style owner。

## 测试与验收矩阵

| 层级 | 最小断言 | 目的 |
| --- | --- | --- |
| Vite build package | 对 base、pseudo/attribute、`!important`、supports-only、media-only、media+supports 做 exact production grammar 断言 | 锁定冒号、分号、wrapper 和无 rule separator |
| Vite build package | 显式 `readable` / `hash` / `compact` class strategy 均使用 production serializer | 证明 class naming 与 CSS formatting 正交 |
| Vite dev package | exact 断言 `S {\n  P: V;\n}`、空行分隔及可读 wrapper | 防止 production mode 泄漏到 dev |
| Vite report | `analysis.size.after*CssBytes` 与写盘 asset 重算一致 | 证明体积分析消费真实生产 CSS |
| Rsbuild build artifact unit | 继续 exact/readable snapshot 及 supports-then-media 套层断言 | 保护 dev/build snapshot 兼容 |
| Rsbuild 真实 build/fixture | 最终 asset 无 readable rule 模式，且与改动前 byte-equal | 证明 native minifier 仍是生产 owner |
| Core | 无代码/快照变化；跑 `@semantic-atomic-css/core verify` | 证明公共 renderer/report 不变 |
| 双 fixture visual | semantic/native dev+preview，宽/窄、hover/focus、attribute、media/supports、fallback | 证明浏览器语义与 cascade 不变 |
| 双 Pilot | fresh baseline/candidate 体积、两次连续 build 全产物 SHA-256 | 执行硬门禁和确定性 |

建议最小文件面：

- 代码：`packages/vite/src/plugin.ts`；Rsbuild 无功能性代码变更。
- 测试：`packages/vite/test/pluginBuild.test.ts`、`packages/vite/test/pluginDev.test.ts`；保留/补强
  `packages/rsbuild/test/buildArtifacts.test.ts` 的 readable snapshot，并在 Rsbuild fixture/Pilot 真实 build 脚本锁定
  final byte equality。
- 文档：`packages/vite/README.md`、`docs/phase-3-vite-adapter-tracking.md`、
  `docs/phase-3-acceptance.md`、`packages/rsbuild/README.md`、
  `docs/phase-6-rsbuild-rspack-adapter-tracking.md`、
  `docs/phase-6-rsbuild-rspack-adapter-acceptance.md`。

## 硬门禁与 A/B 步骤

1. 在同一 commit、Node/pnpm 和 production 配置下生成 baseline 与 candidate，禁止把当前旧 dist
   与新 build 混比。
2. 分别记录两个 Pilot 最终 semantic atomic asset 和全部 `.css` + `.js` 的 raw、逐文件 gzip、
   逐文件 brotli。压缩参数必须与 Analyzer 一致。
3. Vite：atomic asset raw 必须 `< baseline`，atomic asset gzip/brotli 必须 `<= baseline`，总 CSS+JS
   raw/gzip/brotli 必须 `<= baseline`。任一失败即不接受。
4. Rsbuild：atomic asset 必须与 baseline byte-equal，且 gzip/brotli 与总 CSS+JS 必须不回退。
   若不等，先调查 native minifier/lifecycle，不新增 Adapter value canonicalization。
5. 每个 candidate 连续 build 两次，对 CSS、JS、HTML、manifest、report 及其他 emitted asset 的相对路径
   和内容 SHA-256 求全等；任一差异即不接受。
6. 通过 Vite/Rsbuild package verify、根 `pnpm verify`、两套 fixture full visual 和两个 Pilot
   acceptance 后才能完成。体积过门不能替代视觉/cascade 验收。
