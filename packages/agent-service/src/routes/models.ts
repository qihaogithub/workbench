import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getAgentManager } from "../core/agent-manager";
import { AgentConfig } from "../core/types";
import { logger } from "../utils/logger";

/**
 * 注册模型列表 HTTP 端点
 *
 * 创建临时 Pi Agent agent 获取模型列表。
 */
export async function registerModelsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const manager = getAgentManager();

  /**
   * GET /models
   *
   * 从 Pi Agent 的 getModelInfo() 获取可用模型列表。
   */
  fastify.get(
    "/models",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const tempSessionId = `__models_probe_${Date.now()}`;

      try {
        const config: AgentConfig = {
          sessionId: tempSessionId,
        };

        const agent = manager.getOrCreate(tempSessionId, config);

        if (agent.status !== "ready") {
          await agent.start();
        }

        const modelInfo = await agent.getModelInfo?.();

        await manager.destroy(tempSessionId);

        if (!modelInfo) {
          return reply.send({
            success: true,
            data: {
              models: [],
              currentModelId: null,
              canSwitch: false,
            },
          });
        }

        // 转换为统一格式，补充 group 字段
        const models = modelInfo.availableModels.map((m) => {
          const slashIdx = m.id.indexOf("/");
          const group = slashIdx >= 0 ? m.id.slice(0, slashIdx) : "";
          return {
            id: m.id,
            label: m.label,
            group,
            supportsImages: false,
            supportsThinkingDepth: false,
          };
        });

        return reply.send({
          success: true,
          data: {
            models,
            currentModelId: modelInfo.currentModelId,
            canSwitch: modelInfo.canSwitch,
          },
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";

        // 区分连接失败（服务未启动）和其他错误
        const isConnectionError =
          errMsg.includes("fetch failed") ||
          errMsg.includes("ECONNREFUSED") ||
          errMsg.includes("ENOTFOUND") ||
          errMsg.includes("aborted");

        if (isConnectionError) {
          logger.warn("Pi Agent backend not reachable for /models");
          return reply.code(503).send({
            success: false,
            error: {
              code: "SERVER_UNREACHABLE",
              message: "无法连接 Pi Agent 后端，请确认服务已启动后点击「拉取模型」重试",
            },
          });
        }

        logger.error({ error }, "Failed to get models from Pi Agent backend");
        return reply.code(500).send({
          success: false,
          error: {
            code: "GET_MODELS_ERROR",
            message: errMsg,
          },
        });
      }
    },
  );

  logger.info("模型列表路由已注册: GET /models (backend: pi-agent)");
}
