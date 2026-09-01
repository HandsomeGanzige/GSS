# @semantic-atomic-css/css-loader-bridge

供 Rsbuild 与 Webpack adapter 内部复用的 css-loader array/default-locals 转换 seam。该包不是用户接入入口，
负责 rows/locals evidence、class name 环境默认、token/CSS 闭合校验、canonical source-id 聚合和 browser
owner；不拥有 loader request、compiler 生命周期、HTML 注入或构建工具配置。跨模块同权重冲突遵循全局
atomic 顺序，不继承业务 import-order winner。

css-loader adapter 未显式配置命名策略时，dev 使用 `readable-keyed`，build 使用 `compact-keyed`；所有显式策略
与 prefix 原样保留。两种 keyed 策略都使用完整 canonical key 的 128-bit FNV-1a、固定 25 位
lower-base36 摘要；`compact-keyed` 只保留固定 `c` 起始符，不携带可读基名。摘要仍由 registry collision
与 token/CSS closure 兜底，不宣称数学无碰撞。

build 遇到同一 source 的重复 evidence 时合并 export names，并以 `asset-reference` 高于
`ambiguous-export-value` 的固定优先级选择 preserve reason。dev 中同一 owner 的新 generation 替换旧快照；
不同 owner 提供同一 source 时只接受内容完全一致的快照。冲突快照无法在浏览器端安全重建 raw evidence，
因此以稳定 `unstable-dev-source-snapshot` 错误 fail fast，不按异步注册顺序猜测 fallback。
