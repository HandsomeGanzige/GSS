# Compact compression revision

## 决策摘要

本文是修订提案，不代表已接受的产品决策。已确认的边界不变：所有 correctness-eligible
CSS 继续全量原子化；compact 基名必须在单次 build 中由完整 atomic key 内容寻址，
append-only registry 对相同注册序列可复现；
不恢复 Planner、不增两次 build、不做全局 dense allocation；显式 `hash` 的 `_` + 8 位 base36
字节必须精确兼容。

推荐将 compact 修订为 **32-bit FNV-1a + 固定 7 字符 lower-base36 的 CSS-safe 首位映射**：

```txt
u32      = 现有 FNV-1a 32-bit 结果
base36   = u32.toString(36).padStart(7, "0")  # 首位只可能是 0/1
compact  = (base36[0] === "0" ? "a" : "b") + base36.slice(1)
shape    = [ab][0-9a-z]{6}
length   = 7
space    = 2^32（可逆的表示映射，不再截 bit）
```

该方案在现有 Vite Pilot 的 in-memory 精确 token 替换投影中，同时消除独立 atomic CSS
和总 CSS+JS 的 raw/gzip/brotli 回退。它不需要放宽“独立 atomic gzip 允许 +4 bytes”的
门禁。如果真实重建任一已确认 corpus 仍回退，fallback 是 **不启用 compact 作为生产默认，
build 默认保持旧 hash**，而不是恢复 Planner 或改体积门禁。

## 压缩回退的根因

当前 40-bit compact 是 `[a-p][a-zA-Z0-9_-]{6}`：六个后续字符在 64 字符字母表上
接近均匀，混合大小写、数字、`_` 和 `-`。它虽然每次 class 出现比旧 hash 少 2 个 raw bytes，
却删除了旧 hash 在每个 token 中共享的 `_0` 前缀，并把剩余字符的符号集从小写 base36
扩展到 64 字符高熵符号集。gzip/brotli 因此几乎无法在 token 内复用短 substring，也要支付
更高的 literal/Huffman 成本。

Vite Pilot 已给出直接证据：259 个 atomic declarations、1,124 次 mapping token 出现完全一致，
所以差异不是 atomization rate，而是命名编码本身。

| 现有实际 build | Atomic raw | Atomic gzip | Atomic brotli | 总 CSS+JS raw | 总 gzip | 总 brotli |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 显式 hash | 17,794 | 4,284 | 3,759 | 257,428 | 81,072 | 69,939 |
| 40-bit base64url compact | 17,276 | 4,592 | 3,991 | 254,649 | 81,667 | 70,610 |
| compact - hash | -518 | **+308** | **+232** | -2,779 | **+595** | **+671** |

连续 compact build 已证明确定性，因而这不是 build 抖动，而是可重现的编码压缩回归。

## 候选比较

下表的“投影”使用当前 compact build 的 manifest `atomic.key -> className`，在内存中将所有
CSS/JS class token 换为候选的内容寻址名称，再使用 Node zlib 重测；未写入或修改 build 产物。
它能精确回答 class 字符串的压缩影响，但 Vite content-hash filename 只能由最终真实重建门禁确认。

