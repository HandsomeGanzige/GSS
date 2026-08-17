---
id: "build-finalization-snapshot-cache"
name: "构建收尾快照复用与内存优化"
summary: "消除Core与Adapter构建收尾阶段对atomic-registry的重复深拷贝渲染和聚合同时保持全部公共输出逐字节兼容"
keywords: ["core","snapshot","cache","finalization","performance","memory","vite","rsbuild"]
type: "delivery"
status: "completed"
stage: "close"
parent: "../../index.md"
owner: "root"
lease_until: "2026-08-17T12:06:05.383Z"
updated_at: "2026-08-17T08:06:05.383Z"
---

# 构建收尾快照复用与内存优化

## Goal

<!-- workflow:goal:start -->
```json
"为 append-only Core transformer 建立 revision 级按需 finalization：同步 borrowed visitor 避免 declaration 快照深拷贝，轻量 cache 复用 CSS bytes 与 report merge，manifest 每次保持独立防御性投影，并验证 Vite/Rsbuild 产物不变与真实性能收益。"
```
<!-- workflow:goal:end -->

## Success criteria

<!-- workflow:success_criteria:start -->
```json
[
  "保持transformCss、createTransformer及所有Core/Vite/Rsbuild公共接口、manifest/report-schema、输出顺序与CSS字节完全不变。",
  "同一 transformer revision 内 atomic CSS string/bytes 与 report merge 按需复用；manifest 每次从 borrowed visitor 独立投影；每次 transform 后正确失效，外部修改返回对象不得污染内部状态。",
  "测试覆盖空输入、跨文件复用、重复getter、getter交错、transform后失效及返回快照防御性。",
  "基准独立记录transform与finalization、重复getter和peak-heap；在代表性1x/10x-corpus上证明优化且不出现明显回退。",
  "Core、Vite、Rsbuild包verify与根verify通过；独立Test/Review无未解决问题。"
]
```
<!-- workflow:success_criteria:end -->

## Confirmed decisions

<!-- workflow:confirmed_decisions:start -->
```json
[
  {
    "id": "byte-compatible",
    "summary": "公共API与所有CSS、manifest、report字节和顺序必须不变",
    "evidence": [
      "用户确认只做构建性能与内存优化",
      "AGENTS.md确定性与兼容边界"
    ]
  },
  {
    "id": "evidence-driven",
    "summary": "仅实施profile和基准能够证明有效的缓存避免新增无收益复杂度",
    "evidence": [
      "当前createTransformer重复registry.list与renderAtomicCss调用"
    ]
  },
  {
    "id": "borrowed-view-contingency",
    "summary": "首版深拷贝缓存内存门禁失败后允许设计仅限Core包内部且不进入public-export的只读borrowed-view替代方案",
    "evidence": [
      "10x-retained-heap-8886064-vs-2104-bytes",
      "架构材料预设的失败后contingency"
    ]
  }
]
```
<!-- workflow:confirmed_decisions:end -->

## Current progress

