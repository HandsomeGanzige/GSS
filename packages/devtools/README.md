# @semantic-atomic-css/devtools

`@semantic-atomic-css/devtools` 提供构建工具无关的调试能力：Playwright-compatible
computed style verifier、逐属性 style diff report、dev report 协议和 Shadow DOM browser overlay
runtime。它不读取项目文件、不参与 CSS 转换，也不推断 DOM class 共现。

## Computed style verifier

包本身不依赖 Playwright；调用方注入 Playwright `Browser`，因此 fixture 或消费方可以自行锁定浏览器版本：

```ts
import { chromium } from 'playwright';
import {
  verifyComputedStyles,
  writeAndAssertStyleDiffReport
} from '@semantic-atomic-css/devtools';

const browser = await chromium.launch();
const report = await verifyComputedStyles({
  browser,
  baseline: { label: 'native', url: 'http://127.0.0.1:4173' },
  candidate: { label: 'semantic', url: 'http://127.0.0.1:4174' },
  viewports: [{ width: 1280, height: 900 }, { width: 520, height: 900 }],
  readySelector: '#app',
  cases: [
    {
      id: 'button',
      selector: '[data-gss-case="button"]',
      properties: ['color', 'backgroundColor']
    },
    {
      id: 'button-hover',
      selector: '[data-gss-case="button"]',
      properties: ['backgroundColor'],
      action: { type: 'hover' }
    }
  ]
});

await writeAndAssertStyleDiffReport(report, 'artifacts/style-diff.json');
await browser.close();
```

report 不写入时间戳或动态端口，只记录 label、run、viewport、case、属性值和逐属性差异，便于连续运行比较。
`writeAndAssertStyleDiffReport` 会先写出完整 JSON，再在存在差异时抛错。verifier 对空 viewports/cases/properties、
重复 case id/property 会 fail fast，不会以零比较伪造通过结果。导航等待 `load` 和可选 ready selector，因此
不会被页面持续轮询阻塞。`captureComputedStyles` 与 `createStyleDiffReport` 也可单独使用。

## Dev report 与 overlay

Vite/Rsbuild adapter 显式启用 `devtools` 后，默认提供：

- `GET /__semantic-atomic-css/report`：包含 adapter、status 和 environments 的当前 JSON envelope。
- browser overlay：同源轮询 report API，在 Shadow DOM 中展示 health、files、atomic、unsafe、preserved
  和 estimated diff。

dev envelope 把既有 `TransformReport + analysis` 原样放在 `environments[].report` 中。
endpoint 拒绝 dot-segment，两个 adapter 只处理 GET；其他 method 继续交给 dev server。overlay 的
动态文本只通过 `textContent` 写入，请求不重叠，BFCache 恢复后重启轮询。
它仅校验展示必需的当前字段；非法 payload 会显示 `GSS · offline`
和 `invalid-dev-report-payload`，不会把缺失值默认为零或 unknown。

Shadow DOM 只隔离 overlay 内部样式；连接到 `documentElement` 的 `<aside>` host 仍是一个 dev-only light DOM
节点，可能影响 `:last-child` / `:has()` 等根级结构 selector。对此敏感的项目应配置 `overlay: false`
并只使用 JSON API。

完整设计、source map 边界和验收见：

- [Phase 7 方案](../../docs/phase-7-verifier-devtools-plan.md)
- [Phase 7 验收](../../docs/phase-7-verifier-devtools-acceptance.md)
