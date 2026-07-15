# 参与贡献

本文档说明人类维护者参与 GSS 开发时需要了解的仓库入口、职责边界和交付流程。产品语义以
[长期技术方案](./semantic-atomic-css-plugin-plan.md)及各阶段设计文档为准。

## 本地准备

```bash
pnpm install
pnpm verify
```

仓库使用 pnpm workspace。根命令只提供聚合入口：

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm verify
```

## 从哪里开始

- 修改 core：先阅读 [core README](./packages/core/README.md) 和
  [CORE_DESIGN.md](./packages/core/CORE_DESIGN.md)。
- 修改 analyzer：先阅读 [analyzer README](./packages/analyzer/README.md) 和对应 Phase 4 文档。
- 修改 Vite adapter：先阅读 [Vite README](./packages/vite/README.md)、
  [adapter 设计](./docs/phase-3-vite-adapter-design.md)与 tracking 文档。
- 修改真实构建验收：使用 `fixtures/vite-css-modules`，不要把 playground 变成自动门禁。
- 修改人工 Pilot：使用 `playground/vite-react-css-modules`，不要把业务展示逻辑放进 fixture。

## 架构约束

- core 只处理标准 CSS 字符串，不依赖 Vite、文件系统、CSS Modules tokens 或浏览器运行时。
- analyzer 只消费构建数据，不读取文件，也不猜测缺少 usage evidence 的 DOM class 共现。
- Vite adapter 必须复用 Vite 原生 CSS Modules 管线，不自行实现 scoped class 和 tokens 语义。
- 无法证明安全等价时保留 CSS，并产生可追踪 diagnostic 或明确失败。
- 输出顺序、class name、manifest 和 report 必须可复现。
- 不通过提高 atomization rate 改变 cascade。

## 代码与注释

- TypeScript 标识符和公共 interface 使用项目现有英文命名。
- 代码注释和仓库文档使用中文。
- 公开导出必须使用 JSDoc 说明职责、生命周期、输入输出、错误模式和关键限制。
- selector、atomic key、cascade、fallback、manifest/report 和构建生命周期注释必须解释为什么。
- 不为显而易见的赋值、循环和薄包装堆砌注释。

## 测试分层

- `packages/*/test`：快速验证包的公开 interface 和关键行为契约。
- `fixtures/vite-css-modules`：使用真实 Vite 的稳定黑盒验收。
- `playground/vite-react-css-modules`：中型人工 Pilot，不进入默认自动门禁。

改动 core 或 compiler 语义：

```bash
pnpm --filter @semantic-atomic-css/core verify
```

改动 analyzer：

```bash
pnpm --filter @semantic-atomic-css/analyzer verify
```

改动 Vite adapter 或构建产物：

```bash
pnpm --filter @semantic-atomic-css/vite verify
pnpm verify
```

改动浏览器渲染、cascade 或响应式行为：

```bash
pnpm --filter @semantic-atomic-css/vite-fixture test:visual
```

## 需要先讨论的改动

以下改动应先在对应设计文档中形成决策，再进入实现：

- 扩大输入类型、selector 或 at-rule 支持范围。
- 移除 semantic/fallback CSS 或启用 aggressive atomization。
- 改变 warning、strict、unsupported feature 或 fail-fast 语义。
- 改变 cascade、atomic key、class name、manifest/report schema。
- 引入 JSX/TSX usage metadata 或跨 class 冲突推断。
- 跨包大重构、破坏性 public interface 或新增生产依赖。

## 提交前检查

- 改动只覆盖当前目标，没有无关重构或生成物。
- 实现、测试和文档描述同一行为。
- 新行为同时覆盖成功路径和保守失败/保留路径。
- 已运行与风险匹配的最小验证集合。
- 未运行的命令及原因在交付说明中明确记录。
