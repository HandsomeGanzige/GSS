---
id: "compact-atomic-class-names"
name: "Atomic class 紧凑命名"
summary: "移除收益 Planner，并为全量安全原子化提供兼容、确定且更短的生产 class 名。"
keywords: ["atomic-class","compact-name","hash","vite","rsbuild","planner-removal"]
type: "delivery"
status: "completed"
stage: "close"
parent: "../../index.md"
owner: "root"
lease_until: "2026-08-17T05:33:17.627Z"
updated_at: "2026-08-17T04:33:17.627Z"
---

# Atomic class 紧凑命名

## Goal

<!-- workflow:goal:start -->
```json
"删除尚未提交的 declaration benefit Planner 主线，保持所有安全 CSS 全量原子化；新增 compact 命名策略并作为 Vite/Rsbuild 生产默认，同时保持开发可读名和显式 hash 兼容。"
```
<!-- workflow:goal:end -->

## Success criteria

<!-- workflow:success_criteria:start -->
```json
[
  "Planner 的 Core/Analyzer 公共接口、实现、测试、脚本和 Phase 9 文档被完整移除，既有 all-safe 转换行为恢复为单一路径。",
  "Core 提供确定、CSS-safe、无默认前缀且短于现有 9 字符 hash 的 compact 命名策略，并覆盖复用、碰撞和输出契约。",
  "Vite 与 Rsbuild 生产默认使用 compact，开发默认 readable，显式 hash 与自定义 prefix 行为保持兼容。",
  "Core、Analyzer、Vite、Rsbuild 与根 verify 通过，fixture/Pilot 的 raw、gzip、brotli 与确定性结果有记录。",
  "最终 diff 不包含已取消 Adapter Planner 项目或其他临时产物。"
]
```
<!-- workflow:success_criteria:end -->

## Confirmed decisions

<!-- workflow:confirmed_decisions:start -->
```json
[
  {
    "id": "all-safe-only",
    "summary": "所有通过正确性检查的 CSS 都原子化，不根据估算负收益回退。组件 fallback 仅由 selector/cascade/unsupported 等正确性证据决定。",
    "evidence": [
      "用户确认 2026-08-17"
    ]
  },
  {
    "id": "remove-planner",
    "summary": "删除当前尚未提交的 Planner/Core Analyzer 实现及对应 Phase 9 文档和脚本。",
    "evidence": [
      "用户明确同意"
    ]
  },
  {
    "id": "compact-default",
    "summary": "新增 compact 策略并作为 Vite/Rsbuild 生产默认；开发态 readable、显式 hash 和 prefix 保持兼容。",
    "evidence": [
      "用户明确同意"
    ]
  },
  {
    "id": "compact-collision-suffix",
    "summary": "compact 不同 key 偶然同名时沿用现有 registry suffix；接受极端碰撞下 base/suffix 归属可能受注册顺序影响，不引入 fail-fast、全局收集或两阶段构建。",
    "evidence": [
      "用户明确确认 2026-08-17",
      "compact 与旧 hash 使用相同 32-bit collision domain"
    ]
  }
]
```
<!-- workflow:confirmed_decisions:end -->

## Current progress

<!-- workflow:current_progress:start -->
```json
"用户接受 compact 极端碰撞继续沿用 suffix 与既有顺序取舍；正在修正旧 40-bit 架构材料并恢复独立验证。"
```
<!-- workflow:current_progress:end -->

## Todo

<!-- workflow:todo:start -->
```json
[
  {
    "id": "align-goal",
    "text": "Confirm goal, success criteria, and boundaries.",
    "status": "completed",
    "assignment": "",
    "blockers": []
  },
  {
    "id": "settle-contract",
    "text": "确定 compact 编码、碰撞语义、兼容边界与 Planner 清理清单",
    "status": "completed",
    "assignment": "",
    "blockers": []
  },
  {
    "id": "implement-change",
    "text": "移除 Planner 并实现 Core/Adapter compact 命名及测试文档",
    "status": "completed",
    "assignment": "",
    "blockers": []
  },
  {
    "id": "verify-change",
    "text": "执行独立测试、审查、修复与最终验收",
    "status": "completed",
    "assignment": "",
    "blockers": []
  }
]
```
<!-- workflow:todo:end -->

## Assignments

