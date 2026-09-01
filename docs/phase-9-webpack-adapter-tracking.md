# Phase 9 Webpack 5 Adapter 推进记录

## 当前状态

- Status: completed
- 完成日期：2026-08-24
- 生产包：`packages/webpack`
- 自动 fixture：`fixtures/webpack-css-modules`
- 中型 Pilot：`playground/webpack-react-css-modules`

## 已完成

- Batch 0 公开接口与跨进程 filesystem cache metadata replay 得到 `go`。
- 新增内部 `css-loader-bridge`，迁移 Rsbuild 的 rows/locals 纯转换、stable artifacts、canonical renderer 与
  browser owner；Rsbuild adapter 生命周期、错误语义和 public factory 不变。
- Webpack plugin class 会递归处理静态 RuleSet，安装 cache-safe bridge，增强 default locals，并保留资源、
  ICSS 同值歧义和 unsafe selector fallback。
- build 输出 `static/css/semantic-atomic.css`，按需输出 manifest/report，通过 HtmlWebpackPlugin 保证 link
  位于 native stylesheets 前。
- dev 使用单一 shared owner；devtools 支持 `adapter: webpack` report envelope、GET middleware 与 overlay。
- fixture 已覆盖 base/preprocessor、semantic/native、跨进程 cache replay、资源、link/metadata、dev/preview、
  desktop/narrow computed style、token prefix、direct module 更新、Sass partial 更新和移除 Less import 后 stale
  style 清理。
- React Pilot 已覆盖双入口、lazy routes、CSS/SCSS/Less Modules、ICSS、资源及 semantic/native artifacts。

## 2026-08-24 review 收口

- 普通 `modules: false` CSS rule 现在完整旁路；modules 缺省/不一致 auto、use 数组函数项、css-loader shorthand、
  可重叠 pipeline、动态 entry、webworker、全局/per-entry library 和 Module Federation 精确 fail fast。
  Webpack `devtool` 的 CSS/all source-map 继承也
  会被识别；目标 css-loader 只有显式 `sourceMap: false` 才能关闭继承。
- dev report 使用 pending/commit 两阶段：失败 compilation 不污染 last-good，成功空编译清空旧状态。
- visual server 使用动态端口并等待子进程退出，不占用固定端口或遗留 WDS。
- css-loader adapters 共用环境 resolver：dev 默认 `readable-keyed`、build 默认 `compact-keyed`，显式策略原样
  保留。两种 keyed 策略都使用完整 canonical key 的 128-bit FNV-1a / 固定 25 位
  lower-base36 摘要；这是明确 class-byte 迁移。显式 `readable` 恢复原字节，但跨独立 loader 碰撞会
  fail fast。内部 metadata schema 2 携带实际 key/class mapping，最终 snapshot 强制验证 token/CSS 闭合。
- owner 明确选择全局 atomic cascade：跨模块输出按 canonical source id 排序并按 atomic key 去重，支持
  multi-entry/lazy；同一元素组合多个 Modules token 时，同权重、同属性 winner 不继承业务 import 顺序。
  重复 source 的 build preserve reason 使用固定优先级合并；dev 不同 owner 只接受一致快照，冲突以稳定
  `unstable-dev-source-snapshot` fail fast，不由注册先后选择。
- synthetic URL 使用相对 marker 与静态 publicPath evidence，真实 fixture 覆盖 root/relative/父级相对、
  protocol-relative CDN 与 marker 同名根 publicPath；visual 子进程 spawn 后立即登记，HTTP fetch 使用剩余
  deadline 的 AbortSignal，SIGKILL 后也有最终 settle 上限，部分失败统一清理。
  fixture 的 semantic/native parity 只覆盖不依赖该反模式的语料。

## 2026-09-01 review 修复

- RuleSet 探测改为基于 `compiler.context`、绝对字符串目录和 RegExp/数组 witness 的
  `matched / disjoint / unknown` 判断；常见绝对 `include` 可安装 bridge，无法证明的 condition 稳定
  fail fast。Webpack fixture 的 CSS/SCSS/Less pipeline 使用真实绝对 include 作为集成证据。
- `modules: false` 仍完整旁路 transform，但进入支持后缀与 overlap 分析；显式排除 Modules 的普通 rule
  继续允许，broad 普通 rule 与 Modules rule 重叠时拒绝。
- peer 门禁按 rule 实际 loader request 解析最近 package identity/version，覆盖标准 bare、绝对路径与 query；
  bare request 遇到自定义 `resolveLoader.alias/modules/plugins` 时保守 fail fast。plugin 的 mode、last-good
  report 和 pending compilation state 改为每 compiler 隔离，支持复用同一实例。
- dev report 公共类型改为严格 idle/ready/error 判别联合；error 必须带摘要且可保留 last-good。
  metadata schema 2 parser 完整校验 owner、compiled inputs、preservation reason 和 key/class mapping。

## 当前风险

- 自动 RuleSet 只承诺有静态 witness 的 condition/use；复杂第三方 loader wrapper 或无法证明的 RegExp
  必须显式失败后单独取证。
- watch 已覆盖 direct module、Sass partial 与 remove-import 最终状态；当前仍不承诺不触发 reload 的
  CSS-only HMR，验收只要求最终状态无 stale CSS/tokens。
- Webpack 没有默认 CSS minimizer；atomic asset 只交给项目已有 optimize/minimizer，不保证任意第三方
  minimizer 的输出格式。
