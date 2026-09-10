import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";
import { getImageGenConfig } from "../../services/image-gen-config";
import { uploadToGlobalImageStore } from "./global-image-store";
import { registerGlobalImageToProject } from "./image-store-register";
import {
  requestProjectReference,
  type ReferenceImageContent,
} from "./markdown-reference-tool";
import {
  generateImage as generateImageWithProvider,
  getImageGenCapabilities,
  getImageGenSessionCount as getSharedImageGenSessionCount,
  resetImageGenSessionCount as resetSharedImageGenSessionCount,
  type ImageGenApiProfile,
} from "../../services/image-generation-service";

const GenerateImageParams = Type.Object({
  prompt: Type.String({
    description: "画面描述，最长 1000 字符",
    minLength: 1,
  }),
  filename: Type.String({
    description: "输出文件名，如 hero.png（仅支持 png/jpg/jpeg/webp）",
    minLength: 1,
  }),
  size: Type.Optional(
    Type.Union(
      [
        Type.Literal("1024x1024"),
        Type.Literal("1024x1792"),
        Type.Literal("1792x1024"),
      ],
      { description: "生成尺寸，默认 1024x1024" },
    ),
  ),
  n: Type.Optional(
    Type.Number({
      description: "变体数，默认 1，最大 4",
    }),
  ),
  references: Type.Optional(
    Type.Array(
      Type.Object({
        uri: Type.String({ description: "完整 canonical wb:// 引用" }),
        assetId: Type.String({ description: "该引用中的图片 assetId" }),
      }),
      { maxItems: 4, description: "受控项目图片参考，最多 4 张" },
    ),
  ),
});
export type GenerateImageParams = Static<typeof GenerateImageParams>;

const SUPPORTED_OUTPUT_FORMATS = new Set(["png", "jpg", "jpeg", "webp"]);

export function getImageGenSessionCount(sessionId: string): number {
  return getSharedImageGenSessionCount(sessionId);
}

export function resetImageGenSessionCount(sessionId: string): void {
  resetSharedImageGenSessionCount(sessionId);
}

function filenameToMime(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return null;
}

