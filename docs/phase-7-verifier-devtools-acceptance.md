# Phase 7 验证器与调试体验验收

## 验收状态

- Status: completed
- 验收日期：2026-07-19
- 生产入口：`@semantic-atomic-css/devtools`、Vite/Rsbuild adapter `devtools` 选项
- 浏览器入口：两套 fixture `test:visual`

## 自动验收矩阵

| 能力 | 证据 |
| --- | --- |
| computed style verifier | desktop/narrow、base/preprocessor、dev/preview、pseudo/hover/focus/lazy；空/重复输入 fail fast |
| style diff report | 当前 labels/summary/runs/differences 结构、属性级 difference、merge、零比较拒绝、失败前 JSON 写盘 |
| Vite dev API | idle/ready、import removal/current cache、generation race、GET、analysis、no-store、非法 endpoint |
| Rsbuild dev API | idle/ready、environment snapshot、GET、analysis、no-store、非法 endpoint |
| dev report consumer contract | nested `attribute-cascade-order` diagnostic/distribution 对象引用与 JSON roundtrip 原样保留；无 schema version |
| browser overlay | 有效 idle/ready 展示、非法 payload offline、250ms 轮询、请求不重叠/BFCache runtime；semantic dev 存在 Shadow root；native/preview/build 不注入 |
| 回归边界 | tokens、rect、资源 HTTP、Sass partial、移除 import 与原 static fixture 继续通过 |
| source map | 方案和非目标明确；未实现路径不降低 `map: null` / fail-fast 保护 |

## 验收命令

```bash
pnpm --filter @semantic-atomic-css/devtools verify
pnpm --filter @semantic-atomic-css/vite verify
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm verify

GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/vite-fixture test:visual \
  -- --report /private/tmp/gss-vite-cascade-oracle-closeout.json
GSS_VISUAL_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual \
  -- --report /private/tmp/gss-rsbuild-cascade-oracle-closeout.json
```

visual 使用真实 localhost 与 Chrome，不进入根 `pnpm verify`。受限环境如果无法监听端口或启动 Chrome，
必须记录未运行原因，不能用包级 fake browser 测试替代真实 semantic/native 对照。

## 2026-07-25 attribute selector consumer contract

- Devtools：2 个 test files、18 项测试通过，typecheck/build 通过。
- dev report envelope 保留 nested report 同一对象；JSON roundtrip 后
  `attribute-cascade-order` diagnostic reason 与 Analyzer distribution key 均存在。
- overlay 接受携带这些 nested 字段的 ready payload，实际 rows 仍只有 adapter、files、
  atomic declarations、unsafe rules、preserved rules 与 estimated diff，不展示 reason-specific UI。
- 当前 envelope 与 nested report 不新增 `schemaVersion`、兼容 reader 或 reason whitelist。
- 本批不修改 production runtime、computed style verifier、adapter 或 fixture，因此未运行 browser visual
  与根级跨 adapter 门禁；下方完整回归数字仍是此前独立快照。

## 2026-07-25 跨 adapter 完整回归快照

- Devtools：2 个 test files、17 项测试通过；当前 dev report 与 style diff report 均不包含人为
  schema version，overlay 继续校验当前展示字段和非法 payload offline。
- Vite：4 个 test files、37 项测试通过；Rsbuild：4 个 test files、18 项测试通过。
- 根 `pnpm verify` 通过：Core 8 files/74 tests、Analyzer 1 file/7 tests、Devtools
  2 files/17 tests、Vite 4 files/37 tests、Rsbuild 4 files/18 tests，五个产品包合计
  19 files/153 tests；全部 typecheck/build 与 Vite/Rsbuild 两套 fixture static 通过。
- Vite full visual 使用当前无版本 `adapter/status/environments` envelope，覆盖 HMR/import-removal
  stale selector 清理与 cascade oracle；20 runs、132 cases、420 次属性比较、0 differences，
  `passed=true`。
- Rsbuild full visual 使用当前无版本 envelope，覆盖 partial reload/import-removal 与 fail-closed
  stale selector CSSOM 检查和 cascade oracle；8 runs、108 cases、220 次属性比较、
  0 differences，`passed=true`。
- canonical reports 分别写入 `/private/tmp/gss-vite-cascade-oracle-closeout.json` 与
  `/private/tmp/gss-rsbuild-cascade-oracle-closeout.json`。
- visual 需要 localhost 与 Chrome 权限；受限 sandbox 的监听权限不作为产品失败。

## 历史执行结果

以下保留 2026-07-19 Phase 7 收口、2026-07-22 package-only 当前契约回归与 descriptor B6
收口的历史统计，
不作为 2026-07-25 当前完整门禁数字：

- devtools：2 个 test files、9 项测试，含零检查、失败写盘、导航/cleanup、endpoint 与 overlay 生命周期；
  typecheck/build 通过。
- Vite adapter：4 个 test files、35 项测试，含 GET API/overlay、import-removal/current cache、generation race
  与 build 回归。
- Rsbuild adapter：4 个 test files、14 项测试，含 dev API/overlay、environment/build/runtime 回归。
- Vite/Rsbuild static fixture：通过。
- 根 `pnpm verify`：通过，覆盖 core 32、analyzer 5、devtools 9、Vite 35、Rsbuild 14 项测试及两套
  static fixture。
- Vite 完整 visual：通过；style diff 为 20 runs、92 case snapshots、344 次属性比较、0 difference。
- Rsbuild 完整 visual：通过；style diff 为 8 runs、72 case snapshots、168 次属性比较、0 difference。
- 两套 visual 在 250ms 最低轮询下通过 dev report API/Shadow DOM overlay、tokens、资源、交互与 Sass
  partial/stale CSS 验收；Vite 同时完成 TSX import removal 真实验收。
- 公共 `verifyComputedStyles` 使用真实 Chromium 对照 native/250ms overlay 页面：1 run、1 comparison、0
  difference，2s timeout 内通过。
- 2026-07-22 当前契约回归：devtools 2 个 test files、17 项测试，覆盖两种 report
  无 `schemaVersion`、environment 稳定排序、nested `selectorIdentity` 透传、有效
  idle/ready overlay 真实 runtime 执行与非法 payload offline；package verify 通过。
- 2026-07-25 selector descriptor B6 历史基线：根门禁为五包 18 files/144 tests；
  Vite visual 为 20 runs/100 cases/356 comparisons，Rsbuild visual 为
  8 runs/80 cases/180 comparisons；两者均为 0 differences、`passed=true`。历史 reports 为
  `/tmp/gss-vite-selector-descriptor-style-diff.json` 与
  `/tmp/gss-rsbuild-selector-descriptor-style-diff.json`。

## 通过判定

Phase 7 只有在以下条件同时成立时完成：

1. verifier 真实消费 Playwright page，并生成可持久化属性级 diff。
2. 两个 adapter 的 dev API 返回当前状态而非 build/stale collector。
3. overlay 在 semantic dev 可见，已验收 case 不改变 semantic/native computed style 对照；根级结构
   selector 的 light DOM host 边界已文档化且可通过 `overlay: false` 避免。
4. 默认配置和 build/preview 不新增 API、overlay 或 report asset。
5. 包级、根静态门禁和两套完整 visual fixture 均通过。
6. source map 未实现部分继续明确保护，不以 manifest location 冒充完整 map。
