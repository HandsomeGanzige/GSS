# @semantic-atomic-css/core

`@semantic-atomic-css/core` 是与构建工具无关的安全 CSS 转换引擎。它接收标准 CSS 字符串和
调用方提供的 class scope strategy，输出 atomic CSS、preserved fallback、class mapping、
manifest 与 report。

## 职责边界

core 负责：

- 使用 PostCSS AST 解析标准 CSS。
- 判断 selector 和 declaration 是否可以安全 atomize。
- 生成稳定 atomic key、class name 和 CSS。
- 保留无法证明安全等价的 CSS，并返回结构化 diagnostic。
- 为单次输入或 append-only build 生成 manifest 与 report。

core 不负责：

- 文件读取、文件写入和 include/exclude 匹配。
- Sass、Less 等预处理器编译。
- CSS Modules scoping、tokens 和 export 语义。
- Vite、HMR、virtual module 和 asset emit。

完整设计决策见 [CORE_DESIGN.md](./CORE_DESIGN.md)。

## 单次转换

```ts
import { transformCss } from '@semantic-atomic-css/core';

const result = transformCss({
  id: '/src/Button.module.css',
  css: '.button { color: red; }',
  scope: {
    resolveClassName(className) {
      return `Button_${className}__hash`;
    }
  }
});

console.log(result.css.atomic);
console.log(result.css.preserved);
console.log(result.classes);
```

`TransformCssResult` 始终是当前输入的快照。CSS parse error 不会直接抛出，而会返回
`parse-error` diagnostic 和空 CSS 结果。

## 跨文件聚合

```ts
import { createTransformer } from '@semantic-atomic-css/core';

const transformer = createTransformer({
  className: { strategy: 'hash', prefix: '_' }
});

transformer.transformCss(firstInput);
transformer.transformCss(secondInput);

const atomicCss = transformer.getAtomicCss();
const manifest = transformer.getManifest();
const report = transformer.getReport();
```

`createTransformer` 只适用于一次 append-only build。它不支持更新、删除或失效已处理的 id，
不得直接作为 dev/HMR 缓存。

## 正确性约束

- 无法证明安全的 selector 必须进入 preserved fallback。
- 默认保留 resolver 返回的 semantic class。
- `!important`、pseudo、media 和 supports 都参与 atomic key。
- 同一 source class 内保持 declaration 原始顺序。
- CSS custom property declaration 默认保留。
- unsupported at-rule 不会被当作可安全转换路径。

## 验证

```bash
pnpm --filter @semantic-atomic-css/core verify
```
