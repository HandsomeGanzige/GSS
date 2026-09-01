# Phase 9 Webpack 5 Adapter 验收

## 状态

- Status: completed
- 验收日期：2026-08-24

## 自动矩阵

| 维度 | 当前证据 |
| --- | --- |
| 输入 | CSS/SCSS/Less Modules、普通 CSS 对照 |
| tokens | default locals、camel case、custom ident、composes/ICSS、同值歧义保留、readable-keyed 与最终 CSS 闭合 |
| selector/cascade | base、pseudo、attribute、selector-list、unsafe fallback、断点和重要性 |
| 资源 | inline/external、query/hash、root/relative/父级相对 publicPath、protocol-relative/绝对 CDN、marker 同名根路径、asset graph |
| RuleSet | compiler.context/绝对 include、condition unknown fail fast、modules:false disjoint/overlap、oneOf 互斥 |
| loader peer | 标准 bare/绝对/query actual request 的 package identity 与 major 校验；自定义 resolveLoader 保守拒绝 |
| build | extraction、atomic link 顺序、manifest/report/analyzer、内部 metadata 完整校验与清理 |
| cache | 两个独立进程共享 filesystem cache，删除 dist 后 metadata/atomic 产物稳定重放 |
| runtime | semantic/native dev+preview、desktop/narrow、computed style、token prefix、单一 owner、重复 source 冲突保护、direct/partial/remove-import 最终状态、同一 plugin 多 compiler 隔离 |
| Pilot | React 双入口、lazy、CSS/SCSS/Less、资源、ICSS、semantic/native artifacts |

## 2026-09-01 review 回归

- package tests 覆盖绝对字符串/RegExp/数组 condition、unknown fail fast、`modules:false` broad overlap 与
  显式 disjoint；真实 fixture 的三种 Module pipeline 均使用 suite `src` 绝对 include。
- 实际 loader request 的 package identity/major、同实例 build/dev compiler mode/report 隔离和 metadata
  schema 2 全字段畸形输入均有回归；dev report error 保留 last-good environment。
- 本轮没有改变 Core selector、atomic key、class bytes、manifest/report schema 或 Rsbuild/Vite 行为。
- 最终 `pnpm verify` 通过：Webpack 5 files/37 tests、Devtools 2 files/20 tests，全部 package
  typecheck/build 与三套 static fixture 通过；Webpack 与 Rsbuild visual 均通过。修复前曾出现一次 Vite
  shared-partial 测试波动，单项重跑及本轮两次最终根验证均通过，未复现为产品失败。

## 验证命令

```bash
pnpm --filter @semantic-atomic-css/css-loader-bridge verify
pnpm --filter @semantic-atomic-css/rsbuild verify
pnpm --filter @semantic-atomic-css/webpack verify
pnpm --filter @semantic-atomic-css/webpack-fixture verify
pnpm --filter @semantic-atomic-css/webpack-fixture test:visual
pnpm --filter playground-webpack-react-css-modules acceptance
pnpm verify
```

Webpack visual 使用动态端口；四个 WDS 子进程在 spawn 后立即登记，URL marker 与 HTTP readiness 共用
30 秒 deadline，每次 fetch 都以剩余时间设置 AbortSignal。任一服务提前退出、超时或部分启动失败时，finally
都会对已启动进程执行 SIGTERM → 5 秒等待 → SIGKILL → 1 秒最终 settle，并关闭已创建 preview server。
静态验收另以受控子进程覆盖部分启动失败与 readiness timeout 清理路径。

Webpack visual 会真实修改并恢复 tracked fixture：direct CSS Module 更新、Sass partial 更新和移除/恢复
Less import 均验证 semantic/native 最终状态一致，shared owner 不重复且移除 import 后 `border-radius: 9px`
stale rule 消失。当前仍不承诺 CSS-only HMR；允许 Webpack dev server 采用 reload，只锁定最终状态正确性。

全局 atomic CSS 的跨模块 cascade 使用 canonical source-id/key 顺序，不继承业务 import 顺序。visual parity
语料不得通过组合多个 Modules token，让同权重、同属性 declaration 的 winner 依赖文件加载先后；该写法
属于明确排除的业务反模式，不作为 semantic/native parity 失败。
