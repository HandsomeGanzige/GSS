# Phase 10 跨 Module 上下文声明聚合追踪

## 最终状态

- Work Item：`P5-CDF-STAGE-0`
- 决策：`closed-no-go; product-deferred`
- 原因：Vite、Rsbuild、Webpack 三端真实 Pilot 均只有 3 个 eligible descendant occurrence，且三个 declaration block 都是 singleton；`grouped=0`，没有跨 Module 可复用证据
- Production：未接入
- 公共 API/schema、Adapter 行为、CSS Modules exports、Runtime：均未修改
- Stage 1：未授权

设计与安全边界见 [`phase-10-contextual-declaration-factoring-design.md`](phase-10-contextual-declaration-factoring-design.md)。本 Work Item 独立于 [`FOUND-04`](phase-8-multi-local-selector-foundation-evaluation.md)，不恢复其 production foundation。

## 一次性 capture 与 replay 口径

评估期间只用环境变量 `GSS_P5_CAPTURE_FILE` 临时启用 instrumentation：

- Vite 从 `getStableBuildResults()` 捕获 canonical `transform.css.preserved`，并记录已解析资源引用的 atomic section 与最终 P0 CSS；
- Rsbuild / Webpack 从 css-loader bridge 的 canonical `transforms` 捕获同一 `transform.css.preserved` 流、atomic section 与 Analyzer 使用的 logical P0 CSS；
- instrumentation 只输出 `{ adapter, atomicCss, inputs, finalP0Css }` 到 `/private/tmp/gss-p5-cdf-stage0`，没有复制 selector grammar，也没有写入 manifest/report；
- replay 前把绝对 source id 规范化为 `playground/<adapter>-react-css-modules/...`，排序仍与原 canonical 次序一致；原始 capture SHA-256 包含当前机器绝对路径，仅作为本次 preimage 证据，不宣称跨机器稳定。

离线 evaluator 只读取当前最终 preserved occurrence stream；已 atomize 并输出到 atomic section 的 rule 不被错误当作 barrier。P0/P5 都按 Adapter 的 `trim + 非空片段以两个换行连接` 口径序列化。每端以正常输入和反转 arrival order 重放，完整 report 相等；P0 logical CSS 与 capture 的 `finalP0Css` 逐字节闭合。

## 三端真实 Pilot 结果

### Preserved section

| Adapter | sources | eligible / grouped / groups / skipped | P0 raw / gzip / brotli | P5 raw / gzip / brotli | P0 = P5 SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| Vite | 17 | `3 / 0 / 0 / 3` | `5559 / 1336 / 1113 B` | `5559 / 1336 / 1113 B` | `29eeb12538823f58ebc95cb11b05e7583c46491ffe4f1fe53c18abdad31b1b2a` |
| Rsbuild | 23 | `3 / 0 / 0 / 3` | `6461 / 1524 / 1286 B` | `6461 / 1524 / 1286 B` | `ac4e6b21860ae6c62512be2bd7357291530ac5d3f147b58e67cef662c624a6af` |
| Webpack | 23 | `3 / 0 / 0 / 3` | `6482 / 1549 / 1303 B` | `6482 / 1549 / 1303 B` | `052fb649cc0e32dcd853863a4200efad57e772f615bba01fb02f7e7c2a1cea44` |

三端 skip reason 都是 `singleton=3`；另外 Vite 有 `ineligible-selector=35`，Rsbuild / Webpack 各为 `43`。这些 ineligible rule 保持原 CSS，并作为不可跨越 barrier。

### 包含不变 atomic section 的 logical total

| Adapter | P0 raw / gzip / brotli | P5 raw / gzip / brotli | P0 = P5 SHA-256 |
| --- | ---: | ---: | --- |
| Vite | `16149 / 4200 / 3710 B` | `16149 / 4200 / 3710 B` | `c0f75e759793e205f11cf8447c8dd3a6c2e5590b2a69c60eb99d50f2695a6583` |
| Rsbuild | `24794 / 8437 / 7757 B` | `24794 / 8437 / 7757 B` | `a62cf86f38b85e90741e40ef0d2226a8bf0a644b1f8e4a0611c0d149c200e385` |
| Webpack | `24920 / 8526 / 7845 B` | `24920 / 8526 / 7845 B` | `20df6a2180d6ca30f9fa3e8a6cadfa4ee5ac5d2ea7c2694b4443e4bee620de0c` |

Vite logical total 就是 Adapter 生成的全局 semantic CSS。Rsbuild / Webpack 的 logical total 是 bridge/Analyzer 的 atomic + preserved 全局闭合视图；实际构建仍把 atomic asset 与原生 chunk CSS 分开。因为 `grouped=0`，P5 没有改变任一 section，实际物理 CSS assets 也逐字节不变：

