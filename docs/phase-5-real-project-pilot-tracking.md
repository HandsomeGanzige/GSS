# Phase 5 中型 React + Vite 真实项目 Pilot 推进记录

## 当前状态

Status: in_progress

开始日期：2026-07-15

本记录跟踪 `playground/vite-react-css-modules` 在 Phase 5 完成后的真实消费方扩展。自动错误边界与
visual 回归仍由 `fixtures/vite-css-modules` 负责；Pilot 聚焦较大 React module graph 中的人工体验、
产物观察和 partial full reload。

## 目标与边界

- 保持现有 5 个懒加载路由，不新增专门的预处理器演示路由。
- 在真实业务模块中混用 CSS、SCSS 与 Less Modules。
- 覆盖 Sass `@use`、Less `@import`、`additionalData`、本地资源和 `composes` 闭包。
- 对比 semantic/native 的 dev、preview、tokens、computed style 和窄屏布局。
- 不复制 publicDir、自定义 `renderBuiltUrl`、错误依赖和自动浏览器 fixture。
- 不修改 core、analyzer、Vite adapter 公共 API，不向根目录增加命令。

## 实施结果

| 场景 | 实现 |
| --- | --- |
| Sass 首屏模块 | `Shell.module.scss` 使用共享 `_pilot-theme.scss`、嵌套 pseudo/media 和 Vite `additionalData` |
| 资源与 compose | `logoAsset` 引用本地 SVG，实际 `logoMark` 通过 `composes` 关联资源 class |
| Less lazy 模块 | `BuildArtifactPanel.module.less` 使用 `pilot-theme.less`、mixin、嵌套 selector 和 `additionalData` |
| 三语言混用 | 其余 CSS Modules 保持不变，CSS/SCSS/Less 共同注册全局 atomic rules |
| 可观察性 | Shell 和 Build route 显示 semantic/native 模式；Build route 展示语言矩阵和代表性 token |

Pilot 固定使用与自动 fixture 相同的 `sass 1.101.0` 和 `less 4.6.7`。semantic/native 共享同一份
CSS Modules、预处理器和 `assetsInlineLimit: 0` 配置，仅插件列表不同。

## 静态产物验收

执行命令：

```bash
pnpm --filter playground-vite-react-css-modules typecheck
pnpm --filter playground-vite-react-css-modules build:semantic
pnpm --filter playground-vite-react-css-modules build:native
```

当前结果：

- semantic/native build 均通过，均发布 `assets/pilot-mark-[hash].svg`。
- `semantic-atomic.css` 使用最终 `/assets/pilot-mark-[hash].svg`，无 `__VITE_ASSET__` 残留。
- manifest/report 同时包含 `.module.css`、`.module.scss` 和 `.module.less` source id。
- `logoAsset` 与 composed `logoMark` 的 `atomicClassNames` 均为空，report 含两条
  `preserved-class / asset-reference`。
- `display: grid` 等 atomic rule 的 sources 同时包含 CSS、SCSS 与 Less。
- `unsupportedFeatures` 为空，health 为预期的 `risky`，没有进入 `blocked`。

Analyzer 指标：

| 指标 | 结果 |
| --- | --- |
| source classes | `212` |
| atomic declarations | `264` |
| reused atomic declarations | `944` |
| reuse ratio | `0.7815` |
| unsafe rules | `23` |
| preserved rules / declarations | `26 / 59` |
| preserved CSS ratio | `0.2055` |
| before/after raw bytes | `44695 / 15571` |
| before/after gzip bytes | `5191 / 4152` |
| before/after brotli bytes | `4371 / 3624` |
| estimated total diff | `-17044` bytes |

风险来源仍是 Pilot 刻意保留的 unsafe selector 和 Settings route 的一组 shorthand/longhand 顺序冲突；
新增资源保留使 preserved CSS ratio 从 Phase 5 前的 `0.1882` 上升到 `0.2055`，仍低于 `0.3` 门槛。

## 人工浏览器旅程

| 编号 | 模式 | 旅程 | 状态 |
| --- | --- | --- | --- |
| P1 | semantic/native dev | 全部 5 route、模式标识和核心交互 | partial |
| P2 | semantic/native dev | Build 语言矩阵、SCSS/Less token 与资源图形 | passed |
| P3 | semantic/native dev | `390 × 844` 窄屏布局、hover/focus 与响应式 | partial |
| P4 | semantic/native preview | 核心 computed style 和资源访问对照 | partial |
| P5 | semantic dev | 修改 Sass partial 后 full reload，无 stale token | passed |
| P6 | semantic dev | 修改 Less partial 后 full reload，无 stale token | passed |

本次已完成：

- semantic dev 依次通过 Overview、Modules、Diagnostics、Build、Settings 的核心交互，桌面与
  `390 × 844` 均无横向溢出。
- semantic/native dev 的 Build route 均显示正确模式；SCSS 资源 token 在两种模式下只有 scoped
  compose classes，Less token 在 semantic 中附加 atomic classes、native 中保持单个 scoped class。
- semantic preview 的桌面与窄屏 computed style、最终 SVG URL 和 build atomic token 通过，
  浏览器 console 无 error/warning。
- Sass partial 更新时 Overview 的 React period 从 `7d` 重置为 `24h`，背景色同步更新；
  Less partial 更新时 Build environment 从 `development` 重置为 `production`，token 中只有
  新的 atomic class。恢复源文件后 computed style 与 token 都回到基线。
- 根 `pnpm typecheck`、`pnpm build`、`pnpm verify` 以及 Pilot `build:native` 均通过。

未完成项：

- 浏览器控制层在批量切换 native dev 本地端口时拒绝继续访问；未使用另一套浏览器自动化机制绕过。
- 因此本轮没有重新执行 native 的其余 4 个 route、`390 × 844` 窄屏和 native preview。Phase 4
  对这些未改动 route 已有通过记录，本轮 native dev 已覆盖发生变化的共享 Shell 与 Build/Less 表面，
  但这不能替代新的完整 native preview 记录。

只有上述旅程、根 `typecheck/build/verify` 和最终 diff 检查完成后，本文状态才改为 `completed`。
