import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config";
import { getBrowserPool } from "../utils/browser-pool";
import { compileCode } from "../utils/compile-client";
import { getCompileCache } from "../utils/compile-cache";
import {
  computeScreenshotHash,
  screenshotExists,
  readScreenshot,
  writeScreenshot,
  cleanupOldScreenshots,
} from "../utils/screenshot-store";
import { generateIframeHtml } from "@opencode-workbench/shared/demo/iframe-template";

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
  status: "pending" | "rendering" | "done" | "failed";
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
  status: "running" | "completed";
}

const batchStore = new Map<string, BatchState>();

function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
  sessionId?: string,
): Promise<{ url: string; hash: string; elapsed: number; cached: boolean }> {
  const startTime = Date.now();

  const hash = computeScreenshotHash(code, configData, width, height, fullPage);

  // Check cache
  if (await screenshotExists(projectId, pageId, hash)) {
    return {
      url: `/api/screenshots/file/${projectId}/${pageId}`,
      hash,
      elapsed: Date.now() - startTime,
      cached: true,
    };
  }

  // Compile code (with cache)
  const compileCache = getCompileCache();
  let compileResult = compileCache.get(code);

  if (!compileResult) {
    compileResult = await compileCode(code, sessionId);
    compileCache.set(code, compileResult);
  }

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
  const buffer = await pool.renderPage(html, width, height, fullPage);

  // Save to disk
  const elapsed = Date.now() - startTime;
  await writeScreenshot(projectId, pageId, hash, buffer, elapsed);

  // Cleanup old files in background
  cleanupOldScreenshots(projectId, pageId).catch(() => {});

  return {
    url: `/api/screenshots/file/${projectId}/${pageId}`,
    hash,
    elapsed,
    cached: false,
  };
}

// --- Route handlers ---

async function handleGenerate(
  request: FastifyRequest<{ Body: GenerateRequest }>,
  reply: FastifyReply,
) {
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
      sessionId,
    );

    return reply.send({
      success: true,
      data: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("Compile") || message.includes("编译")) {
      return reply.status(422).send({
        success: false,
        error: { code: "COMPILE_ERROR", message: `代码编译失败: ${message}` },
      });
    }

    return reply.status(500).send({
      success: false,
      error: { code: "SCREENSHOT_ERROR", message },
    });
  }
}

async function handleGenerateBatch(
  request: FastifyRequest<{ Body: GenerateBatchRequest }>,
  reply: FastifyReply,
) {
  const { projectId, pages, sessionId } = request.body;

  if (!projectId || !pages?.length) {
    return reply.status(400).send({
      success: false,
      error: { code: "INVALID_REQUEST", message: "缺少必要参数" },
    });
  }

  const batchId = generateBatchId();

  const results: BatchResult[] = pages.map((p) => ({
    pageId: p.pageId,
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
  };

  batchStore.set(batchId, batch);

  // Process in background
  processBatch(batch, pages, sessionId).catch(() => {});

  return reply.send({
    success: true,
    data: {
      batchId,
      total: batch.total,
      cached: 0,
    },
  });
}

async function processBatch(
  batch: BatchState,
  pages: BatchPage[],
  sessionId?: string,
): Promise<void> {
  const queue = [...pages];
  const concurrency = config.maxConcurrentPages;

  const worker = async () => {
    while (queue.length > 0) {
      const page = queue.shift();
      if (!page) break;

      const resultIndex = batch.results.findIndex(
        (r) => r.pageId === page.pageId,
      );
      if (resultIndex === -1) continue;

      batch.results[resultIndex].status = "rendering";

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
          sessionId,
        );

        batch.results[resultIndex] = {
          pageId: page.pageId,
          url: result.url,
          hash: result.hash,
          elapsed: result.elapsed,
          cached: result.cached,
          status: "done",
        };

        batch.completed++;
        if (result.cached) batch.cached++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        batch.results[resultIndex] = {
          pageId: page.pageId,
          status: "failed",
          error: message,
        };
        batch.failed++;
        batch.completed++;
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () =>
    worker(),
  );

  await Promise.all(workers);

  batch.status = "completed";

  // Clean up batch state after 5 minutes
  setTimeout(() => {
    batchStore.delete(batch.batchId);
  }, 5 * 60 * 1000);
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

  const buffer = await readScreenshot(projectId, pageId, hash);

  if (!buffer) {
    return reply.status(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: "截图文件不存在" },
    });
  }

  return reply
    .header("Content-Type", "image/png")
    .header("Cache-Control", "public, max-age=3600")
    .send(buffer);
}

async function handleStatus(
  request: FastifyRequest<{
    Params: { projectId: string; batchId: string };
  }>,
  reply: FastifyReply,
) {
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
      results: batch.results,
    },
  });
}

// --- Route registration ---

export async function screenshotRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post("/generate", handleGenerate);
  fastify.post("/generate-batch", handleGenerateBatch);
  fastify.get("/file/:projectId/:pageId", handleFile);
  fastify.get("/status/:projectId/:batchId", handleStatus);
}
