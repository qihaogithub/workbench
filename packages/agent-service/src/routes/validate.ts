import * as fs from "fs";
import * as path from "path";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getSessionStore } from "../session/session-store";
import {
  validateAll,
  formatValidateDemoResult,
} from "@opencode-workbench/shared/contracts";
import { logger } from "../utils/logger";

interface ValidateDemoParams {
  sessionId: string;
}

interface ValidateDemoBody {
  demoId?: string;
}

/**
 * 注册 validate_demo 工具路由
 */
export async function registerValidateRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const sessionStore = getSessionStore();

  /**
   * POST /api/agent/:sessionId/validate
   *
   * 读取 workspace 中的代码和 Schema 文件，执行校验并返回结构化结果。
   * AI 完成文件修改后调用此端点进行最终校验。
   */
  fastify.post<{ Params: ValidateDemoParams; Body: ValidateDemoBody }>(
    "/api/agent/:sessionId/validate",
    async (
      request: FastifyRequest<{
        Params: ValidateDemoParams;
        Body: ValidateDemoBody;
      }>,
      reply: FastifyReply,
    ) => {
      const { sessionId } = request.params;
      const { demoId } = request.body || {};

      const session = sessionStore.get(sessionId);
      if (!session) {
        return reply.code(404).send({
          success: false,
          error: {
            code: "SESSION_NOT_FOUND",
            message: `Session ${sessionId} 不存在`,
          },
        });
      }

      const workingDir = session.workingDir;
      if (!workingDir) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_PARAMS",
            message: "Session 没有绑定工作空间",
          },
        });
      }

      // 确定要校验的 demoId：优先使用请求中的，否则使用 session 关联的
      const targetDemoId = demoId || session.demoId;
      if (!targetDemoId) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_PARAMS",
            message: "未指定 demoId，且 Session 未关联 demo",
          },
        });
      }

      try {
        // 读取代码文件
        const codePath = path.join(
          workingDir,
          "demos",
          targetDemoId,
          "index.tsx",
        );
        const schemaPath = path.join(
          workingDir,
          "demos",
          targetDemoId,
          "config.schema.json",
        );

        let code = "";
        let schema = "";

        try {
          code = await fs.promises.readFile(codePath, "utf-8");
        } catch {
          return reply.code(404).send({
            success: false,
            error: {
              code: "FILE_READ_ERROR",
              message: `代码文件不存在: demos/${targetDemoId}/index.tsx`,
            },
          });
        }

        try {
          schema = await fs.promises.readFile(schemaPath, "utf-8");
        } catch {
          return reply.code(404).send({
            success: false,
            error: {
              code: "FILE_READ_ERROR",
              message: `Schema 文件不存在: demos/${targetDemoId}/config.schema.json`,
            },
          });
        }

        // 执行校验
        const result = validateAll(code, schema);
        const formatted = formatValidateDemoResult(result, targetDemoId);

        logger.info(
          { sessionId, demoId: targetDemoId, passed: formatted.passed },
          "validate_demo 完成",
        );

        return reply.send({
          success: true,
          data: formatted,
        });
      } catch (error) {
        logger.error(
          { error, sessionId, demoId: targetDemoId },
          "validate_demo 失败",
        );
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "校验失败",
          },
        });
      }
    },
  );

  /**
   * POST /api/validate
   *
   * 直接传入 code 和 schema 进行校验（用于前端手动触发等场景）
   */
  fastify.post<{
    Body: { code: string; schema: string; demoId?: string };
  }>(
    "/api/validate",
    async (
      request: FastifyRequest<{
        Body: { code: string; schema: string; demoId?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { code, schema, demoId } = request.body;

      if (code === undefined || schema === undefined) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "缺少 code 或 schema 参数",
          },
        });
      }

      try {
        const result = validateAll(code, schema);
        const formatted = formatValidateDemoResult(result, demoId || "unknown");

        return reply.send({
          success: true,
          data: formatted,
        });
      } catch (error) {
        logger.error({ error }, "validate 失败");
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "校验失败",
          },
        });
      }
    },
  );

  logger.info("校验路由已注册");
}
