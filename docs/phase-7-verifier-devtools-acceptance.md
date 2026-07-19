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
| style diff report | schema v1、属性级 difference、merge、零比较拒绝、失败前 JSON 写盘 |
| Vite dev API | idle/ready、import removal/current cache、generation race、GET、analysis、no-store、非法 endpoint |
| Rsbuild dev API | idle/ready、environment snapshot、GET、analysis、no-store、非法 endpoint |
| browser overlay | 250ms 轮询、请求不重叠/BFCache runtime；semantic dev 存在 Shadow root；native/preview/build 不注入 |
| 回归边界 | tokens、rect、资源 HTTP、Sass partial、移除 import 与原 static fixture 继续通过 |
| source map | 方案和非目标明确；未实现路径不降低 `map: null` / fail-fast 保护 |

## 验收命令

```bash
pnpm --filter @semantic-atomic-css/devtools verify
pnpm --filter @semantic-atomic-css/vite verify
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm verify

pnpm --filter @semantic-atomic-css/vite-fixture test:visual -- --report /tmp/gss-vite-style-diff.json
pnpm --filter @semantic-atomic-css/rsbuild-fixture test:visual -- --report /tmp/gss-rsbuild-style-diff.json
```

visual 使用真实 localhost 与 Chrome，不进入根 `pnpm verify`。受限环境如果无法监听端口或启动 Chrome，
必须记录未运行原因，不能用包级 fake browser 测试替代真实 semantic/native 对照。

## 执行结果

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

## 通过判定

Phase 7 只有在以下条件同时成立时完成：

1. verifier 真实消费 Playwright page，并生成可持久化属性级 diff。
2. 两个 adapter 的 dev API 返回当前状态而非 build/stale collector。
3. overlay 在 semantic dev 可见，已验收 case 不改变 semantic/native computed style 对照；根级结构
   selector 的 light DOM host 边界已文档化且可通过 `overlay: false` 避免。
4. 默认配置和 build/preview 不新增 API、overlay 或 report asset。
5. 包级、根静态门禁和两套完整 visual fixture 均通过。
6. source map 未实现部分继续明确保护，不以 manifest location 冒充完整 map。
