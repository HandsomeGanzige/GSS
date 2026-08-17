---
id: "production-atomic-css-serialization"
name: "生产 Atomic CSS 紧凑序列化"
summary: "在不改 selector、value 或 atomization 决策的前提下，压缩生产 atomic asset 的结构空白开销。"
keywords: ["atomic-css","serialization","minification","vite","rsbuild","compression"]
type: "delivery"
status: "cancelled"
stage: "close"
parent: "../../index.md"
owner: "root"
lease_until: "2026-08-17T07:34:41.842Z"
updated_at: "2026-08-17T06:34:41.842Z"
---

# 生产 Atomic CSS 紧凑序列化

## Goal

<!-- workflow:goal:start -->
```json
"为 Vite/Rsbuild 生产 atomic CSS 建立安全的结构级紧凑序列化，保留开发可读输出与 Core 公共输出兼容，并以真实 fixture/Pilot raw、gzip、brotli 和视觉等价验收。"
```
<!-- workflow:goal:end -->

## Success criteria

<!-- workflow:success_criteria:start -->
```json
[
  "生产 atomic CSS 仅移除结构性空白和可省略末尾分号，不执行 selector/value canonicalization、规则重排或 declaration 合并。",
  "Vite 生产 atomic asset 使用紧凑序列化；Rsbuild 明确复用 native minifier 或同等紧凑路径，开发态继续保持可读输出。",
  "Core 公共 transform/render、manifest/report schema、atomic key/class、selector/cascade 和 Adapter tokens 保持兼容。",
  "Vite/Rsbuild 包 verify、根 verify、双 fixture visual 与 Pilot acceptance 通过。",
  "两个 Pilot 的生产 atomic CSS raw 严格下降，gzip/brotli 不回退；总 CSS+JS raw/gzip/brotli 不回退，连续构建确定。"
]
```
<!-- workflow:success_criteria:end -->

## Confirmed decisions

<!-- workflow:confirmed_decisions:start -->
```json
[
  {
    "id": "structural-only",
    "summary": "本批只优化生产 atomic CSS 的结构序列化；不做 value canonicalization、selector 改写、rule grouping、declaration merging 或 atomization 收益筛选。",
    "evidence": [
      "用户要求继续非 selector 优化主线",
      "既有产品边界"
    ]
  },
  {
    "id": "preserve-dev-core",
    "summary": "开发态保留可读 CSS，Core 公共输出保持兼容；生产 Adapter 才可启用紧凑格式。",
    "evidence": [
      "调试可读性与公共兼容边界"
    ]
  }
]
```
<!-- workflow:confirmed_decisions:end -->

## Current progress

