import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { config } from "../config";
import {
  getBrowserPool,
  isLikelyBlankScreenshot,
} from "../utils/browser-pool";
import { compileCode } from "../utils/compile-client";
import { getCompileCache } from "../utils/compile-cache";
import {
  ScreenshotError,
  getErrorMessage,
  getScreenshotErrorCode,
  type ScreenshotErrorCode,
} from "../utils/errors";
import {
  computeScreenshotHash,
  screenshotExists,
  readScreenshot,
  readScreenshotMeta,
  readScreenshotRenderBox,
  writeScreenshot,
  cleanupOldScreenshots,
  type ScreenshotVariant,
} from "../utils/screenshot-store";
import { generateIframeHtml } from "@workbench/shared/demo/iframe-template";
import {
  buildPrototypePreviewDocumentHtml,
  type PageSnapshotInput,
  type PrototypePageMeta,
} from "@workbench/shared";
import {
  buildSketchScenePreviewDocumentHtml,
  getSketchSceneHashSource,
  parseSketchSceneDocument,
} from "@workbench/sketch-core";
import type {
  RenderStageTimings,
  ScreenshotPriority,
  ScreenshotRenderBox,
  ScreenshotRenderMode,
} from "../utils/browser-pool";
import { getScreenshotMetrics } from "../utils/screenshot-metrics";

// --- Request schemas ---

type RequestSnapshotInput =
  | PageSnapshotInput
  | {
      runtimeType?: "high-fidelity-react";
      code: string;
      configData?: Record<string, unknown>;
      previewSize?: PageSnapshotInput["previewSize"];
    };

type GenerateRequest = RequestSnapshotInput & {
  projectId: string;
  pageId: string;
  width?: number;
  height?: number;
  fullPage?: boolean;
  sessionId?: string;
  priority?: ScreenshotPriority;
  renderMode?: ScreenshotRenderMode;
  measuredHeight?: number;
  force?: boolean;
};

type BatchPage = RequestSnapshotInput & {
  pageId: string;
  width?: number;
  height?: number;
  fullPage?: boolean;
  priority?: ScreenshotPriority;
  renderMode?: ScreenshotRenderMode;
  measuredHeight?: number;
  force?: boolean;
};

interface GenerateBatchRequest {
  projectId: string;
  pages: BatchPage[];
  sessionId?: string;
}

// --- Batch state ---

interface BatchResult {
  pageId: string;
  priority?: ScreenshotPriority;
  variant?: ScreenshotVariant;
  quality?: ScreenshotVariant;
  url?: string;
  assetUrl?: string;
  hash?: string;
  elapsed?: number;
  cached?: boolean;
  queueWaitMs?: number;
  timings?: ScreenshotTimings;
  renderBox?: ScreenshotRenderBox;
  status: "pending" | "rendering" | "done" | "failed";
  errorCode?: ScreenshotErrorCode;
  error?: string;
}

interface BatchPriorityStats {
  total: number;
  completed: number;
  failed: number;
  cached: number;
  status: "pending" | "running" | "completed";
  firstCompletedAt?: string;
  completedAt?: string;
  firstCompletedElapsedMs?: number;
  completedElapsedMs?: number;
}

interface BatchMetrics {
  totalElapsedMs: number;
  totalCompileMs: number;
  totalRenderMs: number;
  totalWriteMs: number;
  totalQueueWaitMs: number;
  renderStages: RenderStageTimings;
  rendered: number;
  screenshotCacheHits: number;
  compileCacheHits: number;
  inFlightHits: number;
}

interface BatchState {
  batchId: string;
  projectId: string;
  total: number;
  results: BatchResult[];
  completed: number;
  failed: number;
  cached: number;
  status: "running" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  cancelled: boolean;
  errorsByCode: Partial<Record<ScreenshotErrorCode, number>>;
  priorityStats: Record<ScreenshotPriority, BatchPriorityStats>;
  metrics: BatchMetrics;
}

const batchStore = new Map<string, BatchState>();
const inFlightScreenshots = new Map<string, Promise<GenerateScreenshotResult>>();

interface ScreenshotTimings {
  compileMs: number;
  renderMs: number;
  writeMs: number;
  totalMs: number;
  renderStages: RenderStageTimings;
}

