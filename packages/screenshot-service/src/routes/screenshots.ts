import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import { config } from "../config";
import { getBrowserPool } from "../utils/browser-pool";
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
  readScreenshotRenderBox,
  writeScreenshot,
  cleanupOldScreenshots,
} from "../utils/screenshot-store";
import { generateIframeHtml } from "@opencode-workbench/shared/demo/iframe-template";
import type { ScreenshotRenderBox } from "../utils/browser-pool";

// --- Request schemas ---

interface GenerateRequest {
  projectId: string;
  pageId: string;
  code: string;
  configData: Record<string, unknown>;
  width?: number;
  height?: number;
  fullPage?: boolean;
  sessionId?: string;
}

interface BatchPage {
  pageId: string;
  code: string;
  configData: Record<string, unknown>;
  width?: number;
  height?: number;
  fullPage?: boolean;
}

interface GenerateBatchRequest {
  projectId: string;
  pages: BatchPage[];
  sessionId?: string;
}

// --- Batch state ---

interface BatchResult {
  pageId: string;
  url?: string;
  hash?: string;
  elapsed?: number;
  cached?: boolean;
  renderBox?: ScreenshotRenderBox;
  status: "pending" | "rendering" | "done" | "failed";
  errorCode?: ScreenshotErrorCode;
  error?: string;
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
}

const batchStore = new Map<string, BatchState>();
const inFlightScreenshots = new Map<string, Promise<GenerateScreenshotResult>>();

interface ScreenshotTimings {
  compileMs: number;
  renderMs: number;
  writeMs: number;
  totalMs: number;
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
}

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

function normalizeHash(hash?: string): string | undefined {
  if (!hash) return undefined;
  return /^[a-f0-9]{16}$/i.test(hash) ? hash.toLowerCase() : undefined;
}

function computeBatchPageHash(page: BatchPage): string {
  return computeScreenshotHash(
    page.code,
    page.configData || {},
    page.width || config.viewport.width,
    page.height || config.viewport.height,
    page.fullPage ?? false,
  );
}

// --- Screenshot generation ---

async function generateScreenshot(
  projectId: string,
  pageId: string,
  code: string,
  configData: Record<string, unknown>,
  width: number,
  height: number,
  fullPage: boolean,
  requestId: string,
  sessionId?: string,
): Promise<GenerateScreenshotResult> {
  const startTime = Date.now();

  const hash = computeScreenshotHash(code, configData, width, height, fullPage);

  // Check cache
  if (await screenshotExists(projectId, pageId, hash)) {
    const renderBox = await readScreenshotRenderBox(projectId, pageId, hash);
    if (renderBox) {
      return {
        url: `/api/screenshots/file/${projectId}/${pageId}`,
        hash,
        elapsed: Date.now() - startTime,
        cached: true,
        requestId,
        queueWaitMs: 0,
        renderBox,
        timings: {
          compileMs: 0,
          renderMs: 0,
          writeMs: 0,
          totalMs: Date.now() - startTime,
        },
      };
    }
  }

  const inFlightKey = `${projectId}:${pageId}:${hash}`;
  const inFlight = inFlightScreenshots.get(inFlightKey);
  if (inFlight) {
    const result = await inFlight;
    return { ...result, requestId };
  }

  const generatePromise = generateScreenshotUncached(
    projectId,
    pageId,
    code,
    configData,
    width,
    height,
    fullPage,
    requestId,
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
  code: string,
  configData: Record<string, unknown>,
  width: number,
  height: number,
  fullPage: boolean,
  requestId: string,
  hash: string,
  startTime: number,
  sessionId?: string,
): Promise<GenerateScreenshotResult> {
  const compileCache = getCompileCache();
  const cacheScope = sessionId || "global";
  const compileStart = Date.now();
  let compileResult = compileCache.get(code, cacheScope);

  if (!compileResult) {
    try {
      compileResult = await compileCode(code, sessionId);
      compileCache.set(code, compileResult, cacheScope);
    } catch (error) {
      throw new ScreenshotError(
        "COMPILE_ERROR",
        `代码编译失败: ${getErrorMessage(error)}`,
        error,
      );
    }
  }
  const compileMs = Date.now() - compileStart;

  // Generate HTML
  const html = generateIframeHtml({
    compiledCode: compileResult.compiledCode,
    cssImports: compileResult.cssImports,
    configData,
    supportUrlMode: false,
    baseOrigin: config.authorSiteUrl,
  });

  // Render screenshot
  const pool = getBrowserPool();
  const renderResult = await pool.renderPage(html, width, height, fullPage);

  // Save to disk
  const writeStart = Date.now();
  await writeScreenshot(
    projectId,
    pageId,
    hash,
    renderResult.buffer,
    Date.now() - startTime,
    renderResult.renderBox,
  );
  const writeMs = Date.now() - writeStart;

  // Cleanup old files in background
  cleanupOldScreenshots(projectId, pageId).catch(() => {});

  const elapsed = Date.now() - startTime;
  return {
    url: `/api/screenshots/file/${projectId}/${pageId}`,
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
    },
  };
}