<!-- workflow:assignments:start -->
```json
[
  {
    "id": "compact-contract-architecture",
    "role": "architecture",
    "status": "completed",
    "objective": "基于当前 Core/Adapter 实现，给出 implementation-ready 的 compact class 编码、默认 prefix、碰撞/确定性语义、公共兼容策略，以及精确的 Planner 清理清单。",
    "successCriteria": [
      "明确 compact 输出字符集、固定或变长长度、hash 位宽与 CSS identifier 合法性。",
      "明确 collision 时 correctness 与乱序确定性策略，不弱化现有契约。",
      "明确 readable/hash/compact 与显式 prefix 的兼容矩阵，以及 Vite/Rsbuild dev/build 默认。",
      "列出 Planner 新增文件及已修改文件中必须删除的符号/段落，避免覆盖此前非 Planner 改动。",
      "给出 Core、Adapter、fixture/Pilot 最小测试与体积验收矩阵。"
    ],
    "read": [
      "AGENTS.md",
      "README.md",
      "package.json",
      "packages/core/CORE_DESIGN.md",
      "packages/core/src/atomizer/createAtomicClassName.ts",
      "packages/core/src/utils/hash.ts",
      "packages/core/src/utils/sanitize.ts",
      "packages/core/src/registry/AtomicRegistry.ts",
      "packages/core/src/public/types.ts",
      "packages/core/src/policies/defaultOptions.ts",
      "packages/core/test/atomizer.test.ts",
      "packages/core/test/selectorOutputContract.test.ts",
      "packages/vite/src/plugin.ts",
      "packages/vite/src/types.ts",
      "packages/rsbuild/src/plugin.ts",
      "packages/rsbuild/src/types.ts",
      "git diff",
      "docs/phase-9-declaration-benefit-optimization-*.md",
      "scripts/"
    ],
    "write": [
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md"
    ],
    "decisions": [
      "所有正确性 eligible CSS 都原子化，不做收益筛选。",
      "删除未提交 Planner 主线。",
      "新增 compact 并作为生产默认；dev readable、显式 hash/prefix 兼容。",
      "不新增生产依赖，不扩展 selector/cascade 语义。"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "workspace-write"
      ],
      "available": [
        "workspace-read",
        "workspace-write",
        "shell"
      ],
      "unavailable": [
        "web-search"
      ]
    },
    "agentId": "/root/compact_name_architect",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": true,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "推荐 40-bit FNV-1a fingerprint 编码为固定 7 字符 [a-p][A-Za-z0-9_-]{6}，compact 无默认 prefix，Core 默认仍保持 readable + _。",
        "保留 registry 碰撞 suffix 与 Adapter 稳定注册语义；build 默认 compact、dev 默认 readable，显式 readable/hash/compact/prefix 均兼容。",
        "已提供 Planner 精确删除清单和 Core/Analyzer/双 Adapter/真实 corpus 验收矩阵。"
      ],
      "artifacts": [
        {
          "path": ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
          "purpose": "implementation-ready compact 命名、兼容、清理和验收合同。"
        }
      ],
      "files": [
        "packages/core/src/atomizer/createAtomicClassName.ts",
        "packages/core/src/utils/hash.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/src/public/types.ts",
        "packages/core/src/policies/defaultOptions.ts",
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/src/index.ts",
        "packages/analyzer/src/index.ts",
        "packages/vite/src/plugin.ts",
        "packages/rsbuild/src/plugin.ts",
        "packages/core/CORE_DESIGN.md",
        "README.md"
      ],
      "checks": [
        {
          "command": "git diff/status and Planner symbol/file inventory",
          "result": "passed"
        },
        {
          "command": "Contract traceability check",
          "result": "passed"
        },
        {
          "command": "git diff --check -- architecture material",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "新增公共命名策略并改变双 Adapter 生产默认输出，必须独立验证碰撞、确定性、显式兼容、浏览器等价和真实压缩体积。",
      "requires_review": true,
      "review_reason": "40-bit 编码、strategy-aware prefix、registry 碰撞边界及跨多个脏文件的 Planner 定向清理都需要独立审查。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "implement-compact-and-remove-planner",
    "role": "development",
    "status": "completed",
    "objective": "按 architecture contract 定向删除未提交 Planner 主线，恢复单一 all-safe transformer；实现 Core compact 策略、双 Adapter 生产默认、相关测试和中文文档，并完成风险匹配验证。",
    "successCriteria": [
      "逐项删除 Planner runtime/type/analyzer/engine/test/script/docs/work-item 产物，保留同文件中 selector/cascade 等非 Planner 改动。",
      "实现 40-bit/7 字符 CSS-safe compact，Core 默认 readable+_，显式 hash 精确输出不变，compact 未显式 prefix 时为空。",
      "Vite/Rsbuild build 默认 compact、dev 默认 readable，显式 readable/hash/compact/prefix 覆盖符合兼容矩阵。",
      "补齐 Core 精确向量/options/registry/output 测试和双 Adapter 默认/显式/确定性测试；不扩展 selector 或 Vite dev fail-fast。",
      "运行 Core、Analyzer、Vite、Rsbuild verify 和 pnpm verify；运行可行的 fixture/Pilot 构建及 hash-vs-compact 体积比较并报告任何未运行项。",
      "最终 git diff 无 Planner 符号残留、无临时结果，git diff --check 通过。"
    ],
    "read": [
      "AGENTS.md",
      "README.md",
      "package.json",
      "packages/core/CORE_DESIGN.md",
      "docs/phase-2-packages-architecture.md",
      "docs/phase-3-vite-adapter-design.md",
      "docs/phase-3-vite-adapter-tracking.md",
      "docs/phase-6-rsbuild-rspack-adapter-design.md",
      "docs/phase-6-rsbuild-rspack-adapter-tracking.md",
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
      "git diff",
      "git status",
      "HEAD versions of modified files",
      "packages/core/**",
      "packages/analyzer/**",
      "packages/vite/**",
      "packages/rsbuild/**",
      "fixtures/**",
      "playground/**",
      "semantic-atomic-css-plugin-plan.md",
      "docs/phase-8-capability-hardening-backlog.md"
    ],
    "write": [
      "packages/core",
      "packages/analyzer",
      "packages/vite",
      "packages/rsbuild",
      "README.md",
      "semantic-atomic-css-plugin-plan.md",
      "docs",
      "scripts",
      ".agent-work/work-items/benefit-aware-build-planner",
      ".agent-work/work-items/benefit-aware-adapter-builds",
      ".agent-work/index.md"
    ],
    "decisions": [
      "所有 correctness-eligible CSS 全量原子化；不保留收益 Planner。",
      "compact=40-bit FNV-1a fingerprint 的固定 7 字符 [a-p][A-Za-z0-9_-]{6}；默认无 prefix。",
      "Core 直接默认 readable+_；Adapter build compact、dev readable；显式 hash 和 prefix 兼容。",
      "保留现有 registry collision suffix 语义；不在本批增加 Vite dev collision fail-fast。",
      "不得用破坏性 checkout/reset 覆盖脏工作树；按 architecture 清单定向 patch。"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "workspace-write",
        "shell"
      ],
      "available": [
        "workspace-read",
        "workspace-write",
        "shell"
      ],
      "unavailable": [
        "browser"
      ]
    },
    "agentId": "/root/compact_name_developer",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": true,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "已删除 Planner 主线并实现 32-bit FNV-1a、固定 7 字符 [ab][0-9a-z]{6} compact，保留 explicit hash、prefix、碰撞 suffix 和 all-safe 语义。",
        "Vite Pilot 真实 A/B 六项均优于 hash，连续构建 14 个文件 SHA-256 完全一致。",
        "Rsbuild Pilot 构建成功，剩余失败来自旧 inspector 的等价 attribute selector 字符串判断，转独立后续修复。"
      ],
      "artifacts": [],
      "files": [
        "README.md",
        "semantic-atomic-css-plugin-plan.md",
        "docs/phase-3-acceptance.md",
        "docs/phase-3-vite-adapter-design.md",
        "docs/phase-3-vite-adapter-tracking.md",
        "docs/phase-6-rsbuild-rspack-adapter-tracking.md",
        "docs/phase-8-capability-hardening-backlog.md",
        "packages/core/CORE_DESIGN.md",
        "packages/core/src/atomizer/createAtomicClassName.ts",
        "packages/core/src/policies/defaultOptions.ts",
        "packages/core/src/public/types.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/src/utils/hash.ts",
        "packages/core/test/atomizer.test.ts",
        "packages/core/test/contract.test.ts",
        "packages/vite/README.md",
        "packages/vite/src/plugin.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/rsbuild/README.md",
        "packages/rsbuild/src/plugin.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts",
        "packages/rsbuild/test/plugin.test.ts"
      ],
      "checks": [
        {
          "command": "Core/Analyzer/Vite/Rsbuild verify + pnpm verify",
          "result": "passed"
        },
        {
          "command": "Vite Pilot hash/compact six-metric A/B and determinism",
          "result": "passed"
        },
        {
          "command": "Rsbuild Pilot acceptance (inspector spelling mismatch)",
          "result": "failed"
        },
        {
          "command": "Planner residual scan + git diff --check",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "命名编码、碰撞处理及两个 Adapter 的生产默认均改变，需要独立测试复核真实构建产物与跨语料确定性。",
      "requires_review": true,
      "review_reason": "新增 public strategy 并改变生产构建默认命名，需独立审查兼容矩阵、文档一致性及 Planner 删除边界。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "revise-compact-compression",
    "role": "architecture",
    "status": "completed",
    "objective": "针对 7 字符 40-bit base64url compact 在 Vite Pilot 中 raw 改善但 gzip/brotli 回退的证据，设计可在单次构建保持内容寻址与显式 hash 兼容、且真实压缩不回退的紧凑编码修订。",
    "successCriteria": [
      "解释当前方案压缩回退的根因，并以实际 Pilot 数字为依据。",
      "比较至少 32-bit lower-base36 CSS-safe 7 字符、保留公共前缀的 8 字符、以及其他无需全局收集的候选。",
      "推荐一个实现规模受控的候选与 fallback 判定，并明确碰撞、合法性、compatibility、raw/gzip/brotli预期。",
      "提供 Development 可直接实施与测量的最小改动和 A/B corpus 验收步骤；不得恢复收益 Planner或双构建。"
    ],
    "read": [
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
      "packages/core/src/utils/hash.ts",
      "packages/core/src/atomizer/createAtomicClassName.ts",
      "packages/core/src/registry/AtomicRegistry.ts",
      "packages/core/test/atomizer.test.ts",
      "packages/vite/src/plugin.ts",
      "packages/rsbuild/src/plugin.ts",
      "playground/vite-react-css-modules",
      "playground/rsbuild-react-css-modules",
      "/tmp"
    ],
    "write": [
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md"
    ],
    "decisions": [
      "所有 correctness-eligible CSS 全量原子化，不能按收益选择 preserved。",
      "单次构建、内容寻址、顺序稳定；不使用全局密集编号。",
      "显式 hash 精确兼容，Core 默认 readable；生产 compact 只有在真实 raw/gzip/brotli 均不回退时才可成为默认。",
      "Vite Pilot 证据：compact atomic raw -518，但 gzip +308、brotli +232；总 CSS+JS raw -2779，但 gzip +595、brotli +671。"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "shell"
      ],
      "available": [
        "workspace-read",
        "workspace-write",
        "shell"
      ],
      "unavailable": [
        "web-search"
      ]
    },
    "agentId": "/root/compact_name_architect",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": true,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "推荐固定 7 字符 [ab][0-9a-z]{6} 的 32-bit lower-base36 映射；投影中 atomic 与总 CSS+JS 的 raw/gzip/brotli 六项均优于显式 hash。",
        "不接受 6-char base64url 的 atomic gzip +4，也不降到 31 bit；任一真实 corpus 回退时生产默认保持 hash。",
        "修订保持单 build、内容寻址、现有 collision suffix 与显式 hash 精确输出。"
      ],
      "artifacts": [
        {
          "path": ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md",
          "purpose": "压缩根因、候选实测、推荐编码及 A/B 关闭步骤。"
        }
      ],
      "files": [
        "packages/core/src/utils/hash.ts",
        "packages/core/src/atomizer/createAtomicClassName.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/src/policies/defaultOptions.ts",
        "packages/core/test/atomizer.test.ts",
        "packages/vite/src/plugin.ts",
        "packages/rsbuild/src/plugin.ts"
      ],
      "checks": [
        {
          "command": "Vite Pilot manifest declaration/mapping parity",
          "result": "passed"
        },
        {
          "command": "候选 token 内存替换后 gzip/brotli A/B",
          "result": "passed"
        },
        {
          "command": "git diff --check -- revision material",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "投影的总 brotli 优势仅 23 bytes，必须真实重建双 Adapter fixture/Pilot、连续构建及视觉验收。",
      "requires_review": true,
      "review_reason": "编码位宽、压缩门禁、碰撞域与生产 fallback 共同决定公共 build 输出。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "fix-rsbuild-pilot-inspector",
    "role": "development",
    "status": "completed",
    "objective": "修复 Rsbuild Pilot artifact inspector 对语义等价 attribute selector 引号压缩的误判，不放宽 class/selector boundary 校验，并重跑 acceptance。",
    "successCriteria": [
      "inspector 将 manifest 中带引号的合法 equality attribute value 与构建 CSS 中等价的无引号 serialization 识别为同一 selector。",
      "仍拒绝更长 class 前缀、不同 attribute value、不同 operator 或其他 selector 误命中。",
      "新增/扩展 inspector 自检覆盖 quoted/unquoted 正向与非等价反向场景。",
      "playground-rsbuild-react-css-modules acceptance 通过且 git diff --check 通过。"
    ],
    "read": [
      "AGENTS.md",
      "playground/rsbuild-react-css-modules/package.json",
      "playground/rsbuild-react-css-modules/scripts/inspect-artifacts.mjs",
      "playground/rsbuild-react-css-modules/dist/semantic",
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/CORE_DESIGN.md"
    ],
    "write": [
      "playground/rsbuild-react-css-modules/scripts/inspect-artifacts.mjs"
    ],
    "decisions": [
      "只修 verifier 的 serialization-equivalence 判断，不改变 Core selector grammar、manifest descriptor 或生产 CSS。",
      "不得用简单去引号全局替换放宽 selector boundary；必须结构化或受限规范化 equality attribute value。",
      "保留现有 exact selector 更长前缀防误命中。"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "workspace-write",
        "shell"
      ],
      "available": [
        "workspace-read",
        "workspace-write",
        "shell"
      ],
      "unavailable": [
        "browser"
      ]
    },
    "agentId": "/root/compact_name_developer",
    "dependsOn": [
      "implement-compact-and-remove-planner"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "Rsbuild Pilot inspector 现在将合法 equality attribute 的带引号/无引号序列化视为等价，同时保留精确 selector/class 边界。",
        "新增正反自检覆盖 quote 等价、更长 class、不同 name/value/operator 和非法无引号值。"
      ],
      "artifacts": [],
      "files": [
        "playground/rsbuild-react-css-modules/scripts/inspect-artifacts.mjs"
      ],
      "checks": [
        {
          "command": "pnpm --filter playground-rsbuild-react-css-modules acceptance",
          "result": "passed"
        },
        {
          "command": "git diff --check -- Rsbuild Pilot inspector",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "自定义 selector serialization matcher 需要独立边界验证。",
      "requires_review": true,
      "review_reason": "受限 CSS identifier parsing 与 selector variant 生成需独立审查是否误放宽。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "independent-compact-test",
    "role": "test",
    "status": "completed",
    "objective": "独立验证 Planner 已彻底移除、compact/hash/readable 兼容、双 Adapter 默认、真实压缩收益、确定性和 Rsbuild Pilot inspector 边界。",
    "successCriteria": [
      "Core/Analyzer/Vite/Rsbuild/root verify 全部通过，且 Planner 符号/文件负向检查无残留。",
      "compact 精确形状/向量、prefix 矩阵、显式 hash 固定输出、collision suffix 与 output contract 有独立证据。",
      "Vite Pilot 真实 hash/compact A/B 六项不回退，连续 compact 构建确定；Rsbuild Pilot acceptance 通过。",
      "inspector quoted/unquoted equality 正向及更长 class/不同 name-value-operator 反向边界成立。",
      "尝试两个 fixture visual；若环境不可用，精确记录未运行原因，不冒充通过。"
    ],
    "read": [
      "AGENTS.md",
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md",
      "git diff",
      "git status",
      "packages/core",
      "packages/analyzer",
      "packages/vite",
      "packages/rsbuild",
      "fixtures",
      "playground",
      "README.md",
      "semantic-atomic-css-plugin-plan.md",
      "docs"
    ],
    "write": [],
    "decisions": [
      "所有 eligible CSS 全量原子化；Planner 删除。",
      "compact=[ab][0-9a-z]{6}，build 默认 compact/dev readable，显式 hash/prefix 兼容。",
      "真实 atomic 与总 CSS+JS raw/gzip/brotli 任一不得劣于 hash。",
      "测试只读，不修改生产或测试文件。"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "shell"
      ],
      "available": [
        "workspace-read",
        "shell"
      ],
      "unavailable": [
        "browser-tool"
      ]
    },
    "agentId": "/root/compact_name_test",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "Core/Analyzer/Vite/Rsbuild/root verify、Planner 清理、compact/hash/prefix/collision/output 契约及双 fixture visual 全通过。",
        "Vite Pilot compact 相对 hash：atomic raw/gzip/brotli -518/-12/-33 bytes，总 CSS+JS -2784/-125/-53 bytes，declarations/mapping 不变。",
        "连续构建 14 文件一致；Rsbuild Pilot acceptance 与 inspector 正反边界通过。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/utils/hash.ts",
        "packages/core/src/atomizer/createAtomicClassName.ts",
        "packages/core/src/policies/defaultOptions.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/test/atomizer.test.ts",
        "packages/core/test/contract.test.ts",
        "packages/analyzer/src/index.ts",
        "packages/vite/src/plugin.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/rsbuild/src/plugin.ts",
        "packages/rsbuild/test/plugin.test.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts",
        "playground/rsbuild-react-css-modules/scripts/inspect-artifacts.mjs",
        "fixtures/vite-css-modules/scripts/verify-visual.mjs",
        "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs"
      ],
      "checks": [
        {
          "command": "Core/Analyzer/Vite/Rsbuild verify + pnpm verify",
          "result": "passed"
        },
        {
          "command": "Planner negative scan and Core runtime export",
          "result": "passed"
        },
        {
          "command": "Compact vectors/prefix/collision/output/defaults/determinism",
          "result": "passed"
        },
        {
          "command": "Fresh Vite Pilot six-metric A/B and SHA-256",
          "result": "passed"
        },
        {
          "command": "Rsbuild Pilot acceptance and inspector boundaries",
          "result": "passed"
        },
        {
          "command": "Vite fixture visual",
          "result": "passed"
        },
        {
          "command": "Rsbuild fixture visual",
          "result": "passed"
        },
        {
          "command": "git diff --check",
          "result": "passed"
        }
      ],
      "requires_test": null,
      "test_reason": null,
      "requires_review": null,
      "review_reason": null,
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "independent-compact-review",
    "role": "review",
    "status": "completed",
    "objective": "独立审查最终 diff 是否满足全量安全原子化、Planner 精确清理、compact 编码/碰撞/兼容、Adapter 默认和 inspector 受限等价判断，识别正确性或维护性缺陷。",
    "successCriteria": [
      "按 AGENTS.md 与 architecture contract 核对 spec 和代码，不把测试通过替代语义审查。",
      "确认 32-bit lower-base36 编码覆盖完整 u32、CSS 合法、旧 hash 精确兼容、prefix 空值和 collision suffix 正确。",
      "确认 Planner 清理未误删 selector/cascade 非 Planner 工作，公共出口/Analyzer/文档无残留或矛盾。",
      "确认 Vite/Rsbuild production/dev 默认和显式覆盖一致，确定性前提未被破坏。",
      "确认 Rsbuild inspector 规范化仅覆盖合法 equality attribute value，没有 selector grammar 放宽或误命中。"
    ],
    "read": [
      "AGENTS.md",
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md",
      "git diff",
      "git status",
      "packages/core",
      "packages/analyzer",
      "packages/vite",
      "packages/rsbuild",
      "playground/rsbuild-react-css-modules/scripts/inspect-artifacts.mjs",
      "README.md",
      "semantic-atomic-css-plugin-plan.md",
      "docs"
    ],
    "write": [],
    "decisions": [
      "用户确认删除 Planner、全量安全转换和 compact 生产默认。",
      "最终编码为 32-bit [ab][0-9a-z]{6}，不是首版 40-bit/base64url。",
      "不扩展 selector/cascade/fail-fast；显式 hash/prefix 兼容。"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "code-search"
      ],
      "available": [
        "workspace-read",
        "code-search",
        "diff",
        "shell"
      ],
      "unavailable": [
        "browser"
      ]
    },
    "agentId": "/root/compact_name_review",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "[P2] Vite 在 transform 完成顺序中提前注册 declaration；compact 发生 32-bit 碰撞时 base/suffix 归属随异步顺序变化，现有反序测试没有制造碰撞。",
        "[P2] 初始 architecture contract 仍保留已废弃的 40-bit/base64url 描述，与最终 32-bit revision 矛盾。",
        "u32 映射、显式 hash/prefix/suffix、Planner 清理、Adapter 默认和 inspector 受限规范化未发现其他缺陷。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/utils/hash.ts",
        "packages/core/src/policies/defaultOptions.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/test/atomizer.test.ts",
        "packages/vite/src/plugin.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/rsbuild/src/plugin.ts",
        "packages/rsbuild/src/buildArtifacts.ts",
        "playground/rsbuild-react-css-modules/scripts/inspect-artifacts.mjs",
        ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
        ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md"
      ],
      "checks": [
        {
          "command": "Compact encoder/hash/prefix/collision static review",
          "result": "passed"
        },
        {
          "command": "Planner cleanup and selector/cascade preservation review",
          "result": "passed"
        },
        {
          "command": "Vite/Rsbuild build-order determinism trace",
          "result": "failed"
        },
        {
          "command": "Superseded 40-bit documentation scan",
          "result": "failed"
        },
        {
          "command": "Rsbuild inspector boundary review",
          "result": "passed"
        }
      ],
      "requires_test": null,
      "test_reason": null,
      "requires_review": null,
      "review_reason": null,
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "reconcile-compact-contract",
    "role": "architecture",
    "status": "completed",
    "objective": "将初始 compact architecture contract 更新为最终 32-bit lower-base36 方案，并记录用户接受 collision suffix 的极端顺序取舍，消除与 revision 和生产文档的矛盾。",
    "successCriteria": [
      "compact-class-contract.md 的编码、regex、向量、实现面和验收全部改为 32-bit [ab][0-9a-z]{6}。",
      "删除或明确标记所有 40-bit/FNV-64/base64url superseded 描述，不与 compact-compression-revision.md 冲突。",
      "collision 段明确同 key 复用、异 key suffix、append-only 注册序列可复现，以及用户接受极端碰撞下 suffix 归属顺序差异。",
      "不修改生产代码、测试或 Work Item index，git diff --check 通过。"
    ],
    "read": [
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md",
      "packages/core/src/utils/hash.ts",
      "packages/core/src/registry/AtomicRegistry.ts",
      "packages/core/test/atomizer.test.ts",
      "packages/core/CORE_DESIGN.md",
      "README.md"
    ],
    "write": [
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md"
    ],
    "decisions": [
      "最终 compact 是现有 32-bit FNV 的 7 字符 [ab][0-9a-z]{6} 编码。",
      "不同 key 同名继续使用 suffix；用户接受极端碰撞下 suffix 归属可能依赖注册顺序。",
      "不引入 fail-fast、全局收集、两阶段构建或 Planner。"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "workspace-write"
      ],
      "available": [
        "workspace-read",
        "workspace-write",
        "shell"
      ],
      "unavailable": [
        "web-search"
      ]
    },
    "agentId": "/root/compact_name_architect",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": true,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "Initial contract 现已记录最终 32-bit FNV-1a 固定 [ab][0-9a-z]{6} lower-base36 实现。",
        "Collision 合同明确接受 base/suffix 归属随注册顺序差异，同时保持同序列可复现与 class 唯一。",
        "已移除过时编码和 fail-fast 提案，并明确不引入全局收集、两阶段、Planner 或 selector/cascade 变化。"
      ],
      "artifacts": [
        {
          "path": ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
          "purpose": "与 compression revision 对齐的最终实现和验收合同。"
        }
      ],
      "files": [
        "packages/core/src/utils/hash.ts",
        "packages/core/src/atomizer/createAtomicClassName.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/test/atomizer.test.ts",
        "packages/core/CORE_DESIGN.md",
        "README.md"
      ],
      "checks": [
        {
          "command": "git diff --check -- compact-class-contract.md",
          "result": "passed"
        },
        {
          "command": "Superseded encoding/vector/regex residual scan",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "合同覆盖公共命名、碰撞、Adapter 默认、压缩与确定性，独立验证仍有意义。",
      "requires_review": true,
      "review_reason": "最终兼容和验收合同需要与实现及证据独立核对。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "compact-contract-rereview",
    "role": "rereview",
    "status": "completed",
    "objective": "复核首次 Review 的两项问题是否已按用户决策关闭：碰撞 suffix 顺序取舍已被明确接受并记录，初始 architecture contract 已完全更新为最终 32-bit 编码。",
    "successCriteria": [
      "核对 Work Item decision、两份 architecture materials、Core design/README 与实现对 collision suffix 的描述一致，不再把已接受取舍当未解决缺陷。",
      "确认 compact-class-contract.md 无 40-bit/FNV-64/base64url/旧 regex/vector 残留，且与 revision 和实现一致。",
      "确认没有因文档修复引入 fail-fast、全局收集、两阶段或 selector/cascade 扩展。",
      "检查最终 diff 是否还有其他由该修复引入的 actionable defect。"
    ],
    "read": [
      "AGENTS.md",
      ".agent-work/work-items/compact-atomic-class-names/index.md",
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md",
      "packages/core/src/utils/hash.ts",
      "packages/core/src/registry/AtomicRegistry.ts",
      "packages/core/CORE_DESIGN.md",
      "README.md",
      "git diff",
      "git status"
    ],
    "write": [],
    "decisions": [
      "用户接受不同 key compact 碰撞时沿用 suffix及极端注册顺序归属差异。",
      "最终 compact 为 32-bit [ab][0-9a-z]{6}，不采用 40-bit/base64url。",
      "不引入 fail-fast、全局收集、两阶段或 Planner。"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "code-search"
      ],
      "available": [
        "workspace-read",
        "code-search",
        "diff",
        "shell"
      ],
      "unavailable": [
        "browser"
      ]
    },
    "agentId": "/root/compact_name_review",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "[P3] compression revision 仍声称 Adapter build 按稳定 source-id 注册，与已接受的碰撞顺序边界矛盾，需要标记该断言 superseded 或限定为同一注册序列。",
        "初始 compact contract 已完全对齐最终 32-bit 方案，无有效旧向量/regex。",
        "未引入 fail-fast、全局收集、两阶段、Planner 或 selector/cascade 扩展。"
      ],
      "artifacts": [],
      "files": [
        ".agent-work/work-items/compact-atomic-class-names/index.md",
        ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
        ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md",
        "packages/core/src/utils/hash.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/CORE_DESIGN.md",
        "README.md"
      ],
      "checks": [
        {
          "command": "Final compact encoding/vector/implementation consistency",
          "result": "passed"
        },
        {
          "command": "Collision decision documentation alignment",
          "result": "failed"
        },
        {
          "command": "Forbidden expansion scan",
          "result": "passed"
        },
        {
          "command": "git diff --check",
          "result": "passed"
        }
      ],
      "requires_test": null,
      "test_reason": null,
      "requires_review": null,
      "review_reason": null,
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "reconcile-compression-collision-text",
    "role": "architecture",
    "status": "completed",
    "objective": "修正 compact-compression-revision.md 中与用户已接受 collision suffix 顺序取舍矛盾的稳定 source-id 注册断言，使两份材料和实现一致。",
    "successCriteria": [
      "删除或限定 Adapter 稳定 source-id 注册断言，不再承诺碰撞场景跨注册顺序同名分配。",
      "明确同一注册序列可复现、不同 key 同名仍唯一并加 suffix、极端碰撞的 base/suffix 归属顺序差异已被用户接受。",
      "不改编码、压缩数字、生产代码或其他决策，residual scan 与 git diff --check 通过。"
    ],
    "read": [
      ".agent-work/work-items/compact-atomic-class-names/index.md",
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md",
      "packages/core/src/registry/AtomicRegistry.ts",
      "packages/vite/src/plugin.ts",
      "packages/rsbuild/src/buildArtifacts.ts"
    ],
    "write": [
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md"
    ],
    "decisions": [
      "用户接受 collision suffix 与极端注册顺序归属差异。",
      "同一注册序列仍必须可复现，collision 仍必须生成唯一 class。"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "workspace-write"
      ],
      "available": [
        "workspace-read",
        "workspace-write",
        "shell"
      ],
      "unavailable": [
        "web-search"
      ]
    },
    "agentId": "/root/compact_name_architect",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "已删除 compression revision 中错误的稳定 source-id 注册断言。",
        "材料现明确同序列可复现、suffix 保证唯一，以及用户接受罕见碰撞下的顺序归属差异。"
      ],
      "artifacts": [
        {
          "path": ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md",
          "purpose": "压缩决策记录与 append-only collision 合同一致。"
        }
      ],
      "files": [
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/vite/src/plugin.ts",
        "packages/rsbuild/src/plugin.ts"
      ],
      "checks": [
        {
          "command": "Stable source-id/order-independent residual scan",
          "result": "passed"
        },
        {
          "command": "git diff --check -- compression revision",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "独立测试应验证同序列可复现与 collision 唯一性，不断言跨顺序归属。",
      "requires_review": true,
      "review_reason": "修订文字定义接受的确定性边界，需要最终复核。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "final-compact-rereview",
    "role": "rereview",
    "status": "completed",
    "objective": "最终复核已接受的 collision suffix 边界、两份 architecture materials、实现、测试与文档是否完全一致，并确认此前 Review findings 全部关闭且无新缺陷。",
    "successCriteria": [
      "compact-class-contract 与 compact-compression-revision 均准确描述 32-bit [ab][0-9a-z]{6} 和已接受的 suffix 顺序边界。",
      "实现/测试只要求同注册序列可复现与 collision class 唯一，不错误承诺或错误测试跨碰撞顺序同名。",
      "首次 Review 的旧 40-bit 文档矛盾和稳定 source-id 断言已关闭。",
      "Planner 无恢复，公共兼容、Adapter 默认、inspector 边界和验证证据无矛盾。",
      "最终 diff 无其他 actionable defect，git diff --check 通过。"
    ],
    "read": [
      "AGENTS.md",
      ".agent-work/work-items/compact-atomic-class-names/index.md",
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
      ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md",
      "git diff",
      "git status",
      "packages/core",
      "packages/analyzer",
      "packages/vite",
      "packages/rsbuild",
      "playground/rsbuild-react-css-modules/scripts/inspect-artifacts.mjs",
      "README.md",
      "semantic-atomic-css-plugin-plan.md",
      "docs"
    ],
    "write": [],
    "decisions": [
      "用户接受 compact collision suffix 和极端注册顺序归属差异。",
      "最终编码 32-bit [ab][0-9a-z]{6}，build compact/dev readable，显式 hash/prefix 兼容。",
      "不恢复 Planner、fail-fast、全局收集或两阶段。"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "code-search"
      ],
      "available": [
        "workspace-read",
        "code-search",
        "diff",
        "shell"
      ],
      "unavailable": [
        "browser"
      ]
    },
    "agentId": "/root/compact_name_review",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "无 actionable finding；此前文档和 collision-order findings 均按用户记录决策关闭。",
        "最终合同一致使用 32-bit [ab][0-9a-z]{6}，保证 class 唯一与同注册序列可复现，并明确接受罕见跨顺序 base/suffix 归属变化。",
        "独立 Test 的 verify、双 visual、Rsbuild acceptance、Vite A/B 与重复构建确定性证据均通过。"
      ],
      "artifacts": [],
      "files": [
        ".agent-work/work-items/compact-atomic-class-names/index.md",
        ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-class-contract.md",
        ".agent-work/work-items/compact-atomic-class-names/materials/architecture/compact-compression-revision.md",
        "README.md",
        "semantic-atomic-css-plugin-plan.md",
        "packages/core/CORE_DESIGN.md",
        "packages/core/src/utils/hash.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/test/atomizer.test.ts",
        "packages/vite/src/plugin.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/rsbuild/src/plugin.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts",
        "playground/rsbuild-react-css-modules/scripts/inspect-artifacts.mjs"
      ],
      "checks": [
        {
          "command": "Full final diff and spec alignment",
          "result": "passed"
        },
        {
          "command": "40-bit/base64url/stable-source-id residual scan",
          "result": "passed"
        },
        {
          "command": "Collision uniqueness/suffix/same-sequence review",
          "result": "passed"
        },
        {
          "command": "Planner cleanup/compatibility/Adapter/inspector review",
          "result": "passed"
        },
        {
          "command": "Independent Test evidence audit",
          "result": "passed"
        },
        {
          "command": "git diff --check",
          "result": "passed"
        }
      ],
      "requires_test": null,
      "test_reason": null,
      "requires_review": null,
      "review_reason": null,
      "blockers": []
    },
    "blockers": []
  }
]
```
<!-- workflow:assignments:end -->

