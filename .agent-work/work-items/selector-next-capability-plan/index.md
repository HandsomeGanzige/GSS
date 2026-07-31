---
id: "selector-next-capability-plan"
name: "Phase 8 下一 selector 能力选择方案"
summary: "基于 SEL-01/02/03 完成后的真实 blocker 与收益，选择并规划下一项最值得推进的 selector 能力。"
keywords: ["phase-8","selector","SEL-04","FOUND-04","GOV-01","benefit"]
type: "exploration"
status: "completed"
stage: "close"
parent: "../../index.md"
owner: "/root"
lease_until: "2026-07-30T07:33:46.953Z"
updated_at: "2026-07-29T07:33:46.953Z"
---

# Phase 8 下一 selector 能力选择方案

## Goal

<!-- workflow:goal:start -->
```json
"用双 Pilot、fixture 与当前 Core 架构证据比较 SEL-04 子集、FOUND-04 多锚点设计和 GOV-01 shadow analysis，给出一份不扩大已确认边界、可供 owner 决策的下一步实施计划。"
```
<!-- workflow:goal:end -->

## Success criteria

<!-- workflow:success_criteria:start -->
```json
[
  "量化当前双 Pilot 剩余 selector blocker、受影响 class 与潜在收益，不把 fixture oracle 当真实需求。",
  "分别评估 SEL-04 的 tag+class、id+class、更多 pseudo class，以及 FOUND-04、GOV-01 的等价证明、风险、依赖和收益。",
  "明确推荐项、暂缓项、产品边界、停止条件和 owner 仍需确认的决策。",
  "输出可直接用于后续实施授权的分批计划、测试矩阵、Pilot 门槛与回滚策略。"
]
```
<!-- workflow:success_criteria:end -->

## Confirmed decisions

<!-- workflow:confirmed_decisions:start -->
```json
[
  {
    "id": "planning-only",
    "summary": "本轮只形成下一步方案，不修改生产代码、测试、fixture、业务语料或权威产品文档。",
    "evidence": []
  },
  {
    "id": "demand-first",
    "summary": "候选必须以真实 Pilot/report 分布和可证明收益排序，fixture cascade oracle 不作为需求数量。",
    "evidence": []
  },
  {
    "id": "subsets-separate",
    "summary": "SEL-04 的 tag+class、id+class、更多 pseudo class 必须分别评估和批准，不打包开放任意单锚点 selector。",
    "evidence": []
  },
  {
    "id": "no-found05",
    "summary": "FOUND-05 跨 class/module 共现顺序保持 deferred，不引入 JSX usage evidence 或 DOM 共现推断。",
    "evidence": []
  },
  {
    "id": "semantic-preserved",
    "summary": "semantic class 与完整 fallback 继续保留；无等价证明或收益不足时不实施。",
    "evidence": []
  }
]
```
<!-- workflow:confirmed_decisions:end -->

## Current progress

