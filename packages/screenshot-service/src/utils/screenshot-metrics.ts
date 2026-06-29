import type { ScreenshotVariant } from "./screenshot-store";
import type {
  RenderStageTimings,
  ScreenshotPriority,
  ScreenshotRenderMode,
} from "./browser-pool";
import type { ScreenshotErrorCode } from "./errors";

interface ScreenshotMetricSample {
  timestamp: number;
  elapsedMs: number;
  compileMs: number;
  renderMs: number;
  writeMs: number;
  queueWaitMs: number;
  width: number;
  height: number;
  fullPage: boolean;
  cached: boolean;
  priority: ScreenshotPriority;
  variant: ScreenshotVariant;
  renderMode: ScreenshotRenderMode;
  renderStages: RenderStageTimings;
}

interface PercentileSnapshot {
  p50: number;
  p90: number;
  p99: number;
  avg: number;
  max: number;
}

const MAX_SAMPLES = 500;

function emptyRenderStages(): RenderStageTimings {
  return {
    browserMs: 0,
    pageCreateMs: 0,
    setViewportMs: 0,
    setContentMs: 0,
    waitForSelectorMs: 0,
    waitForNetworkIdleMs: 0,
    animationFrameMs: 0,
    runtimeErrorCheckMs: 0,
    measurementMs: 0,
    viewportResizeMs: 0,
    screenshotMs: 0,
  };
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return sorted[index];
}

function summarize(values: number[]): PercentileSnapshot {
  if (values.length === 0) {
    return { p50: 0, p90: 0, p99: 0, avg: 0, max: 0 };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    p50: percentile(values, 0.5),
    p90: percentile(values, 0.9),
    p99: percentile(values, 0.99),
    avg: Math.round(total / values.length),
    max: Math.max(...values),
  };
}

function incrementCounter<T extends string>(
  counter: Partial<Record<T, number>>,
  key: T,
): void {
  counter[key] = (counter[key] || 0) + 1;
}

class ScreenshotMetrics {
  private samples: ScreenshotMetricSample[] = [];
  private errorsByCode: Partial<Record<ScreenshotErrorCode, number>> = {};

  recordSuccess(sample: Omit<ScreenshotMetricSample, "timestamp">): void {
    this.samples.push({
      ...sample,
      timestamp: Date.now(),
      renderStages: sample.renderStages || emptyRenderStages(),
    });
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    }
  }

  recordError(code: ScreenshotErrorCode): void {
    this.errorsByCode[code] = (this.errorsByCode[code] || 0) + 1;
  }

  snapshot() {
    const byPriority: Partial<Record<ScreenshotPriority, number>> = {};
    const byVariant: Partial<Record<ScreenshotVariant, number>> = {};
    const byFullPage = { true: 0, false: 0 };
    const bySize: Record<string, number> = {};
    const renderStages = emptyRenderStages();

    for (const sample of this.samples) {
      incrementCounter(byPriority, sample.priority);
      incrementCounter(byVariant, sample.variant);
      byFullPage[String(sample.fullPage) as "true" | "false"]++;
      incrementCounter(bySize, `${sample.width}x${sample.height}`);

      renderStages.browserMs += sample.renderStages.browserMs;
      renderStages.pageCreateMs += sample.renderStages.pageCreateMs;
      renderStages.setViewportMs += sample.renderStages.setViewportMs;
      renderStages.setContentMs += sample.renderStages.setContentMs;
      renderStages.waitForSelectorMs += sample.renderStages.waitForSelectorMs;
      renderStages.waitForNetworkIdleMs +=
        sample.renderStages.waitForNetworkIdleMs;
      renderStages.animationFrameMs += sample.renderStages.animationFrameMs;
      renderStages.runtimeErrorCheckMs +=
        sample.renderStages.runtimeErrorCheckMs;
      renderStages.measurementMs += sample.renderStages.measurementMs;
      renderStages.viewportResizeMs += sample.renderStages.viewportResizeMs;
      renderStages.screenshotMs += sample.renderStages.screenshotMs;
    }

    const count = this.samples.length;
    const cachedCount = this.samples.filter((sample) => sample.cached).length;

    return {
      windowSize: MAX_SAMPLES,
      sampleCount: count,
      cacheHitRate: count === 0 ? 0 : cachedCount / count,
      cachedCount,
      byPriority,
      byVariant,
      byFullPage,
      bySize,
      errorsByCode: this.errorsByCode,
      totalMs: summarize(this.samples.map((sample) => sample.elapsedMs)),
      compileMs: summarize(this.samples.map((sample) => sample.compileMs)),
      renderMs: summarize(this.samples.map((sample) => sample.renderMs)),
      writeMs: summarize(this.samples.map((sample) => sample.writeMs)),
      queueWaitMs: summarize(this.samples.map((sample) => sample.queueWaitMs)),
      renderStages,
    };
  }
}

const screenshotMetrics = new ScreenshotMetrics();

export function getScreenshotMetrics(): ScreenshotMetrics {
  return screenshotMetrics;
}
