# Phase 8 SEL-02 Attribute Selector 验收

## 当前状态

- Core、Analyzer/Devtools、Vite 与 Rsbuild 的分批实现和分批独立验证已完成。
- 两个 Pilot 的 semantic/native 同语料构建与实际收益复盘已完成。
- Batch 5 最终根 `pnpm verify`、Vite full visual、Rsbuild full visual 已通过。
- Batch 5 独立 Test 已通过；独立 Review 首轮发现的两个 P2 文档矛盾已修复，focused re-review
  已通过且无剩余 finding。SEL-02 全仓收口状态为 **completed**。

设计边界见 [SEL-02 Attribute Selector 设计](phase-8-attribute-selector-design.md)，Core 长期契约见
[Core 包设计决策](../packages/core/CORE_DESIGN.md)。

## 验收口径

成功路径必须证明 presence、exact equality、两种 node order 和 serializer spelling 进入 guarded
atomic selector；保守路径必须证明 `[class...]`、其他 operator、flag、namespace、多 attribute、
attribute+pseudo/其他组合与 cascade order risk 继续 scoped fallback。

除 semantic/native computed style 外，还必须检查：

- semantic scoped class 始终存在，eligible class 只追加 atomic token；
- manifest class mapping → atomic entry → `selector.css` → 实际 stylesheet 链路一致；
- attribute add/change/remove 不要求修改 className；
- `attribute-cascade-order` 进入 Core diagnostic、Analyzer distribution、Devtools/adapter report；
- fallback 前没有 registry 部分注册，HMR update/remove 后没有 stale token 或 stale selector；
- adapter 未复制 Core grammar、identity canonicalization 或 cascade guard。

## 分批证据

| 范围 | 命令 | 已完成证据 |
| --- | --- | --- |
| Core | `pnpm --filter @semantic-atomic-css/core verify` | 通过；覆盖 grammar、AST spelling、renderer clone、near-miss、same-class guard、`A → B → A`、shorthand/longhand、importance、context、diagnostic 与零部分注册 |
| Analyzer | `pnpm --filter @semantic-atomic-css/analyzer verify` | 通过；聚合 `attribute-cascade-order`，不把不同 identity 共现当作已证明 conflict |
| Devtools | `pnpm --filter @semantic-atomic-css/devtools verify` | 通过；协议、report 与 overlay 透传 reason，不转换 CSS |
| Vite package/static | `pnpm --filter @semantic-atomic-css/vite verify`；`pnpm --filter @semantic-atomic-css/vite-fixture verify` | 4 files/38 tests、typecheck/build 与 fixture static 通过 |
| Rsbuild package/static | `pnpm --filter @semantic-atomic-css/rsbuild verify`；`pnpm --filter @semantic-atomic-css/rsbuild-fixture verify` | 4 files/20 tests、typecheck/build 与 fixture static 通过 |

Vite 分批 visual：

```sh
GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual \
  -- --suite base --report /private/tmp/gss-vite-attribute-selector-base.json

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual \
  -- --report /private/tmp/gss-vite-attribute-selector-full.json
```

base 为 32 runs/136 cases/444 comparisons/0 differences；full 为
40 runs/176 cases/596 comparisons/0 differences，均 `passed=true`。覆盖 CSS/SCSS、dev/preview、
desktop/narrow、attribute absent/open/closed/removed、className 稳定、CSSOM guarded selector、
order-risk fallback 与 HMR stale cleanup。

Rsbuild 分批 visual：

```sh
GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual \
  -- --suite base --report /private/tmp/gss-rsbuild-attribute-selector-base.json

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual \
  -- --report /private/tmp/gss-rsbuild-attribute-selector-full.json
```

base 为 4 runs/124 cases/296 comparisons/0 differences；full 为
8 runs/148 cases/360 comparisons/0 differences，均 `passed=true`。Sass nested 输入证明 Core
descriptor 保留输入 serializer spelling，而 Rsbuild/Lightning CSS 可在最终产物安全移除 ident quote；
adapter 未做 canonicalization。

## Pilot 同语料收益

