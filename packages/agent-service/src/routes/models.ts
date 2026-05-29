import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { logger } from "../utils/logger";

const OPENCODE_SERVER_URL =
  process.env.OPENCODE_SERVER_URL || "http://localhost:4096";

/**
 * /config/providers 返回的模型能力结构（仅取需要的字段）
 */
interface ProviderModelCapabilities {
  input?: { text?: boolean; image?: boolean; audio?: boolean; video?: boolean };
  output?: { text?: boolean; image?: boolean };
  reasoning?: boolean;
  toolcall?: boolean;
}

interface ProviderModelVariant {
  reasoningEffort?: string;
  [key: string]: unknown;
}

interface ProviderModel {
  id: string;
  providerID: string;
  name?: string;
  family?: string;
  capabilities?: ProviderModelCapabilities;
  variants?: Record<string, ProviderModelVariant>;
  cost?: { input?: number; output?: number };
  limit?: { context?: number; output?: number };
  status?: string;
}

interface Provider {
  id: string;
  name?: string;
  models?: Record<string, ProviderModel>;
}

interface ConfigProvidersResponse {
  providers: Provider[];
  default?: Record<string, string>;
}

/**
 * 注册模型列表 HTTP 端点
 *
 * 供管理后台使用，通过 OpenCode Server 的 /config/providers 端点
 * 查询所有供应商和模型，包含多模态、思考深度等能力信息。
 */
export async function registerModelsRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  /**
   * GET /models
   *
   * 从 OpenCode Server /config/providers 获取完整的模型列表及能力信息。
   * 返回字段：id, label, group, supportsImages, supportsThinkingDepth
   */
  fastify.get(
    "/models",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const response = await fetch(
          `${OPENCODE_SERVER_URL}/config/providers`,
          {
            method: "GET",
            signal: AbortSignal.timeout(10000),
          },
        );

        if (!response.ok) {
          return reply.code(502).send({
            success: false,
            error: {
              code: "BACKEND_UNAVAILABLE",
              message: `OpenCode Server responded ${response.status}`,
            },
          });
        }

        const data = (await response.json()) as ConfigProvidersResponse;

        const models: Array<{
          id: string;
          label: string;
          group: string;
          supportsImages: boolean;
          supportsThinkingDepth: boolean;
        }> = [];

        for (const provider of data.providers || []) {
          const providerModels = provider.models || {};
          for (const [, modelInfo] of Object.entries(providerModels)) {
            const fullId = `${provider.id}/${modelInfo.id}`;
            const caps = modelInfo.capabilities;
            const variants = modelInfo.variants || {};

            // 判断是否支持思考深度：有 low/medium/high 等变体
            const hasThinkingVariants = Object.keys(variants).some(
              (k) =>
                k === "low" || k === "medium" || k === "high" || k === "max",
            );

            models.push({
              id: fullId,
              label: modelInfo.name || modelInfo.id,
              group: provider.id,
              supportsImages: !!caps?.input?.image,
              supportsThinkingDepth: hasThinkingVariants || !!caps?.reasoning,
            });
          }
        }

        // 从 default 映射中推断当前默认模型
        const currentModelId = data.default
          ? Object.entries(data.default)
              .map(([p, m]) => `${p}/${m}`)
              .find((id) => models.some((m) => m.id === id)) || null
          : null;

        return reply.send({
          success: true,
          data: {
            models,
            currentModelId,
            canSwitch: models.length > 1,
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
          logger.warn(
            { serverUrl: OPENCODE_SERVER_URL },
            "OpenCode Server is not reachable for /models",
          );
          return reply.code(503).send({
            success: false,
            error: {
              code: "SERVER_UNREACHABLE",
              message: `无法连接 OpenCode Server (${OPENCODE_SERVER_URL})，请确认服务已启动后点击「拉取模型」重试`,
            },
          });
        }

        logger.error(
          { error },
          "Failed to fetch models from /config/providers",
        );
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

  logger.info("模型列表路由已注册: GET /models");
}
