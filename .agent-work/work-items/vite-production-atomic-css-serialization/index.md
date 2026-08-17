---
id: "vite-production-atomic-css-serialization"
name: "Vite 生产 Atomic CSS 紧凑序列化"
summary: "压缩 Vite 自定义 atomic asset 的结构开销，并证明 Rsbuild native minifier 产物保持不变。"
keywords: ["vite","atomic-css","serializer","compression","rsbuild-parity","minification"]
type: "delivery"
status: "completed"
stage: "close"
parent: "../../index.md"
owner: "root"
lease_until: "2026-08-17T07:54:13.894Z"
updated_at: "2026-08-17T06:54:13.894Z"
---

# Vite 生产 Atomic CSS 紧凑序列化

## Goal

<!-- workflow:goal:start -->
```json
"为 Vite production atomic asset 实现 compression-aware 结构序列化，保持 Core/dev 可读输出与语义兼容；以 Rsbuild native-minified asset byte equality 作为跨 Adapter 生命周期对照。"
```
<!-- workflow:goal:end -->

## Success criteria

<!-- workflow:success_criteria:start -->
```json
[
  "Vite production serializer 使用已批准的 compression-aware grammar，仅改变结构字节，不 canonicalize selector/value、不 grouping/merge/reorder。",
  "Vite dev 与 Core 公共 atomic CSS 保持当前 readable 字节输出，manifest/report schema、tokens、key/class 和 cascade 不变。",
  "Vite Pilot 最终 atomic asset raw 严格下降，asset 与总 CSS+JS gzip/brotli 均不回退，连续构建确定。",
  "Rsbuild 不增加重复 production serializer；fresh final atomic asset 相对基线 byte-equal，gzip/brotli、总 CSS+JS 与 dev snapshot 不回退。",
  "Vite/Rsbuild/Core 包 verify、根 verify、双 fixture visual 和两个 Pilot acceptance 通过，独立 Test/Review 无未解决问题。"
]
```
<!-- workflow:success_criteria:end -->

## Confirmed decisions

<!-- workflow:confirmed_decisions:start -->
```json
[
  {
    "id": "vite-production-only",
    "summary": "Vite 自定义 emitted asset 在 Adapter build renderer 内启用 production grammar；dev 和 Core 继续 readable。",
    "evidence": [
      "架构材料生命周期证据"
    ]
  },
  {
    "id": "rsbuild-native-owner",
    "summary": "Rsbuild production formatting 继续由 native minifier 负责，Adapter 不重复 serializer；最终 asset 要求 byte-equal/no-regression。",
    "evidence": [
      "当前 Rsbuild Pilot final asset 已为单行 minified"
    ]
  },
  {
    "id": "compression-aware-grammar",
    "summary": "采用经 Pilot 投影通过的混合结构 grammar，保留可压缩重复模式；拒绝全密集写法及任何 selector/value canonicalization、grouping、merge、reorder。",
    "evidence": [
      "Vite Pilot dense gzip +30/brotli +75；recommended gzip -19/brotli -16"
    ]
  }
]
```
<!-- workflow:confirmed_decisions:end -->

## Current progress

