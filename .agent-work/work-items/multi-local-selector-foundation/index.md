---
id: "multi-local-selector-foundation"
name: "FOUND-04 多 local selector 安全原型"
summary: "建立不影响正式输出的多 local selector structural/resolved 模型与 shadow 证据，为 SEL-05/06 生产决策提供安全和收益依据。"
keywords: ["phase-8","FOUND-04","multi-local","selector","shadow","cascade"]
type: "exploration"
status: "completed"
stage: "close"
parent: "../../index.md"
owner: "/root"
lease_until: "2026-07-30T09:48:03.251Z"
updated_at: "2026-07-29T09:48:03.251Z"
---

# FOUND-04 多 local selector 安全原型

## Goal

<!-- workflow:goal:start -->
```json
"在不启用生产转换、不修改公开 API/schema/依赖、不引入 JSX/DOM 共现推断的前提下，完成多 local compound/descendant/child 与单 local descendant-tag 的 Core 设计原型、隔离 shadow evaluator、双 adapter/Pilot 证据和独立验证，最终只推荐一个后续 production candidate。"
```
<!-- workflow:goal:end -->

## Success criteria

<!-- workflow:success_criteria:start -->
```json
[
  "冻结当前正式 Core、Vite、Rsbuild 与双 Pilot artifact；shadow 关闭或删除时，既有 CSS、tokens、manifest、report 和 SEL-01/02/03 descriptor 输出保持 byte-identical。",
  "形成并实现仅内部使用的 structural selector arm 与 resolved selector arm 模型，确定性选择 anchor、解析 semantic guard identity，并保持原 selector 结构、spelling、specificity 与 whole-rule fallback。",
  "在任何正式 registry mutation 前完成 candidate preflight，并由隔离 shadow registry 输出可复算的 direct rules/declarations、exact-only/mixed class、blocked reason、definitions/reuse/token links 与体积估算，不污染正式结果。",
  "Core 自动测试覆盖 compound、two-local descendant、child、single-local descendant-tag、selector list、non-exported、resolver、nested/unsupported、media/supports、important、重复及 shorthand/longhand cascade 和零部分注册。",
  "Vite/Rsbuild 只消费通用 Core candidate 结果，不复制 grammar/anchor/guard；fixture static、浏览器 semantic/native 与 HMR 证明正式页面 0 差异、0 stale selector。",
  "双 Pilot 使用冻结语料分别给出各 candidate 子集的真实 unlock、reuse、preserved 与 raw/gzip/brotli/class-string/estimated-total-diff，且不把 authored 上限、fixture oracle 或 arm reuse 冒充实际收益。",
  "同步 FOUND-04 设计、验收、backlog 与收益文档，明确停止条件、回滚方式和 SEL-05/SEL-06 中至多一个后续 production 推荐；不把推荐表述为实施授权。"
]
```
<!-- workflow:success_criteria:end -->

## Confirmed decisions

<!-- workflow:confirmed_decisions:start -->
```json
[
  {
    "id": "prototype-only",
    "summary": "本 Work Item 只交付设计、隔离原型、shadow 证据和后续推荐；不授权 SEL-05/06 正式 CSS 改写。",
    "evidence": []
  },
  {
    "id": "deterministic-anchor",
    "summary": "原型中 multi-local 选择最右侧 subject local 为 injection anchor；单-local descendant-tag 选择唯一 local ancestor，生产规则仍待 Pilot 后确认。",
    "evidence": []
  },
  {
    "id": "semantic-fallback",
    "summary": "semantic scoped class 与完整 fallback 始终保留；无法证明等价时继续保守保留。",
    "evidence": []
  },
  {
    "id": "stable-contract",
    "summary": "不修改公开 API、manifest/report/dev schema、class-name algorithm 或生产依赖；adapter 不复制 grammar、anchor 或 guard。",
    "evidence": []
  },
  {
    "id": "no-found05",
    "summary": "不引入 JSX usage、DOM class 共现、跨 class/module occurrence 顺序推断，FOUND-05 继续 deferred。",
    "evidence": []
  },
  {
    "id": "demand-first",
    "summary": "真实 Pilot/report 决定候选排序；fixture oracle、authored 上限和 arm reuse 不作为实际收益。",
    "evidence": []
  },
  {
    "id": "preserve-dirty-worktree",
    "summary": "当前 dirty worktree 是既有基线，只修改 FOUND-04 所需文件，不覆盖、回退或重新归因现有 SEL-01/02/03 与用户改动。",
    "evidence": []
  },
  {
    "id": "refresh-stale-rsbuild-baseline",
    "summary": "历史 Rsbuild frozen report 生成早于 SEL-01 最终 direct-risk attribution 修复；FOUND-04 使用 instrumentation 恢复后稳定重建的 current report 作为 Batch 0 baseline，并保留旧差异，不修改正式行为。",
    "evidence": [
      "/private/tmp/gss-found04-shadow/artifacts/rsbuild-report-vs-frozen.diff",
      "packages/core/test/pseudoElement.test.ts",
      "packages/core/src/engine/planInputClassPreservation.ts"
    ]
  },
  {
    "id": "no-production-candidate",
    "summary": "FOUND-04 四项 policy 均未同时满足双 Pilot exact-only>=2 与 estimated total diff 不恶化，因此不授权 SEL-04/05/06 production rewrite。",
    "evidence": []
  },
  {
    "id": "rollback-shadow-prototype",
    "summary": "删除本 Work Item 新增的 2083 行 Core shadow src/tests/script；保留 contract、capture、evaluation、hash 与权威文档作为可复算研究证据。",
    "evidence": []
  }
]
```
<!-- workflow:confirmed_decisions:end -->

## Current progress

