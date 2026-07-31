# AGENTS.md

本文档只定义 AI agent 在本仓库内工作的工程约束和交付流程，不维护产品介绍、阶段状态、
路线图或待办列表。动态信息应更新到对应设计、追踪或验收文档，避免本文件再次演变为项目目标文档。

## 信息来源

开始工作前只读取与当前任务有关的资料：

| 场景 | 必读资料 |
| --- | --- |
| 了解项目入口、包结构和命令 | `README.md`、根目录 `package.json` |
| 修改产品边界或 compiler 语义 | `semantic-atomic-css-plugin-plan.md` |
| 修改 core | `packages/core/CORE_DESIGN.md`、相关测试 |
| 修改包职责或依赖方向 | `docs/phase-2-packages-architecture.md` |
| 修改 Vite adapter | `docs/phase-3-vite-adapter-design.md`、`docs/phase-3-vite-adapter-tracking.md`、相关测试 |
| 修改验收流程 | `fixtures/vite-css-modules`、对应 acceptance 文档 |
| 修改 Phase 4 行为或 analyzer 风险模型 | 对应的 `docs/phase-4-*.md`、相关测试 |
| 修改 Rsbuild adapter | `docs/phase-6-rsbuild-rspack-adapter-*.md`、相关测试 |
| 修改 verifier、dev report 或 overlay | `docs/phase-7-verifier-devtools-*.md`、相关测试 |

不要把上述文档整段复制回本文件。若代码、测试和文档互相矛盾，先确认当前实际行为和差异影响；
无法从仓库证据确定预期时，向项目 owner 说明冲突，不自行选择新的产品语义。

## 开始任务

1. 明确用户要求、允许改动的范围和完成标准。
2. 检查 `git status` 和相关文件，保留用户已有改动，不覆盖或回退无关内容。
3. 阅读上表中与任务直接相关的资料，并定位对应实现、测试和文档。
4. 选择能覆盖改动风险的最小验证集合；不要默认运行与任务无关的耗时验收。
5. 改动保持聚焦。除非任务明确要求，不顺带重构、升级依赖、调整公共 API 或处理无关问题。

## 通用工程约束

- 正确性优先于压缩率。无法证明安全等价时，保留原 CSS 并输出可追踪的 warning/report。
- 使用 PostCSS 和 `postcss-selector-parser` 处理结构化 CSS 与 selector，不用正则替代 AST 解析。
- 遵循现有 TypeScript、Vitest、包导出和命名风格；不要引入重复抽象或无必要依赖。
- 不为通过测试而削弱断言、删除 fallback、吞掉异常或降低诊断级别。
- 输出顺序、class name、manifest 和 report 必须可复现，不得依赖文件遍历或异步 transform 的完成顺序。
- 除非任务明确涉及依赖，不修改 `package.json`、lockfile 或安装依赖。
- 不删除、终止或占用来源不明的进程。开发端口被占用时使用备用端口。
- 未经明确要求，不执行提交、推送、发布或破坏性 Git 操作。

## 语言、注释与文档

- 需求、设计、追踪、验收和 README 等仓库文档使用中文。
- 代码注释使用中文；标识符、公共 API 和第三方术语沿用项目现有英文约定。
- 新增或修改类、函数、方法、导出类型和关键流程函数时，补充中文注释，说明职责、输入输出或关键约束。
- selector 安全判断、atomic key、cascade 顺序、CSS 保留、manifest/report 生成和构建工具适配等复杂逻辑，
  必须解释“为什么这样处理”，不要添加只复述代码的注释。
- 行为、配置、输出格式、风险、验收方式或阶段状态发生变化时，同步更新对应现有文档。
- 优先修改已有文档：设计决策写入设计文档，实施事实写入 tracking 文档，验证步骤写入 acceptance 文档。
  本文件仅在 AI 工作规则或长期不可妥协的工程边界变化时更新。

## 包职责边界

| 范围 | 职责 | 禁止事项 |
| --- | --- | --- |
| `packages/core` | 标准 CSS 字符串的 AST 转换、atomic/preserved CSS、manifest 和 report 数据 | 不依赖 Vite、React、CSS Modules tokens、文件系统或浏览器运行时 |
| `packages/analyzer` | 消费构建数据，分析风险、收益、体积和可证明的 declaration 冲突 | 不读取文件，不依赖 Vite，不猜测缺少 usage evidence 的 DOM class 共现 |
| `packages/devtools` | computed style verifier、style diff、dev report 协议和隔离 overlay runtime | 不转换 CSS，不读取项目文件，不依赖具体 adapter 或把 Playwright 变成生产依赖 |
| `packages/vite` | 复用 Vite 原生 CSS Modules 结果，增强 tokens，聚合 CSS 并输出 assets | 不自行实现 scoped class 或 CSS Modules 编译语义，不静默忽略不支持的配置 |
| `packages/rsbuild` | 复用 Rsbuild 原生 CSS Modules rows/locals，增强 tokens，聚合 CSS 并输出 assets | 不自行实现 scoping/ICSS/预处理器，不依赖 Vite 或 raw Rspack 私有状态 |
| `fixtures/vite-css-modules` | 小型、稳定、自动化真实 Vite 回归 fixture | 不扩展成展示型业务项目 |
| `fixtures/rsbuild-css-modules` | 小型、稳定、自动化真实 Rsbuild 回归 fixture | 不扩展成展示型业务项目 |
| `playground/vite-react-css-modules` | 中型真实场景 Pilot 和人工浏览器验收 | 未经明确决策不加入自动门禁 |
| `playground/rsbuild-react-css-modules` | 中型 Rsbuild 多入口 Pilot 和人工浏览器验收 | 未经明确决策不加入自动门禁 |