interface ScreenshotCacheStats {
  screenshotHit: boolean;
  compileHit: boolean;
  inFlightHit: boolean;
}

interface GenerateScreenshotResult {
  url: string;
  hash: string;
  elapsed: number;
  cached: boolean;
  requestId: string;
  queueWaitMs: number;
  timings: ScreenshotTimings;
  renderBox: ScreenshotRenderBox;
  cache: ScreenshotCacheStats;
  variant: ScreenshotVariant;
  quality: ScreenshotVariant;
  assetUrl: string;
}

const SCREENSHOT_PRIORITIES: ScreenshotPriority[] = [
  "active",
  "visible",
  "nearby",
  "thumbnail",
  "background",
];

const PRIORITY_WEIGHT: Record<ScreenshotPriority, number> = {
  active: 0,
  visible: 1,
  nearby: 2,
  thumbnail: 3,
  background: 4,
};

function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getRequestId(request: FastifyRequest): string {
  const header = request.headers["x-request-id"];
  return typeof header === "string" && header.length > 0
    ? header
    : randomUUID();
}

function touchBatch(batch: BatchState): void {
  batch.updatedAt = new Date().toISOString();
}

function cleanupExpiredBatches(): void {
  const now = Date.now();
  for (const [batchId, batch] of batchStore.entries()) {
    if (Date.parse(batch.expiresAt) <= now) {
      batchStore.delete(batchId);
    }
  }
}

function incrementBatchError(
  batch: BatchState,
  code: ScreenshotErrorCode,
): void {
  batch.errorsByCode[code] = (batch.errorsByCode[code] || 0) + 1;
}

function normalizePriority(priority?: string): ScreenshotPriority {
  return SCREENSHOT_PRIORITIES.includes(priority as ScreenshotPriority)
    ? (priority as ScreenshotPriority)
    : "background";
}

function normalizeRenderMode(renderMode?: string): ScreenshotRenderMode {
  return renderMode === "fast" ? "fast" : "strict";
}

function normalizeVariant(variant?: string): ScreenshotVariant {
  return variant === "fast" ? "fast" : "strict";
}

function normalizeHash(hash?: string): string | undefined {
  if (!hash) return undefined;
  return /^[a-f0-9]{16}$/i.test(hash) ? hash.toLowerCase() : undefined;
}

function buildScreenshotUrl(
  projectId: string,
  pageId: string,
  hash?: string,
  variant: ScreenshotVariant = "strict",
): string {
  const base = `/api/screenshots/file/${projectId}/${pageId}`;
  if (!hash) return base;
  const params = new URLSearchParams({ hash });
  if (variant !== "strict") {
    params.set("variant", variant);
  }
  return `${base}?${params.toString()}`;
}

async function isReadableHealthyScreenshot(
  projectId: string,
  pageId: string,
  hash: string,
  variant: ScreenshotVariant = "strict",
): Promise<boolean> {
  const [buffer, renderBox] = await Promise.all([
    readScreenshot(projectId, pageId, hash, variant),
    readScreenshotRenderBox(projectId, pageId, hash, variant),
  ]);
  return Boolean(buffer && !isLikelyBlankScreenshot(buffer.length, renderBox));
}

function createPriorityStats(): Record<ScreenshotPriority, BatchPriorityStats> {
  return {
    active: {
      total: 0,
      completed: 0,
      failed: 0,
      cached: 0,
      status: "completed",
    },
    visible: {
      total: 0,
      completed: 0,
      failed: 0,
      cached: 0,
      status: "completed",
    },
    nearby: {
      total: 0,
      completed: 0,
      failed: 0,
      cached: 0,
      status: "completed",
    },
    thumbnail: {
      total: 0,
      completed: 0,
      failed: 0,
      cached: 0,
      status: "completed",
    },
    background: {
      total: 0,
      completed: 0,
      failed: 0,
      cached: 0,
      status: "completed",
    },
  };
}

function createBatchMetrics(): BatchMetrics {
  return {
    totalElapsedMs: 0,
    totalCompileMs: 0,
    totalRenderMs: 0,
    totalWriteMs: 0,
    totalQueueWaitMs: 0,
    renderStages: createEmptyRenderStageTimings(),
    rendered: 0,
    screenshotCacheHits: 0,
    compileCacheHits: 0,
    inFlightHits: 0,
  };
}

