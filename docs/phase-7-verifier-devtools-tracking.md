# Phase 7 验证器与调试体验推进记录

## Phase 9 Webpack protocol 增量（2026-08-24）

- dev report adapter enum 新增 `webpack`；最近 compilation 失败时允许 `status: "error"`、稳定 error 摘要
  和最后一次成功 environments，下一次成功快照会恢复 ready。
- overlay 对 error 使用 blocked 展示，不把失败轮次与成功 nested report 混合；既有 Vite/Rsbuild
  idle/ready payload 与无 `schemaVersion` 契约不变。
- Webpack fixture 真实 GET endpoint 与 overlay runtime 已纳入 visual 验收。

## 当前状态

- Status: completed
- 完成日期：2026-07-19
- 主入口：`packages/devtools` / `@semantic-atomic-css/devtools`
- 设计：[Phase 7 方案](phase-7-verifier-devtools-plan.md)
- 验收：[Phase 7 验收](phase-7-verifier-devtools-acceptance.md)

## 批次结果

| Batch | 主题 | 状态 | 结果 |
| --- | --- | --- | --- |
| 0 | 现有 verifier 与 adapter state 调研 | completed | 复用两套 fixture 的真实 Playwright journey，不新增浏览器依赖 |
| 1 | devtools 包与 diff report | completed | structural Playwright seam、稳定 report、protocol、overlay runtime |
| 2 | Vite 接入 | completed | 当前 dev cache 重建 report、middleware、HTML overlay 注入 |
| 3 | Rsbuild 接入 | completed | environment snapshot、middleware、HTML overlay 注入 |
| 4 | fixture 与文档 | completed | semantic/native style diff、API/overlay 真实检查、source map 方案 |
| 5 | 完成后稳健性审计 | completed | stale import/race、零检查、失败 report、250ms 轮询、GET/endpoint 与生命周期收口 |

## 已落地事实

- 新 package 没有 Playwright 或 browser runtime 生产依赖；两套 fixture 继续锁定自己的 Playwright。
- Vite/Rsbuild `devtools` 默认关闭，build asset 行为和既有 report schema 不变。
- 两套 visual script 支持 `--report <file>`，不在单个 run 提前抛出 style diff，并会在最终断言成功或
  失败前先持久化完整 JSON。
- dev report API 复用 analyzer health/risk/benefit/size，不复制新的风险模型。
- overlay 使用 Shadow DOM 隔离 UI stylesheet，请求串行且可从 BFCache 恢复；`<aside>` host 的根级
  结构 selector 影响已作为显式边界记录。
- Vite 从更新前 outgoing graph 失效被移除的 CSS dependency，并用 per-file generation 阻止旧异步
  transform 回写 current cache。
- verifier 拒绝空/重复检查输入，零 comparisons 不得 passed，并使用 `load` 代替 `networkidle`。
- 完整 CSS source map 仍未实现；Vite `map: null` 与 Rsbuild fail-fast 继续作为正确性保护。
- 2026-07-22 当前 report 契约删除 dev envelope 与 style diff report 的人为
  `schemaVersion`；不保留旧 reader 或 dual-write。
- overlay 对展示必需字段做具体校验，非法 payload 统一进入 offline；
  nested Analyzer `selectorIdentity` 原样透传。
- 2026-07-25 consumer contract 已证明 nested Core diagnostic 的
  `attribute-cascade-order` reason 与 Analyzer distribution 由 envelope 保留同一 report 对象，
  且 JSON roundtrip 不过滤或改写字段；协议仍无 `schemaVersion`。
- overlay 接受携带上述 nested 字段的 ready payload，但继续只展示 aggregate unsafe count、
  health 与体积等既有 rows，不新增 reason-specific UI 或 reason whitelist。

## 最终回归

- `pnpm --filter @semantic-atomic-css/devtools verify`：通过；2 个 test files、18 项测试，
  typecheck/build 通过。新增 consumer contract 只修改 protocol test，不修改 production runtime
  或 computed style verifier。
- 此前 `pnpm verify`：通过；95 项包级测试与两套 static fixture 全部通过。
- Vite visual：20 runs、344 次 computed style 属性比较、0 difference。
- Rsbuild visual：8 runs、168 次 computed style 属性比较、0 difference。
- 两份 style diff JSON 分别写入临时验收路径，并有独立失败 report 用例证明断言前写盘。
- 两套 visual 均在 `pollIntervalMs: 250` 下通过；Vite 真实修改 TSX 移除 SCSS import 后 report 从 3 个
  module 收敛为 2 个且旧原子规则消失。

## 风险收口

| 风险 | 处理 |
| --- | --- |
| overlay 改变被测样式 | Shadow DOM 隔离 stylesheet；fixture 对比已覆盖 case；根级结构 selector 敏感项目使用 `overlay: false` |
| stale dev report | Vite outgoing graph 清理 + per-file generation + 请求时重建；Rsbuild 每轮 compile 清理 environment state |
| 零检查伪通过 | 输入不变量 fail fast，`comparisons === 0` 时 `passed: false` 且 assert 抛错 |
| polling 阻塞验证 | verifier/fixture 等待 `load`，两套真实 visual 使用 250ms 最低轮询验收 |
| report API 污染 nested build report | envelope 仅表达 adapter/status/environments，nested report 原样复用 |
| 非法 payload 被默认值掩盖 | 校验 overlay 实际消费字段，失败显示 `invalid-dev-report-payload` |
| Playwright 版本耦合生产包 | structural browser/page interface，由调用方注入 |
| source map 近似映射误导调试 | 未闭合 map composition 前不输出近似 map，Rsbuild 继续 fail fast |
