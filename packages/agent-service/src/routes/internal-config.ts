/**
 * 内部配置同步路由
 *
 * 用途：author-site 管理后台修改 backendProviders 后，调用此端点推送到 agent-service
 * 鉴权：X-Internal-Token header（与 .env INTERNAL_API_TOKEN 匹配）
 *
 * 端点：
 * - POST /internal/backend-providers  设置完整配置
 * - GET  /internal/backend-providers  获取当前配置（用于调试/验证）
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getBackendProvidersManager } from "../config/backend-providers";
import { getSessionModelConfigs } from "../config/session-model-configs";
import { getAgentManager } from "../core/agent-manager";
import { logger } from "../utils/logger";
import type { BackendProvidersConfig } from "@opencode-workbench/shared";

const TOKEN_HEADER = "x-internal-token";

function checkToken(request: FastifyRequest, reply: FastifyReply): boolean {
  const expected =
    process.env.INTERNAL_API_TOKEN ||
    (process.env.NODE_ENV === "production" ? "" : "dev-internal-token");
  if (!expected) {
    reply.code(503).send({
      success: false,
      error: {
        code: "INTERNAL_TOKEN_NOT_SET",
        message: "agent-service 未配置 INTERNAL_API_TOKEN，拒绝内部请求",
      },
    });
    return false;
  }

  const provided = request.headers[TOKEN_HEADER];
  if (provided !== expected) {
    reply.code(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "内部接口鉴权失败",
      },
    });
    return false;
  }
  return true;
}

export async function registerInternalConfigRoutes(fastify: FastifyInstance) {
  /**
   * 设置完整配置（author-site 推送）
   */
  fastify.post(
    "/internal/backend-providers",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkToken(request, reply)) return;

      const body = request.body as Partial<BackendProvidersConfig> | null;
      if (!body || !Array.isArray(body.providers)) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_BODY",
            message: "请求体必须包含 providers 数组",
          },
        });
      }

      // 字段校验
      const errors: string[] = [];
      for (let i = 0; i < body.providers.length; i++) {
        const p = body.providers[i];
        if (!p.id) errors.push(`providers[${i}].id 必填`);
        if (!p.baseURL) errors.push(`providers[${i}].baseURL 必填`);
        if (!Array.isArray(p.models)) errors.push(`providers[${i}].models 必须是数组`);
      }
      if (errors.length > 0) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.join("; "),
          },
        });
      }

      const config: BackendProvidersConfig = {
        providers: body.providers,
        activeProviderId: body.activeProviderId,
        activeModelId: body.activeModelId,
      };

      getBackendProvidersManager().setConfig(config);

      logger.info(
        {
          providerCount: config.providers.length,
          activeProviderId: config.activeProviderId,
        },
        "BackendProviders config pushed from author-site",
      );

      return reply.send({
        success: true,
        data: {
          providerCount: config.providers.length,
          activeProviderId: config.activeProviderId,
        },
      });
    },
  );

  fastify.post(
    "/internal/sessions/:sessionId/model-config",
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      if (!checkToken(request, reply)) return;

      const body = request.body as Partial<BackendProvidersConfig> | null;
      if (!body || !Array.isArray(body.providers)) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_BODY",
            message: "请求体必须包含 providers 数组",
          },
        });
      }

      const errors: string[] = [];
      for (let i = 0; i < body.providers.length; i++) {
        const provider = body.providers[i];
        if (!provider.id) errors.push(`providers[${i}].id 必填`);
        if (!provider.baseURL) errors.push(`providers[${i}].baseURL 必填`);
        if (!Array.isArray(provider.models)) {
          errors.push(`providers[${i}].models 必须是数组`);
        }
      }
      if (errors.length > 0) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.join("; "),
          },
        });
      }

      const config: BackendProvidersConfig = {
        providers: body.providers,
        activeProviderId: body.activeProviderId,
        activeModelId: body.activeModelId,
      };

      getSessionModelConfigs().set(request.params.sessionId, config);
      const existingAgent = getAgentManager().get(request.params.sessionId);
      if (existingAgent) {
        existingAgent.updateConfig({
          ...existingAgent.getConfig(),
          backendProviders: config,
        });
      }

      logger.info(
        {
          sessionId: request.params.sessionId,
          providerCount: config.providers.length,
          activeProviderId: config.activeProviderId,
        },
        "Session model config pushed from author-site",
      );

      return reply.send({
        success: true,
        data: {
          sessionId: request.params.sessionId,
          providerCount: config.providers.length,
          activeProviderId: config.activeProviderId,
        },
      });
    },
  );

  /**
   * 获取当前配置（用于验证推送是否成功）
   */
  fastify.get(
    "/internal/backend-providers",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkToken(request, reply)) return;

      const cfg = getBackendProvidersManager().getConfig();

      // 返回时脱敏 apiKey（仅显示长度和前缀）
      const safeProviders = cfg.providers.map((p) => ({
        ...p,
        apiKey: p.apiKey ? `${p.apiKey.slice(0, 4)}...(${p.apiKey.length})` : "",
      }));

      return reply.send({
        success: true,
        data: {
          ...cfg,
          providers: safeProviders,
        },
      });
    },
  );

  logger.info("内部配置同步路由已注册: POST/GET /internal/backend-providers");
}