function createEmptyRenderStageTimings(): RenderStageTimings {
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

function addRenderStageTimings(
  target: RenderStageTimings,
  source: RenderStageTimings,
): void {
  target.browserMs += source.browserMs;
  target.pageCreateMs += source.pageCreateMs;
  target.setViewportMs += source.setViewportMs;
  target.setContentMs += source.setContentMs;
  target.waitForSelectorMs += source.waitForSelectorMs;
  target.waitForNetworkIdleMs += source.waitForNetworkIdleMs;
  target.animationFrameMs += source.animationFrameMs;
  target.runtimeErrorCheckMs += source.runtimeErrorCheckMs;
  target.measurementMs += source.measurementMs;
  target.viewportResizeMs += source.viewportResizeMs;
  target.screenshotMs += source.screenshotMs;
}

function sortBatchPages(pages: BatchPage[]): BatchPage[] {
  return pages
    .map((page, index) => ({
      ...page,
      priority: normalizePriority(page.priority),
      index,
    }))
    .sort((a, b) => {
      const priorityDiff =
        PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      return priorityDiff === 0 ? a.index - b.index : priorityDiff;
    })
    .map(({ index: _index, ...page }) => page);
}

function recordBatchSuccess(
  batch: BatchState,
  priority: ScreenshotPriority,
  result: GenerateScreenshotResult,
): void {
  const stats = batch.priorityStats[priority];
  stats.completed++;
  if (result.cached) stats.cached++;
  recordPrioritySliceProgress(batch, stats);

  batch.metrics.totalElapsedMs += result.elapsed;
  batch.metrics.totalCompileMs += result.timings.compileMs;
  batch.metrics.totalRenderMs += result.timings.renderMs;
  batch.metrics.totalWriteMs += result.timings.writeMs;
  batch.metrics.totalQueueWaitMs += result.queueWaitMs;
  addRenderStageTimings(
    batch.metrics.renderStages,
    result.timings.renderStages,
  );
  if (!result.cached) batch.metrics.rendered++;
  if (result.cache.screenshotHit) batch.metrics.screenshotCacheHits++;
  if (result.cache.compileHit) batch.metrics.compileCacheHits++;
  if (result.cache.inFlightHit) batch.metrics.inFlightHits++;
}

function recordBatchFailure(
  batch: BatchState,
  priority: ScreenshotPriority,
): void {
  const stats = batch.priorityStats[priority];
  stats.completed++;
  stats.failed++;
  recordPrioritySliceProgress(batch, stats);
}

function recordPrioritySliceProgress(
  batch: BatchState,
  stats: BatchPriorityStats,
): void {
  const now = Date.now();
  const createdAtMs = Date.parse(batch.createdAt);
  const elapsedMs = Number.isFinite(createdAtMs) ? now - createdAtMs : undefined;

  if (!stats.firstCompletedAt) {
    stats.firstCompletedAt = new Date(now).toISOString();
    stats.firstCompletedElapsedMs = elapsedMs;
  }

  if (stats.completed >= stats.total) {
    stats.status = "completed";
    stats.completedAt = new Date(now).toISOString();
    stats.completedElapsedMs = elapsedMs;
  } else {
    stats.status = "running";
  }
}

function getBatchRetryAfterMs(batch: BatchState): number {
  if (batch.status !== "running" || batch.cancelled) return 0;

  const hasInteractiveWork = ["active", "visible"].some((priority) => {
    const stats = batch.priorityStats[priority as ScreenshotPriority];
    return stats.total > 0 && stats.completed < stats.total;
  });

  if (hasInteractiveWork) return 500;

  const remaining = Math.max(0, batch.total - batch.completed);
  if (remaining === 0) return 0;
  if (remaining <= config.maxConcurrentPages) return 1000;
  return 1500;
}

function createScreenshotIdentity(sessionId?: string): Record<string, unknown> {
  return {
    sessionScope: sessionId || "global",
    previewRuntimeSource: config.previewRuntimeSource,
    runtimeBaseUrl: config.authorSiteUrl,
    cdnBaseUrl: config.cdnBaseUrl,
  };
}

function normalizeConfigData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizePrototypeMeta(meta: PrototypePageMeta | undefined): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const visualKeys = ["width", "height", "backgroundColor", "theme"];
  const result: Record<string, unknown> = {};
  for (const key of visualKeys) {
    if (meta[key] !== undefined) result[key] = meta[key];
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeSnapshotInput(
  input: RequestSnapshotInput,
  width: number,
  height: number,
): PageSnapshotInput | null {
  const previewSize = input.previewSize ?? { width, height };
  const configData = normalizeConfigData(input.configData);

  if (input.runtimeType === "prototype-html-css") {
    if (typeof input.prototypeHtml !== "string" || input.prototypeHtml.length === 0) {
      return null;
    }
    return {
      runtimeType: "prototype-html-css",
      prototypeHtml: input.prototypeHtml,
      prototypeCss: typeof input.prototypeCss === "string" ? input.prototypeCss : "",
      prototypeMeta: normalizePrototypeMeta(input.prototypeMeta),
      configData,
      previewSize,
    };
  }

  if (input.runtimeType === "sketch-scene") {
    const sketchScene = parseSketchSceneDocument(input.sketchScene);
    if (!sketchScene) return null;
    return {
      runtimeType: "sketch-scene",
      sketchScene,
      sketchMeta:
        input.sketchMeta && typeof input.sketchMeta === "object"
          ? input.sketchMeta as Record<string, unknown>
          : undefined,
      configData,
      previewSize,
    };
  }

  if (typeof input.code !== "string" || input.code.length === 0) {
    return null;
  }
  return {
    runtimeType: "high-fidelity-react",
    code: input.code,
    configData,
    previewSize,
  };
}

function getSnapshotHashSource(input: PageSnapshotInput): string {
  if (input.runtimeType === "high-fidelity-react") {
    return input.code;
  }
  if (input.runtimeType === "sketch-scene") {
    return getSketchSceneHashSource(input.sketchScene, input.configData);
  }
  return JSON.stringify({
    runtimeType: input.runtimeType,
    prototypeHtml: input.prototypeHtml,
    prototypeCss: input.prototypeCss || "",
    prototypeMeta: normalizePrototypeMeta(input.prototypeMeta),
  });
}

function computeSnapshotHash(
  input: PageSnapshotInput,
  width: number,
  height: number,
  fullPage: boolean,
  sessionId?: string,
): string {
  return computeScreenshotHash(
    getSnapshotHashSource(input),
    input.configData || {},
    width,
    height,
    fullPage,
    createScreenshotIdentity(sessionId),
  );
}

function computePageHash(page: BatchPage, sessionId?: string): string {
  const width = page.width || config.viewport.width;
  const height = page.height || config.viewport.height;
  const snapshotInput = normalizeSnapshotInput(page, width, height);
  if (!snapshotInput) return "";
  return computeSnapshotHash(
    snapshotInput,
    width,
    height,
    page.fullPage ?? false,
    sessionId,
  );
}

function getPageVariant(page: Pick<BatchPage, "renderMode">): ScreenshotVariant {
  return normalizeRenderMode(page.renderMode);
}

// --- Screenshot generation ---

async function generateScreenshot(
  projectId: string,
  pageId: string,
  snapshotInput: PageSnapshotInput,
  width: number,
  height: number,
  fullPage: boolean,
  requestId: string,
  priority: ScreenshotPriority,
  renderMode: ScreenshotRenderMode,
  force = false,
  measuredHeight?: number,
  sessionId?: string,
): Promise<GenerateScreenshotResult> {
  const startTime = Date.now();

  const hash = computeSnapshotHash(
    snapshotInput,
    width,
    height,
    fullPage,
    sessionId,
  );
  const variant: ScreenshotVariant = renderMode;

  // Check cache
  if (!force && (await screenshotExists(projectId, pageId, hash, variant))) {
    const renderBox = await readScreenshotRenderBox(
      projectId,
      pageId,
      hash,
      variant,
    );
    const buffer = renderBox
      ? await readScreenshot(projectId, pageId, hash, variant)
      : null;
    if (
      renderBox &&
      buffer &&
      !isLikelyBlankScreenshot(buffer.length, renderBox)
    ) {
      const assetUrl = buildScreenshotUrl(projectId, pageId, hash, variant);
      const elapsed = Date.now() - startTime;
      const renderStages = createEmptyRenderStageTimings();
      getScreenshotMetrics().recordSuccess({
        elapsedMs: elapsed,
        compileMs: 0,
        renderMs: 0,
        writeMs: 0,
        queueWaitMs: 0,
        width,
        height,
        fullPage,
        cached: true,
        priority,
        variant,
        renderMode,
        renderStages,
      });
      return {
        url: `/api/screenshots/file/${projectId}/${pageId}`,
        assetUrl,
        hash,
        elapsed,
        cached: true,
        requestId,
        queueWaitMs: 0,
        renderBox,
        timings: {
          compileMs: 0,
          renderMs: 0,
          writeMs: 0,
          totalMs: elapsed,
          renderStages,
        },
        cache: {
          screenshotHit: true,
          compileHit: false,
          inFlightHit: false,
        },
        variant,
        quality: variant,
      };
    }
  }

  const inFlightKey = `${projectId}:${pageId}:${hash}:${variant}`;
  const inFlight = inFlightScreenshots.get(inFlightKey);
  if (!force && inFlight) {
    const result = await inFlight;
    return {
      ...result,
      requestId,
      cache: {
        ...result.cache,
        inFlightHit: true,
      },
    };
  }

  const generatePromise = generateScreenshotUncached(
    projectId,
    pageId,
    snapshotInput,
    width,
    height,
    fullPage,
    requestId,
    priority,
    renderMode,
    measuredHeight,
    hash,
    startTime,
    sessionId,
  ).finally(() => {
    inFlightScreenshots.delete(inFlightKey);
  });

  inFlightScreenshots.set(inFlightKey, generatePromise);
  return generatePromise;
}

async function generateScreenshotUncached(
  projectId: string,
  pageId: string,
  snapshotInput: PageSnapshotInput,
  width: number,
  height: number,
  fullPage: boolean,
  requestId: string,
  priority: ScreenshotPriority,
  renderMode: ScreenshotRenderMode,
  measuredHeight: number | undefined,
  hash: string,
  startTime: number,
  sessionId?: string,
): Promise<GenerateScreenshotResult> {
  let compileMs = 0;
  let compileHit = false;
  let html: string;

  if (snapshotInput.runtimeType === "high-fidelity-react") {
    const compileCache = getCompileCache();
    const cacheScope = sessionId || "global";
    const compileStart = Date.now();
    let compileResult = compileCache.get(snapshotInput.code, cacheScope);
    compileHit = Boolean(compileResult);

    if (!compileResult) {
      try {
        compileResult = await compileCode(snapshotInput.code, sessionId);
        compileCache.set(snapshotInput.code, compileResult, cacheScope);
      } catch (error) {
        throw new ScreenshotError(
          "COMPILE_ERROR",
          `代码编译失败: ${getErrorMessage(error)}`,
          error,
        );
      }
    }
    compileMs = Date.now() - compileStart;

    html = generateIframeHtml({
      compiledCode: compileResult.moduleUrl ? undefined : compileResult.compiledCode,
      compiledCodeUrl: compileResult.moduleUrl,
      cssImports: compileResult.cssImports,
      configData: snapshotInput.configData,
      cdnBaseUrl: config.cdnBaseUrl,
      runtimeBaseUrl: config.authorSiteUrl,
      useCdnRuntime: config.previewRuntimeSource === "cdn",
      supportUrlMode: true,
      baseOrigin: config.authorSiteUrl,
    });
  } else if (snapshotInput.runtimeType === "prototype-html-css") {
    html = buildPrototypePreviewDocumentHtml({
      html: snapshotInput.prototypeHtml,
      css: snapshotInput.prototypeCss,
      configData: snapshotInput.configData,
      previewSize: snapshotInput.previewSize ?? { width, height },
    });
  } else {
    html = buildSketchScenePreviewDocumentHtml({
      scene: snapshotInput.sketchScene,
      configData: snapshotInput.configData,
      previewSize: {
        width,
        height,
      },
    });
  }

  // Render screenshot
  const pool = getBrowserPool();
  const renderResult = await pool.renderPage(
    html,
    width,
    height,
    fullPage,
    priority,
    renderMode,
    measuredHeight,
  );

  // Save to disk
  const writeStart = Date.now();
  await writeScreenshot(
    projectId,
    pageId,
    hash,
    renderResult.buffer,
    Date.now() - startTime,
    renderResult.renderBox,
    renderMode,
  );
  const writeMs = Date.now() - writeStart;

  // Cleanup old files in background
  cleanupOldScreenshots(projectId, pageId).catch(() => {});

  const elapsed = Date.now() - startTime;
  const assetUrl = buildScreenshotUrl(projectId, pageId, hash, renderMode);
  const renderStages = renderResult.renderTimings || createEmptyRenderStageTimings();
  getScreenshotMetrics().recordSuccess({
    elapsedMs: elapsed,
    compileMs,
    renderMs: renderResult.renderMs,
    writeMs,
    queueWaitMs: renderResult.queueWaitMs,
    width,
    height,
    fullPage,
    cached: false,
    priority,
    variant: renderMode,
    renderMode,
    renderStages,
  });
  return {
    url: `/api/screenshots/file/${projectId}/${pageId}`,
    assetUrl,
    hash,
    elapsed,
    cached: false,
    requestId,
    queueWaitMs: renderResult.queueWaitMs,
    renderBox: renderResult.renderBox,
    timings: {
      compileMs,
      renderMs: renderResult.renderMs,
      writeMs,
      totalMs: elapsed,
      renderStages,
    },
    cache: {
      screenshotHit: false,
      compileHit,
      inFlightHit: false,
    },
    variant: renderMode,
    quality: renderMode,
  };
}

// --- Route handlers ---

async function handleGenerate(
  request: FastifyRequest<{ Body: GenerateRequest }>,
  reply: FastifyReply,
) {
  const requestId = getRequestId(request);
  const {
    projectId,
    pageId,
    width,
    height,
    fullPage,
    sessionId,
    priority,
    renderMode,
    measuredHeight,
    force,
  } = request.body;

  if (!projectId || !pageId) {
    return reply.status(400).send({
      success: false,
      error: { code: "INVALID_REQUEST", message: "缺少必要参数" },
    });
  }

  const w = width || config.viewport.width;
  const h = height || config.viewport.height;
  const snapshotInput = normalizeSnapshotInput(request.body, w, h);
  if (!snapshotInput) {
    return reply.status(400).send({
      success: false,
      error: { code: "INVALID_REQUEST", message: "截图输入无效" },
    });
  }

  try {
    const result = await generateScreenshot(
      projectId,
      pageId,
      snapshotInput,
      w,
      h,
      fullPage ?? false,
      requestId,
      normalizePriority(priority || "active"),
      normalizeRenderMode(renderMode),
      Boolean(force),
      measuredHeight,
      sessionId,
    );

    request.log.info(
      {
        requestId,
        projectId,
        pageId,
        priority: normalizePriority(priority || "active"),
        variant: result.variant,
        cached: result.cached,
        queueWaitMs: result.queueWaitMs,
        cache: result.cache,
        ...result.timings,
      },
      "screenshot generated",
    );

    return reply.send({
      success: true,
      data: result,
    });
  } catch (err) {
    const message = getErrorMessage(err);
    const code = getScreenshotErrorCode(err);
    getScreenshotMetrics().recordError(code);

    request.log.warn({ requestId, projectId, pageId, code, message }, "screenshot failed");

    if (
      code === "COMPILE_ERROR" ||
      code === "RUNTIME_ERROR" ||
      code === "EMPTY_RENDER"
    ) {
      return reply.status(422).send({
        success: false,
        error: { code, message },
      });
    }

    return reply.status(500).send({
      success: false,
      error: { code, message },
    });
  }
}

async function handleGenerateBatch(
  request: FastifyRequest<{ Body: GenerateBatchRequest }>,
  reply: FastifyReply,
) {
  cleanupExpiredBatches();
  const { projectId, pages, sessionId } = request.body;

  if (!projectId || !pages?.length) {
    return reply.status(400).send({
      success: false,
      error: { code: "INVALID_REQUEST", message: "缺少必要参数" },
    });
  }
  const invalidPage = pages.find((page) => {
    const width = page.width || config.viewport.width;
    const height = page.height || config.viewport.height;
    return !normalizeSnapshotInput(page, width, height);
  });
  if (invalidPage) {
    return reply.status(400).send({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: `页面 ${invalidPage.pageId || "(unknown)"} 截图输入无效`,
      },
    });
  }

  const batchId = generateBatchId();
  const now = Date.now();

  const sortedPages = sortBatchPages(pages);
  const priorityStats = createPriorityStats();

  for (const page of sortedPages) {
    const stats = priorityStats[normalizePriority(page.priority)];
    stats.total++;
    stats.status = "pending";
  }

  const results: BatchResult[] = sortedPages.map((page) => ({
    pageId: page.pageId,
    priority: normalizePriority(page.priority),
    variant: getPageVariant(page),
    quality: getPageVariant(page),
    hash: computePageHash(page, sessionId),
    status: "pending" as const,
  }));

  const batch: BatchState = {
    batchId,
    projectId,
    total: pages.length,
    results,
    completed: 0,
    failed: 0,
    cached: 0,
    status: "running",
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + config.screenshotBatchTtlMs).toISOString(),
    cancelled: false,
    errorsByCode: {},
    priorityStats,
    metrics: createBatchMetrics(),
  };

  const initialResults = results.map((result) => ({ ...result }));
  batchStore.set(batchId, batch);

  // Process in background
  processBatch(batch, sortedPages, getRequestId(request), sessionId, request.log).catch(
    () => {},
  );

  return reply.send({
    success: true,
    data: {
      batchId,
      total: batch.total,
      cached: 0,
      priorityStats: batch.priorityStats,
      prioritySlices: batch.priorityStats,
      metrics: batch.metrics,
      retryAfterMs: getBatchRetryAfterMs(batch),
      results: initialResults,
    },
  });
}

