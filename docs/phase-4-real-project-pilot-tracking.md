# Phase 4 中型 React + Vite 真实项目 Pilot 推进记录

## 当前状态

Status: completed

开始日期：2026-07-14

本记录用于持续跟踪 `playground/vite-react-css-modules` 从人工观察页升级为 Phase 4 真实项目试用
基准的过程。实施、验收、异常和指标必须随进度更新，不在结束时一次性补写。

## 目标与非目标

目标：

- 建立场景丰富、可操作的中型 React + Vite + CSS Modules 应用。
- 使用 5 个懒加载路由验证 shared dev CSS owner 在真实 module graph 下的行为。
- 同时提供 semantic/native 的 dev 与 build preview 对照入口。
- 覆盖 Route A CSS Modules 继承、safe atomization、unsafe fallback、report 和 manifest。
- 通过人工浏览器旅程验证桌面端、移动端、交互状态和一次 full reload 更新。

非目标：

- 不新增第三个 playground。
- 不把 pilot 浏览器验收接入 `verify:phase4:full`。
- 不新增后端、网络请求、React Router 或 UI 组件库。
- 不实现 Sass/Less、named exports、strict mode、CSS-only HMR 或复杂 selector atomization。
- 不实现同属性冲突优化或 analyzer 冲突提示。

## 应用架构

Pilot 保留 `Semantic Ops Console` 领域，使用本地确定性数据和无依赖 hash router。

| 路由 | 加载方式 | 核心交互 | 重点覆盖 |
| --- | --- | --- | --- |
| Overview | `React.lazy` | 周期切换、pipeline 选中、活动筛选 | 首个 lazy route、状态 class、重复 atomic |
| Modules | `React.lazy` | 搜索、状态筛选、列表选中、详情抽屉 | shared owner 后续扩展、conditional class |
| Diagnostics | `React.lazy` | safe/fallback 切换、风险筛选、告警确认 | unsafe fallback、attribute、pseudo-element |
| Build | `React.lazy` | 环境切换、artifact 选择、tokens 展开 | 非 class export、按钮伪类、disabled |
| Settings | `React.lazy` | 模式切换、表单校验、checkbox、保存状态 | `active ? styles.active : styles.normal` |

目标规模：

- 5 个懒加载 route。
- 至少 16 个 React 组件。
- 至少 15 个 `.module.css` 文件。
- 每个 route 至少直接加载一个 route 专属 CSS Module。

## CSS 场景矩阵

| 类别 | 计划覆盖 |
| --- | --- |
| safe selector | base class、`:hover`、`:focus-visible`、`:active`、`:disabled` |
| at-rule | `@media`、`@supports` |
| CSS Modules | `composes`、`@value`、`:export`、dashed local、`localsConvention`、`generateScopedName` |
| declaration | custom property、`var(...)`、`!important`、shorthand/longhand 顺序 |
| fallback | descendant、child、compound class、attribute、pseudo-element、`:global` |
| cascade | base + state class、全局 `button { font: inherit; }`、跨模块重复 declaration |
| module graph | 首屏 owner、后续 lazy route、新模块首次登记、full reload |

## 实施 Checklist

- [x] 建立 pilot 推进记录文档。
- [x] 将 5 个 route 改为 `React.lazy` + `Suspense`。
- [x] 增加交互状态与稳定 `data-pilot-case` 验收锚点。
- [x] 补齐组件和 CSS Module 规模。
- [x] 补齐 CSS Modules 与 safe/fallback 场景矩阵。
- [x] 配置 Vite 原生 `localsConvention` 与 `generateScopedName` 继承。
- [x] 增加 semantic/native dev、build、preview 固定入口。
- [x] semantic build 显式开启 manifest/report。
- [x] 通过根 TypeScript typecheck。
- [x] 通过 semantic/native build 和产物检查。
- [x] 通过现有 `pnpm verify:phase4:full`。
- [x] 完成 semantic/native dev 桌面与移动端人工验收。
- [x] 完成 semantic/native build preview 人工验收。
- [x] 完成一次 CSS Module full reload 人工验收并恢复源文件。
- [x] 回写 analyzer 指标、偏差、结论和阶段状态。

## 人工验收旅程