<!-- workflow:current_progress:start -->
```json
"已完成低 retained-heap borrowed visitor、轻量 finalization cache、独立 Test/Review 与性能门禁；无未解决 blocker。"
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
    "id": "design-cache-boundary",
    "text": "设计快照所有权失效规则与基准门禁",
    "status": "completed",
    "assignment": "",
    "blockers": []
  },
  {
    "id": "implement-cache",
    "text": "实现Core快照复用并补充测试文档和基准",
    "status": "completed",
    "assignment": "",
    "blockers": []
  },
  {
    "id": "verify-cache",
    "text": "独立验证性能兼容性并完成审查",
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
    "id": "design-finalization-cache",
    "role": "architecture",
    "status": "completed",
    "objective": "依据当前Core与两个Adapter调用链设计最小的构建收尾快照缓存边界失效规则防御性语义和性能验收方法并写入指定架构材料",
    "successCriteria": [
      "明确当前重复list、render、manifest/report聚合的调用次数和对象所有权。",
      "比较transformer级聚合缓存、registry快照缓存及Adapter本地缓存方案并给出最小推荐。",
      "定义transform后失效、空输入、重复getter、交错getter及外部对象修改的兼容契约。",
      "给出可复现的1x/10x基准设计和不可回退门禁，不承诺无证据的绝对比例。"
    ],
    "read": [
      "AGENTS.md",
      "packages/core/CORE_DESIGN.md",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/src/registry/AtomicRegistry.ts",
      "packages/core/src/output",
      "packages/core/src/manifest",
      "packages/core/src/report",
      "packages/core/test",
      "packages/vite/src/plugin.ts",
      "packages/rsbuild/src/buildArtifacts.ts",
      "packages/rsbuild/src/plugin.ts",
      "packages/vite/test",
      "packages/rsbuild/test"
    ],
    "write": [
      ".agent-work/work-items/build-finalization-snapshot-cache/materials/architecture/finalization-snapshot-cache.md"
    ],
    "decisions": [
      "不改变公共API、输出字节、顺序、schema与selector/cascade语义。",
      "只实施有profile或基准证据的优化。",
      "不新增生产依赖。"
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
      "unavailable": []
    },
    "agentId": "snapshot_architect",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "推荐Core-transformer内按revision失效的按组件懒收尾缓存同一revision将list-render-report-merge分别收敛至一次。",
        "已量化Vite-manifest加report为4次list、Rsbuild-snapshot为3次list且Adapter生产CSS聚合继续保留。",
        "材料定义异常与空输入失效、外部修改隔离和1x/10x时间及堆内存门禁。"
      ],
      "artifacts": [
        {
          "path": ".agent-work/work-items/build-finalization-snapshot-cache/materials/architecture/finalization-snapshot-cache.md",
          "purpose": "记录缓存边界、调用链、防御性契约与benchmark门禁。"
        }
      ],
      "files": [
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/test/transformer.test.ts",
        "packages/vite/src/plugin.ts",
        "packages/rsbuild/src/buildArtifacts.ts"
      ],
      "checks": [
        {
          "command": "Static-call-path-census",
          "result": "passed"
        },
        {
          "command": "Vitest-bench-capability-check",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "缓存freshness异常失效对象隔离和性能门禁需要独立验证。",
      "requires_review": true,
      "review_reason": "revision时机内部所有权report公式与retained-heap需独立审查。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "implement-finalization-cache",
    "role": "development",
    "status": "completed",
    "objective": "按架构材料先建立未优化baseline再实现Core-transformer按revision失效的按组件懒收尾缓存补足防御性测试benchmark与中文文档并验证两个Adapter字节兼容",
    "successCriteria": [
      "先新增固定seed的1x/10x-finalization-benchmark并在任何生产代码修改前保存/tmp-baseline证据。",
      "同一revision-registry-list、Core-render与report-merge各至多一次；每次transform入口先失效且成功空输入reuse-only与抛错路径fresh。",
      "getManifest与getReport每次返回独立防御性对象；TransformCssResult外部修改不能污染内部聚合状态。",
      "不新增公共API或依赖不修改Adapter生产CSS聚合不改变正常输入下任何CSS/manifest/report字节顺序schema。",
      "candidate冷路径和端到端不超过baseline-1.05倍热路径1x/10x至少改善10%且10x-peak与retained-heap不超过1.10倍；若失败则停止并报告。",
      "Core、Vite、Rsbuild包verify与根verify通过并同步Core设计和Phase8-backlog。"
    ],
    "read": [
      "AGENTS.md",
      ".agent-work/work-items/build-finalization-snapshot-cache/materials/architecture/finalization-snapshot-cache.md",
      "README.md",
      "package.json",
      "packages/core/CORE_DESIGN.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "packages/core/src",
      "packages/core/test",
      "packages/vite/src/plugin.ts",
      "packages/vite/test",
      "packages/rsbuild/src/buildArtifacts.ts",
      "packages/rsbuild/src/plugin.ts",
      "packages/rsbuild/test"
    ],
    "write": [
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/test/finalizationSnapshot.bench.ts",
      "packages/core/test/transformer.test.ts",
      "packages/core/test/selectorOutputContract.test.ts",
      "packages/core/test/contract.test.ts",
      "packages/core/CORE_DESIGN.md",
      "docs/phase-8-capability-hardening-backlog.md"
    ],
    "decisions": [
      "采用transformer级按组件懒缓存不采用registry借用视图或Adapter本地缓存。",
      "每次transform入口失效包括空输入和抛错；复用sources变化也必须fresh。",
      "公开结构化getter始终防御性复制CSS字符串可复用。",
      "Adapter生产排序和序列化边界保持不变。",
      "性能门禁失败不得以理论收益合入。"
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
    "agentId": "snapshot_developer",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "被拒绝的full-clone-prototype未留下production-test或文档残留当前相关改动均属于successor-borrowed-visitor实现。",
        "保留benchmark已演进为原始heap输出指纹和可配置指标路径版本。",
        "private-tmp证据仍记录rejected-candidate-10x-retained-8886064-bytes对baseline-2104-bytes。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/test/finalizationSnapshot.bench.ts"
      ],
      "checks": [
        {
          "command": "rejected-prototype-residue-scan",
          "result": "passed"
        },
        {
          "command": "successor-evidence-scan",
          "result": "passed"
        },
        {
          "command": "baseline-retained-2104-check",
          "result": "passed"
        },
        {
          "command": "candidate-retained-8886064-check",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "独立Test仍需复核successor缓存语义benchmark和Adapter字节兼容。",
      "requires_review": true,
      "review_reason": "独立Review仍需确认rejected-prototype与successor架构边界无混淆。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "design-low-retained-cache",
    "role": "architecture",
    "status": "completed",
    "objective": "基于首版retained-heap失败证据设计不复制完整declaration对象图的Core内部替代方案并校正可比较的内存测量口径同时保持所有公共防御性契约",
    "successCriteria": [
      "解释incremental-retained近零baseline分母的统计问题并定义同时报告total-retained与incremental-overhead的门禁。",
      "设计仅包内borrowed-view或等价visitor边界不得从package入口导出且不得向public-return泄露内部引用。",
      "明确render-createManifest-report的类型和所有权改动以及每revision失效规则。",
      "以当前baseline为依据预测并规定candidate必须重跑的时间peak-total-retained与output-hash门禁。"
    ],
    "read": [
      "AGENTS.md",
      ".agent-work/work-items/build-finalization-snapshot-cache/materials/architecture/finalization-snapshot-cache.md",
      "packages/core/test/finalizationSnapshot.bench.ts",
      "/tmp/gss-finalization-baseline-metrics.json",
      "/tmp/gss-finalization-metrics.json",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/src/registry/AtomicRegistry.ts",
      "packages/core/src/output/renderAtomicCss.ts",
      "packages/core/src/output/createManifest.ts",
      "packages/core/src/output/mergeReport.ts",
      "packages/core/test"
    ],
    "write": [
      ".agent-work/work-items/build-finalization-snapshot-cache/materials/architecture/low-retained-finalization-cache.md"
    ],
    "decisions": [
      "允许只在Core内部使用borrowed-view或visitor不得public-export。",
      "不得直接缓存完整registry-list深拷贝。",
      "公开manifest-report-result继续深度防御性且所有产物字节不变。",
      "不得用近零incremental-baseline作为唯一retained比例分母但必须透明报告绝对新增内存。"
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
      "unavailable": []
    },
    "agentId": "low_retained_architect",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "推荐Core内同步borrowed-visitor并仅按需缓存CSS-string-byte-count和无declaration引用的canonical-report。",
        "校正门禁同时比较total-retained与绝对incremental-overhead首版10x额外8886064-bytes仍明确失败。",
        "材料定义所有权transform-entry失效getter顺序工作次数及时间heap-output-equality门禁。"
      ],
      "artifacts": [
        {
          "path": ".agent-work/work-items/build-finalization-snapshot-cache/materials/architecture/low-retained-finalization-cache.md",
          "purpose": "低retained-heap-finalization-cache的决策就绪架构与验收门禁。"
        }
      ],
      "files": [
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/src/output/renderAtomicCss.ts",
        "packages/core/src/output/createManifest.ts",
        "packages/core/src/output/mergeReport.ts",
        "packages/core/test/finalizationSnapshot.bench.ts",
        "packages/core/test/transformer.test.ts"
      ],
      "checks": [
        {
          "command": "material-diff-check",
          "result": "passed"
        },
        {
          "command": "baseline-candidate-ratio-calculation",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "borrowed-reference隔离异常freshness-UTF8-byte等价和修订内存门禁需独立测试。",
      "requires_review": true,
      "review_reason": "内部引用逃逸package-root-export公开深防御性和transform-entry失效需独立审查。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "implement-low-retained-cache",
    "role": "development",
    "status": "completed",
    "objective": "按低内存架构修订benchmark并先重跑baseline再实现Core内部同步borrowed-visitor与轻量finalization-cache完成正确性性能文档和全仓验证",
    "successCriteria": [
      "先修订benchmark记录setup-total-incremental-positive-peak原值及output-fingerprint并在production-edit前生成新baseline。",
      "AtomicRegistry-list防御性契约不变新增同步visitor不从package-root导出且finalization不保存或泄露borrowed-ref。",
      "manifest每次独立投影report缓存不含declaration引用report-only只缓存byte-count-getAtomicCss按需缓存string并满足架构规定的顺序工作次数。",
      "transform入口失效且result-report-diagnostics与聚合内部状态隔离覆盖new-key-reuse-only-empty-parse-error-throw。",
      "1x/10x全部时间门禁通过10x-peak-total-retained与4MiB绝对incremental门禁通过output-fingerprint逐字节一致。",
      "Core-Vite-Rsbuild包verify与根verify通过文档同步且不修改Adapter代码公共API依赖或生产产物。"
    ],
    "read": [
      "AGENTS.md",
      ".agent-work/work-items/build-finalization-snapshot-cache/materials/architecture/low-retained-finalization-cache.md",
      "packages/core/test/finalizationSnapshot.bench.ts",
      "packages/core/CORE_DESIGN.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "packages/core/src",
      "packages/core/test",
      "packages/vite/src/plugin.ts",
      "packages/vite/test",
      "packages/rsbuild/src/buildArtifacts.ts",
      "packages/rsbuild/src/plugin.ts",
      "packages/rsbuild/test"
    ],
    "write": [
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/src/registry/AtomicRegistry.ts",
      "packages/core/src/output/renderAtomicCss.ts",
      "packages/core/src/output/createManifest.ts",
      "packages/core/test/finalizationSnapshot.bench.ts",
      "packages/core/test/transformer.test.ts",
      "packages/core/test/selectorOutputContract.test.ts",
      "packages/core/test/contract.test.ts",
      "packages/core/test/atomizer.test.ts",
      "packages/core/CORE_DESIGN.md",
      "docs/phase-8-capability-hardening-backlog.md"
    ],
    "decisions": [
      "同步borrowed-visitor只在Core内部使用不得package-root-export或跨同步回调保留引用。",
      "不得缓存完整registry-list或manifest；report-only不得保留CSS-string。",
      "getter顺序允许report-first后CSS进行第二次registry-visit以换取低retained-heap。",
      "校正后的内存门禁同时报告total与有符号incremental并以4MiB绝对增量拒绝第二份对象图。",
      "不修改Adapter生产聚合公共API依赖selector-cascade或输出字节。"
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
    "agentId": "low_retained_developer",
    "dependsOn": [
      "design-low-retained-cache"
    ],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "实现Core内部borrowed-visitor与轻量finalization-cache并保持公开投影防御性和transform-entry失效。",
        "同机baseline-candidate的时间total-retained-incremental与fingerprint门禁全部通过。",
        "Core设计和Phase8-backlog已同步且Core-Vite-Rsbuild和根verify通过。"
      ],
      "artifacts": [
        {
          "path": "packages/core/CORE_DESIGN.md",
          "purpose": "记录borrowed-visitor所有权finalization-cache和防御性快照契约。"
        },
        {
          "path": "docs/phase-8-capability-hardening-backlog.md",
          "purpose": "记录PERF-03完成与benchmark证据。"
        }
      ],
      "files": [
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/src/output/renderAtomicCss.ts",
        "packages/core/src/output/createManifest.ts",
        "packages/core/test/finalizationSnapshot.bench.ts",
        "packages/core/test/transformer.test.ts",
        "packages/core/test/selectorOutputContract.test.ts",
        "packages/core/test/atomizer.test.ts",
        "packages/core/CORE_DESIGN.md",
        "docs/phase-8-capability-hardening-backlog.md"
      ],
      "checks": [
        {
          "command": "baseline-finalization-benchmark-explicit-GC",
          "result": "passed"
        },
        {
          "command": "candidate-gate-comparison",
          "result": "passed"
        },
        {
          "command": "core-verify",
          "result": "passed"
        },
        {
          "command": "vite-verify",
          "result": "passed"
        },
        {
          "command": "rsbuild-verify",
          "result": "passed"
        },
        {
          "command": "root-pnpm-verify",
          "result": "passed"
        }
      ],
      "requires_test": true,
      "test_reason": "borrowed引用生命周期mutation隔离异常freshness和heap门禁需独立验证。",
      "requires_review": true,
      "review_reason": "内部所有权seam和顺序依赖cache行为需独立引用逃逸与契约审查。",
      "blockers": []
    },
    "blockers": []
  },
  {
    "id": "independent-cache-test",
    "role": "test",
    "status": "completed",
    "objective": "独立验证borrowed-visitor轻量cache的正确性防御性freshness输出字节性能内存门禁及Core-Vite-Rsbuild-root回归",
    "successCriteria": [
      "复核baseline与candidate均由当前修订benchmark同机重跑且1x/10x全部时间peak-total-incremental-fingerprint门禁通过。",
      "定向测试覆盖visitor顺序byte-meter-Unicode-getter顺序重复读取new-key-reuse-only-empty-parse-error-throw及外部mutation隔离。",
      "确认AtomicRegistry-list防御性契约和package-root导出不变。",
      "Core-Vite-Rsbuild包verify和pnpm-verify全部通过且git-diff-check通过。"
    ],
    "read": [
      "AGENTS.md",
      ".agent-work/work-items/build-finalization-snapshot-cache/materials/architecture/finalization-snapshot-cache.md",
      ".agent-work/work-items/build-finalization-snapshot-cache/materials/architecture/low-retained-finalization-cache.md",
      "git-diff",
      "git-status",
      "packages/core/src",
      "packages/core/test",
      "packages/core/CORE_DESIGN.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "packages/vite",
      "packages/rsbuild",
      "/private/tmp/gss-finalization-baseline.json",
      "/private/tmp/gss-finalization-candidate.json"
    ],
    "write": [],
    "decisions": [
      "不修改production-test-doc或task-state。",
      "校正benchmark的绝对4MiB增量与total-retained-1.10门禁不可放宽。",
      "输出fingerprint相等之外还需定向deep-equality和public-export检查。"
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
    "agentId": "independent_cache_test",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "定向语义getter全排列防御性freshness-Core-Vite-Rsbuild-root-verify和diff-check全部通过。",
        "独立candidate复跑满足全部timing-heap-4MiB-incremental与输出fingerprint门禁。",
        "校正baseline-provenance一致且旧full-clone-8886064-byte-retained增量明确失败。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/src/output/renderAtomicCss.ts",
        "packages/core/src/output/createManifest.ts",
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/src/index.ts",
        "packages/core/test/atomizer.test.ts",
        "packages/core/test/transformer.test.ts",
        "packages/core/test/selectorOutputContract.test.ts",
        "packages/core/test/finalizationSnapshot.bench.ts",
        "packages/vite/src/plugin.ts",
        "packages/rsbuild/src/plugin.ts"
      ],
      "checks": [
        {
          "command": "targeted-core-semantic-tests",
          "result": "passed"
        },
        {
          "command": "getter-permutations-and-empty-snapshot",
          "result": "passed"
        },
        {
          "command": "independent-explicit-GC-candidate-benchmark",
          "result": "passed"
        },
        {
          "command": "1x-and-10x-all-performance-heap-fingerprint-gates",
          "result": "passed"
        },
        {
          "command": "public-export-and-list-defensive-checks",
          "result": "passed"
        },
        {
          "command": "Core-Vite-Rsbuild-root-verify",
          "result": "passed"
        },
        {
          "command": "git-diff-check",
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
    "id": "independent-cache-review",
    "role": "review",
    "status": "completed",
    "objective": "独立审查borrowed引用所有权cache失效公开防御性report公式输出兼容benchmark方法与文档一致性并报告可操作缺陷",
    "successCriteria": [
      "追踪所有visitBorrowed-consumer确认没有reference-array-iterator捕获或public-export。",
      "检查transform入口失效reuse-sources-report-clone-diagnostic-source和manifest深复制边界。",
      "检查byte-meter与renderer同源Unicode分隔wrapper一致且report公式schema-order不变。",
      "确认首版full-clone残留为零benchmark门禁无选择性报告文档与代码一致。",
      "按严重级别报告findings无问题则明确no-actionable-findings。"
    ],
    "read": [
      "AGENTS.md",
      ".agent-work/work-items/build-finalization-snapshot-cache/materials/architecture/finalization-snapshot-cache.md",
      ".agent-work/work-items/build-finalization-snapshot-cache/materials/architecture/low-retained-finalization-cache.md",
      "git-diff",
      "git-status",
      "packages/core/src/engine/createTransformer.ts",
      "packages/core/src/registry/AtomicRegistry.ts",
      "packages/core/src/output/renderAtomicCss.ts",
      "packages/core/src/output/createManifest.ts",
      "packages/core/src/output/mergeReport.ts",
      "packages/core/src/index.ts",
      "packages/core/test/finalizationSnapshot.bench.ts",
      "packages/core/test/transformer.test.ts",
      "packages/core/test/atomizer.test.ts",
      "packages/core/CORE_DESIGN.md",
      "docs/phase-8-capability-hardening-backlog.md",
      "packages/vite/src/plugin.ts",
      "packages/rsbuild/src/buildArtifacts.ts"
    ],
    "write": [],
    "decisions": [
      "visitor只能同步包内使用且不能泄露registry引用。",
      "公开CSS-manifest-report字节顺序schema和防御性保持不变。",
      "首版8.9MB失败必须保留为负证据低内存candidate必须满足全部门禁。"
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
    "agentId": "independent_cache_review",
    "dependsOn": [],
    "sharedInterfaceStable": true,
    "touchesGlobal": false,
    "integrator": "",
    "result": {
      "status": "completed",
      "summary": [
        "无可操作问题所有visitBorrowed-consumer均同步且无borrowed引用逃逸reader未进入package-root-API。",
        "cache失效throw-freshness防御性clone-UTF8-byte语法report公式schema-key-order及fingerprint均兼容。",
        "rejected-full-clone无实现残留且8886064-byte失败仍保留Adapter聚合未被替换。"
      ],
      "artifacts": [],
      "files": [
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/src/output/renderAtomicCss.ts",
        "packages/core/src/output/createManifest.ts",
        "packages/core/src/output/mergeReport.ts",
        "packages/core/src/index.ts",
        "packages/core/test/atomizer.test.ts",
        "packages/core/test/transformer.test.ts",
        "packages/core/test/selectorOutputContract.test.ts",
        "packages/core/test/finalizationSnapshot.bench.ts",
        "packages/core/CORE_DESIGN.md",
        "docs/phase-8-capability-hardening-backlog.md",
        "packages/vite/src/plugin.ts",
        "packages/rsbuild/src/buildArtifacts.ts"
      ],
      "checks": [
        {
          "command": "borrowed-reference-search",
          "result": "passed"
        },
        {
          "command": "core-ownership-diff-review",
          "result": "passed"
        },
        {
          "command": "benchmark-and-rejected-evidence-review",
          "result": "passed"
        },
        {
          "command": "adapter-attribution-review",
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
    "id": "materials/architecture/finalization-snapshot-cache.md",
    "role": "architecture",
    "path": "materials/architecture/finalization-snapshot-cache.md",
    "summary": "记录transformer级懒收尾缓存边界调用链量化防御性语义与性能门禁",
    "purpose": "作为开发测试和审查的唯一架构依据"
  },
  {
    "id": "materials/architecture/low-retained-finalization-cache.md",
    "role": "architecture",
    "path": "materials/architecture/low-retained-finalization-cache.md",
    "summary": "记录同步borrowed-visitor与轻量cache方案以及校正后的时间和内存门禁",
    "purpose": "作为替代开发测试审查的架构依据"
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
        "reason": "borrowed-reference隔离异常freshness-UTF8-byte等价和修订内存门禁需独立测试。"
      },
      "review": {
        "requires": true,
        "reason": "内部引用逃逸package-root-export公开深防御性和transform-entry失效需独立审查。"
      }
    },
    "development": [
      {
        "assignment": "implement-low-retained-cache",
        "test": {
          "requires": true,
          "reason": "borrowed引用生命周期mutation隔离异常freshness和heap门禁需独立验证。"
        },
        "review": {
          "requires": true,
          "reason": "内部所有权seam和顺序依赖cache行为需独立引用逃逸与契约审查。"
        }
      },
      {
        "assignment": "implement-finalization-cache",
        "test": {
          "requires": true,
          "reason": "独立Test仍需复核successor缓存语义benchmark和Adapter字节兼容。"
        },
        "review": {
          "requires": true,
          "reason": "独立Review仍需确认rejected-prototype与successor架构边界无混淆。"
        }
      }
    ],
    "main": {
      "test": {
        "requires": true,
        "reason": "缓存freshness公开对象隔离异常路径与GC内存门禁需要独立执行证据"
      },
      "review": {
        "requires": true,
        "reason": "内部borrowed引用边界与顺序依赖缓存需要独立代码审查"
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
    "已完成Core内部低retained-heap构建收尾优化同步borrowed-visitor避免重复declaration深拷贝轻量cache复用report与CSS派生结果所有公共产物fingerprint不变且独立性能测试和审查通过"
  ],
  "artifacts": [],
  "blockers": [],
  "next_action": "无自动后续项后续仅在真实profile显示Adapter-stabilizer或analyzer成为热点时另立独立优化项目",
  "success_evidence": [
    {
      "criterion": "同一transformer状态下atomic-CSS、manifest与report复用一次聚合结果；每次transform后正确失效，外部修改返回对象不得污染缓存或后续结果。",
      "evidence": "同步borrowed-visitor消除registry-list中间深拷贝report和byte-count按revision缓存manifest每次直接防御性投影；定向测试覆盖所有失效和mutation-isolation",
      "pointers": [
        "packages/core/src/engine/createTransformer.ts",
        "packages/core/src/registry/AtomicRegistry.ts",
        "packages/core/test/transformer.test.ts"
      ]
    },
    {
      "criterion": "测试覆盖空输入、跨文件复用、重复getter、getter交错、transform后失效及返回快照防御性。",
      "evidence": "Core定向测试与独立六种getter全排列十次重复验证全部通过并覆盖empty-reuse-new-key-parse-error-throw和嵌套对象mutation",
      "pointers": [
        "packages/core/test/transformer.test.ts",
        "packages/core/test/atomizer.test.ts"
      ]
    },
    {
      "criterion": "Core、Vite、Rsbuild包verify与根verify通过；独立Test/Review无未解决问题。",
      "evidence": "Development与独立Test均确认Core-Vite-Rsbuild包verify及pnpm-verify通过独立Review-no-actionable-findings",
      "pointers": [
        ".agent-work/work-items/build-finalization-snapshot-cache/index.md"
      ]
    },
    {
      "criterion": "保持transformCss、createTransformer及所有Core/Vite/Rsbuild公共接口、manifest/report-schema、输出顺序与CSS字节完全不变。",
      "evidence": "1x与10x的atomic-CSS和JSON-manifest-report原始bytes及SHA-256与baseline完全一致package-root仍只导出createTransformer和transformCss且三个包及根verify通过",
      "pointers": [
        "packages/core/test/finalizationSnapshot.bench.ts",
        "packages/core/test/selectorOutputContract.test.ts"
      ]
    },
    {
      "criterion": "基准独立记录transform与finalization、重复getter和peak-heap；在代表性1x/10x-corpus上证明优化且不出现明显回退。",
      "evidence": "独立10x复跑cold-hot-all-getters分别为baseline的0.486x-0.412x-0.412x端到端0.982xpeak-delta-0.311x-total-retained-1.003x-positive-incremental-0且fingerprint完全一致",
      "pointers": [
        "packages/core/test/finalizationSnapshot.bench.ts",
        "docs/phase-8-capability-hardening-backlog.md"
      ]
    }
  ]
}
```
<!-- workflow:result:end -->
