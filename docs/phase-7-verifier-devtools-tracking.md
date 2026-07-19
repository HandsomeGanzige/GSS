# Phase 7 验证器与调试体验推进记录

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
| 1 | devtools 包与 diff schema | completed | structural Playwright seam、稳定 report、protocol、overlay runtime |
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

## 最终回归

- `pnpm verify`：通过；95 项包级测试与两套 static fixture 全部通过。
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
| report API schema 污染 build schema | 独立 `schemaVersion: 1` envelope，nested report 原样复用 |
| Playwright 版本耦合生产包 | structural browser/page interface，由调用方注入 |
| source map 近似映射误导调试 | 未闭合 map composition 前不输出近似 map，Rsbuild 继续 fail fast |