<!-- workflow:current_progress:start -->
```json
"双 Pilot 证据、候选比较、Core 风险与 Batch 0..5 已收口；本轮无生产改动。"
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
    "id": "compare-next-options",
    "text": "比较 SEL-04 子集、FOUND-04 与 GOV-01，形成下一步推荐和实施门槛。",
    "status": "completed",
    "assignment": "next-capability-architecture",
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
    "id": "next-capability-architecture",
    "role": "architecture",
    "status": "completed",
    "objective": "基于 SEL-01/02/03 最终 artifacts 和当前 Core seam，比较 SEL-04 各单锚点子集、FOUND-04 多 local anchor/semantic guard 设计、GOV-01 candidate shadow analysis，推荐下一步并给出可实施的分批计划。",
    "successCriteria": [
      "逐条归类双 Pilot 当前 unsafe selectors、涉及 source classes 和 class-wide unlock 关系；区分真实需求与 fixture oracle。",
      "分别评估 tag+class、id+class、更多 pseudo class的真实频率、等价证明、specificity/cascade 风险和复用收益。",
      "评估 FOUND-04 能否直接进入 design，以及 GOV-01 是前置、并行工具还是后置治理；明确推荐排序。",
      "形成包含 Batch 0 baseline、Core interface、preflight/cascade、adapter/fixture、browser/HMR、Pilot收益、文档、门禁、停止条件的计划。",
      "列出需要 owner 确认的最小决策，未确认前不把 candidate 当已授权。"
    ],
    "read": [
      "AGENTS.md",
      "README.md",
      "semantic-atomic-css-plugin-plan.md",
      "packages/core/CORE_DESIGN.md",
      "packages/core/src/selector/planSelectorRewrite.ts",
      "packages/core/src/engine/planInputClassPreservation.ts",
      "packages/core/src/engine/createTransformer.ts",
      "docs/phase-8-capability-hardening-backlog.md",
      "docs/selector-capability-benefit-review.md",
      "docs/phase-8-pseudo-element-design.md",
      "docs/phase-8-selector-list-design.md",
      "docs/phase-5-real-project-pilot-tracking.md",
      "docs/phase-6-rsbuild-real-project-pilot-tracking.md",
      "playground/vite-react-css-modules/src",
      "playground/rsbuild-react-css-modules/src",
      "fixtures/vite-css-modules/suites/base/src/cases/CascadeCase.module.css",
      "fixtures/rsbuild-css-modules/suites/base/src/Base.module.css",
      "/private/tmp/gss-pseudo-element-pilot/current/vite-semantic/semantic-atomic-report.json",
      "/private/tmp/gss-pseudo-element-pilot/current/vite-semantic/semantic-atomic-manifest.json",
      "/private/tmp/gss-pseudo-element-pilot/current/rsbuild-semantic/semantic-atomic-report.json",
      "/private/tmp/gss-pseudo-element-pilot/current/rsbuild-semantic/semantic-atomic-manifest.json"
    ],
    "write": [
      ".agent-work/work-items/selector-next-capability-plan/materials/architecture/next-capability-plan.md"
    ],
    "decisions": [
      "planning-only",
      "demand-first",
      "subsets-separate",
      "no-found05",
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
        "推荐下一项为 FOUND-04 设计/原型，并将 GOV-01 限定为内部 shadow 前置，不产品化、不授权正式 CSS 改写。",
        "双 Pilot 的 tag+class、id+class、更多 pseudo 直接需求均为 0；多 local/结构 selector 的 class-wide 上限为 Vite 16 classes/124 declarations、Rsbuild 17/136。",
        "方案已给出 Batch 0..5、Core interface/preflight/identity 方向、双 adapter 验收及成功、停止、回滚门槛。"
      ],
      "artifacts": [
        {
          "path": ".agent-work/work-items/selector-next-capability-plan/materials/architecture/next-capability-plan.md",
          "purpose": "保留下一 selector 能力的量化证据、路线决策与可授权实施计划。"
        }
      ],
      "files": [
        "packages/core/src/selector/planSelectorRewrite.ts",
        "packages/core/src/engine/planInputClassPreservation.ts",
        "packages/core/src/engine/createTransformer.ts"
      ],
      "checks": [
        {
          "command": "双 Pilot report/manifest blocker、class mapping、source selector 与 class-wide unlock 交叉核验",
          "result": "passed"
        },
        {
          "command": "git diff --check -- .agent-work/work-items/selector-next-capability-plan/materials/architecture/next-capability-plan.md",
          "result": "passed"
        },
        {
          "command": "代码测试",
          "result": "not_run"
        }
      ],
      "requires_test": false,
      "test_reason": "本轮仅新增 planning material，没有 executable change，独立 Test 不会增加行为验证信号。",
      "requires_review": false,
      "review_reason": "本轮没有 production、test、fixture、schema 或权威文档改动，独立代码 Review 无可执行变更可审。",
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
    "id": "materials/architecture/next-capability-plan.md",
    "role": "architecture",
    "path": "materials/architecture/next-capability-plan.md",
    "summary": "下一 selector 能力的量化证据、路线比较与分批门槛。",
    "purpose": "供 owner 决定是否授权 FOUND-04 设计原型。"
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
        "requires": false,
        "reason": "本轮仅新增 planning material，没有 executable change，独立 Test 不会增加行为验证信号。"
      },
      "review": {
        "requires": false,
        "reason": "本轮没有 production、test、fixture、schema 或权威文档改动，独立代码 Review 无可执行变更可审。"
      }
    },
    "development": [],
    "main": null
  },
  "decisions": {
    "test": null,
    "review": null
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
    "规划完成：下一步推荐 FOUND-04 设计/原型，并内置非产品化 GOV-01 shadow；待 owner 确认后再建立实施 Work Item。"
  ],
  "artifacts": [],
  "blockers": [],
  "next_action": "等待 owner 确认 FOUND-04 设计/原型边界与确定性 anchor 规则；确认不等于授权 SEL-05/06 production rewrite。",
  "success_evidence": [
    {
      "criterion": "量化当前双 Pilot 剩余 selector blocker、受影响 class 与潜在收益，不把 fixture oracle 当真实需求。",
      "evidence": "已交叉核验最终 report/manifest 与 Pilot source：Vite 11、Rsbuild 16 条 unsafe rules；多 local/结构候选的 class-wide authored 上限分别为 16 classes/124 declarations 与 17/136，并明确 fixture oracle 不计需求。",
      "pointers": [
        "materials/architecture/next-capability-plan.md"
      ]
    },
    {
      "criterion": "分别评估 SEL-04 的 tag+class、id+class、更多 pseudo class，以及 FOUND-04、GOV-01 的等价证明、风险、依赖和收益。",
      "evidence": "Material 分项比较了 SEL-04 四个子集、FOUND-04 与 GOV-01；记录了 specificity、anchor/guard、resolved identity、cascade、schema 与跨包依赖风险。",
      "pointers": [
        "materials/architecture/next-capability-plan.md",
        "packages/core/src/selector/planSelectorRewrite.ts",
        "packages/core/src/engine/planInputClassPreservation.ts"
      ]
    },
    {
      "criterion": "明确推荐项、暂缓项、产品边界、停止条件和 owner 仍需确认的决策。",
      "evidence": "推荐 FOUND-04 设计/原型加内部 shadow；SEL-04 泛化、产品化 GOV-01、FOUND-05 均暂缓，并列出 4 类停止条件与 2 项 owner 最小确认。",
      "pointers": [
        "materials/architecture/next-capability-plan.md"
      ]
    },
    {
      "criterion": "输出可直接用于后续实施授权的分批计划、测试矩阵、Pilot 门槛与回滚策略。",
      "evidence": "Material 提供 Batch 0..5，覆盖 baseline、Core interface、preflight/shadow、静态门禁、双 adapter 浏览器/HMR、双 Pilot gate，以及 candidate flag 回滚策略。",
      "pointers": [
        "materials/architecture/next-capability-plan.md"
      ]
    }
  ]
}
```
<!-- workflow:result:end -->