<!-- workflow:current_progress:start -->
```json
"Vite production serializer 与 Rsbuild native parity 已实现，fresh A/B 和包级验证通过；进入独立 Test/Review。"
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
    "id": "implement-vite-serializer",
    "text": "实现 Vite production grammar、Rsbuild parity 断言、测试和文档",
    "status": "completed",
    "assignment": "",
    "blockers": []
  },
  {
    "id": "verify-vite-serializer",
    "text": "执行独立测试、审查、双 visual 与 Pilot A/B 验收",
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
    "id": "implement-production-serializer",
    "role": "development",
    "status": "completed",
    "objective": "按 architecture material 实现 Vite production compression-aware atomic CSS serializer，保持 dev/Core readable；补 Rsbuild native minifier parity 断言、测试和中文文档，并完成包级与真实 Pilot A/B。",
    "successCriteria": [
      "Vite renderer 增加内部 readable/production mode，共用排序和 wrapper 流程；build 显式 production、dev 默认 readable。",
      "production exact grammar 与材料一致：保留 selector 空格/newline indent、colon space/semicolon，去掉 important 前空格、closing newline、entry separator，压紧 media/supports brace；字段原字节不变。",
      "不改 Core 公共 renderer，不增加 public option/依赖，不做 regex 后处理、canonicalization、grouping、merge/reorder。",
      "Vite build/dev exact tests 覆盖 base、pseudo/attribute、important、media/supports/nested 和 class strategy 正交；analysis size 与写盘 asset 自洽。",
      "Rsbuild 仅补 snapshot readable/native final parity 测试或文档，不引入 production serializer；fresh final asset byte-equal。",
      "运行 Core/Vite/Rsbuild verify、根 verify、双 Pilot acceptance；完成 Vite baseline/candidate 六项 A/B、Rsbuild equality 和重复构建确定性。"
    ],
    "read": [
      "AGENTS.md",
      ".agent-work/work-items/production-atomic-css-serialization/materials/architecture/production-atomic-css-serialization.md",
      "README.md",
      "package.json",
      "packages/core/CORE_DESIGN.md",
      "packages/core/src/output/renderAtomicCss.ts",
      "packages/core/src/output/renderRule.ts",
      "packages/vite/src/plugin.ts",
      "packages/vite/test/pluginBuild.test.ts",
      "packages/vite/test/pluginDev.test.ts",
      "packages/vite/README.md",
      "docs/phase-3-vite-adapter-design.md",
      "docs/phase-3-vite-adapter-tracking.md",
      "docs/phase-3-acceptance.md",
      "packages/rsbuild/src/atomicCss.ts",
      "packages/rsbuild/src/buildArtifacts.ts",
      "packages/rsbuild/src/plugin.ts",
      "packages/rsbuild/test/buildArtifacts.test.ts",
      "packages/rsbuild/test/plugin.test.ts",
      "packages/rsbuild/README.md",
      "docs/phase-6-rsbuild-rspack-adapter-tracking.md",
      "docs/phase-6-rsbuild-rspack-adapter-acceptance.md",
      "playground/vite-react-css-modules",
      "playground/rsbuild-react-css-modules",
      "fixtures/vite-css-modules",
      "fixtures/rsbuild-css-modules"
    ],
    "write": [
      "packages/vite/src/plugin.ts",
      "packages/vite/test/pluginBuild.test.ts",
      "packages/vite/test/pluginDev.test.ts",
      "packages/vite/README.md",
      "docs/phase-3-vite-adapter-design.md",
      "docs/phase-3-vite-adapter-tracking.md",
      "docs/phase-3-acceptance.md",
      "packages/rsbuild/test/buildArtifacts.test.ts",
      "packages/rsbuild/test/plugin.test.ts",
      "packages/rsbuild/README.md",
      "docs/phase-6-rsbuild-rspack-adapter-tracking.md",
      "docs/phase-6-rsbuild-rspack-adapter-acceptance.md",
      "README.md"
    ],
    "decisions": [
      "Vite production 采用 compression-aware grammar；dev/Core readable 不变。",
      "Rsbuild 继续 native minifier owner，final byte-equal/no-regression，不重复 serializer。",
      "禁止 value/selector canonicalization、grouping、merge/reorder、依赖和公共配置。",
      "Vite raw strict；双端 gzip/brotli/总 payload 不回退，连续构建确定。"
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
        "browser-tool"
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
        "Vite 内部 production serializer 已实现并复用现有排序/wrapper；dev 与 Core readable 不变，selector/declaration/context 字节原样保留。",
        "Fresh Vite Pilot atomic raw/gzip/brotli 从 17276/4272/3726 降至 16149/4253/3710，总 CSS+JS 从 254644/80947/69886 降至 253517/80928/69870。",
        "Rsbuild 保持 readable snapshot 与 native minifier owner，final atomic/总 CSS+JS 对 baseline byte-equal，双 Pilot 重复构建确定。"
      ],
      "artifacts": [],
      "files": [
        "README.md",
        "packages/vite/src/plugin.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/vite/test/pluginDev.test.ts",
        "packages/vite/README.md",
        "packages/rsbuild/test/buildArtifacts.test.ts",
        "packages/rsbuild/README.md",
        "docs/phase-3-vite-adapter-design.md",
        "docs/phase-3-vite-adapter-tracking.md",
        "docs/phase-3-acceptance.md",
        "docs/phase-6-rsbuild-rspack-adapter-tracking.md",
        "docs/phase-6-rsbuild-rspack-adapter-acceptance.md"
      ],
      "checks": [
        {
          "command": "Core/Vite/Rsbuild verify + pnpm verify",
          "result": "passed"
        },
        {
          "command": "Vite Pilot typecheck and semantic/native builds",
          "result": "passed"
        },
        {
          "command": "Rsbuild Pilot acceptance",
          "result": "passed"
        },
        {
          "command": "Fresh dual-Pilot A/B, equality and determinism",
          "result": "passed"
        },
        {
          "command": "Fixture/Pilot browser visual parity",
          "result": "not_run"
        },
        {
          "command": "git diff --check assigned files",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "Browser tooling unavailable，独立 Test 应跑双 fixture visual 与 Pilot semantic/native interaction/cascade parity。",
      "requires_review": true,
      "review_reason": "Vite lifecycle boundary 的 emitted bytes/report metrics 改变，Rsbuild 刻意保留 native owner，需要独立审查。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "independent-serialization-test",
    "role": "test",
    "status": "completed",
    "objective": "独立验证 Vite production grammar、dev/Core readable 兼容、report bytes、真实压缩收益、Rsbuild native byte equality、确定性和浏览器语义。",
    "successCriteria": [
      "Core/Vite/Rsbuild 包 verify 与根 verify 通过；exact tests 锁定 production/readable grammar、important、pseudo/attribute、media/supports/nested 和 class strategy 正交。",
      "独立 fresh Vite baseline/candidate A/B 证明 atomic raw strict、asset/总 CSS+JS gzip/brotli 不回退，analysis size 与写盘 CSS 自洽，连续构建全产物一致。",
      "Rsbuild fresh baseline/candidate final atomic byte-equal，readable snapshot 不变，gzip/brotli/总 payload 与重复构建不回退。",
      "Vite/Rsbuild 两个 fixture full visual 与两个 Pilot acceptance/semantic-native 对照通过。",
      "负向检查确认无 Core/public option/依赖/canonicalization/grouping/merge/reorder 变化。"
    ],
    "read": [
      "AGENTS.md",
      ".agent-work/work-items/production-atomic-css-serialization/materials/architecture/production-atomic-css-serialization.md",
      "git diff",
      "git status",
      "packages/core",
      "packages/vite",
      "packages/rsbuild",
      "fixtures",
      "playground",
      "README.md",
      "docs/phase-3-acceptance.md",
      "docs/phase-6-rsbuild-rspack-adapter-acceptance.md",
      "/tmp/gss-serialization-baseline.dI2ByN"
    ],
    "write": [],
    "decisions": [
      "Vite build production grammar，dev/Core readable。",
      "Rsbuild native minifier owner，final byte-equal。",
      "结构级修改，不 canonicalize/group/merge/reorder。",
      "Vite raw strict；双端 gzip/brotli/总 payload不回退。"
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
        "Core/Vite/Rsbuild/root verify、精确 grammar/report bytes、双 fixture visual 与双 Pilot semantic/native 验收全部通过。",
        "Vite atomic 17276/4272/3726→16149/4253/3710，总 CSS+JS -1127/-19/-16 bytes，连续 14 文件一致。",
        "Rsbuild final atomic 9087/3413/3038 与全部 24 产物对基线字节相等且确定；AST 序列证明 Vite 仅改结构空白。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/output/renderAtomicCss.ts",
        "packages/core/src/output/renderRule.ts",
        "packages/vite/src/plugin.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/vite/test/pluginDev.test.ts",
        "packages/rsbuild/src/atomicCss.ts",
        "packages/rsbuild/src/buildArtifacts.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts",
        "fixtures/vite-css-modules/scripts/verify-visual.mjs",
        "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs",
        "playground/vite-react-css-modules/vite.config.ts",
        "playground/rsbuild-react-css-modules/rsbuild.config.ts",
        "playground/rsbuild-react-css-modules/scripts/inspect-artifacts.mjs"
      ],
      "checks": [
        {
          "command": "Core/Vite/Rsbuild verify + root verify",
          "result": "passed"
        },
        {
          "command": "Targeted production/readable/report/snapshot tests",
          "result": "passed"
        },
        {
          "command": "Fresh Vite A/B, AST parity and determinism",
          "result": "passed"
        },
        {
          "command": "Fresh Rsbuild equality and determinism",
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
          "command": "Vite Pilot semantic/native acceptance",
          "result": "passed"
        },
        {
          "command": "Rsbuild Pilot acceptance",
          "result": "passed"
        },
        {
          "command": "Forbidden scope negative scan",
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
    "id": "independent-serialization-review",
    "role": "review",
    "status": "completed",
    "objective": "独立审查 production serializer 的 grammar、安全边界、Vite/Rsbuild 生命周期、report 数据与文档是否符合已批准合同并无回归。",
    "successCriteria": [
      "逐字核对 production grammar 与实现/tests：字段原样、important、semicolon、entry separator、supports/media 顺序正确。",
      "确认 mode 只影响 Vite build，dev/Core/manifest/tokens/key/class/cascade/order 不变，无 regex minify、canonicalization、grouping、merge/reorder 或新依赖。",
      "确认 report/analyzer 消费最终 emitted CSS，Core report readable 语义未被伪装为相同。",
      "确认 Rsbuild 未复制 serializer且 native final equality/readable snapshot 断言有效。",
      "确认文档、A/B 门禁、测试证据一致，最终 diff 无 actionable defect。"
    ],
    "read": [
      "AGENTS.md",
      ".agent-work/work-items/production-atomic-css-serialization/materials/architecture/production-atomic-css-serialization.md",
      "git diff",
      "git status",
      "packages/core/src/output",
      "packages/core/CORE_DESIGN.md",
      "packages/vite/src/plugin.ts",
      "packages/vite/test",
      "packages/vite/README.md",
      "packages/rsbuild/src",
      "packages/rsbuild/test",
      "packages/rsbuild/README.md",
      "README.md",
      "docs/phase-3-vite-adapter-design.md",
      "docs/phase-3-vite-adapter-tracking.md",
      "docs/phase-3-acceptance.md",
      "docs/phase-6-rsbuild-rspack-adapter-tracking.md",
      "docs/phase-6-rsbuild-rspack-adapter-acceptance.md"
    ],
    "write": [],
    "decisions": [
      "Vite production compression-aware grammar；dev/Core readable。",
      "Rsbuild native minifier owner与byte equality。",
      "禁止 canonicalization、grouping、merge/reorder、依赖和公共 API。"
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
        "无 actionable finding；Vite production serializer 精确符合 compression-aware grammar 并复用既有排序/wrapper。",
        "Dev/Core readable 不变，Analyzer 测量最终 emitted CSS，Rsbuild 保持 native minifier owner 与 byte-equality 证据。",
        "未引入 regex minification、canonicalization、grouping、merge/reorder、公共 option、依赖或 Rsbuild 重复 serializer。"
      ],
      "artifacts": [],
      "files": [
        "packages/vite/src/plugin.ts",
        "packages/vite/test/pluginBuild.test.ts",
        "packages/vite/test/pluginDev.test.ts",
        "packages/rsbuild/src/atomicCss.ts",
        "packages/rsbuild/src/buildArtifacts.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts",
        "packages/core/src/output/renderAtomicCss.ts",
        "packages/core/src/output/renderRule.ts",
        "packages/analyzer/src/index.ts",
        "README.md",
        "packages/vite/README.md",
        "packages/rsbuild/README.md",
        "docs/phase-3-vite-adapter-design.md",
        "docs/phase-3-vite-adapter-tracking.md",
        "docs/phase-3-acceptance.md",
        "docs/phase-6-rsbuild-rspack-adapter-tracking.md",
        "docs/phase-6-rsbuild-rspack-adapter-acceptance.md"
      ],
      "checks": [
        {
          "command": "Exact grammar/nesting/separator/important/field review",
          "result": "passed"
        },
        {
          "command": "Vite build-only shared ordering/wrapping review",
          "result": "passed"
        },
        {
          "command": "Analyzer final vs Core readable lifecycle review",
          "result": "passed"
        },
        {
          "command": "Rsbuild snapshot/native/equality/determinism review",
          "result": "passed"
        },
        {
          "command": "Forbidden scope negative review",
          "result": "passed"
        },
        {
          "command": "Docs and hard-gate alignment",
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
[]
```
<!-- workflow:materials:end -->