async function processBatch(
  batch: BatchState,
  pages: BatchPage[],
  requestId: string,
  sessionId?: string,
  logger?: FastifyRequest["log"],
): Promise<void> {
  const queue = [...pages];
  const concurrency = config.maxConcurrentPages;

  const worker = async () => {
    while (queue.length > 0) {
      if (batch.cancelled) break;
      const page = queue.shift();
      if (!page) break;
      const priority = normalizePriority(page.priority);

      const resultIndex = batch.results.findIndex(
        (r) => r.pageId === page.pageId,
      );
      if (resultIndex === -1) continue;

      batch.results[resultIndex].status = "rendering";
      batch.results[resultIndex].priority = priority;
      touchBatch(batch);

      try {
        const w = page.width || config.viewport.width;
        const h = page.height || config.viewport.height;
        const snapshotInput = normalizeSnapshotInput(page, w, h);
        if (!snapshotInput) {
          throw new ScreenshotError("COMPILE_ERROR", "截图输入无效");
        }

        const result = await generateScreenshot(
          batch.projectId,
          page.pageId,
          snapshotInput,
          w,
          h,
          page.fullPage ?? false,
          requestId,
          priority,
          normalizeRenderMode(page.renderMode),
          Boolean(page.force),
          page.measuredHeight,
          sessionId,
        );

        if (batch.cancelled) break;

        batch.results[resultIndex] = {
          pageId: page.pageId,
          priority,
          variant: result.variant,
          quality: result.quality,
          url: result.url,
          assetUrl: result.assetUrl,
          hash: result.hash,
          elapsed: result.elapsed,
          cached: result.cached,
          queueWaitMs: result.queueWaitMs,
          timings: result.timings,
          renderBox: result.renderBox,
          status: "done",
        };

        batch.completed++;
        if (result.cached) batch.cached++;
        recordBatchSuccess(batch, priority, result);
        touchBatch(batch);
      } catch (err) {
        const message = getErrorMessage(err);
        const errorCode = getScreenshotErrorCode(err);
        getScreenshotMetrics().recordError(errorCode);
        batch.results[resultIndex] = {
          pageId: page.pageId,
          priority,
          variant: getPageVariant(page),
          quality: getPageVariant(page),
          hash: computePageHash(page, sessionId),
          status: "failed",
          errorCode,
          error: message,
        };
        incrementBatchError(batch, errorCode);
        recordBatchFailure(batch, priority);
        batch.failed++;
        batch.completed++;
        touchBatch(batch);
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () =>
    worker(),
  );

  await Promise.all(workers);

  batch.status = batch.cancelled ? "cancelled" : "completed";
  touchBatch(batch);

  logger?.info(
    {
      requestId,
      batchId: batch.batchId,
      projectId: batch.projectId,
      total: batch.total,
      completed: batch.completed,
      failed: batch.failed,
      cached: batch.cached,
      status: batch.status,
      priorityStats: batch.priorityStats,
      prioritySlices: batch.priorityStats,
      metrics: batch.metrics,
    },
    "screenshot batch completed",
  );

  // Clean up batch state after 5 minutes
  setTimeout(() => {
    batchStore.delete(batch.batchId);
  }, config.screenshotBatchTtlMs);
}

async function handleFile(
  request: FastifyRequest<{
    Params: { projectId: string; pageId: string };
    Querystring: { hash?: string; t?: string; meta?: string; variant?: string };
  }>,
  reply: FastifyReply,
) {
  const { projectId, pageId } = request.params;
  const { hash, meta: metaQuery } = request.query;
  const variant = normalizeVariant(request.query.variant);
  const normalizedHash = normalizeHash(hash);

  if (metaQuery === "1") {
    const meta = await readScreenshotMeta(projectId, pageId);
    if (!meta?.currentHash) {
      return reply.status(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "截图元数据不存在" },
      });
    }
    const healthy = await isReadableHealthyScreenshot(
      projectId,
      pageId,
      meta.currentHash,
      "strict",
    );
    if (!healthy) {
      return reply.status(404).send({
        success: false,
        error: { code: "NOT_FOUND", message: "截图文件不可用" },
      });
    }

    return reply.header("Cache-Control", "no-store").send({
      success: true,
      data: {
        currentHash: meta.currentHash,
        url: `/api/screenshots/file/${projectId}/${pageId}?hash=${meta.currentHash}`,
        renderBox: meta.renderBoxes?.[meta.currentHash],
      },
    });
  }

  if (hash && !normalizedHash) {
    return reply.status(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "截图文件不存在" },
    });
  }

  const buffer = await readScreenshot(projectId, pageId, normalizedHash, variant);

  if (!buffer) {
    return reply.status(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "截图文件不存在" },
    });
  }
  const renderBox = normalizedHash
    ? await readScreenshotRenderBox(projectId, pageId, normalizedHash, variant)
    : undefined;
  if (isLikelyBlankScreenshot(buffer.length, renderBox)) {
    return reply.status(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "截图文件不可用" },
    });
  }

  return reply
    .header("Content-Type", "image/png")
    .header(
      "Cache-Control",
      normalizedHash ? "public, max-age=31536000, immutable" : "no-store",
    )
    .send(buffer);
}