| 方案 | 位宽 / 形状 | Atomic raw/gzip/br | 总 raw/gzip/br | 判断 |
| --- | --- | --- | --- | --- |
| 当前 40-bit base64url | 40 / 7，64 字符高熵 | 17,276 / 4,592 / 3,991 | 254,649 / 81,667 / 70,610 | 实际失败 |
| 32-bit base64url | 32 / 6，`[a-d]` + 5 个 base64url | 17,017 / 4,288 / 3,751 | 253,262 / 80,780 / 69,815 | 总产物改善，但 atomic gzip +4；仍是高熵符号集 |
| **32-bit lower-base36 mapped** | 32 / 7，`[ab][0-9a-z]{6}` | **17,276 / 4,272 / 3,726** | **254,649 / 80,945 / 69,916** | **推荐；六项都优于 hash** |
| common `a` + 7 base36 | 32 / 8，`a[01][0-9a-z]{6}` | 17,535 / 4,279 / 3,737 | 256,036 / **81,092** / 69,926 | 前缀有效，但总 gzip +20 |
| common `_` + 7 base36 | 32 / 8，`_[01][0-9a-z]{6}` | 17,535 / 4,280 / 3,749 | 256,036 / **81,134** / **70,032** | 总 gzip/brotli 回退 |
| 40-bit lower-base36 mapped | 40 / 8，小写 | 17,535 / 4,551 / 4,009 | 256,036 / 81,772 / 70,791 | 位宽导致剩余熵过高，失败 |
| 32-bit base32 | 32 / 7，小写+`2-7` | 17,276 / 4,287 / 3,739 | 254,649 / 80,920 / **69,954** | 总 brotli +15 |
| 32-bit base26 | 32 / 7，全小写 | 17,276 / **4,328** / 3,718 | 254,649 / 80,799 / 69,795 | atomic gzip +44，不应只看总量 |
| 31-bit lower-base36 mapped | 31 / 6，低熵 | 17,017 / 4,249 / 3,688 | 253,262 / 80,640 / 69,743 | 压缩最好，但故意将碰撞空间降到旧 hash 以下，不推荐 |

32-bit lower-base36 mapped 是保守平衡点：它与旧 hash 保持同一 32-bit collision domain，比旧
hash 少 2 个字符，又用两值首字符和 36 字符小写 alphabet 保留压缩局部性。31-bit/6-char
虽然在当前 Pilot 数字最好，但 birthday collision 概率是 32-bit 的两倍；只为再省 1 字符
主动弱化旧 hash 的碰撞基线不值得。

## 正确性、合法性与兼容

- `compactHashString(key)` 只依赖完整 canonical atomic key，不依赖注册顺序、文件名、
  declaration 频次或第一次 build 结果；因而仍是单 build 内容寻址。
- `[ab][0-9a-z]{6}` 始终以 ASCII letter 开头，默认无 prefix 时是合法 CSS identifier；
  显式 prefix 仍继续通过现有 `ensureValidClassName`。
- compact 恢复到 32-bit collision domain，与显式 hash 相同；不将“不碰撞”当正确性假设。
  同 key 复用同一 class；不同 key 映射到同一 compact 基名时，`AtomicRegistry` 仍用现有
  key-derived suffix 保证两者 class 唯一。append-only registry 对相同注册序列可复现；
  在极端罕见的 collision 中，不同注册顺序可能改变哪个 key 拥有基名或 suffix，
  用户已明确接受这一边界。不引入 global dense allocation。
- 显式 `hash` 仍必须使用现有 `hashString(key)`、默认 `_` prefix 和 8 位 base36；
  其现有精确测试 `_011ty7h5` 必须保留。
- readable、prefix、manifest/report schema、selector/cascade/fallback 不变。compact 本身是已批准的
  新 strategy，因此替换它尚未发布的精确编码不会破坏旧 public hash 兼容。

## Development 直接改动

1. `packages/core/src/utils/hash.ts`
   - 把现有 FNV-1a 32-bit 循环抽成一个包内 `fingerprintString32(input): number`；
     `hashString` 改为消费该 number，但保留原 `toString(36).padStart(length, '0').slice(0, length)`
     的精确行为。
   - 删除 `compactFirstAlphabet`、`compactRestAlphabet`、`compactFingerprintMask`、
     `fingerprintString64` 和现有 BigInt `encodeCompactFingerprint`。
   - 新增包内 `encodeCompactFingerprint(value: number)`：先 `value >>> 0`，生成固定 7 位
     base36，断言/保证首位为 `0 | 1`，映射为 `a | b`。`compactHashString` 改为
     `encodeCompactFingerprint(fingerprintString32(input))`。
   - 不新增依赖，不导出新 package runtime API。
2. `packages/core/src/atomizer/createAtomicClassName.ts`
   - 保持 strategy 分支和 public option 形状不变；它继续调用同名 `compactHashString`。