| 编号 | 模式 | 旅程 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| P1 | semantic/native dev | 桌面端从 Overview 依次访问全部 lazy route | passed | 首屏后依次加载 4 个新 route，无持续性无样式状态 |
| P2 | semantic/native dev | Modules 搜索、筛选、选中和抽屉 | passed | 搜索、watch 筛选、选中阴影、抽屉开关结果一致 |
| P3 | semantic/native dev | Diagnostics fallback 切换和告警确认 | passed | attribute、compound、descendant、child、pseudo-element、global fallback 命中 |
| P4 | semantic/native dev | Build 环境、artifact、tokens 与按钮状态 | passed | ICSS 非 class export 保持 `operations-teal · 8px`，token 可展开 |
| P5 | semantic/native dev | Settings 条件 class、校验、checkbox、保存 | passed | invalid、disabled、compact、notifications 与 saved 状态一致 |
| P6 | semantic/native dev | `390 × 844` 移动端全部 route | passed | 五个 route 横向溢出和控件裁切均为 `0` |
| P7 | semantic/native preview | 桌面与移动端核心旅程 | passed | computed-style 签名与交互结果逐项一致 |
| P8 | semantic dev | 临时修改 lazy route CSS 后确认 full reload | passed | `#be123c -> #9f1239 -> #be123c`，token 与 computed color 同步更新并恢复 |

## 结果表

| 输出 | 运行模式 | desktop | `390 × 844` mobile | 结果 |
| --- | --- | --- | --- | --- |
| semantic | dev | 5 route + 全部核心交互通过 | 5 route 零溢出、零裁切 | passed |
| native | dev | 5 route + 全部核心交互通过 | 5 route 零溢出、零裁切 | passed |
| semantic | build preview | 关键 computed style 与核心交互通过 | 响应式布局与 fallback 通过 | passed |
| native | build preview | 关键 computed style 与核心交互通过 | 响应式布局与 fallback 通过 | passed |

脚本固定端口仍为 dev `5173/5174`、preview `4173/4174`。本次人工验收时 `5173/5174` 已由精简
acceptance fixture 占用，因此 pilot dev 使用备用 `5183/5184`，preview 使用 `4183/4184`；没有终止或
覆盖用户已有进程。semantic preview 样式拓扑为全局基础 CSS + `semantic-atomic.css`，native preview
按 Vite 原生方式加载基础 CSS 与 route CSS chunks。

## Analyzer 指标

| 指标 | 结果 |
| --- | --- |
| health | `risky`，原因为刻意保留的 unsafe selector fallback 和 1 组 class 内 declaration 顺序冲突 |
| source classes | `204` |
| atomic declarations | `265` |
| reused atomic declarations | `915` |
| reuse ratio | `0.7754` |
| preserved CSS ratio | `0.1882` |
| unsafe reason distribution | attribute 9、compound 3、descendant 6、child 1、pseudo-element 3、non-exported 1 |
| declaration conflicts | `1`，`fieldFrame` 的 `border -> border-left-color` shorthand / longhand 顺序依赖 |
| before/after raw bytes | `34250 / 15274` |
| before/after gzip bytes | `4609 / 4073` |
| before/after brotli bytes | `3875 / 3558` |
| estimated total diff | `-7176` bytes，已包含 `11800` bytes class string 增量估算 |

验收约束：`unsupportedFeatures` 必须为空，health 不得为 `blocked`。由于 pilot 会刻意保留 unsafe selector，
允许 health 为 `risky`，但 preserved CSS ratio 必须低于 `0.3`，且风险原因必须与场景矩阵一致。

## 偏差与异常

当前静态构建无阻塞异常。semantic build 会按场景矩阵输出 23 条预期 warning，`unsupportedFeatures`
为空；preserved CSS ratio 低于 `0.3` 门槛。

浏览器首轮验收发现 pilot 的 pipeline 选中卡片在 native 中为绿色背景，在 semantic 中因全局 atomic
规则顺序呈现基础灰色。根因是基础 class 与状态 class 同时声明 `background`，而原 CSS Module 的局部
源码顺序无法由全局 atomic key 的首次登记顺序普遍保持。这属于本阶段已明确不实现的同属性冲突优化，
不是 shared dev CSS owner 缓存失效。Pilot 已将组合状态调整为结构 class 与状态 class 分别负责不同
属性，并保留该场景作为 analyzer 冲突提示或 cascade 建模的输入；调整后已重新完成构建和浏览器验收。
同一轮复验还确认基础 `border` shorthand 与状态 `border-color` longhand 具有相同的跨 class 顺序边界，
因此 pilot 选中态最终只使用不与基础 class 竞争的 `box-shadow`，shorthand/longhand 的同 class 原始顺序
覆盖仍保留在独立 CSS 场景中。

