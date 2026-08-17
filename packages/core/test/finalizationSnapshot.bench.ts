import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { bench } from 'vitest';
import { createTransformer, type ScopeStrategy, type Transformer } from '../src/index.js';

type Scale = '1x' | '10x';
type TimedMetric = 'coldViteMs' | 'hotViteMs' | 'allGettersMs' | 'endToEndMs';

type ScaleMetrics = Record<TimedMetric, number> & {
  setupRetainedHeapBytes: number | null;
  totalRetainedHeapBytes: number | null;
  incrementalRetainedHeapBytes: number | null;
  positiveIncrementalBytes: number | null;
  observedPeakHeapBytes: number;
  observedPeakHeapDeltaBytes: number;
  fingerprints: {
    atomicCss: OutputFingerprint;
    manifest: OutputFingerprint;
    report: OutputFingerprint;
  };
};

type BenchmarkMetrics = Record<Scale, ScaleMetrics>;

type OutputFingerprint = {
  bytes: number;
  sha256: string;
};

const scope: ScopeStrategy = {
  /** 为固定基准输入生成稳定且无额外状态的 scoped class。 */
  resolveClassName(className) {
    return `bench_${className}`;
  }
};

/**
 * 构造架构材料约定的固定 finalization 数据集。
 *
 * 1x 包含 100 个 input、1,000 个 safe class、3,000 次注册、2,001 个唯一 atomic 和
 * 10 条 unsafe diagnostic；10x 将各维度同时放大十倍。
 */
function createInputs(scale: Scale): { id: string; css: string; scope: ScopeStrategy }[] {
  const inputCount = scale === '1x' ? 100 : 1_000;

  return Array.from({ length: inputCount }, (_, inputIndex) => {
    const rules = Array.from({ length: 10 }, (__, classIndex) => {
      const globalIndex = inputIndex * 10 + classIndex;
      return `.class${globalIndex} { display: block; width: ${globalIndex}px; z-index: ${globalIndex}; }`;
    });

    if (inputIndex % 10 === 0) {
      rules.push(`.unsafe${inputIndex} .child${inputIndex} { opacity: 0.${inputIndex % 10}; }`);
    }

    return {
      id: `bench-${inputIndex.toString().padStart(4, '0')}.css`,
      css: rules.join('\n'),
      scope
    };
  });
}

/** 创建已完成 setup transform、尚未读取聚合 getter 的独立 transformer。 */
function createPreparedTransformer(inputs: ReturnType<typeof createInputs>): Transformer {
  const transformer = createTransformer({ className: { strategy: 'hash', prefix: '_' } });
  for (const input of inputs) {
    transformer.transformCss(input);
  }
  return transformer;
}

/** 使用后五个独立 round 的中位数，前两个 round 只预热 JIT。 */
function measureMedian(runRound: () => number): number {
  const durations = Array.from({ length: 7 }, () => runRound());
  return [...durations.slice(2)].sort((left, right) => left - right)[2]!;
}

/** 只计 finalization getter，不把数据 setup 转移到冷路径指标。 */
function measureFinalization(
  inputs: ReturnType<typeof createInputs>,
  finalize: (transformer: Transformer) => void
): number {
  const transformer = createPreparedTransformer(inputs);
  const startedAt = performance.now();
  finalize(transformer);
  return performance.now() - startedAt;
}

/** 测量 setup transform 与一次冷 Vite getter 组合的完整耗时。 */
function measureEndToEnd(inputs: ReturnType<typeof createInputs>): number {
  const startedAt = performance.now();
  const transformer = createPreparedTransformer(inputs);
  runColdVitePath(transformer);
  return performance.now() - startedAt;
}

/** 模拟 Adapter manifest/report consumer 的 getter 顺序。 */
function runColdVitePath(transformer: Transformer): void {
  transformer.getManifest();
  transformer.getReport();
  transformer.getManifest();
}

/**
 * 测量一个独立 transformer round 的 finalization heap 原始值。
 *
 * @remarks
 * observed peak 只在 getter 边界采样，不宣称捕获 getter 内部同步瞬时真峰值。
 * retained 原始值只在 `global.gc` 可用时报告；本地硬门禁命令使用
 * `NODE_OPTIONS=--expose-gc`。
 */
