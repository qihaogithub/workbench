import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getImageGenConfig } from "../services/image-gen-config";
import {
  generateImage,
  getImageGenCapabilities,
  getImageGenSessionCount,
} from "../services/image-generation-service";

type Body = {
  sessionId?: string;
  prompt?: string;
  sizeId?: string;
  qualityId?: string;
  count?: number;
  references?: Array<{ mimeType?: string; dataBase64?: string }>;
};

function auth(request: FastifyRequest, reply: FastifyReply): boolean {
  const expected =
    process.env.INTERNAL_API_TOKEN ||
    (process.env.NODE_ENV === "production" ? "" : "dev-internal-token");
  if (!expected) {
    reply.code(503).send({
      success: false,
      error: { code: "INTERNAL_TOKEN_NOT_SET", message: "内部令牌未配置" },
    });
    return false;
  }
  if (request.headers["x-internal-token"] !== expected) {
    reply.code(401).send({
      success: false,
      error: { code: "UNAUTHORIZED", message: "内部接口鉴权失败" },
    });
    return false;
  }
  return true;
}

export async function registerInternalImageGenRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.get<{ Querystring: { sessionId?: string } }>(
    "/internal/image-gen/capabilities",
    async (request, reply) => {
      if (!auth(request, reply)) return;
      const config = getImageGenConfig();
      const sessionId = request.query.sessionId;
      const remainingCount =
        sessionId && config.maxPerSession > 0
          ? Math.max(
              0,
              config.maxPerSession - getImageGenSessionCount(sessionId),
            )
          : undefined;
      return reply.send({
        success: true,
        data: {
          enabled: config.enabled && Boolean(config.apiKey),
          ...getImageGenCapabilities(config),
          ...(remainingCount === undefined ? {} : { remainingCount }),
        },
      });
    },
  );
  fastify.post(
    "/internal/image-gen/generate",
    async (request: FastifyRequest<{ Body: Body }>, reply) => {
      if (!auth(request, reply)) return;
      const config = getImageGenConfig();
      const body = request.body ?? {};
      if (!config.enabled || !config.apiKey)
        return reply.code(503).send({
          success: false,
          error: { code: "IMAGE_GEN_DISABLED", message: "图像生成未启用" },
        });
      if (typeof body.prompt !== "string" || !body.prompt.trim())
        return reply.code(400).send({
          success: false,
          error: { code: "INVALID_PROMPT", message: "prompt 不能为空" },
        });
      const abortController = new AbortController();
      const onAbort = () => abortController.abort();
      request.raw.once("aborted", onAbort);
      try {
        const result = await generateImage(
          {
            sessionId: body.sessionId,
            prompt: body.prompt,
            size: body.sizeId,
            quality: body.qualityId,
            count: body.count,
            references: (body.references ?? []).map((ref) => ({
              mimeType: ref.mimeType ?? "",
              dataBase64: ref.dataBase64 ?? "",
            })),
            signal: abortController.signal,
          },
          config,
        );
        return reply.send({
          success: true,
          data: { images: result.images },
          meta: {
            sizeId: result.size,
            qualityId: result.quality,
            apiProfile: result.apiProfile,
          },
        });
      } catch (error) {
        const rawCode =
          error instanceof Error ? error.message : "generation_failed";
        const code = rawCode.startsWith("wrong_result_count")
          ? "generation_failed"
          : rawCode;
        const status = [
          "empty_prompt",
          "prompt_too_long",
          "invalid_size",
          "invalid_quality",
          "invalid_count",
          "too_many_references",
          "invalid_reference_type",
          "reference_too_large",
          "references_not_supported",
          "quota_exceeded",
        ].includes(code)
          ? 400
          : code === "cancelled"
            ? 499
            : 502;
        return reply.code(status).send({
          success: false,
          error: {
            code,
            message:
              code === "quota_exceeded" ? "已超过会话生成配额" : "图像生成失败",
          },
        });
      } finally {
        request.raw.removeListener("aborted", onAbort);
      }
    },
  );
}