跨包改动前先确认职责归属。可以在单个包内完成的逻辑，不应通过反向依赖或复制实现扩散到其他包。

## CSS 正确性红线

- 默认只转换 `.module.css`、`.module.scss` 和 `.module.less`，不改写 JSX/TSX 中 CSS Modules 的使用方式。
- 默认保留 semantic scoped class；除非任务明确批准新的产品模式，不移除 semantic class preservation。
- unsafe selector 必须保留为 scoped fallback CSS，并在 warning/report 中记录原因。
- 每个 safe selector arm 只能有一个 local class anchor，且不得包含 tag、id、combinator、额外 class
  或 `:global`。除基础 selector 外，只能三选一：带一个已支持的 pseudo class
  （`:hover`、`:focus`、`:active`、`:disabled`、`:focus-visible`），带一个末尾
  `::before` / `::after` / `:before` / `:after`，或在同一 compound 内带一个 presence / `=` equality
  attribute。
- selector list 只有在全部 arm 都安全、可导出且未被 class-wide evidence 阻断时才能转换；任一 arm
  unsafe 时完整 rule fallback。当前含 pseudo element arm 的 selector list 仍整体 fallback。
- attribute selector 的 parser-decoded name 不得为 `class`，并且不得含 namespace、flag、其他 operator、
  多 attribute 或与 pseudo 等结构混用；attribute 可位于 local class 前后，但 identity 与 renderer
  必须保留输入 AST serializer 的 spelling、spacing 和 node order，不做语义归并。
- attribute candidate 必须在 atomic registry mutation 前完成 same-class cascade guard；无法证明等
  specificity occurrence 重排安全时，以 `attribute-cascade-order` 整类 fallback。adapter 不复制
  selector grammar 或 guard，Analyzer 也不以缺少 usage evidence 的共现猜测替代 Core 判断。
- 当前可处理的条件上下文限于已验证的 `@media` 和 `@supports` 路径。扩展 selector 或 at-rule 前，
  必须先给出语义等价依据并补充测试。
- atomic class 顺序必须稳定；同一个 local class 内保持 declaration 原始顺序。
- `!important` 必须进入 atomic key，不能与非 important declaration 复用。
- CSS custom property declaration 默认保留；使用 `var(...)` 的普通 declaration 可以 atomize。
- 不通过提高 atomization rate 改变 cascade 语义。shorthand/longhand、重复属性和 contextual rule
  等顺序敏感场景必须有针对性回归测试。
- Vite adapter 必须复用 Vite 6 原生 CSS 管线的 scoped CSS、modules tokens、资源和 dependency graph。dev/build 聚合规则的
  基础/条件分区、简单宽度断点顺序和稳定规范化顺序属于正确性约束，不得无证据移除。
- 对无法继承且可能 silent miscompile 的 CSS Modules feature 或配置应 fail fast；不要伪装为已支持。

## 测试与验证

先运行最贴近改动的测试，修复后再运行对应验收。最低要求如下：

| 改动范围 | 最低验证 |
| --- | --- |
| 仅文档 | 检查链接、路径、命令与仓库实际内容一致；通常无需运行代码测试 |
| core 实现或语义 | 更新 `packages/core/test`；运行 `pnpm --filter @semantic-atomic-css/core verify` |
| analyzer 实现或 report analysis | 运行 `pnpm --filter @semantic-atomic-css/analyzer verify`；影响 Vite report 时再运行 `pnpm verify` |
| devtools、dev report API 或 overlay | 运行 `pnpm --filter @semantic-atomic-css/devtools verify`、对应 adapter verify 和 `pnpm verify` |
| Vite adapter、CSS Modules 继承、生成 CSS、manifest/report | 更新对应测试；运行 `pnpm --filter @semantic-atomic-css/vite verify` 和 `pnpm verify` |
| Rsbuild adapter、CSS Modules 继承、生成 CSS、manifest/report | 更新对应测试；运行 `pnpm --filter @semantic-atomic-css/rsbuild verify` 和 `pnpm verify` |
| 配置保护、预处理器、资源或 analyzer 集成 | 运行 `pnpm verify` |
| 浏览器渲染、cascade、响应式或 computed style | 运行两个受影响 adapter 对应 fixture 的 `test:visual` |

新增行为必须同时覆盖成功路径和保守失败/保留路径。涉及 compiler 时重点检查 safe atomization、pseudo、
`@media`/`@supports`、unsafe preservation、custom property、`!important`、稳定输出以及
shorthand/longhand 顺序。

若受环境、权限或已有进程影响无法运行某项验证，记录未运行的命令、具体原因和已完成的替代检查，
不要把“未运行”描述为“通过”。

## 必须先确认的决策

遇到以下情况，先向项目 owner 确认，不自行扩大范围：

- 扩展到 `.module.css` 以外的输入、普通 CSS、预处理器或新的构建工具。
- 放宽 safe selector/at-rule 范围，启用 aggressive atomization，或移除 semantic/fallback CSS。
- 改变 strict mode、unsupported feature、warning 或 fail-fast 语义。
- 改变 cascade 建模、atomic key、class name、manifest/report schema 等兼容性边界。
- 引入 JSX/TSX usage metadata、跨 class 冲突推断或其他新的静态分析证据。
- 进行跨包大重构、公共 API 破坏性修改或新增生产依赖。

提出确认时应给出仓库现状、无法自行决定的原因、可选方案及各自影响。

## 完成任务

交付前必须：

1. 检查最终 diff，确认没有无关改动、临时文件或意外生成物。
2. 确认实现、测试和文档对同一行为的描述一致。
3. 运行与风险匹配的验证，并记录结果。
4. 向用户说明改了什么、验证了什么、还有哪些未验证或已知风险。
