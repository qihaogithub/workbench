import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { getSnapshotRenderer } from "../utils/snapshot-renderer";

interface GenerateSnapshotBody {
  projectId: string;
  pageId: string;
  code: string;
  schema?: string;
  configData?: Record<string, unknown>;
  width?: number;
  height?: number;
}

interface GenerateBatchBody {
  projectId: string;
  pages: Array<{
    pageId: string;
    code: string;
    schema?: string;
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

  /**
   * POST /api/snapshots/generate
   * 生成单页截图，返回截图 URL
   */
  fastify.post("/api/snapshots/generate", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as GenerateSnapshotBody;
    const { projectId, pageId, code, configData, width = 375, height = 812 } = body;

    if (!projectId || !pageId || !code) {
      return reply.status(400).send({
        success: false,
        error: { code: "INVALID_REQUEST", message: "缺少必填参数" },
      });
    }

    try {
      const renderer = getSnapshotRenderer();
      const pngBuffer = await renderer.render({
        code,
        configData,
        width,
        height,
      });

      const pageDir = join(snapshotDir, projectId);
      if (!existsSync(pageDir)) {
        mkdirSync(pageDir, { recursive: true });
      }
      writeFileSync(join(pageDir, `${pageId}.png`), pngBuffer);

      return reply.send({
        success: true,
        data: {
          url: `/api/snapshots/file/${projectId}/${pageId}`,
        },
      });
    } catch (error) {
      fastify.log.error({ error }, "截图生成失败");
      return reply.status(500).send({
        success: false,
        error: { code: "SNAPSHOT_ERROR", message: "截图生成失败" },
      });
    }
  });

  /**
   * POST /api/snapshots/generate-batch
   * 批量生成截图（并发 5 个）
   */
  fastify.post("/api/snapshots/generate-batch", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as GenerateBatchBody;
    const { projectId, pages } = body;

    if (!projectId || !pages?.length) {
      return reply.status(400).send({
        success: false,
        error: { code: "INVALID_REQUEST", message: "缺少必填参数" },
      });
    }

    const concurrency = parseInt(process.env.SNAPSHOT_CONCURRENCY || "5", 10);
    const results: Record<string, string> = {};
    const errors: string[] = [];

    const renderer = getSnapshotRenderer();

    for (let i = 0; i < pages.length; i += concurrency) {
      const batch = pages.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (page) => {
          try {
            const pngBuffer = await renderer.render({
              code: page.code,
              configData: page.configData,
              width: page.width || 375,
              height: page.height || 812,
            });

            const pageDir = join(snapshotDir, projectId);
            if (!existsSync(pageDir)) {
              mkdirSync(pageDir, { recursive: true });
            }
            writeFileSync(join(pageDir, `${page.pageId}.png`), pngBuffer);

            results[page.pageId] = `/api/snapshots/file/${projectId}/${page.pageId}`;
          } catch (error) {
            fastify.log.error({ error, pageId: page.pageId }, "截图生成失败");
            errors.push(page.pageId);
          }
        }),
      );
    }

    return reply.send({
      success: true,
      data: { urls: results, errors: errors.length > 0 ? errors : undefined },
    });
  });

  /**
   * GET /api/snapshots/list/:projectId
   * 列出项目下已有截图（返回 pageId → URL 映射）
   */
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

  /**
   * GET /api/snapshots/file/:projectId/:pageId
   * 提供截图文件
   */
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
}