## Children

<!-- workflow:children:start -->
```json
[]
```
<!-- workflow:children:end -->

## Materials

<!-- workflow:materials:start -->
```json
[
  {
    "id": "materials/architecture/compact-class-contract.md",
    "role": "architecture",
    "path": "materials/architecture/compact-class-contract.md",
    "summary": "compact 编码、兼容矩阵、Planner 清理清单与验收合同。",
    "purpose": "指导 Development 和验证。"
  },
  {
    "id": "materials/architecture/compact-compression-revision.md",
    "role": "architecture",
    "path": "materials/architecture/compact-compression-revision.md",
    "summary": "压缩回退根因、32-bit lower-base36 修订和真实 A/B 门禁。",
    "purpose": "指导 compact 编码修订与关闭。"
  }
]
```
<!-- workflow:materials:end -->

## Verification decision and evidence

<!-- workflow:verification:start -->
```json
{
  "votes": {
    "architecture": {
      "covered": true,
      "test": {
        "requires": true,
        "reason": "独立测试应验证同序列可复现与 collision 唯一性，不断言跨顺序归属。"
      },
      "review": {
        "requires": true,
        "reason": "修订文字定义接受的确定性边界，需要最终复核。"
      }
    },
    "development": [
      {
        "assignment": "implement-compact-and-remove-planner",
        "test": {
          "requires": true,
          "reason": "命名编码、碰撞处理及两个 Adapter 的生产默认均改变，需要独立测试复核真实构建产物与跨语料确定性。"
        },
        "review": {
          "requires": true,
          "reason": "新增 public strategy 并改变生产构建默认命名，需独立审查兼容矩阵、文档一致性及 Planner 删除边界。"
        }
      },
      {
        "assignment": "fix-rsbuild-pilot-inspector",
        "test": {
          "requires": true,
          "reason": "自定义 selector serialization matcher 需要独立边界验证。"
        },
        "review": {
          "requires": true,
          "reason": "受限 CSS identifier parsing 与 selector variant 生成需独立审查是否误放宽。"
        }
      }
    ],
    "main": {
      "test": {
        "requires": true,
        "reason": "公共命名策略、双 Adapter 生产默认、Planner 跨文件清理和真实产物均改变，独立 Test 必需。"
      },
      "review": {
        "requires": true,
        "reason": "编码、碰撞、兼容矩阵、verifier 等价判断及脏工作树清理边界需要独立审查。"
      }
    }
  },
  "decisions": {
    "test": {
      "execute": true,
      "rule": "three-party-majority",
      "votes": {
        "architecture": true,
        "development": true,
        "main": true
      },
      "reason": "default execution was not overridden by two exemption votes"
    },
    "review": {
      "execute": true,
      "rule": "three-party-majority",
      "votes": {
        "architecture": true,
        "development": true,
        "main": true
      },
      "reason": "default execution was not overridden by two exemption votes"
    }
  }
}
```
<!-- workflow:verification:end -->

