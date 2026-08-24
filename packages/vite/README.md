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
      report: { enabled: true },
      devtools: { enabled: true }
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
- devtools 默认关闭；开启后只在 dev 提供 report API 与 overlay，不改变 build asset。
- `modules.namedExports: true` 和 `diagnostics.strict: true` 当前会显式失败。
- Lightning CSS transformer 当前会显式失败。
- 无法从 Vite 原生管线取得 tokens 时会停止构建，避免 silent miscompile。

## Dev 与 build

dev 使用单一 virtual CSS owner 聚合当前已知模块，避免同一 atomic class 被多个 style tag 重复注入。
CSS Module 或预处理器依赖更新时，adapter 会失效受影响模块并触发 full reload。

显式配置 `devtools: { enabled: true }` 后，dev server 提供
`GET /__semantic-atomic-css/report`，并向 semantic dev HTML 注入 Shadow DOM overlay。可以使用
`overlay: false` 只启用 API，或用 `endpoint` 与 `pollIntervalMs` 调整 pathname/轮询；endpoint 必须是
无 query/hash/dot-segment 的绝对 pathname。API 仅处理 GET。JS/TS 更新时 adapter 会从更新前的 outgoing
graph 保守清理 CSS dependency，并以 per-file generation 拒绝旧异步 transform 回写；API 每次从当前
per-file cache 重建 report。

build 默认生成 `assets/semantic-atomic.css`。显式开启后还会生成：

- `semantic-atomic-manifest.json`
- `semantic-atomic-report.json`

build metadata 在同一个 `generateBundle` 中按需收集：两项都关闭时不读取 Core manifest；只开启
manifest 或 report 时各读取一次；两项同时开启时，manifest asset 与 report analyzer 共用同一份
已稳定化 snapshot，避免对大型 manifest 重复投影和复制。

class name 在 dev 默认使用可读的 `readable + "_"`，build 默认使用无 prefix 的 32-bit / 7 字符 lower-base36
`compact`；通过 `core.className` 显式指定 `readable`、`hash`、`compact` 或 `prefix` 时始终覆盖环境默认。
既有显式 `hash` 仍输出 `_` 加 8 位 base36。

dev atomic CSS 继续使用可读 rule、空行分隔和缩进 wrapper。build 的独立 atomic asset 不会
重新进入 Vite 原生 CSS minifier，因此 adapter 使用内部 production serializer：保留 `selector` / `prop` /
`value` / context 原字节和既有顺序，只收紧 rule 末尾、`!important`、entry separator 与 at-rule wrapper。
该格式不分组、合并、重排或 canonicalize CSS，report `analysis.size.after*CssBytes` 按实际写盘 asset 计算。

build 聚合顺序、基础/条件规则分区和简单宽度断点顺序属于 cascade 正确性约束，不是格式化细节。
聚合 renderer 直接使用 core 为每条 atomic declaration 预渲染的 `selector.css`，不解析
`selector.identity`，也不自行拼接 class 或 pseudo。manifest 的 atomic entry 保留必填
`selector.identity` / `selector.css`；build analysis conflict 保留 `selectorIdentity`。

dev report 使用当前唯一的 `adapter/status/environments` envelope，不包含人为 `schemaVersion`。
包入口只导出 `semanticAtomicCss` factory，不提供历史别名。

## Selector 能力边界

Vite adapter 不维护 selector 白名单，也不解析 `selector.identity`。当前直接消费 Core 输出的
classes、预渲染 `selector.css`、diagnostics 与 report：

- 单 local anchor 的基础 selector、五种 pseudo class 和独立 before/after pseudo element 由 Core
  生成对应 atomic selector；legacy/modern pseudo element spelling 由 descriptor 保留。
- 单个 local class 上的 attribute presence、exact equality 和 attribute-before-class node order
  可以生成带原 attribute guard 的 atomic selector，Vite tokens 同时保留原生 scoped class。
- selector list 仅在全部 arm 都安全、可导出且未被 class-wide evidence 阻断时转换；含 pseudo element
  arm 或任一 unsafe arm 时完整 fallback，不做混合拆分。
- 同一 `data-*` exact equality 的互斥 value 可以保持独立 guarded atomic rule。
- attribute rule 与 supported pseudo rule 出现同 importance property 竞争时，Core 以
  `attribute-cascade-order` 整类保留 scoped fallback；adapter 不追加 partial atomic token。
- `^=` 等未支持 operator、flag、namespace、多个 attribute 等 near-miss 继续以
  `attribute-selector` 保守保留。
- `.module.scss` 的 nested attribute selector 先由 Vite/Sass 编译，再走同一通用链路；adapter
  不读取 authored Sass bytes 重建 selector。

运行时增加、切换或移除 attribute 只改变 selector 是否匹配，不改变 CSS Modules className。
真实 fixture 会在 semantic/native dev 与 preview 中比较 absent、open、closed、removed 四个状态，
并从 CSSOM 精确确认 atomic class 与 attribute guard 绑定。

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
- [Phase 7 verifier/devtools](../../docs/phase-7-verifier-devtools-plan.md)

## 验证

```bash
pnpm --filter @semantic-atomic-css/vite verify
pnpm verify
```

`pnpm verify` 还会运行两个真实 fixture 的静态门禁。阶段性测试数量和历史失败只记录在对应 acceptance /
tracking 文档中，不在当前包 README 维护易过期的快照。

涉及浏览器渲染、cascade 或响应式行为时还应运行：

```bash
pnpm --filter @semantic-atomic-css/vite-fixture test:visual
```
