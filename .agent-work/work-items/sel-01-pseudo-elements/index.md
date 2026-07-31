---
id: "sel-01-pseudo-elements"
name: "SEL-01 单锚点伪元素安全转换"
summary: "为单 local class 的 before/after 伪元素建立保守、安全、可验收的 atomic 转换能力。"
keywords: ["SEL-01","pseudo-element","selector","cascade","vite","rsbuild"]
type: "delivery"
status: "completed"
stage: "close"
parent: "../../index.md"
owner: "/root"
lease_until: "2026-07-30T05:04:11.159Z"
updated_at: "2026-07-29T05:04:11.159Z"
---

# SEL-01 单锚点伪元素安全转换

## Goal

<!-- workflow:goal:start -->
```json
"实现已确认的 SEL-01：支持单 local class anchor 的 ::before/::after 及 legacy :before/:after，保持语义 class、完整 fallback 和现有公共 schema，并通过 Core、双 adapter、fixture、Pilot 与浏览器门禁。"
```
<!-- workflow:goal:end -->

## Success criteria

<!-- workflow:success_criteria:start -->
```json
[
  "Core 安全转换现代与 legacy before/after，并对 unsafe 结构、alias cascade 风险和 selector list 完整 fallback。",
  "Vite 与 Rsbuild 仅消费 Core descriptor，manifest/report schema 不变且无 adapter grammar 复制。",
  "双 fixture 覆盖静态、HMR、CSSOM 与 computed pseudo style 的 semantic/native 等价。",
  "Vite 与 Rsbuild Pilot 的目标 pseudo blocker 解除，其他 unsafe evidence 仍完整保留。",
  "相关设计、acceptance、tracking、backlog 与收益文档同步，所需验证全部通过。"
]
```
<!-- workflow:success_criteria:end -->

## Confirmed decisions

<!-- workflow:confirmed_decisions:start -->
```json
[
  {
    "id": "grammar-boundary",
    "summary": "仅支持一个 local class anchor，selector 末尾单个 before/after；拒绝 tag、id、combinator、额外 class、attribute、pseudo class 和多 pseudo。",
    "evidence": []
  },
  {
    "id": "legacy-required",
    "summary": "同时支持 ::before/::after 与 legacy :before/:after；identity 与 renderer 保留 Core 实际输入拼写。",
    "evidence": []
  },
  {
    "id": "cascade-canonicalization",
    "summary": "cascade guard 将 :before 与 ::before 归一为同一语义 pseudo box，before 与 after 彼此独立。",
    "evidence": []
  },
  {
    "id": "list-excluded",
    "summary": "SEL-01 不把 pseudo-element arms 纳入 selector-list 成功路径；伪元素列表继续完整 selector-list fallback。",
    "evidence": []
  },
  {
    "id": "schema-stable",
    "summary": "不修改公开 TransformCss/Result、AtomicSelectorDescriptor、manifest、report 或 diagnostic schema，不新增生产依赖。",
    "evidence": []
  },
  {
    "id": "semantic-preserved",
    "summary": "semantic scoped class 始终保留；Vite/Rsbuild 不复制 Core grammar、planner 或 cascade guard。",
    "evidence": []
  },
  {
    "id": "identity-spelling-preserved",
    "summary": "SEL-01 identity 与 atomic renderer 必须保留 Core 实际输入的 :before/::before 或 :after/::after spelling；仅 cascade guard 归一语义名称。架构材料中的全量双冒号 canonicalization recommendation 不采纳。",
    "evidence": []
  }
]
```
<!-- workflow:confirmed_decisions:end -->

## Current progress

