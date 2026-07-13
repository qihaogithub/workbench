/**
 * Workspace Performance Sampling (WMA-347)
 *
 * 采集 Workspace Authority 相关操作的延迟样本，并提供 SLO 报告。
 *
 * 设计原则：
 * - 纯内存采样，无持久化（页面刷新即清空）
 * - 固定容量环形缓冲区，防止内存泄漏
 * - 每个指标独立计算 p50/p95/p99 并与 SLO 目标对比
 */

/** 性能采样指标名称 */
export type PerformanceMetric =
  | "autosave-debounce"
  | "queue-wait"
  | "commit-latency"
  | "remote-update-latency"
  | "draft-preview-latency"
  | "projection-latency"
  | "reconnect-convergence"
  | "canonical-lag";

/** SLO 目标定义（p95 上限，单位毫秒） */
export interface SLOTarget {
  p95MaxMs: number;
  description: string;
}

/** 单个指标的采样统计结果 */
export interface MetricStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
}

/** 单个指标的 SLO 检查结果 */
export interface MetricSLOCheck {
  metric: PerformanceMetric;
  stats: MetricStats;
  slo: SLOTarget;
  passed: boolean;
}

/** SLO 报告 */
export interface SLOReport {
  timestamp: number;
  metrics: MetricSLOCheck[];
  allPassed: boolean;
}

/** SLO 目标表 */
const SLO_TARGETS: Record<PerformanceMetric, SLOTarget> = {
  "autosave-debounce": {
    p95MaxMs: 1500,
    description: "停止输入到「已自动保存」",
  },
  "queue-wait": {
    p95MaxMs: 500,
    description: "mutation 队列等待时间",
  },
  "commit-latency": {
    p95MaxMs: 500,
    description: "Authority commit 延迟",
  },
  "remote-update-latency": {
    p95MaxMs: 300,
    description: "远程协作更新延迟",
  },
  "draft-preview-latency": {
    p95MaxMs: 1000,
    description: "React draft 预览延迟",
  },
  "projection-latency": {
    p95MaxMs: 150,
    description: "HTML/CSS/Sketch draft 预览延迟",
  },
  "reconnect-convergence": {
    p95MaxMs: 3000,
    description: "WebSocket 重连收敛时间",
  },
  "canonical-lag": {
    p95MaxMs: 5000,
    description: "Canonical 物化延迟（空闲）",
  },
};

/** 环形缓冲区默认容量 */
const DEFAULT_BUFFER_SIZE = 1000;

/**
 * 环形缓冲区，用于高效存储延迟样本。
 */
class RingBuffer {
  private buffer: Float64Array;
  private head = 0;
  private _count = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Float64Array(capacity);
  }

  push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this._count < this.capacity) {
      this._count++;
    }
  }

  get count(): number {
    return this._count;
  }

  /** 返回所有有效样本（按插入顺序） */
  toArray(): number[] {
    if (this._count < this.capacity) {
      return Array.from(this.buffer.subarray(0, this._count));
    }
    // 缓冲区已满，从 head 开始读取
    const result: number[] = new Array(this._count);
    for (let i = 0; i < this._count; i++) {
      result[i] = this.buffer[(this.head + i) % this.capacity];
    }
    return result;
  }

  clear(): void {
    this.head = 0;
    this._count = 0;
  }
}

/**
 * 计算分位数（基于排序后数组的线性插值）。
 * @param sorted 已排序的样本数组
 * @param quantile 0-1 之间的分位数
 */
function percentile(sorted: number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const index = quantile * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * 计算指定样本集的统计信息。
 */
function computeStats(samples: number[]): MetricStats {
  if (samples.length === 0) {
    return { count: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/**
 * 性能采样器。
 *
 * 为每个 PerformanceMetric 维护独立的环形缓冲区，
 * 提供 sample* 方法和 getSLOReport 汇总。
 */
export class WorkspacePerformanceSampler {
  private readonly buffers: Map<PerformanceMetric, RingBuffer>;

  constructor(bufferSize: number = DEFAULT_BUFFER_SIZE) {
    this.buffers = new Map();
    const metrics: PerformanceMetric[] = [
      "autosave-debounce",
      "queue-wait",
      "commit-latency",
      "remote-update-latency",
      "draft-preview-latency",
      "projection-latency",
      "reconnect-convergence",
      "canonical-lag",
    ];
    for (const metric of metrics) {
      this.buffers.set(metric, new RingBuffer(bufferSize));
    }
  }

  /** 记录 autosave debounce 等待时间 */
  sampleAutosaveDebounce(waitMs: number): void {
    this.buffers.get("autosave-debounce")!.push(waitMs);
  }

  /** 记录 mutation 队列等待时间 */
  sampleQueueWait(waitMs: number): void {
    this.buffers.get("queue-wait")!.push(waitMs);
  }

  /** 记录 Authority commit 延迟 */
  sampleCommitLatency(latencyMs: number): void {
    this.buffers.get("commit-latency")!.push(latencyMs);
  }

  /** 记录远程协作更新延迟 */
  sampleRemoteUpdateLatency(latencyMs: number): void {
    this.buffers.get("remote-update-latency")!.push(latencyMs);
  }

  /** 记录 draft 预览延迟 */
  sampleDraftPreviewLatency(latencyMs: number): void {
    this.buffers.get("draft-preview-latency")!.push(latencyMs);
  }

  /** 记录 projection ack 延迟 */
  sampleProjectionLatency(latencyMs: number): void {
    this.buffers.get("projection-latency")!.push(latencyMs);
  }

  /** 记录重连收敛时间 */
  sampleReconnectConvergence(latencyMs: number): void {
    this.buffers.get("reconnect-convergence")!.push(latencyMs);
  }

  /** 记录 canonical 物化延迟 */
  sampleCanonicalLag(lagMs: number): void {
    this.buffers.get("canonical-lag")!.push(lagMs);
  }

  /** 获取指定指标的统计信息 */
  getMetricStats(metric: PerformanceMetric): MetricStats {
    const buffer = this.buffers.get(metric);
    if (!buffer) {
      return { count: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
    }
    return computeStats(buffer.toArray());
  }

  /** 生成 SLO 报告 */
  getSLOReport(): SLOReport {
    const metrics: MetricSLOCheck[] = [];
    let allPassed = true;

    for (const [metric, slo] of Object.entries(SLO_TARGETS) as Array<
      [PerformanceMetric, SLOTarget]
    >) {
      const stats = this.getMetricStats(metric);
      const passed = stats.count === 0 || stats.p95 <= slo.p95MaxMs;
      if (!passed) allPassed = false;
      metrics.push({ metric, stats, slo, passed });
    }

    return {
      timestamp: Date.now(),
      metrics,
      allPassed,
    };
  }

  /** 清空所有采样数据 */
  reset(): void {
    for (const buffer of this.buffers.values()) {
      buffer.clear();
    }
  }
}

/**
 * 创建默认性能采样器实例。
 */
export function createPerformanceSampler(): WorkspacePerformanceSampler {
  return new WorkspacePerformanceSampler();
}