// --- Route handlers ---

async function handleGenerate(
  request: FastifyRequest<{ Body: GenerateRequest }>,
  reply: FastifyReply,
) {
  const requestId = getRequestId(request);
  const { projectId, pageId, code, configData, width, height, fullPage, sessionId } =
    request.body;

  if (!projectId || !pageId || !code) {
    return reply.status(400).send({
      success: false,
      error: { code: "INVALID_REQUEST", message: "缺少必要参数" },
    });
  }

  const w = width || config.viewport.width;
  const h = height || config.viewport.height;

  try {
    const result = await generateScreenshot(
      projectId,
      pageId,
      code,
      configData || {},
      w,
      h,
      fullPage ?? false,
      requestId,
      sessionId,
    );

    request.log.info(
      { requestId, projectId, pageId, cached: result.cached, ...result.timings },
      "screenshot generated",
    );

    return reply.send({
      success: true,
      data: result,
    });
  } catch (err) {
    const message = getErrorMessage(err);
    const code = getScreenshotErrorCode(err);

    request.log.warn({ requestId, projectId, pageId, code, message }, "screenshot failed");

    if (code === "COMPILE_ERROR" || code === "RUNTIME_ERROR") {
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

  const batchId = generateBatchId();
  const now = Date.now();

  const results: BatchResult[] = pages.map((page) => ({
    pageId: page.pageId,
    hash: computeBatchPageHash(page),
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
  };

  const initialResults = results.map((result) => ({ ...result }));
  batchStore.set(batchId, batch);

  // Process in background
  processBatch(batch, pages, getRequestId(request), sessionId).catch(() => {});

  return reply.send({
    success: true,
    data: {
      batchId,
      total: batch.total,
      cached: 0,
      results: initialResults,
    },
  });
}

async function processBatch(
  batch: BatchState,
  pages: BatchPage[],
  requestId: string,
  sessionId?: string,
): Promise<void> {
  const queue = [...pages];
  const concurrency = config.maxConcurrentPages;

  const worker = async () => {
    while (queue.length > 0) {
      if (batch.cancelled) break;
      const page = queue.shift();
      if (!page) break;

      const resultIndex = batch.results.findIndex(
        (r) => r.pageId === page.pageId,
      );
      if (resultIndex === -1) continue;

      batch.results[resultIndex].status = "rendering";
      touchBatch(batch);

      try {
        const w = page.width || config.viewport.width;
        const h = page.height || config.viewport.height;

        const result = await generateScreenshot(
          batch.projectId,
          page.pageId,
          page.code,
          page.configData || {},
          w,
          h,
          page.fullPage ?? false,
          requestId,
          sessionId,
        );

        if (batch.cancelled) break;

        batch.results[resultIndex] = {
          pageId: page.pageId,
          url: result.url,
          hash: result.hash,
          elapsed: result.elapsed,
          cached: result.cached,
          renderBox: result.renderBox,
          status: "done",
        };

        batch.completed++;
        if (result.cached) batch.cached++;
        touchBatch(batch);
      } catch (err) {
        const message = getErrorMessage(err);
        const errorCode = getScreenshotErrorCode(err);
        batch.results[resultIndex] = {
          pageId: page.pageId,
          hash: computeBatchPageHash(page),
          status: "failed",
          errorCode,
          error: message,
        };
        incrementBatchError(batch, errorCode);
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

  // Clean up batch state after 5 minutes
  setTimeout(() => {
    batchStore.delete(batch.batchId);
  }, config.screenshotBatchTtlMs);
}

async function handleFile(
  request: FastifyRequest<{
    Params: { projectId: string; pageId: string };
    Querystring: { hash?: string; t?: string };
  }>,
  reply: FastifyReply,
) {
  const { projectId, pageId } = request.params;
  const { hash } = request.query;
  const normalizedHash = normalizeHash(hash);

  if (hash && !normalizedHash) {
    return reply.status(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "截图文件不存在" },
    });
  }

  const buffer = await readScreenshot(projectId, pageId, normalizedHash);

  if (!buffer) {
    return reply.status(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "截图文件不存在" },
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
      cancelled: batch.cancelled,
      results: batch.results,
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
