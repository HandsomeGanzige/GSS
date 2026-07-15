# @semantic-atomic-css/analyzer

`@semantic-atomic-css/analyzer` 消费 core 和 adapter 已产生的构建数据，分析风险、收益、体积和
可以从 manifest 证明的 declaration 冲突。它不会读取文件、依赖 Vite 或改写 CSS。

## 接口

包只提供一个运行时入口：

```ts
import { analyzeBuild } from '@semantic-atomic-css/analyzer';

const analysis = analyzeBuild({
  report,
  manifest,
  modules,
  outputCss
});
```

输入必须来自同一次稳定构建快照：

- `report`：core 聚合 report。
- `manifest`：与 report 对应的 core manifest。
- `modules`：每个 CSS Module 的 scoped、atomic、preserved CSS 和 diagnostics。
- `outputCss`：adapter 最终输出的聚合 CSS。
- `unsupportedFeatures`：adapter 已确认无法继承的 feature，可选。

## 输出

`BuildAnalysis` 包含四组数据：

- `health`：`ready`、`risky` 或 `blocked` 的试用判断及原因。
- `risk`：unsafe reason、preserved 比例、高风险文件、保护失败和 declaration 冲突。
- `benefit`：source class、atomic declaration 和复用率。
- `size`：raw、gzip、brotli 和 class string 增量估算。

消费者应依赖结构化字段，不应解析自然语言 `reasons` 文案。

## 证据边界

- 只报告同一 semantic class 内可由 manifest 证明的同属性或 shorthand/longhand 冲突。
- pseudo、media、supports 或 important 层级不同的 declaration 不合并判断。
- 没有 JSX/TSX usage evidence 时，不猜测不同 class 是否会在同一 DOM 节点共现。
- 压缩指标使用 Node.js 同步 gzip/brotli，定位为构建结束阶段分析，而非请求时运行时逻辑。

## 验证

```bash
pnpm --filter @semantic-atomic-css/analyzer verify
```
