# Phase 3 Vite Adapter 验收记录

## 验收命令

从仓库根目录执行：

```bash
pnpm verify:phase3
pnpm verify:phase3:visual
```

`pnpm verify:phase3` 会执行：

- `pnpm test`
- `pnpm typecheck`
- core package build
- analyzer package build
- Vite adapter package build
- `playground-vite-css-modules-acceptance` build
- `node scripts/verify-phase-3.mjs`

`pnpm verify:phase3:visual` 会执行：

- 构建 core、analyzer 和 Vite adapter package，确保 playground 使用最新 `dist`。
- 启动 `playground/vite-css-modules-acceptance` 的 semantic/native dev server。
- 分别构建 semantic/native 临时产物并启动 preview server。
- 使用 Playwright 驱动本机 Google Chrome，在桌面和窄屏视口下比对 computed style。
- 如果 Chrome 不在默认位置，可通过 `GSS_VISUAL_CHROME_EXECUTABLE` 指定可执行文件路径。

## 当前验收结果

2026-07-06 已通过：

```txt
pnpm verify:phase3
pnpm verify:phase3:visual
```

2026-07-07 Phase 4 Route A 迁移后已重新通过：

```txt
pnpm verify:phase3
pnpm verify:phase3:visual
pnpm verify:phase4
```

2026-07-07 Phase 4 visual flake 修复后已重新通过：

```txt
pnpm verify:phase4
pnpm verify:phase3:visual
```

其中 `pnpm verify:phase3:visual` 在修复后连续运行三次通过，覆盖此前不稳定的
`dev/desktop/base/cascade-active` 背景色用例。

覆盖范围：

- core 单元测试通过。
- Vite adapter 单元测试通过。
- Vite adapter tokens 测试覆盖 `asIs`、`camelCase`、`camelCaseOnly`、`dashes`、`dashesOnly`。
- Vite adapter Route A 测试覆盖 Vite 原生 `localsConvention`、`generateScopedName`、`composes`、
  `:import(...)`、`@value`、`:export` 继承，以及非 class export 不追加 atomic class。
- Vite adapter 保护测试覆盖 `modules.namedExports: true`、`diagnostics.strict: true` 和
  `css.modules: false` 显式失败；build 测试同时覆盖 Vite `css.modules.namedExports: true` 继承失败、
  GSS 显式 `modules` 配置重新启用或覆盖 Route A 的路径。
- Vite adapter fallback 测试覆盖非导出 class selector 的 `non-exported-class` 保留策略。
- analyzer 单元测试覆盖 unsafe 分布、体积估算、健康度 `risky` / `blocked` 状态。
- Vite adapter build 测试覆盖 dev/build atomic class name 策略约定：dev 默认 readable，build 默认 hash，
  且可通过 `core.className.strategy/prefix` 覆盖。
- Vite adapter build 测试覆盖显式开启 manifest/report 后的 source location 反查，包含 atomic source、
  class manifest id 和 diagnostic source。
- Vite adapter dev transform 覆盖 virtual CSS id 编码，确保 atomic CSS 不会被 Vite CSS Modules 二次 scoped。
- Vite adapter dev transform 覆盖全局 atomic CSS 去重顺序，确保后加载模块不会用重复 atomic class 覆盖
  active 状态或 `@media` 覆盖。
- Vite adapter dev transform 使用 cascade layer 固定 atomic 首次声明顺序，避免 dev 多个 virtual CSS
  style tag 中的 partial snapshot 后注入重复 atomic key，覆盖 active 状态。
- Vite adapter dev transform 覆盖 CSS Module 写文件后 full reload、dev cache 失效和重新请求后的新 tokens、
  新 atomic CSS、新 fallback CSS。
- 根项目 TypeScript typecheck 通过。
- core、analyzer、vite package 和精简 acceptance fixture build 通过。
- 自动验收不再使用 `playground/vite-react-css-modules` 作为基准；该项目保留为较大场景人工观察 playground。
- `playground/vite-css-modules-acceptance` 覆盖重复 atomic declaration、media/supports、顺序敏感 declaration、
  custom property、状态伪类、dashed/camelCase export key 和 unsafe fallback。
- acceptance fixture build 输出 `dist/assets/semantic-atomic.css`。
- `dist/index.html` 注入全局聚合 CSS asset。
- unsafe selector fallback CSS 保留在全局 CSS asset 中。
- 静态验收脚本检查 atomic asset、media/supports、`!important`、custom property、attribute fallback、
  pseudo-element fallback 和 scoped descendant fallback。
- 默认不输出 `semantic-atomic-manifest.json`。
- 默认不输出 `semantic-atomic-report.json`。
- visual 验收脚本对比 semantic/native dev 与 build preview 的 computed style，允许 className/token 字符串不同。
- visual 验收失败时会输出 semantic/native 截图、错误文本和 debug JSON，debug JSON 包含目标元素 className、
  computed style、style tag 与 stylesheet link 信息。
- Phase 4 静态验收脚本覆盖 report `analysis` 字段、Route A tokens 增强、`:import(...)`、非 class export
  保持、global fallback、Vite `css.modules: false` 显式覆盖和 Vite `css.modules.namedExports: true`
  继承失败。
- Phase 4 静态验收脚本覆盖普通 CSS asset 继续由 Vite 输出，CSS Modules scoped CSS 不重复进入 Vite
  原生 CSS asset。

## 手动检查重点

构建后可检查：

```txt
playground/vite-css-modules-acceptance/dist/index.html
playground/vite-css-modules-acceptance/dist/assets/semantic-atomic.css
```

期望：

- HTML 包含 `assets/semantic-atomic.css`。
- `semantic-atomic.css` 先输出 atomic CSS，再输出 preserved fallback CSS。
- 精简 fixture 页面包含 `data-gss-case` 验收锚点。
- dev 对照检查中，semantic/native computed style 应只允许 class token 字符串差异。
- build preview 对照检查中，semantic/native computed style 应只允许 CSS asset 与 class token 字符串差异。
- 重复 base atomic declaration 不应覆盖 active 状态或窄屏 `@media` 覆盖。
- descendant、attribute、pseudo-element 等 unsafe selector 对应 fallback 被 scoped 后保留。
- semantic 模式下 class 字符串包含 semantic scoped class 与 atomic classes。
- 默认没有 manifest/report JSON。
- 显式开启 report 时，JSON 顶层保留 core report，并包含 analyzer `analysis` 字段。

`playground/vite-react-css-modules` 仍可用于手动观察较大业务场景，但不作为自动验收基准。

## 非目标确认

本阶段不验收：

- Less/Sass。
- named exports。
- strict mode fail build。
- CSS-only HMR。
- HMR 写文件 visual 验收。
- core `invalidate(id)` 或 rebuild API。
- 与 Vite 原生 CSS Modules hash 完全一致。
