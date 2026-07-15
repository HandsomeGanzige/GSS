# @semantic-atomic-css/vite

`@semantic-atomic-css/vite` 把 GSS 接入 Vite 6 原生 CSS Modules 管线。adapter 复用 Vite 的
预处理器、scoped CSS、tokens、资源和 dependency graph，再执行 safe atomization、tokens 增强
以及 atomic/preserved CSS 聚合。

## 使用

```ts
import { defineConfig } from 'vite';
import { semanticAtomicCss } from '@semantic-atomic-css/vite';

export default defineConfig({
  plugins: [
    semanticAtomicCss({
      manifest: { enabled: true },
      report: { enabled: true }
    })
  ]
});
```

默认只处理：

- `*.module.css`
- `*.module.scss`
- `*.module.less`

普通 CSS、SCSS 和 Less 保持由 Vite 原生管线处理。adapter 不改写 JSX/TSX，也不会删除 semantic
scoped class。

## 配置边界

- 未显式提供 `modules` 时继承 Vite `css.modules`。
- 显式提供 `modules` 时，只用 GSS 当前支持的配置覆盖原生管线。
- include/exclude 当前只承诺已验证的 `*` 与 `**` 匹配能力。
- manifest 和 report 默认关闭。
- `modules.namedExports: true` 和 `diagnostics.strict: true` 当前会显式失败。
- Lightning CSS transformer 当前会显式失败。
- 无法从 Vite 原生管线取得 tokens 时会停止构建，避免 silent miscompile。

## Dev 与 build

dev 使用单一 virtual CSS owner 聚合当前已知模块，避免同一 atomic class 被多个 style tag 重复注入。
CSS Module 或预处理器依赖更新时，adapter 会失效受影响模块并触发 full reload。

build 默认生成 `assets/semantic-atomic.css`。显式开启后还会生成：

- `semantic-atomic-manifest.json`
- `semantic-atomic-report.json`

build 聚合顺序、基础/条件规则分区和简单宽度断点顺序属于 cascade 正确性约束，不是格式化细节。

## 已知非目标

- 普通全局 CSS atomization。
- named exports。
- strict mode。
- CSS-only HMR。
- Lightning CSS transformer。
- Vite 7 或其他构建工具 adapter。
- 跨 class 或复杂媒体表达式的完整 cascade 建模。

设计与当前实现记录见：

- [Vite adapter 设计](../../docs/phase-3-vite-adapter-design.md)
- [Vite adapter tracking](../../docs/phase-3-vite-adapter-tracking.md)
- [Phase 4 production readiness](../../docs/phase-4-production-readiness-plan.md)

## 验证

```bash
pnpm --filter @semantic-atomic-css/vite verify
pnpm verify
```

涉及浏览器渲染、cascade 或响应式行为时还应运行：

```bash
pnpm --filter @semantic-atomic-css/vite-fixture test:visual
```
