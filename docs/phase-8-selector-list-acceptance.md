# Phase 8 SEL-03 Selector List 验收

## 结论

- Status: `completed`
- 验收日期：2026-07-28
- 公开 API/schema/生产依赖变化：无
- 产品边界：仅转换全部 arm 均符合已有 base/pseudo/SEL-02 attribute grammar 的 list；
  unsafe mixed list 仍完整 fallback 并保留 `selector-list` reason。

## 自动覆盖

Core 覆盖三 arm、重复 arm、同 class 多 arm、base/pseudo/attribute identity、media/supports、
declaration/arm 顺序、custom property 整 list 保留、unsafe arm 前/中/后、链式传播、
`preserveClassNames`、non-exported、attribute/pseudo cascade risk 和零部分 registry 污染。

Vite/Rsbuild package 与 static fixture 证明：

- base/base 与相同 pseudo identity 复用单 token；不同 pseudo/attribute identity 独立；
- presence、exact equality 和 attribute-before-class 保留 SEL-02 spelling/node order；
- combinator、额外 class、global、unsupported pseudo 等任一 unsafe arm 使完整 list fallback；
- non-exported、配置保留、attribute cascade risk 和链式传播不留部分 token；
- manifest 的每个 Core atomic descriptor 只含一个 arm，`selector.css` 不含逗号；
- HMR update/remove/import removal 不保留旧 arm descriptor、selector 或 token。

Analyzer/Devtools 未改 schema，新 Core report 可直接消费；unsafe mixed list 仍按既有
`selector-list` distribution 聚合。

## 浏览器门禁

Vite 和 Rsbuild full visual 均通过，覆盖 semantic/native dev + preview、desktop + narrow：

- selector-list base arm、hover、focus-visible 的固定 computed winner；
- presence/exact attribute 的 absent→open→change→remove，className 不变；
- attribute-before-class 和同一元素同时命中两个 arm；
- semantic scoped token 固定存在，atomic token 数量与 identity 对应；
- CSSOM 精确命中单 arm atomic selector。Rsbuild preview 的原生 minifier 可将声明相同的
  descriptor 重新合并为 CSSOM selector-list，验收对合并后每个 arm 做完整等值匹配；
  manifest/static 仍独立证明 Core descriptor 不含逗号。

报告：

- `/private/tmp/gss-vite-selector-list-closeout.json`
- `/private/tmp/gss-rsbuild-selector-list-closeout.json`

## 双 Pilot 同语料证据

Batch 0 在实施前封存了 semantic/native report、manifest、CSS 和 SHA-256；Batch 5
使用同一业务语料复建。两端 baseline/current 的 files、sourceClasses、`beforeCssBytes`
和 analyzer `beforeRawCssBytes` 分别完全相同。

| Adapter | Artifact | Baseline SHA-256 | Current SHA-256 |
| --- | --- | --- | --- |
| Vite | report | `3cee7f9e17363464596d57d238ee7a6d2d6114bee7b16a0323b2d7a9ef8840ae` | `7d6811675c0a14ce0b034a136a04692d38421441581ab731c44ff2beb3d3dba1` |
| Vite | manifest | `5189704eca4ce9d05beddb757511f2eab2c1b80b3b64001c38397229c08ad501` | `f726c8462161cfe9398599ca544d40ca1ba86550d9482836a9a850c009e1af8a` |
| Vite | atomic CSS | `92d8fb57a3ef46047e048ece11ca72f1f93c6c4e7a93f407c9c0546f33911d7f` | `9cd433a7a53d2f2862d86e5a318ff6cfb20ab2ba934a6a6a0f265b48563e10c0` |
| Rsbuild | report | `a843b784051c5c204c27988ce1ee8cdc0b93825dba88e355f9c1b29d707cf4dd` | `a18365e0b2ab3419df67592a60c5871ec2290e97cb21d40e3d8a91ffbf51a356` |
| Rsbuild | manifest | `598f416628e5b93c7a5f11665ac5e9275ac60ce9ba98b4c588508ebdeac7a4de` | `3e32912a17285b0c469c4ecb91c303c79968d70409b1562ab2a6cc9f7deb9065` |
| Rsbuild | atomic CSS | `4fa5e7fa0ae9b38353b6569f5f405adc1ad8314718e1835902d44145f2c6897a` | `f5d1a77ee920afc6341944563dcaa40f29046432d79956afb981d1e291032cd1` |

| 指标 | Vite | Rsbuild |
| --- | ---: | ---: |
| baseline `selector-list` | 3 | 10 |
| current `selector-list` | 0 | 0 |
| 目标 class 非空 atomic mapping | 4 / 4 | 15 / 15 |
| preserved rules 释放 | 3 | 23 |
| preserved source declarations 释放 | 16 | 94 |
| 新增 registration/token links | 32 | 135 |
| 新增 atomic definitions / reuse | 0 / 32 | 16 / 119 |
| preserved ratio | `0.3492 → 0.3264` | `0.4569 → 0.3369` |
| after raw / gzip / brotli | `18592/4385/3845 → 17960/4291/3771` | `23143/5052/4436 → 20082/4773/4199` |
| class-string increase | `10810 → 11130` | `10550 → 11900` |
| estimated total diff | `-14939 → -15251` | `-13250 → -14961` |

registration/token links 是 registry occurrence 增量，不冒充 source declaration 数；Rsbuild 的数值包含
selector-list 连接分量中一同解锁的 eligible rules。

Pilot semantic/native preview 另在 `1280 × 844` 和 `390 × 844` 对照 Modules route 的普通、
focus-visible、窄屏 computed style、semantic token 和 CSSOM。两个 adapter 均通过；四个目标
class 的 semantic/native token 数为 `7/1、7/1、11/1、11/1`。详细证据保存于
`/private/tmp/gss-selector-list-pilot/pilot-browser-closeout.json`。

## 验证命令

```bash
pnpm --filter @semantic-atomic-css/core verify
pnpm --filter @semantic-atomic-css/analyzer verify
pnpm --filter @semantic-atomic-css/devtools verify
pnpm --filter @semantic-atomic-css/vite verify
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm --filter @semantic-atomic-css/vite-fixture verify
pnpm --filter @semantic-atomic-css/rsbuild-fixture verify
pnpm verify

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual \
  -- --report /private/tmp/gss-vite-selector-list-closeout.json

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual \
  -- --report /private/tmp/gss-rsbuild-selector-list-closeout.json
```
