import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getAgentManager } from "../core/agent-manager";
import { logger } from "../utils/logger";
import { ModelCatalogService } from "../services/model-catalog-service";
import { sendApiError, sendApiSuccess } from "./api-response";

/**
 * 注册模型列表 HTTP 端点
 *
 * 创建临时 Pi Agent agent 获取模型列表。
 */
export async function registerModelsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const service = new ModelCatalogService(getAgentManager());

  /**
   * GET /models
   *
   * 从 Pi Agent 的 getModelInfo() 获取可用模型列表。
   */
  fastify.get(
    "/models",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const result = await service.listModels();
      if (result.success) {
        return sendApiSuccess(reply, result.data);
      }

      if (result.error.code === "SERVER_UNREACHABLE") {
        logger.warn("Pi Agent backend not reachable for /models");
        return sendApiError(reply, 503, result.error);
      }

      logger.error({ error: result.error }, "Failed to get models from Pi Agent backend");
      return sendApiError(reply, 500, result.error);
    },
  );

  logger.info("模型列表路由已注册: GET /models (backend: pi-agent)");
}