| Adapter | CSS files | physical raw / gzip / brotli 总和 | canonical path+content SHA-256 |
| --- | ---: | ---: | --- |
| Vite | 2 | `16535 / 4480 / 3931 B` | `f4da9b813951a6653a0b09708b6b1d6a4cd6dd406bf672788803e1538b1a6034` |
| Rsbuild | 9 | `22671 / 10215 / 9096 B` | `64b99d5cdf12efc8f20b3503bddfd172490ce7826ab7b16146c3a0a728000a48` |
| Webpack | 10 | `28082 / 10825 / 9629 B` | `ff779267db927bbd82702a6eea4bdd8fefa614bb95ac8a6a81752870affc1e91` |

原始 capture SHA-256：Vite `cfb1489c24281de901a2b90f01c64a672524f951be803d7887577ecbd41157aa`、Rsbuild `b88cce4a9090ae93b1538c79eee8ce46f3904916a6a6ff210269b8e1c71a8be2`、Webpack `506ac2534ff54831ca5e9ce086c8b89a198472ef74cdde78af6b243377d98ac3`。

## 门禁结论

三个 Pilot 的 delta 都是 0，但这不是收益通过：没有任何两个真实 occurrence 具有相同 ordered wrapper path + ordered declaration block，P5 从未生成 selector list。`grouped=0` 只能证明当前 corpus 没有可验证复用机会，不能授权 Stage 1。

因此结论为 `closed-no-go; product-deferred`：

- 三端 visual/computed-style：`NOT_RUN`；P5 candidate 与 P0 逐字节相同且没有实际 grouping，不把“没有行为差异”冒充 visual 通过；
- Stage 1 Core planner、跨包 finalizer API、public schema、dev/HMR、runtime：`NOT_AUTHORIZED`；
- test-only executable evaluator、runner、人工 fixtures/tests 已按设计删除；
- 临时 capture 保留在 `/private/tmp/gss-p5-cdf-stage0`，不属于仓库或长期可执行资产。

若未来出现至少两个完整 block 可复用的新真实 corpus，只能重新申请 shadow evaluation；本次 delta=0 不得解释为未来 go。

## 执行命令

```bash
pnpm --filter @semantic-atomic-css/vite build
pnpm --filter @semantic-atomic-css/css-loader-bridge build
pnpm --filter @semantic-atomic-css/rsbuild build
pnpm --filter @semantic-atomic-css/webpack build

GSS_P5_CAPTURE_FILE=/private/tmp/gss-p5-cdf-stage0/vite.json \
  pnpm --filter playground-vite-react-css-modules build:semantic
GSS_P5_CAPTURE_FILE=/private/tmp/gss-p5-cdf-stage0/rsbuild.json \
GSS_P5_CAPTURE_ADAPTER=rsbuild \
  pnpm --filter playground-rsbuild-react-css-modules build:semantic
GSS_P5_CAPTURE_FILE=/private/tmp/gss-p5-cdf-stage0/webpack.json \
GSS_P5_CAPTURE_ADAPTER=webpack \
  pnpm --filter playground-webpack-react-css-modules build:semantic

pnpm --filter @semantic-atomic-css/core exec vitest run \
  --config vitest.config.ts test/contextualDeclarationFactoring.pilots.shadow.test.ts
```

最后一个命令在一次性 runner 删除前通过：`3 tests passed`。它只证明 capture/replay 闭合与确定性，不是 production 测试门禁。

## Rollback 证据

临时 instrumentation 开始前保存 preimage，capture 后逐文件恢复：

| 文件 | restored SHA-256 |
| --- | --- |
| `packages/vite/src/plugin.ts` | `6a1017f6a72f304535d85ae84a354f39dae363b843feabbea67fa28d5b532578` |
| `packages/css-loader-bridge/src/buildArtifacts.ts` | `5520d7f9f3a9042bfc36e132dae0512c42835f5b4fcc243b75b709458da34ab4` |
| `packages/core/src/engine/createTransformer.ts` | `d16dfdc2ad4bc8bf0a2609e4cc1ac3b51a2aac3f33ab70a971563534870f41d2` |
| root `package.json` | `3af378f17a6c3733b975937f30f1d2052c15d7c88d3a9fc9fe94b75bb6c2b704` |
| `pnpm-lock.yaml` | `ea7ea747e0eab2da8a4a07a547e1c69124a82294e5586a9f5499c87d3c530953` |

最终仓库只保留 Phase 10 中文设计与追踪文档；没有 Core `src`、Adapter、package、lockfile、manifest/report schema 或 runtime 改动。
