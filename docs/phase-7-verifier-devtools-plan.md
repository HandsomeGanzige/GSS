# Phase 7 验证器与调试体验方案

## 状态与范围

- Status: completed
- 完成日期：2026-07-19
- 生产工具入口：`@semantic-atomic-css/devtools`
- adapter 接入：`@semantic-atomic-css/vite`、`@semantic-atomic-css/rsbuild`
- 真实验收：两套 CSS Modules fixture 的 semantic/native dev 与 preview

Phase 7 完成以下四项：

1. Playwright-compatible computed style verifier。
2. 可持久化的逐属性 style diff report。
3. Vite/Rsbuild dev server report API。
4. 使用 Shadow DOM 隔离的 browser overlay。

验证器只对照 CSS Modules 原生构建与 GSS 构建，不扩展为普通 CSS 自动转换或任意页面截图相似度工具。
Phase 7 同时完成 CSS source map 的接口方案设计，但不把尚未闭合的完整 source map 宣称为已支持。

## 包职责与依赖方向

```txt
Playwright fixture / consumer
  -> @semantic-atomic-css/devtools verifier + style diff

@semantic-atomic-css/vite ----\
                               -> @semantic-atomic-css/devtools protocol + overlay runtime
@semantic-atomic-css/rsbuild --/
  -> @semantic-atomic-css/core + analyzer
```

`devtools` 不依赖 Vite、Rsbuild 或 Playwright。Playwright 由验证调用方注入；adapter 只依赖构建工具自己的
middleware/HTML hook。core/analyzer 不感知 HTTP、DOM 或浏览器生命周期。

## Computed style verifier

### 输入

- baseline/native URL 与 candidate/semantic URL。
- 一个或多个 viewport。
- 稳定 selector、computed style 属性和可选 pseudo element。
- 可选 `hover`、`focus`、`click` 交互及等待 selector。

viewports、cases 和每个 case 的 properties 必须非空；case id 和同一 case 内的 property
必须唯一。违反这些不变量时 verifier fail fast，零比较 report 不得标记为 passed。

### 输出

`StyleDiffReport` 使用当前唯一结构，包含：

- baseline/candidate label，不持久化动态 URL 或端口。
- 每个 run 的 viewport 与双方完整属性快照。
- 每个 case/property 的 baseline、candidate 差异。
- runs、cases、comparisons、differences 与 passed 摘要。

report 不包含时间戳，输入顺序与属性比较均稳定；`assertNoStyleDifferences` 最多展开前 20 项差异，完整
证据仍保留在 report。`writeAndAssertStyleDiffReport` 在抛出差异前先写盘；fixture 不在单个 run
提前断言，以便收集完整矩阵。现有 fixture 继续额外验证 CSS Modules tokens、布局 rect、资源 HTTP、lazy route
和 partial reload；style diff 不能替代这些非样式证据。

verifier 导航等待页面 `load` 和可选 ready selector，不使用会被定时 API 轮询永久阻塞的
`networkidle`。context 创建后所有 page 创建和导航都在统一 cleanup 边界内。

## Dev report API

两个 adapter 使用相同的 opt-in 配置：

```ts
devtools: {
  enabled: true,
  overlay: true,
  endpoint: '/__semantic-atomic-css/report',
  pollIntervalMs: 1500
}
```

默认完全关闭。`overlay: false` 可只保留 API；显式 `overlay: true` 会隐式启用 API。endpoint 必须是无
query/hash/dot-segment 的绝对 pathname，overlay polling 最低 250ms。

API envelope：

```json
{
  "adapter": "vite",
  "status": "ready",
  "environments": [
    {
      "name": "client",
      "report": {
        "summary": {},
        "size": {},
        "diagnostics": [],
        "analysis": {}
      }
    }
  ]
}
```

- 没有已转换模块时返回 `idle` 与空 environments，不返回猜测数据。
- Vite 每次请求按当前可失效 per-file cache 重放聚合 transformer，已删除模块不会残留。
- Rsbuild 从当前 environment state 创建 snapshot；environment 名按稳定顺序输出。
- response 使用 `application/json` 与 `cache-control: no-store`。
- 两个 adapter 只处理 GET；同路径的其他 HTTP method 继续交给 dev server middleware chain。
- dev envelope 仅表达 adapter/status/environments，nested build report 原样透传。
- 当前契约不使用人为 schema version，也不读取旧 payload。

## Browser overlay

overlay 仅注入 semantic dev HTML，build/preview/native 对照不注入。runtime：

- 使用独立 `<aside>` host 与 Shadow DOM，CSS 不进入业务 document stylesheet。
- 同源读取 report API，不增加 websocket 或第三方 runtime 依赖。
- 展示 analyzer health 以及 files/atomic/unsafe/preserved/estimated diff。
- 页面隐藏时暂停请求，`pagehide` 时清理 timer。
- 同一时刻只发出一个 report 请求；BFCache `pageshow` 恢复后重启唯一 timer。
- report 中的 source id、reason 等动态内容只通过 `textContent` 写入。
- 仅校验展示依赖的 adapter/status/environments、idle/ready 一致性与 ready report
  的 summary/analysis health/analysis size 字段；非法 payload 进入 offline 并展示
  `invalid-dev-report-payload`。

使用严格 CSP 且不允许 inline module script 的项目可配置 `overlay: false`，继续使用 JSON API。Phase 7
不擅自修改消费方 CSP。

Shadow DOM 隔离的是 overlay 内部 stylesheet 和节点，不会让 light DOM host 消失。独立 `<aside>`
可能影响针对 `documentElement` 直接子元素的 `:last-child`、`:has()` 等结构 selector；这是 in-page
overlay 的明确边界，此类项目必须关闭 overlay 并使用 API。

## CSS source map 方案与当前边界

### 当前可用证据

core manifest/diagnostic 已携带 source `id/line/column`，适合 `.module.css` 的声明级反查；SCSS/Less 经
预处理后，id 可以保留原模块身份，但若没有组合上游 map，行列不能当作原预处理器源码的精确映射。

### 完整方案

后续完整 CSS source map 必须同时满足：

1. adapter 从原生管线取得 compiled CSS 对上游 CSS/SCSS/Less 的 source map，不自行猜行偏移。
2. core renderer 为每个 atomic declaration 和 preserved node 记录 generated position 到 source location 的映射。
3. adapter 组合 core map 与上游 preprocessor/CSS Modules map，并处理一个 source declaration 被多个聚合位置引用。
4. 全局 atomic asset、原生 fallback asset、dev shared owner 与 build extraction 分别验证映射，不以其中一条
   路径代表全部路径。
5. URL/asset replacement、条件规则重排和跨文件 atomic 去重后仍能回到首次声明及全部 manifest sources。

Vite 当前 transform seam 没有闭合上述 map composition；Rsbuild css-loader row 虽含 map 字段，但转换后
atomic/preserved 分流和全局聚合仍需重新生成并组合 map。因此当前 Vite 返回 `map: null`，Rsbuild 对 CSS
source map 继续 fail fast。Phase 7 完成的是上述方案与不变量，不降低保护级别。

## 非目标

- 截图像素相似度、任意站点 crawler 或普通 CSS 转换验证。
- 修改 core selector/cascade/atomic key/report schema。
- CSS-only HMR、完整 source map 实现或浏览器 DevTools extension。
- 默认开启 API/overlay，或在生产 build 暴露调试 endpoint。