## Result

<!-- workflow:result:start -->
```json
{
  "status": "completed",
  "summary": [
    "已移除 Planner 主线，恢复全量安全原子化；新增 32-bit/7 字符 compact 并作为双 Adapter 生产默认，保留 dev readable 与显式 hash/prefix；真实压缩、确定性、Pilot、双 visual、独立 Test/Review 全部通过。"
  ],
  "artifacts": [],
  "blockers": [],
  "next_action": "无；可按正常代码评审流程提交。",
  "success_evidence": [
    {
      "criterion": "Planner 的 Core/Analyzer 公共接口、实现、测试、脚本和 Phase 9 文档被完整移除，既有 all-safe 转换行为恢复为单一路径。",
      "evidence": "独立 Test 的 Planner 符号/文件负向扫描与 Core runtime export 检查通过；Core/Analyzer 现有 verify 通过。",
      "pointers": [
        "packages/core/src/index.ts",
        "packages/core/src/engine/createTransformer.ts",
        "packages/analyzer/src/index.ts"
      ]
    },
    {
      "criterion": "Core 提供确定、CSS-safe、无默认前缀且短于现有 9 字符 hash 的 compact 命名策略，并覆盖复用、碰撞和输出契约。",
      "evidence": "compact 固定为 32-bit `[ab][0-9a-z]{6}`、7 字符、默认无前缀；同注册序列可复现，碰撞 suffix 保证唯一，精确向量/options/output/collision 测试通过。",
      "pointers": [
        "packages/core/src/utils/hash.ts",
        "packages/core/src/atomizer/createAtomicClassName.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/test/atomizer.test.ts"
      ]
    },
    {
      "criterion": "Vite 与 Rsbuild 生产默认使用 compact，开发默认 readable，显式 hash 与自定义 prefix 行为保持兼容。",
      "evidence": "两个 Adapter 默认/显式覆盖测试与包 verify 均通过，旧 hash 精确输出测试保留。",
      "pointers": [
        "packages/vite/src/plugin.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/rsbuild/src/plugin.ts",
        "packages/rsbuild/test/plugin.test.ts"
      ]
    },
    {
      "criterion": "Core、Analyzer、Vite、Rsbuild 与根 verify 通过，fixture/Pilot 的 raw、gzip、brotli 与确定性结果有记录。",
      "evidence": "全部包与根 verify、两个 fixture visual、Rsbuild Pilot acceptance 通过；Vite Pilot 相对 hash 的 atomic raw/gzip/brotli -518/-12/-33 bytes，总 CSS+JS -2784/-125/-53 bytes，连续两次 14 文件一致。",
      "pointers": [
        ".agent-work/work-items/compact-atomic-class-names/index.md",
        "playground/rsbuild-react-css-modules/scripts/inspect-artifacts.mjs"
      ]
    },
    {
      "criterion": "最终 diff 不包含已取消 Adapter Planner 项目或其他临时产物。",
      "evidence": "最终 git status/diff、Planner residual scan、git diff --check 与 workflow validate 通过；旧 Planner work items/scripts/results 均不在 diff。",
      "pointers": [
        ".agent-work/index.md",
        "README.md",
        "docs/phase-8-capability-hardening-backlog.md"
      ]
    }
  ]
}
```
<!-- workflow:result:end -->