function measureHeapRound(inputs: ReturnType<typeof createInputs>): Omit<HeapMetrics, 'gcAvailable'> & {
  gcAvailable: boolean;
} {
  const transformer = createPreparedTransformer(inputs);
  globalThis.gc?.();
  const setupRetainedHeapBytes = process.memoryUsage().heapUsed;
  let observedPeakHeapBytes = setupRetainedHeapBytes;
  const samplePeak = (): void => {
    observedPeakHeapBytes = Math.max(observedPeakHeapBytes, process.memoryUsage().heapUsed);
  };

  transformer.getManifest();
  samplePeak();
  transformer.getReport();
  samplePeak();
  transformer.getManifest();
  samplePeak();

  if (!globalThis.gc) {
    return {
      gcAvailable: false,
      setupRetainedHeapBytes: null,
      totalRetainedHeapBytes: null,
      incrementalRetainedHeapBytes: null,
      positiveIncrementalBytes: null,
      observedPeakHeapBytes,
      observedPeakHeapDeltaBytes: observedPeakHeapBytes - setupRetainedHeapBytes
    };
  }

  globalThis.gc();
  const totalRetainedHeapBytes = process.memoryUsage().heapUsed;
  const incrementalRetainedHeapBytes = totalRetainedHeapBytes - setupRetainedHeapBytes;
  return {
    gcAvailable: true,
    setupRetainedHeapBytes,
    totalRetainedHeapBytes,
    incrementalRetainedHeapBytes,
    positiveIncrementalBytes: Math.max(0, incrementalRetainedHeapBytes),
    observedPeakHeapBytes,
    observedPeakHeapDeltaBytes: observedPeakHeapBytes - setupRetainedHeapBytes
  };
}

type HeapMetrics = Pick<
  ScaleMetrics,
  | 'setupRetainedHeapBytes'
  | 'totalRetainedHeapBytes'
  | 'incrementalRetainedHeapBytes'
  | 'positiveIncrementalBytes'
  | 'observedPeakHeapBytes'
  | 'observedPeakHeapDeltaBytes'
>;

/** 对 7 个独立 round 丢弃前 2 个预热值，返回后 5 个的逐字段中位数。 */
function measureHeap(inputs: ReturnType<typeof createInputs>): HeapMetrics {
  const rounds = Array.from({ length: 7 }, () => {
    const round = measureHeapRound(inputs);
    globalThis.gc?.();
    return round;
  }).slice(2);
  const gcAvailable = rounds.every((round) => round.gcAvailable);
  const median = (values: number[]): number => [...values].sort((left, right) => left - right)[2]!;
  const medianOrNull = (read: (round: (typeof rounds)[number]) => number | null): number | null => {
    if (!gcAvailable) {
      return null;
    }
    return median(rounds.map(read) as number[]);
  };

  return {
    setupRetainedHeapBytes: medianOrNull((round) => round.setupRetainedHeapBytes),
    totalRetainedHeapBytes: medianOrNull((round) => round.totalRetainedHeapBytes),
    incrementalRetainedHeapBytes: medianOrNull((round) => round.incrementalRetainedHeapBytes),
    positiveIncrementalBytes: medianOrNull((round) => round.positiveIncrementalBytes),
    observedPeakHeapBytes: median(rounds.map((round) => round.observedPeakHeapBytes)),
    observedPeakHeapDeltaBytes: median(rounds.map((round) => round.observedPeakHeapDeltaBytes))
  };
}

/** 固定原始 UTF-8 bytes 与 SHA-256，用于 baseline/candidate 精确输出对照。 */
function fingerprint(value: string): OutputFingerprint {
  return {
    bytes: Buffer.byteLength(value),
    sha256: createHash('sha256').update(value).digest('hex')
  };
}

/** 在固定 getter 顺序下记录 CSS、manifest 与 report 的原始序列化指纹。 */
function collectFingerprints(inputs: ReturnType<typeof createInputs>): ScaleMetrics['fingerprints'] {
  const transformer = createPreparedTransformer(inputs);
  const manifest = transformer.getManifest();
  const report = transformer.getReport();
  const atomicCss = transformer.getAtomicCss();

  return {
    atomicCss: fingerprint(atomicCss),
    manifest: fingerprint(JSON.stringify(manifest)),
    report: fingerprint(JSON.stringify(report))
  };
}

/** 执行固定 1x/10x 矩阵并把机器数据留在 `/tmp`，不提交进仓库。 */
function collectMetrics(): BenchmarkMetrics {
  return Object.fromEntries(
    (['1x', '10x'] as const).map((scale) => {
      const inputs = createInputs(scale);
      const heap = measureHeap(inputs);
      const metrics: ScaleMetrics = {
        coldViteMs: measureMedian(() => measureFinalization(inputs, runColdVitePath)),
        hotViteMs: measureMedian(() =>
          measureFinalization(inputs, (transformer) => {
            runColdVitePath(transformer);
            for (let repeat = 0; repeat < 10; repeat += 1) {
              runColdVitePath(transformer);
            }
          })
        ),
        allGettersMs: measureMedian(() =>
          measureFinalization(inputs, (transformer) => {
            transformer.getAtomicCss();
            transformer.getManifest();
            transformer.getReport();
          })
        ),
        endToEndMs: measureMedian(() => measureEndToEnd(inputs)),
        ...heap,
        fingerprints: collectFingerprints(inputs)
      };
      return [scale, metrics];
    })
  ) as BenchmarkMetrics;
}

bench(
  '固定 finalization snapshot 矩阵',
  () => {
    const metrics = collectMetrics();
    writeFileSync(
      process.env.GSS_FINALIZATION_METRICS_PATH ?? '/tmp/gss-finalization-metrics.json',
      `${JSON.stringify(metrics, null, 2)}\n`
    );
  },
  {
    iterations: 1,
    time: 0,
    warmupIterations: 0,
    warmupTime: 0
  }
);