状态样式调整后的浏览器复验进一步发现，CSS Module 文件变化时 shared CSS owner 会收到 HMR update，
但内部 CSS Module JS virtual module 的 Vite transform cache 未失效，full reload 后仍输出旧 tokens。现有单测
曾显式调用 `moduleGraph.invalidateAll()`，未覆盖真实浏览器路径。该 adapter 阻塞缺陷已通过精确失效
对应 virtual JS module、移除测试中的全局失效补偿修复，随后通过回归测试和真实 full reload 复验，
旧 token 不再残留。

移动端首轮检查发现 Diagnostics 横向溢出 `217px`、Build 横向溢出 `128px`。两处都具备正确的媒体
atomic token，但被更晚登记的基础规则覆盖：相同 `@media` declaration 已由早期 lazy route 复用，
shared owner 的首次登记顺序因此不能保证后续模块的 `base -> media` 关系。该问题属于当前明确支持的
响应式 safe rule 正确性，而非刻意排除的状态 class 冲突，已升级为 adapter 阻塞缺陷。修复方案是在
dev/build 最终聚合渲染时稳定分区，先输出基础 atomic rules，再输出 `@media` / `@supports` contextual
rules，同时保持各分区内部首次登记顺序；修复后已重跑 adapter、完整 Phase 4 和四维浏览器验收。

基础/条件稳定分区后的移动复验已消除 Diagnostics 和 Build 溢出，但 Modules 仍有 `6px` 溢出：
复用的 `max-width: 620px` 一列规则早于该模块的 `max-width: 1100px` 两列规则。修复继续对 MVP
常见的简单宽度条件建立确定顺序，`max-width` 按断点从大到小、`min-width` 按断点从小到大输出，
让更窄或更高的断点位于后方；复杂媒体表达式保持首次登记顺序，不宣称完整 cascade 建模。

上述两个 adapter 阻塞缺陷均已修复并增加回归测试：HMR 精确失效内部 CSS Module JS virtual module；
dev/build 聚合 CSS 先输出基础 atomic rules，再输出 contextual rules，并在原槽位内重排同类简单宽度
断点。

最终重复 semantic build 时还发现 analyzer gzip/brotli 数字和 JSON 产物哈希漂移。根因是原 `buildOrder`
记录并发 transform 的完成顺序，该顺序既不稳定也不是可靠 import order。adapter 现按规范化 source id
统一排序 build CSS、preserved fallback 与 analyzer modules，并规范化 diagnostics、manifest 键和共享
atomic sources。连续两次 build 的 atomic CSS、report、manifest SHA-256 已分别保持一致。最终
`@semantic-atomic-css/vite` 为 24 个测试，`pnpm verify:phase4:full` 通过。

保留边界：两个同时生效的 class 若竞争同一属性，或复杂媒体表达式要求跨模块精确 source-order，仍不在
Phase 4 的完整 cascade 建模范围内。Pilot 避免把同属性状态 class 当成支持项，状态 class 改用不冲突的
阴影；analyzer 现已对同一 semantic class 内可从 manifest 确定的同属性和 shorthand / longhand 竞争
输出结构化提示，跨 class 共现仍因缺少 DOM 证据而不误报。

## 最终结论

Phase 4 中型 React + Vite Pilot 已完成。应用达到 5 个懒加载 route、16 个导出 React 组件和 18 个
CSS Module，semantic/native 的 dev 与 build preview 在 desktop/mobile 下完成 computed-style 和核心
交互对照。Pilot 暴露并推动修复 shared owner HMR token 缓存、响应式 atomic 复用顺序和 build 产物
非确定性三个真实 adapter 缺陷；最终 analyzer 为 `risky`，风险来自刻意保留的 unsafe fallback
和 1 组可确定的 class 内 shorthand / longhand 顺序依赖，`unsupportedFeatures` 为空，
preserved CSS ratio `0.1882` 低于 `0.3` 门槛。