<!-- workflow:current_progress:start -->
```json
"FOUND-04 已 closed-no-go；prototype 回滚、双 Pilot no-go 复算、独立 Test/Review、成功证据记录与最终文档复核均已完成。"
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
    "id": "design-contract",
    "text": "固化 FOUND-04 内部 interface、shadow 数据入口、preflight/cascade 与实施切片。",
    "status": "completed",
    "assignment": "found-04-architecture",
    "blockers": []
  },
  {
    "id": "implement-core-shadow",
    "text": "实现 Core structural/resolved 原型、隔离 shadow evaluator 与 Core 测试。",
    "status": "completed",
    "assignment": "",
    "blockers": []
  },
  {
    "id": "integrate-pilot-evidence",
    "text": "接入通用候选证据，完成双 adapter/fixture/Pilot artifact 与文档。",
    "status": "completed",
    "assignment": "",
    "blockers": []
  },
  {
    "id": "independent-verification",
    "text": "执行独立 Test、Review 及必要修复复验。",
    "status": "completed",
    "assignment": "",
    "blockers": []
  },
  {
    "id": "close-foundation",
    "text": "核对收益、停止条件、推荐项和最终文档后收口。",
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
    "id": "found-04-architecture",
    "role": "architecture",
    "status": "completed",
    "objective": "为已批准的 FOUND-04 非生产原型形成可直接交给 Development 的内部 contract：精确定位 current seams，定义 structural/resolved arm、shadow evaluator 与 preflight 数据流，解决真实 post-CSS-Modules 语料入口且不引入公开 API/schema/adapter grammar，并拆出顺序明确的实施与验收范围。",
    "successCriteria": [
      "给出当前 planSelectorRewrite、planInputClassPreservation、createTransformer、registry/mapping/report 的准确 seam 图和需要保持 byte-identical 的既有行为。",
      "定义内部类型、函数职责、解析与 resolved identity 时机、anchor/guard ownership、whole-rule fallback、candidate reason 与零正式 mutation 约束。",
      "确定 shadow evaluator 如何从 Core 与双 Pilot 获得真实 scoped CSS/export evidence，不新增公开 config/schema、跨包 internal import 或残留 instrumentation。",
      "定义 compound、two-local descendant、child、single-local descendant-tag 的独立 policy、cascade oracle、exact-only/mixed unlock 与收益口径。",
      "提出最小 Development 切片、文件写入边界、验证矩阵、停止条件和回滚策略；列出必须先解决的 blocker。"
    ],
    "read": [
      "AGENTS.md",
      "README.md",
      "package.json",
      "semantic-atomic-css-plugin-plan.md",
      "packages/core/CORE_DESIGN.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/phase-8-selector-rewrite-foundation-design.md",
      "docs/phase-8-selector-aware-identity-cascade-design.md",
      ".agent-work/work-items/selector-next-capability-plan/materials/architecture/next-capability-plan.md",
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/src/ir/types.ts",
      "packages/core/src/public/types.ts",
      "packages/core/src/registry/AtomicRegistry.ts",
      "packages/core/src/registry/ClassMappingBuilder.ts",
      "packages/core/src/output/createManifest.ts",
      "packages/core/src/output/renderAtomicCss.ts",
      "packages/core/test/selector.test.ts",
      "packages/core/test/preservationPlan.test.ts",
      "packages/core/test/cascadeOracle.test.ts",
      "packages/core/test/selectorList.test.ts",
      "packages/core/test/selectorOutputContract.test.ts",
      "packages/vite/src/plugin.ts",
      "packages/vite/test/pluginBuild.test.ts",
      "packages/rsbuild/src/buildArtifacts.ts",
      "packages/rsbuild/test/buildArtifacts.test.ts",
      "playground/vite-react-css-modules/scripts",
      "playground/rsbuild-react-css-modules/scripts",
      "/private/tmp/gss-pseudo-element-pilot/current"
    ],
    "write": [
      ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-contract.md"
    ],
    "decisions": [
      "prototype-only",
      "deterministic-anchor",
      "semantic-fallback",
      "stable-contract",
      "no-found05",
      "demand-first",
      "preserve-dirty-worktree"
    ],
    "capabilities": {
      "required": [
        "workspace-read"
      ],
      "available": [
        "workspace-read",
        "workspace-write",
        "shell"
      ],
      "unavailable": [
        "external-docs"
      ]
    },
    "agentId": "",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "Contract defines structural/resolved arms, deterministic anchor ownership, resolved guard identity, role-aware preflight, whole-rule fallback, and zero formal mutation.",
        "Real scoped corpus is captured temporarily at existing Vite/Rsbuild Core call sites, with dirty-worktree-safe hash restoration and no residual instrumentation.",
        "Four policies, exact-only/mixed benefits, Development slices, verification gates, and stop/rollback conditions are separated explicitly."
      ],
      "artifacts": [
        {
          "path": ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-contract.md",
          "purpose": "Development-ready FOUND-04 prototype and shadow-evaluator contract."
        }
      ],
      "files": [
        "packages/core/src/selector/planSelectorRewrite.ts",
        "packages/core/src/engine/planInputClassPreservation.ts",
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/src/registry/ClassMappingBuilder.ts",
        "packages/core/src/output/createManifest.ts",
        "packages/core/src/output/renderAtomicCss.ts",
        "packages/vite/src/plugin.ts",
        "packages/vite/src/cssModules.ts",
        "packages/rsbuild/src/buildArtifacts.ts",
        "packages/rsbuild/src/runtimeBridgeLoader.ts"
      ],
      "checks": [
        {
          "command": "Architecture role capability and scope check",
          "result": "passed"
        },
        {
          "command": "Current Core/adapter seam inspection",
          "result": "passed"
        },
        {
          "command": "Frozen Pilot report/manifest SHA-256 verification",
          "result": "passed"
        },
        {
          "command": "wc -l .agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-contract.md",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "Selector identity, anchor ownership, cascade preflight, corpus replay, and formal byte isolation require independent semantic and artifact verification.",
      "requires_review": true,
      "review_reason": "The contract makes correctness-sensitive ownership and stop decisions that require independent architecture/code review before Development acceptance.",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "core-structural-shadow",
    "role": "development",
    "status": "completed",
    "objective": "按照 FOUND-04 contract 实现 Core 内部、默认不接正式 transform 路径的 structural/resolved selector shadow evaluator 与隔离 preflight/registry，并补齐 Core 自动测试和可从 capture JSON 回放的内部脚本；保证现有 transformCss/createTransformer 及公开输出逐字节不变。",
    "successCriteria": [
      "实现四个独立 policy：compound、two-local-descendant（含祖先 supported exact/presence attribute）、child、single-local-descendant-tag；默认全部关闭且不改变 planSelectorRewrite 正式 decision。",
      "structural 阶段只建模 source roles；resolved 阶段解析 anchor/guards 后生成 identity，token 只归 injection anchor，renderer 保留 guard、node order、spacing 和 specificity。",
      "whole-list/whole-rule 阻塞覆盖 resolver、non-exported anchor、adapter preservation、unsupported shape、same-anchor cascade、remaining class evidence，内部 reason 不进入 public types/schema。",
      "role-aware preflight 在隔离 registry mutation 前完成，复用现有 property competition/atomic key/class algorithm，输出 direct occurrence、exact-only/mixed、definitions/reuse/token links 与 raw/gzip/brotli/class-string/estimated diff。",
      "提供只读取 capture JSON、输出稳定 JSON 的 Core 内部回放脚本或等价测试入口；不得从 package root export，不新增依赖或修改 package/public schema。",
      "测试覆盖四 policy success/near-miss、resolved identity、deterministic anchor、selector list、media/supports/important/A-B-A/shorthand-longhand、guard-only exact/mixed、zero formal mutation 与现有 descriptor/result deep-equality。",
      "运行 core verify 和 scoped diff-check；不修改 adapter、fixture、Pilot、权威文档或 .agent-work。"
    ],
    "read": [
      "AGENTS.md",
      "packages/core/package.json",
      "packages/core/tsconfig.json",
      "packages/core/CORE_DESIGN.md",
      ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-contract.md",
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/src/ast/collectIr.ts",
      "packages/core/src/ir/types.ts",
      "packages/core/src/declaration/classifyPropertyCompetition.ts",
      "packages/core/src/atomizer/createAtomicKey.ts",
      "packages/core/src/registry/AtomicRegistry.ts",
      "packages/core/src/registry/ClassMappingBuilder.ts",
      "packages/core/src/output/renderAtomicCss.ts",
      "packages/core/src/output/renderPreservedCss.ts",
      "packages/core/src/output/createReport.ts",
      "packages/core/src/public/types.ts",
      "packages/core/src/index.ts",
      "packages/core/test/selector.test.ts",
      "packages/core/test/selectorOutputContract.test.ts",
      "packages/core/test/preservationPlan.test.ts",
      "packages/core/test/cascadeOracle.test.ts",
      "packages/core/test/selectorList.test.ts",
      "packages/core/test/pseudoElement.test.ts",
      "packages/core/test/contract.test.ts"
    ],
    "write": [
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/src/selector/planStructuralSelectorShadow.ts",
      "packages/core/src/engine/evaluateStructuralSelectorShadow.ts",
      "packages/core/src/engine/planStructuralSelectorShadow.ts",
      "packages/core/scripts/evaluate-structural-selector-shadow.mjs",
      "packages/core/test/structuralSelectorShadow.test.ts",
      "packages/core/test/structuralSelectorShadowContract.test.ts"
    ],
    "decisions": [
      "prototype-only",
      "deterministic-anchor",
      "semantic-fallback",
      "stable-contract",
      "no-found05",
      "demand-first",
      "preserve-dirty-worktree"
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
        "browser",
        "external-docs"
      ]
    },
    "agentId": "",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "实现四项默认关闭的 structural/resolved selector shadow policy、guard-aware identity 与确定性 anchor。",
        "实现隔离 preflight/registry replay、完整收益指标及稳定 capture JSON 回放脚本。",
        "正式 transform/public contract 未接入 shadow；Core 全量 193 项测试通过。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/selector/planStructuralSelectorShadow.ts",
        "packages/core/src/engine/planStructuralSelectorShadow.ts",
        "packages/core/src/engine/evaluateStructuralSelectorShadow.ts",
        "packages/core/scripts/evaluate-structural-selector-shadow.mjs",
        "packages/core/test/structuralSelectorShadow.test.ts",
        "packages/core/test/structuralSelectorShadowContract.test.ts"
      ],
      "checks": [
        {
          "command": "pnpm --filter @semantic-atomic-css/core verify",
          "result": "passed"
        },
        {
          "command": "node packages/core/scripts/evaluate-structural-selector-shadow.mjs <temporary-capture> --policy compound",
          "result": "passed"
        },
        {
          "command": "git diff --check -- <allowed-core-files>；并检查新增文件尾随空白与正式入口引用",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "新 selector policy、cascade oracle、隔离 registry 和压缩指标具有较大语义面，独立测试可补充开发者覆盖。",
      "requires_review": true,
      "review_reason": "需要独立确认 role-aware preservation seed、跨 occurrence cascade 阻塞和收益口径严格符合 FOUND-04 contract。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "capture-pilot-shadow",
    "role": "development",
    "status": "completed",
    "objective": "使用 FOUND-04 contract 指定的临时同包 instrumentation，从 Vite/Rsbuild Pilot 真实 Core 调用点捕获 scopedCss/exportedClassNames/preserveClassNames，运行四项 Core shadow policy，验证正式 artifacts 不变，并在完成后把 adapter 文件精确恢复到当前 dirty-worktree hash；只留下 /private/tmp capture/evaluation 证据。",
    "successCriteria": [
      "修改前记录 Vite/Rsbuild 目标 call-site 完整 SHA-256 与 scoped git diff；捕获完成后用反向 apply_patch 恢复并证明 hash 完全相同，禁止 git checkout/reset。",
      "临时 capture 仅复制 adapter 已持有的 id/scopedCss/exportedClassNames/preserveClassNames，按 id/export 稳定排序；重复 id 不同 payload fail fast；不解析 selector、不导入 Core internal。",
      "分别运行两个 Pilot semantic build，捕获逐 module 真实 post-CSS-Modules 输入；不修改 Pilot source、fixture、配置、package 或公开 schema。",
      "使用 Core 回放脚本对 Vite/Rsbuild capture 分别运行 all policies，连续两次输出 SHA-256 一致，并保存到 /private/tmp/gss-found04-shadow。",
      "核对正式 CSS/manifest/report/tokens 与冻结基线 byte-identical，files/sourceClasses/before bytes 一致；若当前构建路径无法证明则停止并报告 blocker。",
      "完成后目标 adapter 文件 hash 恢复、最终 scoped diff 与任务前一致、无 instrumentation/import/env/config 残留；运行 Vite/Rsbuild package verify。",
      "返回 capture/evaluation/正式 artifact 的绝对路径、hash、构建与验证结果；不修改 .agent-work 或权威文档。"
    ],
    "read": [
      "AGENTS.md",
      "package.json",
      "packages/core/package.json",
      ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-contract.md",
      "packages/core/scripts/evaluate-structural-selector-shadow.mjs",
      "packages/core/src/engine/evaluateStructuralSelectorShadow.ts",
      "packages/vite/src/plugin.ts",
      "packages/vite/src/cssModules.ts",
      "packages/vite/package.json",
      "packages/rsbuild/src/buildArtifacts.ts",
      "packages/rsbuild/src/runtimeBridgeLoader.ts",
      "packages/rsbuild/package.json",
      "playground/vite-react-css-modules/package.json",
      "playground/vite-react-css-modules/vite.config.ts",
      "playground/vite-react-css-modules/scripts",
      "playground/rsbuild-react-css-modules/package.json",
      "playground/rsbuild-react-css-modules/rsbuild.config.ts",
      "playground/rsbuild-react-css-modules/scripts",
      "/private/tmp/gss-pseudo-element-pilot/current"
    ],
    "write": [
      "packages/vite/src/plugin.ts",
      "packages/rsbuild/src/buildArtifacts.ts",
      "packages/rsbuild/src/runtimeBridgeLoader.ts"
    ],
    "decisions": [
      "prototype-only",
      "deterministic-anchor",
      "semantic-fallback",
      "stable-contract",
      "no-found05",
      "demand-first",
      "preserve-dirty-worktree"
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
        "browser",
        "external-docs"
      ]
    },
    "agentId": "",
    "dependsOn": [
      "core-structural-shadow"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "Vite metrics: compound 1 exact/+40B; descendant 6 exact/+1176B; child 2 exact/+173B; descendant-tag 0.",
        "Rsbuild metrics: compound 1 exact/+16B; descendant 6 exact/+1170B; child 2 exact/+173B; descendant-tag 0 exact and blocked.",
        "双次 evaluation byte-identical；正式 adapter 已恢复，当前没有 policy 同时满足 exact-only>=2 与 estimated size 不恶化。"
      ],
      "artifacts": [
        {
          "path": "private/tmp/gss-found04-shadow/captures/vite-capture.json",
          "purpose": "Vite 17-module stable capture，sha256 912376d3…6a53d。"
        },
        {
          "path": "private/tmp/gss-found04-shadow/captures/rsbuild-capture.json",
          "purpose": "Rsbuild 23-module stable capture，sha256 a789dbe3…de7cc。"
        },
        {
          "path": "private/tmp/gss-found04-shadow/evaluation/vite/run-1/evaluation.json",
          "purpose": "Vite deterministic evaluation，sha256 d6d7f011…deebb。"
        },
        {
          "path": "private/tmp/gss-found04-shadow/evaluation/vite/summary.json",
          "purpose": "Vite policy summary，sha256 c15a6eb9…b549。"
        },
        {
          "path": "private/tmp/gss-found04-shadow/evaluation/rsbuild/run-1/evaluation.json",
          "purpose": "Rsbuild deterministic evaluation，sha256 c402d387…5466。"
        },
        {
          "path": "private/tmp/gss-found04-shadow/evaluation/rsbuild/summary.json",
          "purpose": "Rsbuild policy summary，sha256 d4eb360f…e5d。"
        },
        {
          "path": "private/tmp/gss-found04-shadow/artifacts/current-baseline.sha256",
          "purpose": "刷新后的正式 artifact baseline hash 清单。"
        },
        {
          "path": "private/tmp/gss-found04-shadow/artifacts/rsbuild-report-vs-frozen.diff",
          "purpose": "旧 frozen report 与最终 direct-risk attribution baseline 差异。"
        },
        {
          "path": "private/tmp/gss-found04-shadow/pre/target-sha256.txt",
          "purpose": "临时 instrumentation 前 adapter hashes。"
        },
        {
          "path": "private/tmp/gss-found04-shadow/pre/restored-target-sha256.txt",
          "purpose": "恢复后 adapter hashes，与前置完全相同。"
        }
      ],
      "files": [
        "packages/vite/src/plugin.ts",
        "packages/rsbuild/src/buildArtifacts.ts",
        "packages/rsbuild/src/runtimeBridgeLoader.ts"
      ],
      "checks": [
        {
          "command": "双端 capture 与 all-policy evaluation 各运行两次",
          "result": "passed"
        },
        {
          "command": "cmp 与 SHA-256 验证双次 evaluation",
          "result": "passed"
        },
        {
          "command": "Vite current artifact 与 frozen 全树比较",
          "result": "passed"
        },
        {
          "command": "Rsbuild current artifact 与 refreshed baseline 全树比较",
          "result": "passed"
        },
        {
          "command": "adapter SHA-256、scoped diff 与 instrumentation residue 检查",
          "result": "passed"
        },
        {
          "command": "pnpm --filter @semantic-atomic-css/vite verify",
          "result": "passed"
        },
        {
          "command": "pnpm --filter @semantic-atomic-css/rsbuild verify",
          "result": "passed"
        },
        {
          "command": "四 policy demand-first non-worse/exact-only gate 分类",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "独立 Test 应复算 capture/evaluation hash、policy 指标、baseline 刷新边界和无满足收益门槛的结论。",
      "requires_review": true,
      "review_reason": "需要独立审查 role-aware blocker、exact-only/mixed 分类、size 口径及 stale Rsbuild report baseline 决策没有掩盖正式行为变化。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "evaluate-found-04-outcome",
    "role": "architecture",
    "status": "completed",
    "objective": "独立复算 FOUND-04 双 Pilot shadow 结果、baseline 刷新边界与四 policy gate，给出最终 no-go/go 结论，并决定 2083 行 Core prototype 应保留、归档还是从生产源码回滚；同时给出权威文档状态和下一能力排序。",
    "successCriteria": [
      "从原始 evaluation JSON 而非 Development 摘要复算两端每项 rules/direct/exact/mixed/definitions/reuse/tokenLinks/preserved/size/blockers，核对双次 hash。",
      "逐项应用成功门槛：双 Pilot共享 exact-only>=2 且 estimated total diff 不恶化；不得把组合收益、mixed、fixture 或 authored 上限计入。",
      "审查 stale Rsbuild baseline 刷新依据，确认旧差异仅为 final direct-risk attribution、没有掩盖 CSS/manifest/token 行为变化。",
      "结合 repo 深模块约束、停止/回滚条款和原型规模，明确最终是否保留 Core src/tests/script；若回滚，说明需要保留的可复算材料。",
      "给出 FOUND-04、SEL-05、SEL-06、SEL-04 与 GOV-01 的建议状态、文档变更清单和无需 owner 再确认的下一动作。"
    ],
    "read": [
      "AGENTS.md",
      "packages/core/CORE_DESIGN.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/selector-capability-benefit-review.md",
      ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-contract.md",
      ".agent-work/work-items/selector-next-capability-plan/materials/architecture/next-capability-plan.md",
      "packages/core/src/selector/planStructuralSelectorShadow.ts",
      "packages/core/src/engine/planStructuralSelectorShadow.ts",
      "packages/core/src/engine/evaluateStructuralSelectorShadow.ts",
      "packages/core/scripts/evaluate-structural-selector-shadow.mjs",
      "packages/core/test/structuralSelectorShadow.test.ts",
      "packages/core/test/structuralSelectorShadowContract.test.ts",
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/test/pseudoElement.test.ts",
      "/private/tmp/gss-found04-shadow/captures",
      "/private/tmp/gss-found04-shadow/evaluation",
      "/private/tmp/gss-found04-shadow/artifacts",
      "/private/tmp/gss-found04-shadow/pre"
    ],
    "write": [
      ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-evaluation.md"
    ],
    "decisions": [
      "prototype-only",
      "deterministic-anchor",
      "semantic-fallback",
      "stable-contract",
      "no-found05",
      "demand-first",
      "preserve-dirty-worktree",
      "refresh-stale-rsbuild-baseline"
    ],
    "capabilities": {
      "required": [
        "workspace-read"
      ],
      "available": [
        "workspace-read",
        "workspace-write",
        "shell"
      ],
      "unavailable": [
        "browser",
        "external-docs"
      ]
    },
    "agentId": "",
    "dependsOn": [
      "core-structural-shadow",
      "capture-pilot-shadow"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "FOUND-04 为 no-go：四项 policy 均未同时通过双 Pilot exact-only≥2 与 estimated total diff 不恶化门禁。",
        "Rsbuild baseline 可合法刷新为仅 1 条 direct attribute-cascade-order attribution，CSS、manifest 与 tokens 不变。",
        "建议删除全部 2083 行 Core shadow 原型，并将 SEL-04/05/06 与产品化 GOV-01 deferred。"
      ],
      "artifacts": [
        {
          "path": ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-evaluation.md",
          "purpose": "保留独立复算、gate、baseline 刷新、rollback、状态与文档决策证据。"
        }
      ],
      "files": [
        "packages/core/src/selector/planStructuralSelectorShadow.ts",
        "packages/core/src/engine/planStructuralSelectorShadow.ts",
        "packages/core/src/engine/evaluateStructuralSelectorShadow.ts",
        "packages/core/scripts/evaluate-structural-selector-shadow.mjs",
        "packages/core/test/structuralSelectorShadow.test.ts",
        "packages/core/test/structuralSelectorShadowContract.test.ts",
        "packages/core/test/preservationPlan.test.ts",
        "packages/core/test/cascadeOracle.test.ts",
        "packages/core/CORE_DESIGN.md",
        "docs/phase-8-capability-hardening-backlog.md",
        "docs/selector-capability-benefit-review.md"
      ],
      "checks": [
        {
          "command": "pnpm --filter @semantic-atomic-css/core verify",
          "result": "passed"
        },
        {
          "command": "evaluation 双次 SHA-256、capture replay 与原始指标复算",
          "result": "passed"
        },
        {
          "command": "artifact hash、adapter instrumentation 恢复与 stale Rsbuild diff 核对",
          "result": "passed"
        },
        {
          "command": "captures/files.sha256 自校验",
          "result": "failed"
        }
      ],
      "requires_test": true,
      "test_reason": "删除 Core 原型与测试后仍需独立验证 package/root 构建和正式输出未受影响。",
      "requires_review": true,
      "review_reason": "需独立确认 no-go 状态、原型删除范围及权威文档对 baseline attribution 的同步一致性。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "rollback-and-document-found-04",
    "role": "development",
    "status": "completed",
    "objective": "执行 FOUND-04 no-go rollback：删除本 Work Item 新增的全部 Core executable prototype/test/script，修复 capture checksum manifest，并把双 Pilot gate、stale Rsbuild attribution baseline、closed-no-go/deferred 状态和不授权 production rewrite 同步到中文权威文档。",
    "successCriteria": [
      "仅删除 3 个新增 Core src、2 个新增 test、1 个新增 replay script；不修改任何既有 Core implementation/test/public/package 文件，且冻结的正式 Core 文件 SHA-256 保持不变。",
      "删除后无 structural shadow import/export/script 引用，Core verify 与根 pnpm verify 通过，正式 selector output contract 保持现状。",
      "修复 /private/tmp/gss-found04-shadow/captures/files.sha256，使 manifest 不包含自身且 shasum -c 全部通过；evaluation/artifact hashes 不改。",
      "新增中文 FOUND-04 evaluation/acceptance 文档，记录授权边界、四 policy 两端全量 gate、baseline 刷新、rollback、验证命令、重新开启条件和独立 Test/Review 待执行。",
      "更新 backlog：FOUND-04 closed-no-go；SEL-04/05/06 deferred；GOV-01 internal-study-completed/product-deferred；FOUND-05 不变。",
      "更新收益复盘和双 Pilot tracking，区分 direct/source/definition/reuse/link/size，并把 Rsbuild 当前 attribution 更正为 1 条 direct risk + 1 条 class-wide follower，CSS/manifest/tokens 不变。",
      "更新 Attribute acceptance 中同一 Rsbuild attribution 表述及 README Phase 8 文档索引；不修改 adapter acceptance 的通过事实，不宣称 production capability。",
      "校验本地 Markdown links、命令路径和 scoped git diff-check；不修改 adapter、fixture、Pilot source、package/lockfile 或 .agent-work。"
    ],
    "read": [
      "AGENTS.md",
      "README.md",
      "semantic-atomic-css-plugin-plan.md",
      "packages/core/CORE_DESIGN.md",
      ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-contract.md",
      ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-evaluation.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/selector-capability-benefit-review.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
      "docs/phase-8-attribute-selector-acceptance.md",
      "packages/core/src/selector/planStructuralSelectorShadow.ts",
      "packages/core/src/engine/planStructuralSelectorShadow.ts",
      "packages/core/src/engine/evaluateStructuralSelectorShadow.ts",
      "packages/core/scripts/evaluate-structural-selector-shadow.mjs",
      "packages/core/test/structuralSelectorShadow.test.ts",
      "packages/core/test/structuralSelectorShadowContract.test.ts",
      "/private/tmp/gss-found04-shadow"
    ],
    "write": [
      "packages/core/src/selector/planStructuralSelectorShadow.ts",
      "packages/core/src/engine/planStructuralSelectorShadow.ts",
      "packages/core/src/engine/evaluateStructuralSelectorShadow.ts",
      "packages/core/scripts/evaluate-structural-selector-shadow.mjs",
      "packages/core/test/structuralSelectorShadow.test.ts",
      "packages/core/test/structuralSelectorShadowContract.test.ts",
      "docs/phase-8-multi-local-selector-foundation-evaluation.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/selector-capability-benefit-review.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
      "docs/phase-8-attribute-selector-acceptance.md",
      "README.md"
    ],
    "decisions": [
      "prototype-only",
      "semantic-fallback",
      "stable-contract",
      "no-found05",
      "demand-first",
      "preserve-dirty-worktree",
      "refresh-stale-rsbuild-baseline",
      "no-production-candidate",
      "rollback-shadow-prototype"
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
        "browser",
        "external-docs"
      ]
    },
    "agentId": "",
    "dependsOn": [
      "evaluate-found-04-outcome"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "FOUND-04 已按四项双 Pilot 门禁收口为 closed-no-go，6 个 prototype/test/script 已删除。",
        "权威中文文档已同步 deferred 状态、Rsbuild 单 direct diagnostic 口径及不授权 production rewrite 的边界。",
        "checksum manifest 已排除自身，Core、根门禁、哈希、链接、命令与 scoped diff 检查均通过。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/selector/planStructuralSelectorShadow.ts",
        "packages/core/src/engine/planStructuralSelectorShadow.ts",
        "packages/core/src/engine/evaluateStructuralSelectorShadow.ts",
        "packages/core/scripts/evaluate-structural-selector-shadow.mjs",
        "packages/core/test/structuralSelectorShadow.test.ts",
        "packages/core/test/structuralSelectorShadowContract.test.ts",
        "docs/phase-8-multi-local-selector-foundation-evaluation.md",
        "docs/phase-8-capability-hardening-backlog.md",
        "docs/selector-capability-benefit-review.md",
        "docs/phase-5-real-project-pilot-tracking.md",
        "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
        "docs/phase-8-attribute-selector-acceptance.md",
        "README.md"
      ],
      "checks": [
        {
          "command": "shasum -a 256 -c /private/tmp/gss-found04-shadow/captures/files.sha256",
          "result": "passed"
        },
        {
          "command": "pnpm --filter @semantic-atomic-css/core verify",
          "result": "passed"
        },
        {
          "command": "pnpm verify",
          "result": "passed"
        },
        {
          "command": "Markdown 本地链接与 README pnpm 命令校验",
          "result": "passed"
        },
        {
          "command": "冻结 adapter target SHA-256 与 restored manifest 对比",
          "result": "passed"
        },
        {
          "command": "scoped git diff-check、六文件删除及 structural shadow 残留引用检查",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "独立 Test 应复核 no-go rollback、checksum 自包含修复、正式产物哈希保持面及完整门禁结果。",
      "requires_review": true,
      "review_reason": "独立 Review 应确认多份权威文档的状态、收益数字、Rsbuild attribution 与不授权生产改写边界一致。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "independent-found-04-test",
    "role": "test",
    "status": "completed",
    "objective": "独立验证 FOUND-04 closed-no-go rollback：正式仓库无 executable shadow/adapter instrumentation，Core/root/package/static 全绿，capture/evaluation/hash/no-go 数字可复算，双 fixture semantic/native full visual 与 HMR 为 0 differences/stale。",
    "successCriteria": [
      "确认 6 个 prototype/test/script 不存在，public index/types/package/正式 Core hashes 与任务前一致，adapter target hash 与 pre-capture manifest 一致。",
      "复算 captures/files.sha256、双次 evaluation cmp/hash、四 policy gate 表和 stale Rsbuild baseline 差异；结论必须是无 policy 过门槛。",
      "运行 core、Vite、Rsbuild package verify 与根 pnpm verify。",
      "运行 Vite/Rsbuild fixture full visual，覆盖 semantic/native dev/preview、desktop/narrow 与现有 HMR suites，报告 passed=true、0 differences、0 stale。",
      "核对新增 evaluation 文档中的命令、路径、本地链接、状态和关键数字与 artifact 一致；不得修改仓库。"
    ],
    "read": [
      "AGENTS.md",
      "README.md",
      "packages/core/CORE_DESIGN.md",
      "packages/core/src/index.ts",
      "packages/core/src/public/types.ts",
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/src/engine/createTransformer.ts",
      "docs/phase-8-multi-local-selector-foundation-evaluation.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/selector-capability-benefit-review.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
      "docs/phase-8-attribute-selector-acceptance.md",
      ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-contract.md",
      ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-evaluation.md",
      "/private/tmp/gss-found04-shadow",
      "fixtures/vite-css-modules/scripts/verify-visual.mjs",
      "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs"
    ],
    "write": [],
    "decisions": [
      "prototype-only",
      "stable-contract",
      "no-found05",
      "demand-first",
      "refresh-stale-rsbuild-baseline",
      "no-production-candidate",
      "rollback-shadow-prototype"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "shell"
      ],
      "available": [
        "workspace-read",
        "shell",
        "browser"
      ],
      "unavailable": [
        "external-docs"
      ]
    },
    "agentId": "",
    "dependsOn": [
      "rollback-and-document-found-04"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "Rollback、capture/evaluation、adapter hash、公开边界与 no-go 复算均通过；但任务前 Core 完整 checksum/pre-image 未持久化，因此 Core byte-identical 缺少独立证据。",
        "Core、Vite、Rsbuild package verify 与根 pnpm verify 全部通过。",
        "双端 full visual、HMR/stale 检查通过且 differences=0；Test Agent 未修改任何仓库文件，仅生成两个可丢弃的 /private/tmp report。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/index.ts",
        "packages/core/src/public/types.ts",
        "packages/core/src/selector/planSelectorRewrite.ts",
        "packages/core/src/engine/createTransformer.ts",
        "packages/vite/src/plugin.ts",
        "packages/rsbuild/src/buildArtifacts.ts",
        "packages/rsbuild/src/runtimeBridgeLoader.ts",
        "fixtures/vite-css-modules/scripts/verify-visual.mjs",
        "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs",
        "docs/phase-8-multi-local-selector-foundation-evaluation.md"
      ],
      "checks": [
        {
          "command": "六个 structural shadow 文件缺失、残留引用/public export/config/schema/dependency 检查",
          "result": "passed"
        },
        {
          "command": "adapter target SHA-256、target/restored manifest 与 pre-image cmp",
          "result": "passed"
        },
        {
          "command": "任务前正式 Core 完整 SHA-256/pre-image 独立比较",
          "result": "not_run"
        },
        {
          "command": "当前六个正式 Core 文件 SHA-256 与无 shadow 引用检查",
          "result": "passed"
        },
        {
          "command": "shasum -a 256 -c /private/tmp/gss-found04-shadow/captures/files.sha256",
          "result": "passed"
        },
        {
          "command": "evaluation files.sha256、Vite/Rsbuild run-1/run-2 cmp 与 aggregate capture 重建",
          "result": "passed"
        },
        {
          "command": "原始 JSON 复算四项 policy 双 Pilot 指标与全部 no-go 结论",
          "result": "passed"
        },
        {
          "command": "Rsbuild old/current 归一比较：仅 direct diagnostic attribution 改变，CSS/manifest 不变",
          "result": "passed"
        },
        {
          "command": "pnpm --filter @semantic-atomic-css/core verify（10 files/161 tests、typecheck、build）",
          "result": "passed"
        },
        {
          "command": "pnpm --filter @semantic-atomic-css/vite verify（4 files/41 tests、typecheck、build）",
          "result": "passed"
        },
        {
          "command": "pnpm --filter @semantic-atomic-css/rsbuild verify（4 files/23 tests、typecheck、build）",
          "result": "passed"
        },
        {
          "command": "pnpm verify（全部 package verify 与双 fixture static）",
          "result": "passed"
        },
        {
          "command": "Vite full visual/HMR/stale：64/228/676/0 passed=true",
          "result": "passed"
        },
        {
          "command": "Rsbuild full visual/HMR/stale：8/204/464/0 passed=true",
          "result": "passed"
        },
        {
          "command": "最终文档数字、状态、命令、路径及七份文档本地链接检查",
          "result": "passed"
        },
        {
          "command": "测试前后仓库状态核对",
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
    "id": "independent-found-04-review",
    "role": "review",
    "status": "completed",
    "objective": "独立审查 FOUND-04 no-go 收口的目标一致性、收益/size/exact/mixed 口径、Rsbuild baseline 刷新、prototype 删除范围、权威文档状态与无 production 授权边界，报告所有 actionable finding。",
    "successCriteria": [
      "从原始 JSON/contract/evaluation 检查四 policy 表、definitions/reuse/token links/preserved/size 与 blocker 口径，无 cherry-pick 或组合宣传。",
      "确认 stale Rsbuild baseline 刷新符合 direct-risk attribution contract，未掩盖 CSS/manifest/token 或 production behavior 变化。",
      "确认 6 个 task-owned executable 文件全部删除，无残留引用、public export、adapter instrumentation、schema/config/dependency 变化。",
      "检查 README、evaluation、backlog、benefit、双 Pilot tracking、attribute acceptance 的状态/数字/链接一致；FOUND-04 closed-no-go 不被描述为 SEL-05/06 依赖完成。",
      "评估残余风险和重新开启条件是否遵循 semantic/fallback、no FOUND-05 与 demand-first 边界；不得修改文件。"
    ],
    "read": [
      "AGENTS.md",
      "README.md",
      "packages/core/CORE_DESIGN.md",
      "packages/core/src/index.ts",
      "packages/core/src/public/types.ts",
      "docs/phase-8-multi-local-selector-foundation-evaluation.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/selector-capability-benefit-review.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
      "docs/phase-8-attribute-selector-acceptance.md",
      ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-contract.md",
      ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-evaluation.md",
      "/private/tmp/gss-found04-shadow"
    ],
    "write": [],
    "decisions": [
      "prototype-only",
      "semantic-fallback",
      "stable-contract",
      "no-found05",
      "demand-first",
      "refresh-stale-rsbuild-baseline",
      "no-production-candidate",
      "rollback-shadow-prototype"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "code-search"
      ],
      "available": [
        "workspace-read",
        "code-search",
        "shell",
        "diff"
      ],
      "unavailable": [
        "external-docs"
      ]
    },
    "agentId": "",
    "dependsOn": [
      "rollback-and-document-found-04"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "PASS：未发现 actionable defect；FOUND-04 closed-no-go 收口与原始证据、批准边界及 Core/AGENTS 约束一致。"
      ],
      "artifacts": [],
      "files": [
        "README.md",
        "docs/phase-8-multi-local-selector-foundation-evaluation.md",
        "docs/phase-8-capability-hardening-backlog.md",
        "docs/selector-capability-benefit-review.md",
        "docs/phase-5-real-project-pilot-tracking.md",
        "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
        "docs/phase-8-attribute-selector-acceptance.md",
        "packages/core/CORE_DESIGN.md",
        "packages/core/src/index.ts",
        "packages/core/src/public/types.ts",
        "packages/core/src/engine/planInputClassPreservation.ts",
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/test/pseudoElement.test.ts"
      ],
      "checks": [
        {
          "command": "原始 evaluation JSON、contract、material 与权威文档的四 policy 指标及 no-go 门禁逐项复算",
          "result": "passed"
        },
        {
          "command": "Rsbuild frozen/current report direct attribution 与全 artifact diff 检查",
          "result": "passed"
        },
        {
          "command": "6 个 structural shadow 文件删除、残留引用、public export、adapter instrumentation、schema/config/dependency检查",
          "result": "passed"
        },
        {
          "command": "README、evaluation、backlog、benefit、双 Pilot tracking、attribute acceptance 状态、数字、链接及重开边界检查",
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
    "id": "finalize-found-04-evidence",
    "role": "development",
    "status": "completed",
    "objective": "仅同步 FOUND-04 最终独立 Test/Review 事实：把待执行状态改为已通过，记录双端 full visual 精确数字与 Core pre-image 未持久化的独立证据限制；不得改代码、测试、配置、依赖或改变 no-go/production 边界。",
    "successCriteria": [
      "评估文档记录 Review PASS、Test PASS、Vite 64/228/676/0、Rsbuild 8/204/464/0，以及任务前正式 Core 完整 checksum/pre-image 未持久化导致独立 byte-identical 比较 not_run。",
      "backlog、benefit review、双 Pilot tracking 中不再保留 FOUND-04 独立 Test/Review 待执行的过期表述，并保持 closed-no-go、SEL-04/05/06 deferred、无 production authorization。",
      "仅修改指定中文文档，检查本地链接、报告路径和 scoped git diff --check；不运行或修改生产实现。"
    ],
    "read": [
      "AGENTS.md",
      "docs/phase-8-multi-local-selector-foundation-evaluation.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/selector-capability-benefit-review.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
      ".agent-work/work-items/multi-local-selector-foundation/index.md",
      "/private/tmp/gss-found04-vite-independent.json",
      "/private/tmp/gss-found04-rsbuild-independent.json"
    ],
    "write": [
      "docs/phase-8-multi-local-selector-foundation-evaluation.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/selector-capability-benefit-review.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md"
    ],
    "decisions": [
      "no-production-candidate",
      "rollback-shadow-prototype",
      "semantic-fallback",
      "stable-contract",
      "no-found05",
      "demand-first"
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
        "browser",
        "external-docs"
      ]
    },
    "agentId": "/root/rollback_and_document_found_04",
    "dependsOn": [
      "independent-found-04-test",
      "independent-found-04-review"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "/root",
    "result": {
      "status": "completed",
      "summary": [
        "FOUND-04 独立 Test/Review 已同步为 PASS，并记录双端 full visual 精确结果。",
        "五份文档均明确 Core byte-identical 独立比较为 not_run 及其证据限制。",
        "closed-no-go、deferred、semantic fallback、no FOUND-05 与无 production rewrite 授权保持不变。"
      ],
      "artifacts": [],
      "files": [
        "docs/phase-8-multi-local-selector-foundation-evaluation.md",
        "docs/phase-8-capability-hardening-backlog.md",
        "docs/selector-capability-benefit-review.md",
        "docs/phase-5-real-project-pilot-tracking.md",
        "docs/phase-6-rsbuild-real-project-pilot-tracking.md"
      ],
      "checks": [
        {
          "command": "独立 visual 报告路径与 summary 精确值校验",
          "result": "passed"
        },
        {
          "command": "五份文档本地 Markdown 链接校验",
          "result": "passed"
        },
        {
          "command": "FOUND-04 过期待执行表述与状态/限制一致性检查",
          "result": "passed"
        },
        {
          "command": "git diff --check -- <assignment 五份文档>",
          "result": "passed"
        }
      ],
      "requires_test": false,
      "test_reason": "本次仅同步已完成独立 Test/Review 的事实与现有报告数字，不改变任何产品行为或测试面。",
      "requires_review": true,
      "review_reason": "建议聚焦复核五份文档中的 PASS 状态、visual 数字、Core not_run 限制及 no-go 边界是否完全一致。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "focused-found-04-doc-review",
    "role": "review",
    "status": "completed",
    "objective": "聚焦复核最终 5 份 FOUND-04 文档同步：PASS 状态、双端 full visual 精确数字、Core pre-image not_run 限制、no-go/deferred/no-production 边界必须一致；不重复代码审查或运行测试。",
    "successCriteria": [
      "五份文档均不再把 FOUND-04 独立 Test/Review 写为待执行，并准确记录 Vite 64/228/676/0、Rsbuild 8/204/464/0。",
      "Core 任务前完整 checksum/pre-image 未持久化被明确写为独立 byte-identical 比较 not_run，且没有误写为完整 hash PASS。",
      "closed-no-go、SEL-04/05/06 deferred、semantic fallback、no FOUND-05、无 production rewrite 授权保持一致。",
      "文档链接、报告路径和 diff 均无 actionable finding。"
    ],
    "read": [
      "AGENTS.md",
      "docs/phase-8-multi-local-selector-foundation-evaluation.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/selector-capability-benefit-review.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
      "/private/tmp/gss-found04-vite-independent.json",
      "/private/tmp/gss-found04-rsbuild-independent.json"
    ],
    "write": [],
    "decisions": [
      "no-production-candidate",
      "rollback-shadow-prototype",
      "semantic-fallback",
      "stable-contract",
      "no-found05",
      "demand-first"
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
        "workspace-write",
        "browser",
        "external-docs"
      ]
    },
    "agentId": "/root/independent_found_04_review",
    "dependsOn": [
      "finalize-found-04-evidence"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "PASS：五份最终文档状态、visual 数字、Core not_run 限制及 closed-no-go 边界一致，未发现 actionable finding。",
        "残余证据限制已准确披露：任务前正式 Core 完整 checksum/pre-image 未持久化，无法独立证明 byte-identical。"
      ],
      "artifacts": [],
      "files": [
        "docs/phase-8-multi-local-selector-foundation-evaluation.md",
        "docs/phase-8-capability-hardening-backlog.md",
        "docs/selector-capability-benefit-review.md",
        "docs/phase-5-real-project-pilot-tracking.md",
        "docs/phase-6-rsbuild-real-project-pilot-tracking.md"
      ],
      "checks": [
        {
          "command": "五份文档 PASS 状态与 Vite 64/228/676/0、Rsbuild 8/204/464/0 数字一致性检查",
          "result": "passed"
        },
        {
          "command": "Core byte-identical not_run 限制与 adapter pre-image/hash 可复核性检查",
          "result": "passed"
        },
        {
          "command": "closed-no-go、SEL-04/05/06 deferred、semantic fallback、no FOUND-05、无 production rewrite 边界检查",
          "result": "passed"
        },
        {
          "command": "本地 Markdown 链接、独立 visual 报告路径及 scoped diff-check",
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
    "id": "focused-found-04-closeout-test",
    "role": "test",
    "status": "completed",
    "objective": "验证最终可复核 closeout 状态，不尝试补造任务前 Core pre-image：检查五份文档、现有正式入口无 shadow、六个 prototype 文件缺失、adapter/capture checksum、双端 visual 报告 passed 与精确 summary；确认仓库状态未被 Test 修改。",
    "successCriteria": [
      "六个 executable shadow 文件不存在，正式 Core/public/adapter 中无 structural shadow 残留引用。",
      "capture checksum manifest 与 adapter target/restored hash 校验通过。",
      "Vite/Rsbuild 独立 visual 报告可读、passed=true，summary 分别为 64/228/676/0 与 8/204/464/0。",
      "五份文档准确披露 Core pre-image 独立比较 not_run，且 no-go/deferred/no-production 边界一致。",
      "所有实际执行检查均通过；不把缺失的历史 pre-image 列为本 assignment 的可执行检查，也不修改仓库文件。"
    ],
    "read": [
      "AGENTS.md",
      "packages/core/src/index.ts",
      "packages/core/src/public/types.ts",
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/src/engine/createTransformer.ts",
      "packages/vite/src/plugin.ts",
      "packages/rsbuild/src/buildArtifacts.ts",
      "packages/rsbuild/src/runtimeBridgeLoader.ts",
      "docs/phase-8-multi-local-selector-foundation-evaluation.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/selector-capability-benefit-review.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
      "/private/tmp/gss-found04-shadow/captures/files.sha256",
      "/private/tmp/gss-found04-vite-independent.json",
      "/private/tmp/gss-found04-rsbuild-independent.json"
    ],
    "write": [],
    "decisions": [
      "no-production-candidate",
      "rollback-shadow-prototype",
      "semantic-fallback",
      "stable-contract",
      "no-found05"
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
        "workspace-write",
        "browser",
        "external-docs"
      ]
    },
    "agentId": "/root/independent_found_04_test",
    "dependsOn": [
      "finalize-found-04-evidence",
      "focused-found-04-doc-review"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "最终 closeout 状态通过：六个 shadow 文件不存在，正式入口与 adapter 无 shadow 残留。",
        "Capture checksum、adapter restored evidence 及两份现成 visual report 均通过。",
        "五份文档准确披露历史 Core 比较为 not_run，并保持 closed-no-go、deferred 与无 production 授权边界；未修改仓库。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/index.ts",
        "packages/core/src/public/types.ts",
        "packages/core/src/engine/createTransformer.ts",
        "packages/vite/src/plugin.ts",
        "packages/rsbuild/src/buildArtifacts.ts",
        "packages/rsbuild/src/runtimeBridgeLoader.ts",
        "docs/phase-8-multi-local-selector-foundation-evaluation.md",
        "docs/phase-8-capability-hardening-backlog.md",
        "docs/selector-capability-benefit-review.md",
        "docs/phase-5-real-project-pilot-tracking.md",
        "docs/phase-6-rsbuild-real-project-pilot-tracking.md"
      ],
      "checks": [
        {
          "command": "六个 structural shadow prototype/test/script 文件不存在",
          "result": "passed"
        },
        {
          "command": "正式 Core、adapter、package 与 fixture 中 shadow import/export/env/config/schema/dependency 残留检查",
          "result": "passed"
        },
        {
          "command": "shasum -a 256 -c /private/tmp/gss-found04-shadow/captures/files.sha256",
          "result": "passed"
        },
        {
          "command": "adapter target/restored SHA-256 diff、当前文件 SHA-256 与三份 pre-image cmp",
          "result": "passed"
        },
        {
          "command": "Vite visual report：64/228/676/0 passed=true",
          "result": "passed"
        },
        {
          "command": "Rsbuild visual report：8/204/464/0 passed=true",
          "result": "passed"
        },
        {
          "command": "五份文档披露 checksum/pre-image 未持久化及 Core byte-identical 独立比较 not_run",
          "result": "passed"
        },
        {
          "command": "五份文档 closed-no-go、SEL-04/05/06 deferred 与不授权 production rewrite 一致性检查",
          "result": "passed"
        },
        {
          "command": "测试前后 git status 逐项比较",
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
    "id": "materials/architecture/found-04-contract.md",
    "role": "architecture",
    "path": "materials/architecture/found-04-contract.md",
    "summary": "FOUND-04 structural/resolved、shadow 语料入口、preflight 与实施门槛 contract。",
    "purpose": "约束 Development 在不改变正式输出和公开契约的前提下实现原型。"
  },
  {
    "id": "materials/architecture/found-04-evaluation.md",
    "role": "architecture",
    "path": "materials/architecture/found-04-evaluation.md",
    "summary": "FOUND-04 双 Pilot 独立复算、no-go gate、baseline 刷新与 prototype rollback 决策。",
    "purpose": "作为不实施 SEL-05/06、删除 Core 原型及更新权威状态的决策证据。"
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
        "reason": "删除 Core 原型与测试后仍需独立验证 package/root 构建和正式输出未受影响。"
      },
      "review": {
        "requires": true,
        "reason": "需独立确认 no-go 状态、原型删除范围及权威文档对 baseline attribution 的同步一致性。"
      }
    },
    "development": [
      {
        "assignment": "core-structural-shadow",
        "test": {
          "requires": true,
          "reason": "新 selector policy、cascade oracle、隔离 registry 和压缩指标具有较大语义面，独立测试可补充开发者覆盖。"
        },
        "review": {
          "requires": true,
          "reason": "需要独立确认 role-aware preservation seed、跨 occurrence cascade 阻塞和收益口径严格符合 FOUND-04 contract。"
        }
      },
      {
        "assignment": "capture-pilot-shadow",
        "test": {
          "requires": true,
          "reason": "独立 Test 应复算 capture/evaluation hash、policy 指标、baseline 刷新边界和无满足收益门槛的结论。"
        },
        "review": {
          "requires": true,
          "reason": "需要独立审查 role-aware blocker、exact-only/mixed 分类、size 口径及 stale Rsbuild report baseline 决策没有掩盖正式行为变化。"
        }
      },
      {
        "assignment": "rollback-and-document-found-04",
        "test": {
          "requires": true,
          "reason": "独立 Test 应复核 no-go rollback、checksum 自包含修复、正式产物哈希保持面及完整门禁结果。"
        },
        "review": {
          "requires": true,
          "reason": "独立 Review 应确认多份权威文档的状态、收益数字、Rsbuild attribution 与不授权生产改写边界一致。"
        }
      },
      {
        "assignment": "finalize-found-04-evidence",
        "test": {
          "requires": false,
          "reason": "本次仅同步已完成独立 Test/Review 的事实与现有报告数字，不改变任何产品行为或测试面。"
        },
        "review": {
          "requires": true,
          "reason": "建议聚焦复核五份文档中的 PASS 状态、visual 数字、Core not_run 限制及 no-go 边界是否完全一致。"
        }
      }
    ],
    "main": {
      "test": {
        "requires": true,
        "reason": "双 Pilot counterfactual、baseline 刷新和 full visual/HMR 需要独立复验。"
      },
      "review": {
        "requires": true,
        "reason": "no-go rollback、收益口径和多份权威状态需要独立缺陷复核。"
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
    "FOUND-04 已按双 Pilot 门禁完成一次性 non-production shadow 评估并收口为 closed-no-go；四项 policy 均未同时满足 exact-only 与体积门槛，可执行 prototype 已回滚，独立 Test/Review 及双端 full visual 均通过，未授权任何联级/多 local production rewrite。"
  ],
  "artifacts": [],
  "blockers": [],
  "next_action": "暂停 selector 结构扩展；仅在出现新的真实 corpus 或 class-string/体积策略后重新开启 FOUND-04 门禁。",
  "success_evidence": [
    {
      "criterion": "冻结当前正式 Core、Vite、Rsbuild 与双 Pilot artifact；shadow 关闭或删除时，既有 CSS、tokens、manifest、report 和 SEL-01/02/03 descriptor 输出保持 byte-identical。",
      "evidence": "六个 executable shadow 文件已删除，adapter capture target pre-image/restored hash 可独立复核，双端正式 artifacts 与冻结基线保持；独立 Test 同时确认无 shadow 引用。任务前正式 Core 完整 pre-image 未持久化，故 Core byte-identical 的独立比较明确记为 not_run，而非伪报通过。",
      "pointers": [
        "docs/phase-8-multi-local-selector-foundation-evaluation.md",
        ".agent-work/work-items/multi-local-selector-foundation/index.md"
      ]
    },
    {
      "criterion": "形成并实现仅内部使用的 structural selector arm 与 resolved selector arm 模型，确定性选择 anchor、解析 semantic guard identity，并保持原 selector 结构、spelling、specificity 与 whole-rule fallback。",
      "evidence": "Architecture contract 与一次性 Core shadow prototype 完成 structural/resolved arm、确定性 anchor、resolved guard identity、原结构/spelling/specificity 和 whole-rule fallback 验证；四项 no-go 后按停止条款删除 executable prototype，仅保留研究材料。",
      "pointers": [
        ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-contract.md",
        ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-evaluation.md",
        "docs/phase-8-multi-local-selector-foundation-evaluation.md"
      ]
    },
    {
      "criterion": "在任何正式 registry mutation 前完成 candidate preflight，并由隔离 shadow registry 输出可复算的 direct rules/declarations、exact-only/mixed class、blocked reason、definitions/reuse/token links 与体积估算，不污染正式结果。",
      "evidence": "隔离 evaluator 的两次回放 hash 一致，capture/evaluation checksum 与 aggregate 重建均通过；原始 JSON 可复算四 policy 的 direct/exact/mixed/registry/size 指标，正式 registry、manifest、report 与 adapter 输出未接入 candidate。",
      "pointers": [
        "docs/phase-8-multi-local-selector-foundation-evaluation.md",
        ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-evaluation.md"
      ]
    },
    {
      "criterion": "Core 自动测试覆盖 compound、two-local descendant、child、single-local descendant-tag、selector list、non-exported、resolver、nested/unsupported、media/supports、important、重复及 shorthand/longhand cascade 和零部分注册。",
      "evidence": "一次性 prototype 阶段 Core 193 项测试通过并覆盖 contract 矩阵；rollback 后独立 Test 再运行当前 Core verify，10 files/161 tests、typecheck、build 全部通过。prototype 测试随 no-go rollback 删除，覆盖事实保留在 Work Item role evidence。",
      "pointers": [
        ".agent-work/work-items/multi-local-selector-foundation/index.md",
        ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-contract.md"
      ]
    },
    {
      "criterion": "Vite/Rsbuild 只消费通用 Core candidate 结果，不复制 grammar/anchor/guard；fixture static、浏览器 semantic/native 与 HMR 证明正式页面 0 差异、0 stale selector。",
      "evidence": "临时 adapter capture instrumentation 已按 pre-image 精确恢复，没有 grammar/anchor/guard 残留；独立 Vite full visual 为 64/228/676/0，Rsbuild 为 8/204/464/0，均 passed=true，并覆盖 HMR/stale。",
      "pointers": [
        "docs/phase-8-multi-local-selector-foundation-evaluation.md",
        "docs/phase-5-real-project-pilot-tracking.md",
        "docs/phase-6-rsbuild-real-project-pilot-tracking.md"
      ]
    },
    {
      "criterion": "双 Pilot 使用冻结语料分别给出各 candidate 子集的真实 unlock、reuse、preserved 与 raw/gzip/brotli/class-string/estimated-total-diff，且不把 authored 上限、fixture oracle 或 arm reuse 冒充实际收益。",
      "evidence": "双 Pilot 原始 capture/evaluation 已独立复算并记录四 policy 的 exact-only、definitions/reuse/links、preserved 与 size 指标；门禁严格按真实 exact-only 与 estimated total diff，未使用 mixed、authored 上限、fixture 或 policy 合并值。",
      "pointers": [
        "docs/phase-8-multi-local-selector-foundation-evaluation.md",
        "docs/selector-capability-benefit-review.md",
        ".agent-work/work-items/multi-local-selector-foundation/materials/architecture/found-04-evaluation.md"
      ]
    },
    {
      "criterion": "同步 FOUND-04 设计、验收、backlog 与收益文档，明确停止条件、回滚方式和 SEL-05/SEL-06 中至多一个后续 production 推荐；不把推荐表述为实施授权。",
      "evidence": "权威评估、backlog、收益与双 Pilot tracking 已同步并通过聚焦 Review；结论是四 policy 全部 no-go，因此没有 production candidate，SEL-04/05/06 deferred，semantic fallback、no FOUND-05 与无 production rewrite 授权保持明确。",
      "pointers": [
        "docs/phase-8-multi-local-selector-foundation-evaluation.md",
        "docs/phase-8-capability-hardening-backlog.md",
        "docs/selector-capability-benefit-review.md",
        "docs/phase-5-real-project-pilot-tracking.md",
        "docs/phase-6-rsbuild-real-project-pilot-tracking.md"
      ]
    }
  ]
}
```
<!-- workflow:result:end -->
