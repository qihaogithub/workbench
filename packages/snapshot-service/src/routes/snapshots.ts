import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { renderPage } from "../snapshot-renderer";

interface GenerateSnapshotBody {
  projectId: string;
  pageId: string;
  code: string;
  configData?: Record<string, unknown>;
  width?: number;
  height?: number;
}

interface GenerateBatchBody {
  projectId: string;
  pages: Array<{
    pageId: string;
    code: string;
    configData?: Record<string, unknown>;
    width?: number;
    height?: number;
  }>;
}

export async function registerSnapshotRoutes(fastify: FastifyInstance) {
  const dataDir = process.env.DATA_DIR || join(process.cwd(), "data");
  const snapshotDir = join(dataDir, "snapshots");

  if (!existsSync(snapshotDir)) {
    mkdirSync(snapshotDir, { recursive: true });
  }

  // 单页截图生成
  fastify.post("/api/snapshots/generate", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as GenerateSnapshotBody;
    const { projectId, pageId, code, configData, width = 375, height = 812 } = body;

    if (!projectId || !pageId || !code) {
      return reply.status(400).send({
        success: false,
        error: { code: "INVALID_REQUEST", message: "缺少必填参数 projectId/pageId/code" },
      });
    }

    const startTime = Date.now();

    try {
      const pngBuffer = await renderPage({ code, width, height, configData });

      const pageDir = join(snapshotDir, projectId);
      if (!existsSync(pageDir)) {
        mkdirSync(pageDir, { recursive: true });
      }
      writeFileSync(join(pageDir, `${pageId}.png`), pngBuffer);

      const elapsed = Date.now() - startTime;
      fastify.log.info(`截图生成完成: ${projectId}/${pageId} (${elapsed}ms)`);

      return reply.send({
        success: true,
        data: {
          url: `/api/snapshots/file/${projectId}/${pageId}`,
          elapsed,
        },
      });
    } catch (error) {
      const elapsed = Date.now() - startTime;
      fastify.log.error(`截图生成失败: ${projectId}/${pageId} (${elapsed}ms):`, error);
      return reply.status(500).send({
        success: false,
        error: { code: "SNAPSHOT_ERROR", message: "截图生成失败" },
      });
    }
  });

  // 批量截图生成（并发控制）
  fastify.post("/api/snapshots/generate-batch", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as GenerateBatchBody;
    const { projectId, pages } = body;

    if (!projectId || !pages?.length) {
      return reply.status(400).send({
        success: false,
        error: { code: "INVALID_REQUEST", message: "缺少必填参数 projectId/pages" },
      });
    }

    const concurrency = parseInt(process.env.SNAPSHOT_CONCURRENCY || "5", 10);
    const results: Record<string, { url: string; elapsed: number }> = {};
    const errors: string[] = [];
    const startTime = Date.now();

    for (let i = 0; i < pages.length; i += concurrency) {
      const batch = pages.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (page) => {
          const pageStart = Date.now();
          try {
            const pngBuffer = await renderPage({
              code: page.code,
              width: page.width || 375,
              height: page.height || 812,
              configData: page.configData,
            });

            const pageDir = join(snapshotDir, projectId);
            if (!existsSync(pageDir)) {
              mkdirSync(pageDir, { recursive: true });
            }
            writeFileSync(join(pageDir, `${page.pageId}.png`), pngBuffer);

            results[page.pageId] = {
              url: `/api/snapshots/file/${projectId}/${page.pageId}`,
              elapsed: Date.now() - pageStart,
            };
          } catch (error) {
            fastify.log.error(`截图生成失败 [${page.pageId}]:`, error);
            errors.push(page.pageId);
          }
        }),
      );
    }

    const totalElapsed = Date.now() - startTime;
    fastify.log.info(`批量截图完成: ${pages.length}页, 成功${Object.keys(results).length}, 失败${errors.length} (${totalElapsed}ms)`);

    return reply.send({
      success: true,
      data: {
        urls: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.url])),
        timings: results,
        totalElapsed,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  });

  // 获取截图文件
  fastify.get("/api/snapshots/file/:projectId/:pageId", async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId, pageId } = req.params as { projectId: string; pageId: string };
    const filePath = join(snapshotDir, projectId, `${pageId}.png`);

    if (!existsSync(filePath)) {
      return reply.status(404).send({
        success: false,
        error: { code: "SNAPSHOT_NOT_FOUND", message: "截图不存在" },
      });
    }

    const buffer = readFileSync(filePath);
    return reply
      .header("Content-Type", "image/png")
      .header("Cache-Control", "public, max-age=3600")
      .send(buffer);
  });

  // 列出项目下已有截图
  fastify.get("/api/snapshots/list/:projectId", async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };
    const dir = join(snapshotDir, projectId);

    if (!existsSync(dir)) {
      return reply.send({ success: true, data: { urls: {} } });
    }

    const files = readdirSync(dir).filter((f) => f.endsWith(".png"));
    const urls: Record<string, string> = {};
    for (const file of files) {
      const pageId = file.replace(".png", "");
      urls[pageId] = `/api/snapshots/file/${projectId}/${pageId}`;
    }

    return reply.send({ success: true, data: { urls } });
  });
}