3. `packages/core/test/atomizer.test.ts`
   - 把 64-bit/BigInt/base64url 向量替换为 32-bit lower-base36 向量：
     `compactHashString('') === 'aztntfp'`、`hello -> 'am3bicr'`、`'原子😀' -> 'amtidhb'`；
     encoder 边界 `0 -> a000000`、`36^6 - 1 -> azzzzzz`、`36^6 -> b000000`、
     `0xffffffff -> bz141z3`；全部匹配 `/^[ab][0-9a-z]{6}$/` 且长度 7。
   - 当前 atomic input 的 compact 精确名从 `bxptpD5` 改为 `b1ty7h5`；同步 prefix、
     selector/mapping/manifest/report 的 compact 期望值。
   - 显式 hash `_011ty7h5`、readable、options matrix 和 registry suffix/二次碰撞测试不得弱化。
4. 文档
   - 将 `compact-class-contract.md`、`packages/core/CORE_DESIGN.md`、README/长期方案中的
     40-bit/FNV-64/base64url/`[a-p]...` 改为本文 32-bit/lower-base36/`[ab]...` 合同；
     Adapter 默认和兼容矩阵不改。
5. `packages/core/src/registry/AtomicRegistry.ts`、`packages/core/src/policies/defaultOptions.ts`、
   `packages/vite/src/plugin.ts`、`packages/rsbuild/src/plugin.ts`
   - 编码修订不需要修改这四处语义；仅核对现有 collision helper、compact 空 prefix、
     build compact/dev readable 和显式 hash 覆盖仍通过。

## A/B 与关闭步骤

1. 先运行 `pnpm --filter @semantic-atomic-css/core verify`，证明旧 hash 精确值、compact 向量、
   collision 和 output contract 通过。
2. 保留已有显式 hash Vite Pilot `/tmp/gss-vite-pilot-hash`；用修订后 compact 做真实
   `playground-vite-react-css-modules` build。不使用本文投影数字代替真实 build。
3. 对每个真实 A/B 分别记录：
   - `semantic-atomic.css` raw/gzip/brotli；
   - 产品 `.css` + `.js` 逐文件压缩后求和的 raw/gzip/brotli；
   - atomic declaration 数、mapping occurrences、平均 class 长度；
   - 连续两次 compact build 的文件列表、content hash 和 SHA-256。
4. Vite Pilot 关闭条件是 259 declarations / 1,124 mapping occurrences 不变，且相对
   显式 hash 的下列六项都 `<=`：atomic raw/gzip/brotli 与总 CSS+JS raw/gzip/brotli。
   **不采用“只看总产物，atomic gzip 允许小幅回退”的放宽**；32-bit lower-base36
   已有更好候选证据，无需为 6-char base64url 的 +4 bytes 修改成功标准。
5. Vite Pilot 通过后，以同一口径跑 Vite fixture、Rsbuild fixture 和 Rsbuild Pilot；同步运行
   两个 Adapter verify、root `pnpm verify` 及受影响的 fixture visual。
6. 只有四个真实 corpus 的 raw/gzip/brotli、确定性和 browser/static parity 都通过，
   Vite/Rsbuild build 默认 compact 才能保留。任一硬门禁失败时，将两个 Adapter
   build fallback 恢复为 `hash`；`compact` 可保留为显式非默认 strategy 继续评估。

## 风险与可维护性

- 从 40 bit 回到 32 bit 会增加进入 registry suffix 分支的概率，但不会让不同 key
  silent alias；该位宽与已长期支持的显式 hash 相同。极端罕见的 collision 中基名/
  suffix 归属可随注册顺序不同，该边界已接受；实施不应再降到 31 bit。
- 投影中总 brotli 相对 hash 只改善 23 bytes，因此真实重建是必需门禁，不能把当前
  in-memory 数字直接宣称为最终通过。
- lower-base36 是简单的定长编码，不依赖 corpus 字典、文件遍历或 compressor 版本选名；
  它比定制全局 codebook 更容易测试和跨构建工具复现。
- 不应根据当前 259 个 declaration 训练 alphabet 或改变 key；这会将单纯命名策略变成
  corpus-dependent/global allocation，违反已确认边界。
