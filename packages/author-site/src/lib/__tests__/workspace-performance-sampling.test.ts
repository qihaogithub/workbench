import {
  WorkspacePerformanceSampler,
  createPerformanceSampler,
  type PerformanceMetric,
} from "../workspace-performance-sampling";

describe("WorkspacePerformanceSampler", () => {
  let sampler: WorkspacePerformanceSampler;

  beforeEach(() => {
    sampler = createPerformanceSampler();
  });

  describe("采样记录", () => {
    it("sampleAutosaveDebounce 应记录 autosave debounce 等待时间", () => {
      sampler.sampleAutosaveDebounce(800);
      sampler.sampleAutosaveDebounce(900);
      const stats = sampler.getMetricStats("autosave-debounce");
      expect(stats.count).toBe(2);
    });

    it("sampleQueueWait 应记录 mutation 队列等待时间", () => {
      sampler.sampleQueueWait(100);
      const stats = sampler.getMetricStats("queue-wait");
      expect(stats.count).toBe(1);
    });

    it("sampleCommitLatency 应记录 Authority commit 延迟", () => {
      sampler.sampleCommitLatency(200);
      const stats = sampler.getMetricStats("commit-latency");
      expect(stats.count).toBe(1);
    });

    it("sampleRemoteUpdateLatency 应记录远程协作更新延迟", () => {
      sampler.sampleRemoteUpdateLatency(150);
      const stats = sampler.getMetricStats("remote-update-latency");
      expect(stats.count).toBe(1);
    });

    it("sampleDraftPreviewLatency 应记录 draft 预览延迟", () => {
      sampler.sampleDraftPreviewLatency(500);
      const stats = sampler.getMetricStats("draft-preview-latency");
      expect(stats.count).toBe(1);
    });

    it("sampleProjectionLatency 应记录 projection ack 延迟", () => {
      sampler.sampleProjectionLatency(100);
      const stats = sampler.getMetricStats("projection-latency");
      expect(stats.count).toBe(1);
    });

    it("sampleReconnectConvergence 应记录重连收敛时间", () => {
      sampler.sampleReconnectConvergence(2000);
      const stats = sampler.getMetricStats("reconnect-convergence");
      expect(stats.count).toBe(1);
    });

    it("sampleCanonicalLag 应记录 canonical 物化延迟", () => {
      sampler.sampleCanonicalLag(3000);
      const stats = sampler.getMetricStats("canonical-lag");
      expect(stats.count).toBe(1);
    });
  });

  describe("统计计算", () => {
    it("无样本时统计值应全为 0", () => {
      const stats = sampler.getMetricStats("commit-latency");
      expect(stats.count).toBe(0);
      expect(stats.p50).toBe(0);
      expect(stats.p95).toBe(0);
      expect(stats.p99).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
    });

    it("单样本时所有分位数应等于该样本", () => {
      sampler.sampleCommitLatency(42);
      const stats = sampler.getMetricStats("commit-latency");
      expect(stats.count).toBe(1);
      expect(stats.p50).toBe(42);
      expect(stats.p95).toBe(42);
      expect(stats.p99).toBe(42);
      expect(stats.min).toBe(42);
      expect(stats.max).toBe(42);
    });

    it("多样本时 p50 应为中位数", () => {
      // 添加 1-10
      for (let i = 1; i <= 10; i++) {
        sampler.sampleCommitLatency(i * 10);
      }
      const stats = sampler.getMetricStats("commit-latency");
      expect(stats.count).toBe(10);
      // 排序后: 10,20,30,40,50,60,70,80,90,100
      // p50 应为 index 4.5 -> 50*0.5 + 60*0.5 = 55
      expect(stats.p50).toBeCloseTo(55, 0);
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(100);
    });

    it("环形缓冲区溢出时应只保留最新样本", () => {
      const smallSampler = new WorkspacePerformanceSampler(5);
      for (let i = 1; i <= 10; i++) {
        smallSampler.sampleCommitLatency(i * 10);
      }
      const stats = smallSampler.getMetricStats("commit-latency");
      expect(stats.count).toBe(5);
      // 应保留 60, 70, 80, 90, 100
      expect(stats.min).toBe(60);
      expect(stats.max).toBe(100);
    });
  });

  describe("SLO 报告", () => {
    it("无样本时所有指标应通过 SLO", () => {
      const report = sampler.getSLOReport();
      expect(report.allPassed).toBe(true);
      expect(report.metrics).toHaveLength(8);
      expect(report.timestamp).toBeGreaterThan(0);
      for (const check of report.metrics) {
        expect(check.passed).toBe(true);
      }
    });

    it("所有样本在 SLO 内时应全部通过", () => {
      // 添加远低于 SLO 目标的样本
      sampler.sampleRemoteUpdateLatency(100); // SLO: p95 < 300ms
      sampler.sampleCommitLatency(200); // SLO: p95 < 500ms
      const report = sampler.getSLOReport();
      expect(report.allPassed).toBe(true);
    });

    it("p95 超过 SLO 目标时应标记为失败", () => {
      // 添加大量超过 remote-update-latency SLO (300ms) 的样本
      for (let i = 0; i < 100; i++) {
        sampler.sampleRemoteUpdateLatency(400);
      }
      const report = sampler.getSLOReport();
      expect(report.allPassed).toBe(false);
      const remoteCheck = report.metrics.find(
        (m) => m.metric === "remote-update-latency",
      );
      expect(remoteCheck).toBeDefined();
      expect(remoteCheck!.passed).toBe(false);
      expect(remoteCheck!.stats.p95).toBeCloseTo(400, 0);
    });

    it("报告应包含所有 8 个指标", () => {
      const report = sampler.getSLOReport();
      const metricNames: PerformanceMetric[] = [
        "autosave-debounce",
        "queue-wait",
        "commit-latency",
        "remote-update-latency",
        "draft-preview-latency",
        "projection-latency",
        "reconnect-convergence",
        "canonical-lag",
      ];
      for (const name of metricNames) {
        expect(report.metrics.find((m) => m.metric === name)).toBeDefined();
      }
    });

    it("每个 SLO check 应包含 slo 目标和统计信息", () => {
      const report = sampler.getSLOReport();
      for (const check of report.metrics) {
        expect(check.slo).toBeDefined();
        expect(check.slo.p95MaxMs).toBeGreaterThan(0);
        expect(typeof check.slo.description).toBe("string");
        expect(check.stats).toBeDefined();
      }
    });
  });

  describe("reset", () => {
    it("重置后所有指标应归零", () => {
      sampler.sampleCommitLatency(100);
      sampler.sampleQueueWait(50);
      sampler.reset();
      expect(sampler.getMetricStats("commit-latency").count).toBe(0);
      expect(sampler.getMetricStats("queue-wait").count).toBe(0);
    });
  });
});