<!-- workflow:current_progress:start -->
```json
"SEL-01 实现、Pilot、独立 Test/Review、修复、focused Retest/Rereview 与文档收口全部完成；正在执行最终 workflow/evidence 校验。"
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
    "id": "lock-architecture",
    "text": "核验 SEL-01 Core grammar、cascade、fallback、adapter 边界和验收设计。",
    "status": "completed",
    "assignment": "sel01-architecture",
    "blockers": []
  },
  {
    "id": "implement-sel01",
    "text": "实现 SEL-01 Core、双 adapter fixture、HMR/visual coverage 与文档。",
    "status": "completed",
    "assignment": "sel01-implementation",
    "blockers": []
  },
  {
    "id": "verify-sel01",
    "text": "执行独立浏览器 Test、compiler Review，并修复所有 actionable findings。",
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
    "id": "sel01-architecture",
    "role": "architecture",
    "status": "completed",
    "objective": "基于当前 SEL-02/SEL-03 实现与双 Pilot 证据，给出可直接开发的 SEL-01 内部设计：parser grammar、identity/renderer、legacy alias cascade guard、selector-list 排除、preflight preservation、测试矩阵与 Pilot 基线门槛。",
    "successCriteria": [
      "设计不改变公共 schema、生产依赖或 adapter 职责。",
      "明确 :before/::before 竞争模型、before/after 独立性和零部分注册要求。",
      "确认现有代码接入点、测试文件与文档更新清单。",
      "把结论写入唯一分配的 architecture Material。"
    ],
    "read": [
      "AGENTS.md",
      "semantic-atomic-css-plugin-plan.md",
      "packages/core/CORE_DESIGN.md",
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/src/engine/transformCss.ts",
      "packages/core/test/selector.test.ts",
      "packages/core/test/selectorList.test.ts",
      "packages/core/test/cascadeOracle.test.ts",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/phase-8-selector-list-design.md",
      "docs/selector-capability-benefit-review.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
      "playground/vite-react-css-modules/dist",
      "playground/rsbuild-react-css-modules/dist"
    ],
    "write": [
      ".agent-work/work-items/sel-01-pseudo-elements/materials/architecture/sel01-design.md"
    ],
    "decisions": [
      "grammar-boundary",
      "legacy-required",
      "cascade-canonicalization",
      "list-excluded",
      "schema-stable",
      "semantic-preserved"
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
        "确认四种 before/after 输入可在现有 planner 内保守扩展，并在 registry mutation 前完成 class-wide cascade preservation。",
        "确认伪元素 arm 必须显式排除于 SEL-03 selector-list 成功路径，unsafe list 零部分注册。",
        "架构建议的 identity/renderer 双冒号 canonicalization 被既有 confirmed decision 覆盖；开发将保留 Core 输入 spelling，仅 guard 归一。"
      ],
      "artifacts": [
        {
          "path": ".agent-work/work-items/sel-01-pseudo-elements/materials/architecture/sel01-design.md",
          "purpose": "提供 grammar、cascade、测试、Pilot 与回滚分析。"
        }
      ],
      "files": [
        "packages/core/src/selector/planSelectorRewrite.ts",
        "packages/core/src/engine/planInputClassPreservation.ts",
        "packages/core/src/engine/transformCss.ts"
      ],
      "checks": [
        {
          "command": "postcss-selector-parser legacy/modern before/after AST probe",
          "result": "passed"
        },
        {
          "command": "Vite/Rsbuild Pilot report、manifest 与 dist baseline audit",
          "result": "passed"
        },
        {
          "command": "pnpm --filter @semantic-atomic-css/core verify",
          "result": "not_run"
        }
      ],
      "requires_test": true,
      "test_reason": "该能力改变 compiler safe grammar、atomic identity、cascade preservation 与浏览器 pseudo-element 输出，必须独立验证。",
      "requires_review": true,
      "review_reason": "legacy alias guard 和 class-wide preflight 影响 key/class 稳定性及 fallback 边界，需要独立语义审查。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "sel01-implementation",
    "role": "development",
    "status": "completed",
    "objective": "实现完整 SEL-01：Core 支持单 local anchor 的现代/legacy before/after，identity/renderer 保留输入 spelling、guard 归一 alias，伪元素 selector list 完整 fallback；补齐 package、fixture、HMR/visual、Pilot closeout 与中文文档，保持公共 schema 和 adapter 边界不变。",
    "successCriteria": [
      "Core 四种输入成功且 unsafe/alias cascade/list/non-exported/config/nested evidence 全部保守、零部分注册。",
      "descriptor CSS 只有单 selector 且保留 Core 实际 spelling；:before 与 ::before identity 不合并，guard 仍视为同 pseudo box。",
      "Vite/Rsbuild production adapter 不新增 grammar；package/static fixture 覆盖 descriptor、mapping、fallback、HMR stale cleanup。",
      "fixture visual 覆盖 before/after computed content、color、layout、CSSOM、semantic token 与 desktop/narrow dev/preview。",
      "Pilot current 与 baseline 同语料，Vite 三条 pseudo-element 和 Rsbuild 三条 unsupported-pseudo 消失，仅 selectorValue 获得 mapping，另两 class 因既有 evidence 保留。",
      "新增 SEL-01 design/acceptance 并同步 Core、backlog、双 adapter acceptance、双 Pilot tracking、benefit review 和总计划。"
    ],
    "read": [
      "AGENTS.md",
      "README.md",
      "package.json",
      "semantic-atomic-css-plugin-plan.md",
      "packages/core",
      "packages/analyzer/test",
      "packages/devtools/test",
      "packages/vite/test",
      "packages/rsbuild/test",
      "fixtures/vite-css-modules",
      "fixtures/rsbuild-css-modules",
      "playground/vite-react-css-modules",
      "playground/rsbuild-react-css-modules",
      "docs",
      "materials/architecture/sel01-design.md",
      "/private/tmp/gss-pseudo-element-pilot/baseline",
      "/private/tmp/gss-pseudo-element-pilot/baseline.sha256"
    ],
    "write": [
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/test",
      "packages/analyzer/test",
      "packages/devtools/test",
      "packages/vite/test",
      "packages/rsbuild/test",
      "fixtures/vite-css-modules/scripts",
      "fixtures/vite-css-modules/suites/base/src",
      "fixtures/rsbuild-css-modules/scripts",
      "fixtures/rsbuild-css-modules/suites/base/src",
      "playground/vite-react-css-modules",
      "playground/rsbuild-react-css-modules",
      "packages/core/CORE_DESIGN.md",
      "semantic-atomic-css-plugin-plan.md",
      "docs"
    ],
    "decisions": [
      "grammar-boundary",
      "legacy-required",
      "cascade-canonicalization",
      "list-excluded",
      "schema-stable",
      "semantic-preserved",
      "identity-spelling-preserved"
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
    "agentId": "",
    "dependsOn": [
      "sel01-architecture"
    ],
    "sharedInterfaceStable": false,
    "touchesGlobal": true,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "已实现 terminal before/after pseudo elements 的 Core、consumer、fixture、Pilot evidence 与文档。",
        "createTransformer fallback emission 泛化及 classifyPropertyCompetition 的 border-radius independence 是正确诊断与实际伪元素 atomization 所需扩展，待独立 Review 审查。",
        "实现门禁通过，浏览器 visual 与独立语义审查仍待执行。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/selector/planSelectorRewrite.ts",
        "packages/core/src/engine/planInputClassPreservation.ts",
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/src/declaration/classifyPropertyCompetition.ts",
        "packages/core/test/pseudoElement.test.ts",
        "packages/core/test/selector.test.ts",
        "packages/core/test/selectorList.test.ts",
        "packages/core/test/transformer.test.ts",
        "packages/core/test/cascadeOracle.test.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/vite/test/pluginDev.test.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts",
        "packages/rsbuild/test/devStyles.test.ts",
        "fixtures/vite-css-modules/suites/base/src/App.tsx",
        "fixtures/vite-css-modules/suites/base/src/cases/FallbackCase.module.css",
        "fixtures/vite-css-modules/scripts/verify-static.mjs",
        "fixtures/vite-css-modules/scripts/verify-visual.mjs",
        "fixtures/rsbuild-css-modules/suites/base/src/Base.module.css",
        "fixtures/rsbuild-css-modules/suites/base/src/main.js",
        "fixtures/rsbuild-css-modules/scripts/verify-static.mjs",
        "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs",
        "packages/core/CORE_DESIGN.md",
        "semantic-atomic-css-plugin-plan.md",
        "docs/phase-3-acceptance.md",
        "docs/phase-6-rsbuild-rspack-adapter-acceptance.md",
        "docs/phase-5-real-project-pilot-tracking.md",
        "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
        "docs/selector-capability-benefit-review.md",
        "docs/phase-8-capability-hardening-backlog.md",
        "docs/phase-8-pseudo-element-design.md",
        "docs/phase-8-pseudo-element-acceptance.md"
      ],
      "checks": [
        {
          "command": "pnpm --filter @semantic-atomic-css/core verify",
          "result": "passed"
        },
        {
          "command": "Vite targeted pluginBuild/pluginDev tests",
          "result": "passed"
        },
        {
          "command": "Rsbuild targeted buildArtifacts/devStyles tests",
          "result": "passed"
        },
        {
          "command": "pnpm --dir fixtures/vite-css-modules verify",
          "result": "passed"
        },
        {
          "command": "pnpm --dir fixtures/rsbuild-css-modules verify",
          "result": "passed"
        },
        {
          "command": "Frozen Pilot baseline SHA-256 verification",
          "result": "passed"
        },
        {
          "command": "Vite and Rsbuild semantic/native Pilot builds and comparison",
          "result": "passed"
        },
        {
          "command": "pnpm verify",
          "result": "passed"
        },
        {
          "command": "git diff --check",
          "result": "passed"
        },
        {
          "command": "pnpm --dir fixtures/vite-css-modules test:visual",
          "result": "not_run"
        },
        {
          "command": "pnpm --dir fixtures/rsbuild-css-modules test:visual",
          "result": "not_run"
        }
      ],
      "requires_test": true,
      "test_reason": "独立浏览器验收必须确认 pseudo computed style、CSSOM、responsive 与 semantic token binding。",
      "requires_review": true,
      "review_reason": "compiler selector/cascade 语义及 fallback/property competition 扩展需要独立缺陷审查。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "sel01-independent-test",
    "role": "test",
    "status": "completed",
    "objective": "独立验证 SEL-01 的 Core/adapter/fixture/Pilot/browser 行为，不修改实现；执行根门禁、双 fixture full visual、artifact mapping 与 CSSOM/computed pseudo style 检查。",
    "successCriteria": [
      "pnpm verify 通过。",
      "Vite/Rsbuild fixture full visual 在 dev/preview、desktop/narrow 下 pseudo before/after computed content/color/display/dimensions/margins 与 semantic/native 一致。",
      "CSSOM 存在单 arm pseudo atomic selector，semantic token 始终存在且 unsafe list 无部分 token。",
      "HMR update/remove/import cleanup 无 stale pseudo token/selector/fallback。",
      "Pilot baseline/current corpus 不变、三条旧 blocker 消失、selectorValue mapping 非空、另两 class 保守 fallback、真实 delta 与文档一致。"
    ],
    "read": [
      "AGENTS.md",
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/src/declaration/classifyPropertyCompetition.ts",
      "packages/core/test/pseudoElement.test.ts",
      "packages/core/test/selectorList.test.ts",
      "packages/core/test/cascadeOracle.test.ts",
      "packages/vite/test/pluginBuild.test.ts",
      "packages/vite/test/pluginDev.test.ts",
      "packages/rsbuild/test/buildArtifacts.test.ts",
      "packages/rsbuild/test/devStyles.test.ts",
      "fixtures/vite-css-modules",
      "fixtures/rsbuild-css-modules",
      "docs/phase-8-pseudo-element-acceptance.md",
      "/private/tmp/gss-pseudo-element-pilot/baseline",
      "/private/tmp/gss-pseudo-element-pilot/current",
      "/private/tmp/gss-pseudo-element-pilot/baseline.sha256"
    ],
    "write": [],
    "decisions": [
      "grammar-boundary",
      "legacy-required",
      "cascade-canonicalization",
      "list-excluded",
      "schema-stable",
      "semantic-preserved",
      "identity-spelling-preserved"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "shell",
        "browser"
      ],
      "available": [
        "workspace-read",
        "shell",
        "browser"
      ],
      "unavailable": []
    },
    "agentId": "",
    "dependsOn": [
      "sel01-implementation"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "根门禁及 Pilot/hash/mapping/delta/文档核对通过。",
        "双 full visual 因 Chrome 将 legacy :before/:after CSSOM selectorText 标准化为 ::before/::after而被严格单冒号断言误判失败。",
        "Rsbuild computed parity 为零差异；Vite 在 CSSOM 断言提前终止，base full report 未生成，preprocessor HMR 补跑通过。"
      ],
      "artifacts": [],
      "files": [
        "fixtures/vite-css-modules/scripts/verify-visual.mjs",
        "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs",
        "fixtures/vite-css-modules/scripts/verify-static.mjs",
        "fixtures/rsbuild-css-modules/scripts/verify-static.mjs",
        "packages/vite/test/pluginDev.test.ts",
        "packages/rsbuild/test/devStyles.test.ts",
        "docs/phase-8-pseudo-element-acceptance.md"
      ],
      "checks": [
        {
          "command": "pnpm verify",
          "result": "passed"
        },
        {
          "command": "Vite full visual",
          "result": "failed"
        },
        {
          "command": "Vite full report and base computed coverage",
          "result": "not_run"
        },
        {
          "command": "Rsbuild full visual",
          "result": "failed"
        },
        {
          "command": "Rsbuild computed pseudo parity inspection",
          "result": "passed"
        },
        {
          "command": "Vite preprocessor visual HMR cleanup",
          "result": "passed"
        },
        {
          "command": "Chrome 150 legacy pseudo CSSOM serialization probe",
          "result": "passed"
        },
        {
          "command": "Fixture static/package pseudo assertions",
          "result": "passed"
        },
        {
          "command": "Pilot baseline/current evidence audit",
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
    "id": "sel01-independent-review",
    "role": "review",
    "status": "completed",
    "objective": "独立审查 SEL-01 selector grammar、input-spelling identity、alias cascade preflight、list full fallback、fallback emission/property competition 扩展、adapter boundary、测试充分性与文档一致性，不修改任何文件。",
    "successCriteria": [
      "确认四种成功 grammar 与所有 unsafe near-miss/fallback reason 符合 confirmed decisions。",
      "确认 :before/::before identity 分离但 cascade box 归一，before/after 独立，preflight 在 registry mutation 前且零部分污染。",
      "重点审查 createTransformer fallback emission 泛化与 border-radius competition 扩展是否必要、局部且无 SEL-02/SEL-03 回归。",
      "确认 adapter 未复制 grammar/guard、公共 schema/依赖未改变、tests 覆盖缺口可接受。",
      "确认 design/acceptance/tracking/benefit/backlog/总计划与实际 artifacts 和未完成状态一致。"
    ],
    "read": [
      "AGENTS.md",
      "semantic-atomic-css-plugin-plan.md",
      "packages/core/CORE_DESIGN.md",
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/src/declaration/classifyPropertyCompetition.ts",
      "packages/core/test",
      "packages/vite/test/pluginBuild.test.ts",
      "packages/vite/test/pluginDev.test.ts",
      "packages/rsbuild/test/buildArtifacts.test.ts",
      "packages/rsbuild/test/devStyles.test.ts",
      "fixtures/vite-css-modules/scripts",
      "fixtures/rsbuild-css-modules/scripts",
      "docs/phase-8-pseudo-element-design.md",
      "docs/phase-8-pseudo-element-acceptance.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/phase-3-acceptance.md",
      "docs/phase-6-rsbuild-rspack-adapter-acceptance.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
      "docs/selector-capability-benefit-review.md",
      "/private/tmp/gss-pseudo-element-pilot/baseline",
      "/private/tmp/gss-pseudo-element-pilot/current"
    ],
    "write": [],
    "decisions": [
      "grammar-boundary",
      "legacy-required",
      "cascade-canonicalization",
      "list-excluded",
      "schema-stable",
      "semantic-preserved",
      "identity-spelling-preserved"
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
      "unavailable": []
    },
    "agentId": "",
    "dependsOn": [
      "sel01-implementation"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "[P2] Core implementation uses attribute-cascade-order for pseudo-element cascade guard while authoritative contract and confirmed decision reserve pseudo-element reason for this fallback.",
        "Other SEL-01 grammar, spelling identity, alias preflight, list fallback, property competition, adapter boundary and tests had no actionable code finding.",
        "Residual attribution risk remains because the worktree contains earlier SEL-02/SEL-03 dirty/untracked changes."
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/selector/planSelectorRewrite.ts",
        "packages/core/src/engine/planInputClassPreservation.ts",
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/src/declaration/classifyPropertyCompetition.ts",
        "packages/core/test/pseudoElement.test.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/vite/test/pluginDev.test.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts",
        "packages/rsbuild/test/devStyles.test.ts"
      ],
      "checks": [
        {
          "command": "SEL-01 Core grammar, identity, cascade and fallback inspection",
          "result": "passed"
        },
        {
          "command": "Adapter boundary, fixture and Pilot artifact inspection",
          "result": "passed"
        },
        {
          "command": "Core fallback reason contract consistency inspection",
          "result": "failed"
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
    "id": "fix-reason-and-cssom",
    "role": "development",
    "status": "completed",
    "objective": "修复独立门禁发现的两项缺陷：pseudo-element cascade guard 必须输出既有 pseudo-element reason（attribute candidate 仍为 attribute-cascade-order），并使双 fixture CSSOM 断言接受浏览器对 legacy pseudo 的标准双冒号序列化，同时保持源 descriptor spelling 静态契约。",
    "successCriteria": [
      "pseudo alias cascade risk 的 public diagnostic/unsafeReason/preservedRule reason 为 pseudo-element，attribute guard 行为与 reason 不变。",
      "mixed/propagated evidence 不伪造 reason，零部分 registry 和原 report 计数保持。",
      "Vite/Rsbuild visual CSSOM 断言按语义匹配 :before/::before 与 :after/::after，但 static/package assertions 仍验证 descriptor 输入 spelling。",
      "更新相应 Core tests、fixture self-test 和 SEL-01 design/acceptance/Core design，不扩大公共 schema。",
      "Core、双 fixture verify、pnpm verify 与 git diff --check 通过；browser 留给 Retest。"
    ],
    "read": [
      "AGENTS.md",
      "packages/core/CORE_DESIGN.md",
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/test/pseudoElement.test.ts",
      "packages/core/test/cascadeOracle.test.ts",
      "packages/core/test/preservationPlan.test.ts",
      "fixtures/vite-css-modules/scripts/verify-visual.mjs",
      "fixtures/vite-css-modules/scripts/verify-static.mjs",
      "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs",
      "fixtures/rsbuild-css-modules/scripts/verify-static.mjs",
      "docs/phase-8-pseudo-element-design.md",
      "docs/phase-8-pseudo-element-acceptance.md",
      "semantic-atomic-css-plugin-plan.md"
    ],
    "write": [
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/test/pseudoElement.test.ts",
      "packages/core/test/cascadeOracle.test.ts",
      "packages/core/test/preservationPlan.test.ts",
      "packages/core/CORE_DESIGN.md",
      "fixtures/vite-css-modules/scripts/verify-visual.mjs",
      "fixtures/vite-css-modules/scripts/verify-static.mjs",
      "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs",
      "fixtures/rsbuild-css-modules/scripts/verify-static.mjs",
      "docs/phase-8-pseudo-element-design.md",
      "docs/phase-8-pseudo-element-acceptance.md",
      "semantic-atomic-css-plugin-plan.md"
    ],
    "decisions": [
      "cascade-canonicalization",
      "schema-stable",
      "identity-spelling-preserved"
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
    "agentId": "",
    "dependsOn": [
      "sel01-independent-test",
      "sel01-independent-review"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "Pseudo alias risk 现输出 pseudo-element，attribute risk 保留 attribute-cascade-order，传播不伪造 public reason。",
        "双 fixture visual 接受 Chrome legacy pseudo CSSOM 标准化，但 Core/static spelling 契约未放宽。",
        "自动门禁、自测、根 verify 与 scoped diff check 全部通过，等待 focused Retest/Rereview。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/engine/planInputClassPreservation.ts",
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/test/pseudoElement.test.ts",
        "packages/core/test/preservationPlan.test.ts",
        "packages/core/CORE_DESIGN.md",
        "fixtures/vite-css-modules/scripts/verify-visual.mjs",
        "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs",
        "docs/phase-8-pseudo-element-design.md",
        "docs/phase-8-pseudo-element-acceptance.md",
        "semantic-atomic-css-plugin-plan.md",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts"
      ],
      "checks": [
        {
          "command": "pnpm --filter @semantic-atomic-css/core verify",
          "result": "passed"
        },
        {
          "command": "pnpm --filter @semantic-atomic-css/vite-fixture verify",
          "result": "passed"
        },
        {
          "command": "pnpm --filter @semantic-atomic-css/rsbuild-fixture verify",
          "result": "passed"
        },
        {
          "command": "Vite visual self-test",
          "result": "passed"
        },
        {
          "command": "Rsbuild visual self-test",
          "result": "passed"
        },
        {
          "command": "pnpm verify",
          "result": "passed"
        },
        {
          "command": "Scoped reason/CSSOM diff check",
          "result": "passed"
        },
        {
          "command": "Full browser visual",
          "result": "not_run"
        }
      ],
      "requires_test": true,
      "test_reason": "Focused browser Retest 必须验证 Chrome selectorText 与 computed pseudo style。",
      "requires_review": true,
      "review_reason": "Focused Rereview 必须确认 reason attribution、传播、零 registry pollution 和 schema 不变。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "update-package-reason-contracts",
    "role": "development",
    "status": "completed",
    "objective": "更新 Vite/Rsbuild package consumer tests，使 pseudo alias cascade risk 期望既有 pseudo-element reason；保持 attribute risk 仍为 attribute-cascade-order，并验证 generic adapter consumption。",
    "successCriteria": [
      "仅修改两个 package test 文件中的 SEL-01 alias reason contract，不触碰生产 adapter。",
      "Vite/Rsbuild targeted package tests 通过。",
      "pnpm verify 通过，证明没有遗漏其他旧 expectation。",
      "git diff --check 通过。"
    ],
    "read": [
      "AGENTS.md",
      "packages/vite/test/pluginBuild.test.ts",
      "packages/rsbuild/test/buildArtifacts.test.ts",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/test/pseudoElement.test.ts"
    ],
    "write": [
      "packages/vite/test/pluginBuild.test.ts",
      "packages/rsbuild/test/buildArtifacts.test.ts"
    ],
    "decisions": [
      "schema-stable",
      "cascade-canonicalization"
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
    "agentId": "",
    "dependsOn": [
      "sel01-independent-test",
      "sel01-independent-review"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "Vite 与 Rsbuild SEL-01 alias consumer contract 已改为 pseudo-element reason/distribution。",
        "真正 attribute candidate 的 attribute-cascade-order assertions 保持不变。"
      ],
      "artifacts": [],
      "files": [
        "packages/vite/test/pluginBuild.test.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts"
      ],
      "checks": [
        {
          "command": "Vite pluginBuild targeted test",
          "result": "passed"
        },
        {
          "command": "Rsbuild buildArtifacts targeted test",
          "result": "passed"
        },
        {
          "command": "SEL-01 and attribute reason contract audit",
          "result": "passed"
        },
        {
          "command": "pnpm verify",
          "result": "passed"
        },
        {
          "command": "package test diff check",
          "result": "passed"
        },
        {
          "command": "Browser visual",
          "result": "not_run"
        }
      ],
      "requires_test": true,
      "test_reason": "仍需 focused browser Retest 验证 CSSOM 与 computed pseudo 行为。",
      "requires_review": true,
      "review_reason": "仍需 focused Rereview 确认 reason contract 与 Core propagation 一致。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "sel01-focused-retest",
    "role": "retest",
    "status": "completed",
    "objective": "Focused Retest：验证 reason/CSSOM 修复后根门禁与 Vite/Rsbuild full browser visual 全部通过，并确认报告覆盖 base dev/preview desktop/narrow、computed pseudo、CSSOM、HMR cleanup。",
    "successCriteria": [
      "pnpm verify 通过。",
      "Vite full visual 生成报告且 passed=true，覆盖 base 与 preprocessor、dev/preview、desktop/narrow。",
      "Rsbuild full visual 生成报告且 passed=true。",
      "Chrome selectorText canonicalization 不再误报，computed pseudo parity、semantic token、CSSOM 与 HMR cleanup 均通过。",
      "targeted Core/package reason contracts 验证 pseudo-element 与 attribute-cascade-order 分工正确。"
    ],
    "read": [
      "AGENTS.md",
      "packages/core/test/pseudoElement.test.ts",
      "packages/core/test/preservationPlan.test.ts",
      "packages/vite/test/pluginBuild.test.ts",
      "packages/rsbuild/test/buildArtifacts.test.ts",
      "fixtures/vite-css-modules",
      "fixtures/rsbuild-css-modules",
      "docs/phase-8-pseudo-element-acceptance.md"
    ],
    "write": [],
    "decisions": [],
    "capabilities": {
      "required": [
        "workspace-read",
        "shell",
        "browser"
      ],
      "available": [
        "workspace-read",
        "shell",
        "browser"
      ],
      "unavailable": []
    },
    "agentId": "",
    "dependsOn": [
      "fix-reason-and-cssom",
      "update-package-reason-contracts"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "根 verify 与 Core/Vite/Rsbuild targeted reason tests 通过。",
        "Vite full visual 在 base/dev/attribute-state guarded atomic selector 断言失败并未生成报告。",
        "Rsbuild full visual passed=true：8 runs、204 cases、464 comparisons、0 differences。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/test/pseudoElement.test.ts",
        "packages/core/test/preservationPlan.test.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts",
        "fixtures/vite-css-modules/scripts/verify-visual.mjs",
        "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs"
      ],
      "checks": [
        {
          "command": "pnpm verify",
          "result": "passed"
        },
        {
          "command": "Core pseudo reason targeted tests",
          "result": "passed"
        },
        {
          "command": "Vite pluginBuild targeted test",
          "result": "passed"
        },
        {
          "command": "Rsbuild buildArtifacts targeted test",
          "result": "passed"
        },
        {
          "command": "Vite full visual",
          "result": "failed"
        },
        {
          "command": "Rsbuild full visual",
          "result": "passed"
        },
        {
          "command": "Both visual report completeness inspection",
          "result": "failed"
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
    "id": "sel01-focused-rereview",
    "role": "rereview",
    "status": "completed",
    "objective": "Focused Rereview：确认 P2 reason contract 已修复且 CSSOM assertion 修复不弱化 input-spelling/static contract，不引入 attribute guard、registry、schema 或文档回归。",
    "successCriteria": [
      "pseudo direct risk 输出 pseudo-element，attribute direct risk 输出 attribute-cascade-order，propagated eligible rule 不伪造 public reason。",
      "preflight 仍在 registry mutation 前且 fresh transformer 零部分污染。",
      "CSSOM 比较仅接受 legacy pseudo 的浏览器等价标准化，不接受逗号 list、错误 token 或错误 pseudo box。",
      "Core/static/package tests 仍锁定 input spelling identity/renderer，public schema/依赖/adapter production 不变。",
      "Core design、SEL-01 design/acceptance 与总计划一致。"
    ],
    "read": [
      "AGENTS.md",
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/test/pseudoElement.test.ts",
      "packages/core/test/preservationPlan.test.ts",
      "packages/vite/test/pluginBuild.test.ts",
      "packages/rsbuild/test/buildArtifacts.test.ts",
      "fixtures/vite-css-modules/scripts/verify-visual.mjs",
      "fixtures/vite-css-modules/scripts/verify-static.mjs",
      "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs",
      "fixtures/rsbuild-css-modules/scripts/verify-static.mjs",
      "packages/core/CORE_DESIGN.md",
      "docs/phase-8-pseudo-element-design.md",
      "docs/phase-8-pseudo-element-acceptance.md",
      "semantic-atomic-css-plugin-plan.md"
    ],
    "write": [],
    "decisions": [],
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
      "unavailable": []
    },
    "agentId": "",
    "dependsOn": [
      "fix-reason-and-cssom",
      "update-package-reason-contracts"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "PASS：P2 reason、package expectations、CSSOM equivalent serialization、static spelling 和 docs 无 actionable finding。",
        "preflight 在 registry mutation 前，direct risk 与 propagation 分离，未见部分 registry pollution。",
        "修复未改变 public schema、依赖或 adapter production。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/engine/planInputClassPreservation.ts",
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/src/selector/planSelectorRewrite.ts",
        "packages/core/test/pseudoElement.test.ts",
        "packages/core/test/preservationPlan.test.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts",
        "fixtures/vite-css-modules/scripts/verify-visual.mjs",
        "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs",
        "packages/core/CORE_DESIGN.md",
        "docs/phase-8-pseudo-element-design.md",
        "docs/phase-8-pseudo-element-acceptance.md",
        "semantic-atomic-css-plugin-plan.md"
      ],
      "checks": [
        {
          "command": "Core attribution/propagation/preflight inspection",
          "result": "passed"
        },
        {
          "command": "Package pseudo/attribute assertion inspection",
          "result": "passed"
        },
        {
          "command": "Dual fixture CSSOM/static spelling inspection",
          "result": "passed"
        },
        {
          "command": "Documentation and compatibility boundary inspection",
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
    "id": "fix-vite-guarded-visual",
    "role": "development",
    "status": "completed",
    "objective": "复现并修复 focused Retest 中 Vite base/dev/attribute-state guarded atomic selector 断言失败；判断是 Core reason/preflight 回归、fixture expectation/匹配错误还是构建状态问题，做最小修复并保持 Rsbuild、attribute guard 与 pseudo spelling 契约。",
    "successCriteria": [
      "用相同 Vite full visual 命令稳定复现并记录直接原因。",
      "若为实现缺陷，修复不得破坏 pseudo-element/attribute-cascade-order 分工、零 registry pollution 或 public schema；若为验收脚本缺陷，匹配仍须 exact token/arm/property 且不能 false green。",
      "Vite visual self-test、static verify、targeted tests、pnpm verify 与 git diff check 通过。",
      "Development 可用 Chrome 复跑 Vite full visual作为修复证据，但仍需独立 Retest。",
      "不修改 Rsbuild 或无关文件，除非复现证明共享 helper 必需且先返回 blocker。"
    ],
    "read": [
      "AGENTS.md",
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/test/pseudoElement.test.ts",
      "packages/core/test/preservationPlan.test.ts",
      "packages/vite/test/pluginBuild.test.ts",
      "packages/vite/test/pluginDev.test.ts",
      "fixtures/vite-css-modules/scripts/verify-visual.mjs",
      "fixtures/vite-css-modules/scripts/verify-static.mjs",
      "fixtures/vite-css-modules/suites/base/src",
      "docs/phase-8-pseudo-element-acceptance.md"
    ],
    "write": [
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/test/pseudoElement.test.ts",
      "packages/core/test/preservationPlan.test.ts",
      "packages/vite/test/pluginBuild.test.ts",
      "packages/vite/test/pluginDev.test.ts",
      "fixtures/vite-css-modules/scripts/verify-visual.mjs",
      "fixtures/vite-css-modules/scripts/verify-static.mjs",
      "fixtures/vite-css-modules/suites/base/src",
      "docs/phase-8-pseudo-element-acceptance.md"
    ],
    "decisions": [
      "schema-stable",
      "cascade-canonicalization",
      "identity-spelling-preserved"
    ],
    "capabilities": {
      "required": [
        "workspace-read",
        "workspace-write",
        "shell",
        "browser"
      ],
      "available": [
        "workspace-read",
        "workspace-write",
        "shell",
        "browser"
      ],
      "unavailable": []
    },
    "agentId": "",
    "dependsOn": [
      "sel01-focused-retest",
      "sel01-focused-rereview"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "根因是 visual capture 改为 expectedSelectors[] 后 guarded assertion 仍读取已移除 expectedSelector；Core/adapter/build/port 均正常。",
        "guarded checks 已统一为严格 matcher，mutation self-test 拒绝错误 pseudo box、list、token 和 property。",
        "开发侧 Vite full visual passed：64 runs、228 cases、676 comparisons、0 differences。"
      ],
      "artifacts": [],
      "files": [
        "fixtures/vite-css-modules/scripts/verify-visual.mjs",
        "docs/phase-8-pseudo-element-acceptance.md"
      ],
      "checks": [
        {
          "command": "Initial Vite visual reproduction",
          "result": "failed"
        },
        {
          "command": "Vite visual self-test",
          "result": "passed"
        },
        {
          "command": "Vite full visual dev diagnosis",
          "result": "passed"
        },
        {
          "command": "Vite report passed/differences audit",
          "result": "passed"
        },
        {
          "command": "Vite fixture verify",
          "result": "passed"
        },
        {
          "command": "Vite targeted package tests",
          "result": "passed"
        },
        {
          "command": "pnpm verify",
          "result": "passed"
        },
        {
          "command": "Stale expectedSelector audit",
          "result": "passed"
        },
        {
          "command": "Scoped diff check",
          "result": "passed"
        },
        {
          "command": "Independent focused Retest",
          "result": "not_run"
        }
      ],
      "requires_test": true,
      "test_reason": "独立 Retest 应复跑修复后的 Vite full visual 并检查报告。",
      "requires_review": true,
      "review_reason": "matcher 正确性是防止 CSSOM false green 的边界，但按 Test-failure routing 本轮仅重跑 Retest。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "sel01-final-vite-retest",
    "role": "retest",
    "status": "completed",
    "objective": "最终 focused Vite Retest：独立复跑根门禁、自测和 Vite full visual，确认 strict expectedSelectors matcher 修复后报告完整且无 false green。",
    "successCriteria": [
      "pnpm verify 通过。",
      "Vite visual self-test 通过并覆盖拒绝错误 pseudo box、selector list、token、property。",
      "Vite full visual 生成指定报告，summary.passed=true 且 differences=0。",
      "报告覆盖 base/preprocessor、dev/preview、desktop/narrow、computed pseudo、CSSOM、semantic token 与 HMR update/remove/import cleanup。",
      "工作树未被 Test 修改。"
    ],
    "read": [
      "AGENTS.md",
      "fixtures/vite-css-modules/scripts/verify-visual.mjs",
      "fixtures/vite-css-modules/scripts/verify-static.mjs",
      "fixtures/vite-css-modules/suites",
      "docs/phase-8-pseudo-element-acceptance.md"
    ],
    "write": [],
    "decisions": [],
    "capabilities": {
      "required": [
        "workspace-read",
        "shell",
        "browser"
      ],
      "available": [
        "workspace-read",
        "shell",
        "browser"
      ],
      "unavailable": []
    },
    "agentId": "",
    "dependsOn": [
      "fix-vite-guarded-visual"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "SEL-01 focused Vite Retest 全部通过。",
        "Visual report 为 64 runs、228 cases、676 comparisons、0 differences，覆盖所需 suite/mode/viewport/pseudo/CSSOM/token/HMR。",
        "测试前后工作树状态除既有改动与允许 ignored artifacts 外不变。"
      ],
      "artifacts": [],
      "files": [
        "fixtures/vite-css-modules/scripts/verify-visual.mjs"
      ],
      "checks": [
        {
          "command": "pnpm verify",
          "result": "passed"
        },
        {
          "command": "Vite visual self-test",
          "result": "passed"
        },
        {
          "command": "Matcher negative mutation cases inspection",
          "result": "passed"
        },
        {
          "command": "Vite full visual final retest",
          "result": "passed"
        },
        {
          "command": "Visual report matrix inspection",
          "result": "passed"
        },
        {
          "command": "Before/after worktree status comparison",
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
    "id": "finalize-sel01-docs",
    "role": "development",
    "status": "completed",
    "objective": "将 SEL-01 最终独立 Test/Review、P2 reason 修复、CSSOM matcher 修复、Rsbuild/Vite 最终 visual 报告与 completed 状态同步到权威中文文档；不改代码或测试。",
    "successCriteria": [
      "SEL-01 acceptance 准确记录首轮失败、修复、focused rereview PASS、Rsbuild full PASS、最终 Vite Retest PASS 与报告路径。",
      "backlog、SEL-01 design、双 adapter acceptance、双 Pilot tracking、benefit review、总计划统一标记 SEL-01 completed。",
      "保留真实 Pilot delta 与 confirmed input-spelling/reason 边界，不改写历史 SEL-02/SEL-03 状态。",
      "所有本地文档链接/命令/报告路径存在，目标 diff check 通过。"
    ],
    "read": [
      "AGENTS.md",
      "semantic-atomic-css-plugin-plan.md",
      "docs/phase-8-pseudo-element-design.md",
      "docs/phase-8-pseudo-element-acceptance.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/phase-3-acceptance.md",
      "docs/phase-6-rsbuild-rspack-adapter-acceptance.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
      "docs/selector-capability-benefit-review.md",
      "/private/tmp/gss-vite-pseudo-element-final-retest.json",
      "/private/tmp/gss-rsbuild-pseudo-element-retest.json",
      "/private/tmp/gss-pseudo-element-pilot/baseline",
      "/private/tmp/gss-pseudo-element-pilot/current"
    ],
    "write": [
      "semantic-atomic-css-plugin-plan.md",
      "docs/phase-8-pseudo-element-design.md",
      "docs/phase-8-pseudo-element-acceptance.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/phase-3-acceptance.md",
      "docs/phase-6-rsbuild-rspack-adapter-acceptance.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
      "docs/selector-capability-benefit-review.md"
    ],
    "decisions": [
      "grammar-boundary",
      "legacy-required",
      "cascade-canonicalization",
      "list-excluded",
      "schema-stable",
      "semantic-preserved",
      "identity-spelling-preserved"
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
    "agentId": "",
    "dependsOn": [
      "sel01-final-vite-retest",
      "sel01-focused-rereview"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "九份权威中文文档已统一标记 SEL-01 completed，并保留 Review 与 visual 的完整失败—修复链。",
        "记录 focused rereview PASS、Rsbuild 8/204/464/0、Vite 64/228/676/0 以及 Pilot corpus/delta 不变。",
        "reason/spelling 边界、命令、链接、报告路径与验证结果一致。"
      ],
      "artifacts": [],
      "files": [
        "semantic-atomic-css-plugin-plan.md",
        "docs/phase-8-pseudo-element-design.md",
        "docs/phase-8-pseudo-element-acceptance.md",
        "docs/phase-8-capability-hardening-backlog.md",
        "docs/phase-3-acceptance.md",
        "docs/phase-6-rsbuild-rspack-adapter-acceptance.md",
        "docs/phase-5-real-project-pilot-tracking.md",
        "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
        "docs/selector-capability-benefit-review.md"
      ],
      "checks": [
        {
          "command": "Final visual report path/summary validation",
          "result": "passed"
        },
        {
          "command": "Nine-document local Markdown link validation",
          "result": "passed"
        },
        {
          "command": "Referenced package script/command validation",
          "result": "passed"
        },
        {
          "command": "SEL-01 completed-state consistency audit",
          "result": "passed"
        },
        {
          "command": "Pilot baseline/current path validation",
          "result": "passed"
        },
        {
          "command": "Nine-document diff check",
          "result": "passed"
        }
      ],
      "requires_test": false,
      "test_reason": "纯文档事实同步，最终运行时已由独立 full visual 与 Core/root/package/static 门禁覆盖。",
      "requires_review": false,
      "review_reason": "focused rereview 已通过最终 reason 语义，文档同步已机械校验事实、链接、路径、命令与状态。",
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
    "id": "materials/architecture/sel01-design.md",
    "role": "architecture",
    "path": "materials/architecture/sel01-design.md",
    "summary": "SEL-01 grammar、cascade preflight、selector-list 排除、测试矩阵与 Pilot 门槛分析；identity canonicalization 建议已被 confirmed decision 覆盖。",
    "purpose": "为开发提供代码接入点和风险矩阵，同时保留被拒绝方案的技术权衡。"
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
        "reason": "该能力改变 compiler safe grammar、atomic identity、cascade preservation 与浏览器 pseudo-element 输出，必须独立验证。"
      },
      "review": {
        "requires": true,
        "reason": "legacy alias guard 和 class-wide preflight 影响 key/class 稳定性及 fallback 边界，需要独立语义审查。"
      }
    },
    "development": [
      {
        "assignment": "sel01-implementation",
        "test": {
          "requires": true,
          "reason": "独立浏览器验收必须确认 pseudo computed style、CSSOM、responsive 与 semantic token binding。"
        },
        "review": {
          "requires": true,
          "reason": "compiler selector/cascade 语义及 fallback/property competition 扩展需要独立缺陷审查。"
        }
      },
      {
        "assignment": "update-package-reason-contracts",
        "test": {
          "requires": true,
          "reason": "仍需 focused browser Retest 验证 CSSOM 与 computed pseudo 行为。"
        },
        "review": {
          "requires": true,
          "reason": "仍需 focused Rereview 确认 reason contract 与 Core propagation 一致。"
        }
      },
      {
        "assignment": "fix-reason-and-cssom",
        "test": {
          "requires": true,
          "reason": "Focused browser Retest 必须验证 Chrome selectorText 与 computed pseudo style。"
        },
        "review": {
          "requires": true,
          "reason": "Focused Rereview 必须确认 reason attribution、传播、零 registry pollution 和 schema 不变。"
        }
      },
      {
        "assignment": "fix-vite-guarded-visual",
        "test": {
          "requires": true,
          "reason": "独立 Retest 应复跑修复后的 Vite full visual 并检查报告。"
        },
        "review": {
          "requires": true,
          "reason": "matcher 正确性是防止 CSSOM false green 的边界，但按 Test-failure routing 本轮仅重跑 Retest。"
        }
      },
      {
        "assignment": "finalize-sel01-docs",
        "test": {
          "requires": false,
          "reason": "纯文档事实同步，最终运行时已由独立 full visual 与 Core/root/package/static 门禁覆盖。"
        },
        "review": {
          "requires": false,
          "reason": "focused rereview 已通过最终 reason 语义，文档同步已机械校验事实、链接、路径、命令与状态。"
        }
      }
    ],
    "main": {
      "test": {
        "requires": true,
        "reason": "SEL-01 改变 compiler grammar、cascade preflight 与浏览器 pseudo output，独立 Test 有实质信号。"
      },
      "review": {
        "requires": true,
        "reason": "跨 planner、fallback emission 与 property competition 的语义变更需要独立 Review。"
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
    "SEL-01 已完成：四种 before/after 单锚点 grammar、input-spelling identity、alias cascade guard、selector-list fallback、双 adapter/fixture/Pilot、独立 Test/Review 与修复复验全部收口。"
  ],
  "artifacts": [],
  "blockers": [],
  "next_action": "后续能力需由 owner 从 SEL-04 或其他 backlog 项单独确认。",
  "success_evidence": [
    {
      "criterion": "Core 安全转换现代与 legacy before/after，并对 unsafe 结构、alias cascade 风险和 selector list 完整 fallback。",
      "evidence": "Core verify 159 项通过；pseudo direct risk 使用 pseudo-element、attribute direct risk 保持 attribute-cascade-order；selector-list 与 zero-registry 回归通过。",
      "pointers": [
        "packages/core/test/pseudoElement.test.ts",
        "packages/core/test/preservationPlan.test.ts",
        "packages/core/test/selectorList.test.ts"
      ]
    },
    {
      "criterion": "Vite 与 Rsbuild 仅消费 Core descriptor，manifest/report schema 不变且无 adapter grammar 复制。",
      "evidence": "独立 Review 与 focused Rereview 均确认 production adapter generic、公共 schema/依赖未变；双方 package consumer tests 与根 verify 通过。",
      "pointers": [
        "packages/vite/test/pluginBuild.test.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts",
        "docs/phase-8-pseudo-element-acceptance.md"
      ]
    },
    {
      "criterion": "双 fixture 覆盖静态、HMR、CSSOM 与 computed pseudo style 的 semantic/native 等价。",
      "evidence": "最终 Vite full visual 64/228/676/0、Rsbuild 8/204/464/0，覆盖 dev/preview、desktop/narrow、computed pseudo、CSSOM、semantic token 与 HMR cleanup。",
      "pointers": [
        "fixtures/vite-css-modules/scripts/verify-visual.mjs",
        "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs",
        "docs/phase-8-pseudo-element-acceptance.md"
      ]
    },
    {
      "criterion": "Vite 与 Rsbuild Pilot 的目标 pseudo blocker 解除，其他 unsafe evidence 仍完整保留。",
      "evidence": "冻结 baseline/current corpus 完全一致；双方旧 pseudo blocker 3→0，仅 selectorValue 获得 mapping，taskCard/diagnosticProbe 仍受既有 evidence 保留；delta +4 definitions/+7 reuse/-11 preserved declarations。",
      "pointers": [
        "docs/phase-5-real-project-pilot-tracking.md",
        "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
        "docs/selector-capability-benefit-review.md"
      ]
    },
    {
      "criterion": "相关设计、acceptance、tracking、backlog 与收益文档同步，所需验证全部通过。",
      "evidence": "九份权威中文文档链接、命令、报告路径和 completed 状态一致；根 verify、独立 Review、focused Rereview、双 full visual 与 diff checks 均通过。",
      "pointers": [
        "docs/phase-8-pseudo-element-design.md",
        "docs/phase-8-pseudo-element-acceptance.md",
        "docs/phase-8-capability-hardening-backlog.md",
        "semantic-atomic-css-plugin-plan.md"
      ]
    }
  ]
}
```
<!-- workflow:result:end -->
