# Phase 3 Vite Dev CSS 注入问题修复笔记

## 背景

2026-07-06，在 `playground/vite-react-css-modules` 运行 Vite dev server 时发现：

- React 组件中的 `className` 已经变成 GSS adapter 生成的 tokens。
- 页面没有获得对应样式，看起来像 CSS 没有注入。
- build 产物验收正常，问题集中在 dev 阶段的 virtual CSS 注入链路。

本问题只影响 `@semantic-atomic-css/vite` 的 dev virtual CSS id 设计，不影响 core。
core 仍然只接收标准 CSS 字符串和 `ScopeStrategy`，不感知 CSS Modules、Vite 或 virtual module。

## 现象

页面中元素实际拿到的 class 类似：

```txt
Button_card__2fa2de _display_grid _gap_16px ...
```

但 Vite dev server 返回的 virtual CSS 注入模块中，选择器被二次改写为：

```css
.__display_grid_1c4bl_1 {
  display: grid;
}

._Button_card__2fa2de_1c4bl_123 ._Button_button__42392d_1c4bl_123 {
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.24);
}
```

也就是说：

- JS tokens 导出的是 `_display_grid`。
- 注入到页面的 CSS 选择器却是 `.__display_grid_1c4bl_1`。
- class 与 selector 不匹配，所以页面表现为“className 有变化，但样式没生效”。

## 排查过程

1. 先确认 core 输出正常。

   对 `Button.module.css` 调用 core 后，能得到正确的 atomic CSS 和 preserved fallback CSS：

   ```css
   ._display_grid {
     display: grid;
   }

   .Button_card__2fa2de .Button_button__42392d {
     box-shadow: 0 10px 22px rgba(37, 99, 235, 0.24);
   }
   ```

2. 再检查 Vite dev server 的 `.module.css` 响应。

   `.module.css` 被 Route B 正确拦截，并返回 JS module：

   ```js
   import "/@id/__x00__semantic-atomic-css/css.css?source=%2F...%2FButton.module.css";

   const tokens = {
     "card": "Button_card__2fa2de _display_grid ..."
   };

   export default tokens;
   ```

3. 最后检查 virtual CSS 响应。

   Vite 对 virtual CSS 继续执行了 CSS Modules 处理，因此把已经生成好的 atomic class 和 scoped
   fallback class 又 scoped 了一次。

## 根因

修复前 dev virtual CSS id 的 source query 使用真实路径明文：

```txt
virtual:semantic-atomic-css/css.css?source=/.../Button.module.css
```

虽然 virtual CSS id 本体是 `css.css`，但 Vite 判断 CSS Modules 时会查看完整 id。query 中出现
`.module.css` 后，Vite 6.0.3 会把这份 virtual CSS 也当成 CSS Modules 处理。

这导致转换链路变成：

```txt
Button.module.css
  -> GSS transform
  -> atomic CSS / preserved CSS
  -> Vite 再次按 CSS Modules transform
  -> class selector 二次 scoped
  -> 页面 class 与 CSS selector 不一致
```

## 修复

修复文件：

```txt
packages/vite/src/plugin.ts
```

修复点：

- `createVirtualCssId(id)` 不再把真实源路径通过 `encodeURIComponent` 放进 query。
- 改为复用内部 `encodeId(id)`，使用 base64url 编码 source。
- `decodeVirtualCssSource(id)` 同步改为 `decodeId(query)`。

修复后的 dev virtual CSS id 形态：

```txt
virtual:semantic-atomic-css/css.css?source=L1VzZXJzL2...
```

这样完整 id 中不再出现 `.module.css`，Vite 会把它当普通 CSS virtual module 处理，只负责注入样式，
不会再次执行 CSS Modules scoped class 改写。

## 修复后结果

修复后 virtual CSS 注入模块中的 selector 保持为 GSS 生成结果：

```css
._display_grid {
  display: grid;
}

.Button_card__2fa2de .Button_button__42392d {
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.24);
}
```

页面 class 与 CSS selector 重新匹配，dev 样式可以正常生效。

## 回归测试

新增测试文件：

```txt
packages/vite/test/pluginDev.test.ts
```

覆盖点：

- Vite dev transform `.module.css` 后，生成的 virtual CSS import 不包含 `.module.css`。
- virtual CSS transform 后包含原始 atomic selector，例如 `._color_red`。
- virtual CSS transform 后不包含 CSS Modules 导出，例如 `export const _color_red`。
- virtual CSS transform 后不包含二次 scoped selector，例如 `.__color_red_`。

## 验收

已执行并通过：

```bash
corepack pnpm verify:phase3
```

覆盖：

- core 单元测试。
- Vite adapter 单元测试。
- Vite adapter dev transform 回归测试。
- TypeScript typecheck。
- core、vite package、playground build。
- Phase 3 playground build 产物验收。
- 后续同类 dev/build 渲染等价回归由 `playground/vite-css-modules-acceptance` 和
  `pnpm verify:phase3:visual` 覆盖；较大 `vite-react-css-modules` playground 仅作为人工观察样例。

## 注意事项

- dev virtual CSS id 的 query 不应暴露真实 `.module.css` 路径。
- 后续如果新增 virtual module query 参数，需要确认完整 id 不会触发 Vite CSS Modules 判断。
- 这个修复是 adapter 层问题，不应把 CSS Modules 判断、Vite id 规则或 dev cache 逻辑下沉到 core。
- 运行中的 Vite dev server 会缓存已加载的 plugin 代码；修复 `packages/vite/dist` 后需要重启 dev server。