export function createGenerateImageTool(
  config: AgentConfig,
): AgentTool<typeof GenerateImageParams> {
  return {
    name: "generateImage",
    label: "Generate Image",
    description:
      "使用文生图 API 生成图片并保存到全局图床。适用于页面需要全新素材、没有现成图片文件时。生成后返回 imageId 和 URL，可直接在页面代码（img src）和 config.schema.json 中用 /api/images/{imageId} 引用。仅图片子 Agent 或主 Agent 在需要造图时使用。",
    parameters: GenerateImageParams,
    execute: async (
      _toolCallId: string,
      args: GenerateImageParams,
      signal?: AbortSignal,
    ) => {
      const gen = getImageGenConfig();

      if (!gen.enabled) {
        return {
          content: [
            {
              type: "text",
              text: "Error: 图像生成未启用（IMAGE_GEN_ENABLED=false）。请管理员在服务端配置后重试。",
            },
          ],
          details: { error: "image_gen_disabled" },
          isError: true,
        };
      }
      if (!gen.apiKey) {
        return {
          content: [
            {
              type: "text",
              text: "Error: 未配置 IMAGE_GEN_API_KEY，无法调用图像生成 API。",
            },
          ],
          details: { error: "missing_api_key" },
          isError: true,
        };
      }

      const prompt = args.prompt.trim();
      if (!prompt) {
        return {
          content: [{ type: "text", text: "Error: prompt 不能为空" }],
          details: { error: "empty_prompt" },
          isError: true,
        };
      }
      if (prompt.length > gen.maxPromptLen) {
        return {
          content: [
            {
              type: "text",
              text: `Error: prompt 长度 ${prompt.length} 超过上限 ${gen.maxPromptLen} 字符`,
            },
          ],
          details: { error: "prompt_too_long" },
          isError: true,
        };
      }

      const ext = args.filename.split(".").pop()?.toLowerCase() ?? "";
      if (!SUPPORTED_OUTPUT_FORMATS.has(ext)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: 不支持的输出格式 ".${ext}"，仅支持 ${[...SUPPORTED_OUTPUT_FORMATS].join("/")}`,
            },
          ],
          details: { error: "invalid_format" },
          isError: true,
        };
      }
      if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(args.filename)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: 非法文件名 "${args.filename}"，仅允许字母、数字、连字符和下划线`,
            },
          ],
          details: { error: "invalid_filename" },
          isError: true,
        };
      }

      const n = args.n === undefined ? 1 : Math.min(Math.max(1, args.n), 4);
      const perSession = gen.maxPerSession;
      const sessionId = config.sessionId || "unknown";
      if (perSession > 0) {
        const current = getImageGenSessionCount(sessionId);
        if (current + n > perSession) {
          return {
            content: [
              {
                type: "text",
                text: `Error: 本会话图像生成配额已达上限（${perSession} 张），无法再生成 ${n} 张。`,
              },
            ],
            details: { error: "quota_exceeded", limit: perSession },
            isError: true,
          };
        }
      }

      const mimeType = filenameToMime(args.filename)!;
      const size = args.size ?? "1024x1024";
      const references = args.references ?? [];
      const referenceMetadata = references.map(({ uri, assetId }) => ({
        uri,
        assetId,
      }));
      if (references.length > 4) {
        return {
          content: [{ type: "text", text: "Error: 最多支持 4 张图片参考" }],
          details: { error: "too_many_references", references: referenceMetadata },
          isError: true,
        };
      }
      const capabilities = getImageGenCapabilities(gen);
      if (references.length > 0 && !capabilities.supportsReferences) {
        return {
          content: [
            {
              type: "text",
              text: `Error: 当前图像生成档案不支持图片参考（${capabilities.apiProfile}），已拒绝本次请求。`,
            },
          ],
          details: {
            error: "references_not_supported",
            references: references.map(({ uri, assetId }) => ({ uri, assetId })),
          },
          isError: true,
        };
      }

      const referenceContents: Array<{
        mimeType: string;
        dataBase64: string;
      }> = [];
      for (const reference of references) {
        if (signal?.aborted) {
          return {
            content: [{ type: "text", text: "Error: 图像生成已取消" }],
            details: { error: "cancelled", references: referenceMetadata },
            isError: true,
          };
        }
        try {
          const content = await requestProjectReference<ReferenceImageContent>(
            config,
            { uri: reference.uri, mode: "image", assetId: reference.assetId },
            signal,
          );
          if (
            content.uri !== reference.uri ||
            content.assetId !== reference.assetId ||
            !["image/png", "image/jpeg", "image/webp"].includes(
              content.mimeType,
            ) ||
            typeof content.dataBase64 !== "string" ||
            !content.dataBase64
          ) {
            throw new Error("REFERENCE_INVALID_IMAGE");
          }
          referenceContents.push({
            mimeType: content.mimeType,
            dataBase64: content.dataBase64,
          });
        } catch {
          if (signal?.aborted) {
            return {
              content: [{ type: "text", text: "Error: 图像生成已取消" }],
              details: { error: "cancelled", references: referenceMetadata },
              isError: true,
            };
          }
          return {
            content: [{ type: "text", text: "Error: 图片参考读取失败，未调用图像生成服务" }],
            details: {
              error: "reference_read_failed",
              references: referenceMetadata,
            },
            isError: true,
          };
        }
      }

      // Provider retries, cancellation, quota and response parsing live in the
      // shared service used by both this tool and the whiteboard endpoint.
      let attemptsLeft = 1;
      let lastError = "";
      while (attemptsLeft > 0) {
        attemptsLeft--;
        try {
          const generated = await callImageGenerationApi({
            prompt,
            size,
            n,
            model: gen.model,
            apiProfile: gen.apiProfile,
            baseUrl: gen.baseUrl,
            apiKey: gen.apiKey,
            timeoutMs: gen.timeoutMs,
            maxPerSession: gen.maxPerSession,
            maxRetries: gen.maxRetries,
            maxPromptLen: gen.maxPromptLen,
            sessionId,
            references: referenceContents,
            signal,
          });

          if (generated.buffers.length === 0) {
            lastError = "API 响应中没有可用的图片数据";
          } else {
            const results = [] as Array<{
              imageId: string;
              url: string;
              width?: number;
              height?: number;
            }>;
            for (let i = 0; i < generated.buffers.length; i++) {
              const buffer = generated.buffers[i];
              const stored = uploadToGlobalImageStore({
                buffer,
                filename:
                  generated.buffers.length > 1
                    ? insertSuffixBeforeExt(args.filename, `-${i + 1}`)
                    : args.filename,
                sourceType: "ai_generated",
                projectId: config.projectId ?? undefined,
                createdBy: "ai-agent",
              });
              if (!stored.success) {
                lastError = stored.error;
                continue;
              }
              registerGlobalImageToProject(config, stored, args.filename, {
                createdBy: "ai",
                sourceType: "ai_generated",
                alt: prompt,
              });
              results.push({
                imageId: stored.imageId,
                url: stored.url,
                width: stored.width,
                height: stored.height,
              });
            }
            if (results.length > 0) {
              const lines = results
                .map(
                  (r) =>
                    `- imageId: ${r.imageId}, URL: ${r.url}${r.width ? `, ${r.width}×${r.height}` : ""}`,
                )
                .join("\n");
              return {
                content: [
                  {
                    type: "text",
                    text: `图片生成成功${results.length > 1 ? `（${results.length} 张）` : ""}，已保存到全局图床：\n${lines}\n\n页面代码和 config.schema.json 中直接使用 /api/images/{imageId} 引用。`,
                  },
                ],
                details: {
                  success: true,
                  count: results.length,
                  results,
                  mimeType,
                  size,
                  references: referenceMetadata,
                },
              };
            }
          }
        } catch (error) {
          lastError =
            error instanceof Error ? error.message : String(error);
          if (signal?.aborted) {
            return {
              content: [{ type: "text", text: "Error: 图像生成已取消" }],
              details: { error: "cancelled" },
              isError: true,
            };
          }
        }
        if (attemptsLeft > 0) {
          logger.warn({ lastError, remaining: attemptsLeft }, "generateImage retrying after failure");
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Error: 图像生成失败：${lastError || "未知错误"}`,
          },
        ],
        details: { error: "generation_failed", references: referenceMetadata },
        isError: true,
      };
    },
  };
}

function insertSuffixBeforeExt(filename: string, suffix: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return `${filename}${suffix}`;
  return `${filename.slice(0, dot)}${suffix}${filename.slice(dot)}`;
}

async function callImageGenerationApi(params: {
  prompt: string;
  size: string;
  n: number;
  model: string;
  apiProfile: ImageGenApiProfile;
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxPerSession: number;
  maxRetries: number;
  maxPromptLen: number;
  sessionId: string;
  references?: Array<{ mimeType: string; dataBase64: string }>;
  signal?: AbortSignal;
}): Promise<{ buffers: Buffer[] }> {
  const generated = await generateImageWithProvider(
    {
      sessionId: params.sessionId,
      prompt: params.prompt,
      size: params.size,
      count: params.n,
      references: params.references,
      signal: params.signal,
    },
    {
      enabled: true,
      apiKey: params.apiKey,
      baseUrl: params.baseUrl,
      model: params.model,
      apiProfile: params.apiProfile,
      timeoutMs: params.timeoutMs,
      maxPerSession: params.maxPerSession,
      maxRetries: params.maxRetries,
      concurrency: 1,
      maxPromptLen: params.maxPromptLen,
    },
  );
  return {
    buffers: generated.images.map((image) =>
      Buffer.from(image.dataBase64, "base64"),
    ),
  };
}
