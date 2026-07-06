# Phase 1 验收指南

本文档记录 Phase 1 Vite 原型的历史验收方式。Phase 2 core v1 之后，`packages/vite` 当前不在
工作区内，playground 已回退为普通 Vite React CSS Modules 示例；因此本文中的 manifest/report
产物检查暂不代表当前可执行验收。

## 自动验收

在仓库根目录执行：

```bash
pnpm verify:phase1
```

截至 Phase 2 core v1，该命令是 `pnpm verify:core` 的兼容别名，只检查 core transform engine。
旧 Phase 1 原型曾检查：

- core 单元测试和 fixture snapshot 测试
- TypeScript 类型检查
- packages 和 playground 构建
- 生成的 report 和 manifest
- atomic CSS 输出
- `.card .button` 的 scoped preserved fallback
- hover 规则输出

旧 Phase 1 预期最终输出：

```txt
Phase 1 verification passed.
Report: 1 file, 5 local classes, 30 atomic declarations, 1 unsafe rule.
```

CSS declaration 变化时，具体 atomic class 名称可能变化。

## 手动浏览器验收

以下内容是旧 Vite adapter 存在时的手动验收记录。当前 playground 不再注入 semantic atomic CSS，
后续恢复 adapter 后需要重新校准本节。

启动 playground：

```bash
pnpm dev
```

打开终端输出的本地地址，通常是 `http://127.0.0.1:5173/`。如果端口被占用，可能是 `http://127.0.0.1:5174/`。

预期页面表现：

- 页面显示 `Semantic Atomic CSS` 标题。
- 卡片是白色，有 padding 和 border。
- 按钮是蓝色，并且保留 semantic scoped class，同时追加 atomic classes。
- hover 按钮时背景色变深。
- 按钮阴影仍通过 preserved unsafe selector `.card .button` 生效。

## 构建产物验收

执行 `pnpm build` 后，可以检查：

- `playground/vite-react-css-modules/dist/semantic-atomic-report.json`
- `playground/vite-react-css-modules/dist/semantic-atomic-manifest.json`
- `playground/vite-react-css-modules/dist/assets/*.css`

report 中应该包含一条预期内的 unsafe rule：

```txt
.card .button
```

该 warning 符合预期，因为 Phase 1 默认保留后代选择器。

## Chrome 验收记录

2026-07-01 使用 Chrome 插件验收 `http://127.0.0.1:5174/`，结果通过：

- 页面 title：`Semantic Atomic CSS Playground`
- H1：`Semantic Atomic CSS`
- button class 同时包含 `button_button__...` 和 atomic classes
- atomic CSS 已注入
- hover CSS 已注入，hover 后背景色为 `rgb(29, 78, 216)`
- preserved fallback 已生效，按钮阴影来自 `.card .button`
- 浏览器 console 无 error / warn