```sh
GSS_PLAYGROUND_CSS_MODE=semantic pnpm --dir playground/vite-react-css-modules exec vite build \
  --outDir /private/tmp/gss-attribute-selector-pilot-closeout/current/vite-pilot --emptyOutDir
GSS_PLAYGROUND_CSS_MODE=native pnpm --dir playground/vite-react-css-modules exec vite build \
  --outDir /private/tmp/gss-attribute-selector-pilot-closeout/native/vite-pilot --emptyOutDir
GSS_PLAYGROUND_CSS_MODE=semantic pnpm --dir playground/rsbuild-react-css-modules exec rsbuild build \
  --dist-path /private/tmp/gss-attribute-selector-pilot-closeout/current/rsbuild-pilot
GSS_PLAYGROUND_CSS_MODE=native pnpm --dir playground/rsbuild-react-css-modules exec rsbuild build \
  --dist-path /private/tmp/gss-attribute-selector-pilot-closeout/native/rsbuild-pilot
```

四个 build 均通过。baseline/current 的 `files`、`sourceClasses`、`beforeRawCssBytes` 完全相同；
两个 adapter 的共享业务语料都实际释放 5 个 class，增加 15 个 atomic definitions、37 个 reused
declarations、52 个 declaration occurrences，减少 15 条 preserved rules 和 52 个 preserved
declarations。Vite declaration atomization share 提升 4.11 pp、preserved CSS ratio 降低 0.0837；
Rsbuild 分别提升 3.92 pp、降低 0.0589。

释放 class 为 `ModuleMatrix.surfaceCard`、`RuleInspector.ruleCard`、`ScenarioNotes.noteCard`、
`SelectorMatrix.caseCard`、`Shell.topbar`。Vite 原 9 条 `attribute-selector` 不再以该 reason 保留；
仍有其他 unsafe evidence 的 3 个共享 class 继续 fallback。Rsbuild 原 11 条中 9 条释放，
`InspectorApp.card` 的 risk arm 直接报 1 条 `attribute-cascade-order`；同 class 的 pass arm 作为
class-wide preservation follower 继续 fallback，不伪造第二条 public diagnostic。

这些因果收益只使用同语料 report/manifest delta；`exact-only class` 与历史 `atomic token links`
只作为需求排序证据，不计入实际收益。完整体积与 artifact hash 见
[Selector 能力收益复盘](selector-capability-benefit-review.md)。

2026-07-29 的 FOUND-04 复算同时核对了当前 Rsbuild attribution：旧 frozen report 额外把 follower
记为 direct risk；current report 只有上述 1 条 direct diagnostic，`unsafeRules=15`，
`attribute-cascade-order=1`。CSS、manifest、tokens、preserved rules/declarations 均不变；这是
report 归因刷新，不改变 SEL-02 的转换收益，也不授权任何 multi-local production rewrite。

## 最终组合门禁

```sh
pnpm verify

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual \
  -- --report /private/tmp/gss-vite-attribute-selector-closeout.json

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual \
  -- --report /private/tmp/gss-rsbuild-attribute-selector-closeout.json
```

| 门禁 | 状态 | 实测结果 |
| --- | --- | --- |
| 根 `pnpm verify` | 通过 | 19 files/213 tests，全部 typecheck/build 与两套 static fixture 通过 |
| Vite full visual | 通过 | `/private/tmp/gss-vite-attribute-selector-closeout.json`：40 runs/176 cases/596 comparisons/0 differences，`passed=true` |
| Rsbuild full visual | 通过 | `/private/tmp/gss-rsbuild-attribute-selector-closeout.json`：8 runs/148 cases/360 comparisons/0 differences，`passed=true` |
| 独立 Batch 5 Test | 通过 | 独立确认 root 19/213、Vite 40/176/596/0、Rsbuild 8/148/360/0；8 个 artifact hash、同语料 invariants、49 个文档链接与限定 diff-check 均通过 |
| 独立 Batch 5 Review 首轮 | 两个 P2 | 发现本文件仍把 Test 写为待执行，以及总计划仍把 exact equality attribute 泛化为 unsupported；首轮不记为 PASS |
| Review 修复 | 已完成 | 本文件补记独立 Test 证据；总计划 Safe mode 示例改为 `^=`、flag、多 attribute 与 attribute+pseudo 等真实保守边界 |
| focused re-review | 通过 | 两个 P2 均已闭合，无新增 correctness、scope、兼容性或文档阻断 finding |

visual 需要 localhost 与 Chrome 权限，不进入根 `pnpm verify`。最终根门禁、两套 full visual、
独立 Test 与 focused re-review 均已通过，design/backlog/tracking/acceptance 对 grammar、fallback
与实际收益描述一致；SEL-02 已完成全仓收口。