<!-- workflow:current_progress:start -->
```json
"已选择生产 atomic CSS 结构紧凑序列化作为下一项；正在确认 Vite/Rsbuild 生命周期、可安全省略字符和真实收益基线。"
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
    "id": "settle-serialization",
    "text": "确认结构级紧凑序列化合同、Adapter 生命周期与真实收益基线",
    "status": "in_progress",
    "assignment": "",
    "blockers": []
  },
  {
    "id": "implement-serialization",
    "text": "实现生产紧凑 renderer、测试和文档",
    "status": "pending",
    "assignment": "",
    "blockers": []
  },
  {
    "id": "verify-serialization",
    "text": "执行独立测试、审查与真实语料验收",
    "status": "pending",
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
    "id": "atomic-serialization-architecture",
    "role": "architecture",
    "status": "completed",
    "objective": "基于现有 Vite/Rsbuild renderer、构建产物和验收合同，设计 implementation-ready 的生产 atomic CSS 结构紧凑序列化，不改 Core public output、selector/value spelling、rule order 或 dev 可读性。",
    "successCriteria": [
      "确认 Vite asset 绕过 native CSS minifier、Rsbuild 当前 native minification 的真实生命周期和差异。",
      "定义 readable/compact 两种内部 serializer 的精确语法，包括 selector brace、colon、important、末尾分号、rule 分隔、media/supports 嵌套；逐项说明安全依据。",
      "明确哪些行为禁止：value/selector canonicalization、rule grouping、context coalescing、declaration merging/reorder、第三方依赖。",
      "用两个 Pilot 现有产物或 fresh build 投影 compact 对 atomic 与总 CSS+JS raw/gzip/brotli 的预期，并给出硬门禁。",
      "给出最小文件改动、共享/重复策略、测试矩阵、确定性和 visual/Pilot 验收步骤。"
    ],
    "read": [
      "AGENTS.md",
      "README.md",
      "package.json",
      "packages/core/CORE_DESIGN.md",
      "packages/core/src/output/renderAtomicCss.ts",
      "packages/core/src/output/renderRule.ts",
      "packages/vite/src/plugin.ts",
      "packages/vite/test/pluginBuild.test.ts",
      "packages/vite/README.md",
      "docs/phase-3-vite-adapter-design.md",
      "docs/phase-3-vite-adapter-tracking.md",
      "packages/rsbuild/src/atomicCss.ts",
      "packages/rsbuild/src/buildArtifacts.ts",
      "packages/rsbuild/src/devStyles.ts",
      "packages/rsbuild/src/plugin.ts",
      "packages/rsbuild/test/buildArtifacts.test.ts",
      "packages/rsbuild/README.md",
      "docs/phase-6-rsbuild-rspack-adapter-tracking.md",
      "playground/vite-react-css-modules/dist/semantic",
      "playground/rsbuild-react-css-modules/dist/semantic"
    ],
    "write": [
      ".agent-work/work-items/production-atomic-css-serialization/materials/architecture/production-atomic-css-serialization.md"
    ],
    "decisions": [
      "只做结构级序列化，不做 value/selector canonicalization、grouping、merge、reorder 或 Planner。",
      "Core 公共 output 与 dev readable 保持兼容；生产 Adapter 内部启用 compact。",
      "不新增生产依赖；真实 atomic 与总 CSS+JS raw/gzip/brotli 不得回退。"
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
        "Vite production 推荐 compression-aware 结构 grammar，Pilot 投影最终 asset 16149/4253/3710 B，避免全密集格式 gzip/brotli 回退。",
        "Rsbuild 保持 readable snapshot + native minifier，最终 asset 采用 byte-equal/no-regression，不重复 serializer 或改 value。",
        "Core 与 dev 可读输出不变；Vite 只需 mode-aware 本地 renderer，禁止 grouping/merge/reorder/canonicalization/新增依赖。"
      ],
      "artifacts": [
        {
          "path": ".agent-work/work-items/production-atomic-css-serialization/materials/architecture/production-atomic-css-serialization.md",
          "purpose": "精确 grammar、安全证明、生命周期、Pilot A/B 与硬门禁。"
        }
      ],
      "files": [
        "packages/core/src/output/renderAtomicCss.ts",
        "packages/core/src/output/renderRule.ts",
        "packages/core/CORE_DESIGN.md",
        "packages/vite/src/plugin.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/vite/test/pluginDev.test.ts",
        "packages/vite/README.md",
        "packages/rsbuild/src/atomicCss.ts",
        "packages/rsbuild/src/buildArtifacts.ts",
        "packages/rsbuild/src/plugin.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts",
        "packages/rsbuild/README.md"
      ],
      "checks": [
        {
          "command": "Pilot read-only dense/hybrid zlib projection",
          "result": "passed"
        },
        {
          "command": "Vite/Rsbuild emitted CSS lifecycle inspection",
          "result": "passed"
        },
        {
          "command": "Architecture material diff check",
          "result": "passed"
        },
        {
          "command": "Grammar/metrics/lifecycle residual scan",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "生产 CSS 字节语法、native minifier 生命周期、压缩门禁和浏览器 cascade 需独立验证。",
      "requires_review": true,
      "review_reason": "需独立确认混合 compact grammar、安全边界及 Vite strict/Rsbuild equality 门禁。",
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
    "id": "materials/architecture/production-atomic-css-serialization.md",
    "role": "architecture",
    "path": "materials/architecture/production-atomic-css-serialization.md",
    "summary": "生产 atomic CSS grammar、生命周期差异、Pilot 投影和门禁。",
    "purpose": "指导 Vite 实施与双 Adapter 验收。"
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
        "reason": "生产 CSS 字节语法、native minifier 生命周期、压缩门禁和浏览器 cascade 需独立验证。"
      },
      "review": {
        "requires": true,
        "reason": "需独立确认混合 compact grammar、安全边界及 Vite strict/Rsbuild equality 门禁。"
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
  "status": "pending",
  "summary": [
    "架构证据证明原 success criterion 要求 Rsbuild 最终 raw 严格下降不可成立：其 final asset 已由 native minifier 达到相同紧凑形态。保留材料，改由校正后的 Vite-strict/Rsbuild-equality Work Item 实施。"
  ],
  "artifacts": [],
  "blockers": [],
  "next_action": "创建校正门禁的 delivery Work Item。",
  "success_evidence": []
}
```
<!-- workflow:result:end -->