async function handleStatus(
  request: FastifyRequest<{
    Params: { projectId: string; batchId: string };
  }>,
  reply: FastifyReply,
) {
  cleanupExpiredBatches();
  const { batchId } = request.params;
  const batch = batchStore.get(batchId);

  if (!batch) {
    return reply.status(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "批量任务不存在" },
    });
  }

  return reply.send({
    success: true,
    data: {
      batchId: batch.batchId,
      total: batch.total,
      completed: batch.completed,
      failed: batch.failed,
      cached: batch.cached,
      status: batch.status,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      expiresAt: batch.expiresAt,
      errorsByCode: batch.errorsByCode,
      priorityStats: batch.priorityStats,
      prioritySlices: batch.priorityStats,
      metrics: batch.metrics,
      cancelled: batch.cancelled,
      results: batch.results,
      retryAfterMs: getBatchRetryAfterMs(batch),
    },
  });
}

async function handleCancel(
  request: FastifyRequest<{
    Params: { projectId: string; batchId: string };
  }>,
  reply: FastifyReply,
) {
  cleanupExpiredBatches();
  const { batchId } = request.params;
  const batch = batchStore.get(batchId);

  if (!batch) {
    return reply.status(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "批量任务不存在" },
    });
  }

  batch.cancelled = true;
  batch.status = "cancelled";
  touchBatch(batch);

  return reply.send({
    success: true,
    data: {
      batchId: batch.batchId,
      cancelled: true,
    },
  });
}

// --- Route registration ---

export async function screenshotRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post("/generate", handleGenerate);
  fastify.post("/generate-batch", handleGenerateBatch);
  fastify.post("/cancel/:projectId/:batchId", handleCancel);
  fastify.get("/file/:projectId/:pageId", handleFile);
  fastify.get("/status/:projectId/:batchId", handleStatus);
}