## Verification decision and evidence

<!-- workflow:verification:start -->
```json
{
  "votes": {
    "architecture": null,
    "development": [
      {
        "assignment": "implement-production-serializer",
        "test": {
          "requires": true,
          "reason": "Browser tooling unavailable，独立 Test 应跑双 fixture visual 与 Pilot semantic/native interaction/cascade parity。"
        },
        "review": {
          "requires": true,
          "reason": "Vite lifecycle boundary 的 emitted bytes/report metrics 改变，Rsbuild 刻意保留 native owner，需要独立审查。"
        }
      }
    ],
    "main": {
      "test": {
        "requires": true,
        "reason": "生产 CSS 字节、report 体积和浏览器 cascade 受影响，且 Development 未运行 visual，独立 Test 必需。"
      },
      "review": {
        "requires": true,
        "reason": "compression-aware grammar 与 Vite/Rsbuild 生命周期分工需要独立语义和维护性审查。"
      }
    }
  },
  "decisions": {
    "test": {
      "execute": true,
      "rule": "main-decision-with-development-advice",
      "votes": {
        "architecture": "absent",
        "development": true,
        "main": true
      },
      "reason": "生产 CSS 字节、report 体积和浏览器 cascade 受影响，且 Development 未运行 visual，独立 Test 必需。"
    },
    "review": {
      "execute": true,
      "rule": "main-decision-with-development-advice",
      "votes": {
        "architecture": "absent",
        "development": true,
        "main": true
      },
      "reason": "compression-aware grammar 与 Vite/Rsbuild 生命周期分工需要独立语义和维护性审查。"
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
    "Vite production atomic asset 已启用 compression-aware 结构序列化，dev/Core readable 与语义契约不变；真实 Pilot raw/gzip/brotli 全部改善。Rsbuild 保持 native minifier owner 且 final 全产物 byte-equal；独立 Test/Review、双 visual 与 Pilot 验收全部通过。"
  ],
  "artifacts": [],
  "blockers": [],
  "next_action": "继续评估下一项非 selector 优化时，优先以真实压缩数据筛选；不要直接采用全密集 CSS grammar。",
  "success_evidence": [
    {
      "criterion": "Vite production serializer 使用已批准的 compression-aware grammar，仅改变结构字节，不 canonicalize selector/value、不 grouping/merge/reorder。",
      "evidence": "独立 Review 逐字核对 grammar 与 shared ordering/wrapper；独立 Test 用 PostCSS AST 序列证明 baseline/candidate 仅结构空白变化，负向扫描通过。",
      "pointers": [
        "packages/vite/src/plugin.ts",
        "packages/vite/test/pluginBuild.test.ts"
      ]
    },
    {
      "criterion": "Vite dev 与 Core 公共 atomic CSS 保持当前 readable 字节输出，manifest/report schema、tokens、key/class 和 cascade 不变。",
      "evidence": "Core verify、Vite dev exact readable tests、双 fixture visual 与 manifest/token/order 检查通过。",
      "pointers": [
        "packages/vite/test/pluginDev.test.ts",
        "packages/core/src/output/renderAtomicCss.ts",
        "packages/core/src/output/renderRule.ts"
      ]
    },
    {
      "criterion": "Vite Pilot 最终 atomic asset raw 严格下降，asset 与总 CSS+JS gzip/brotli 均不回退，连续构建确定。",
      "evidence": "Fresh A/B：atomic 17276/4272/3726→16149/4253/3710 bytes；总 CSS+JS -1127/-19/-16 bytes；连续两次 14 文件 SHA-256 全等。",
      "pointers": [
        ".agent-work/work-items/production-atomic-css-serialization/materials/architecture/production-atomic-css-serialization.md",
        "playground/vite-react-css-modules/vite.config.ts"
      ]
    },
    {
      "criterion": "Rsbuild 不增加重复 production serializer；fresh final atomic asset 相对基线 byte-equal，gzip/brotli、总 CSS+JS 与 dev snapshot 不回退。",
      "evidence": "独立 Test 确认 final atomic 9087/3413/3038 bytes 与全部 24 个产物对 baseline byte-equal，连续构建确定；独立 Review 确认无新增 Rsbuild serializer。",
      "pointers": [
        "packages/rsbuild/src/atomicCss.ts",
        "packages/rsbuild/src/buildArtifacts.ts",
        "packages/rsbuild/test/buildArtifacts.test.ts"
      ]
    },
    {
      "criterion": "Vite/Rsbuild/Core 包 verify、根 verify、双 fixture visual 和两个 Pilot acceptance 通过，独立 Test/Review 无未解决问题。",
      "evidence": "Core/Vite/Rsbuild verify、pnpm verify、Vite/Rsbuild full visual、Vite Pilot semantic/native、Rsbuild Pilot acceptance 全部通过；最终 Review 无 finding。",
      "pointers": [
        ".agent-work/work-items/vite-production-atomic-css-serialization/index.md",
        "fixtures/vite-css-modules/scripts/verify-visual.mjs",
        "fixtures/rsbuild-css-modules/scripts/verify-visual.mjs"
      ]
    }
  ]
}
```
<!-- workflow:result:end -->
