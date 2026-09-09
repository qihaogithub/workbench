import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import { getImageGenConfig } from "../../services/image-gen-config";
import { createGenerateImageTool } from "./generate-image-tool";

const GenerateReferenceImageParams = Type.Object({
  prompt: Type.String({ description: "画面描述，最长 1000 字符", minLength: 1 }),
  filename: Type.String({
    description: "输出文件名，如 hero.png（仅支持 png/jpg/jpeg/webp）",
    minLength: 1,
  }),
  size: Type.Optional(
    Type.Union([
      Type.Literal("1024x1024"),
      Type.Literal("1024x1792"),
      Type.Literal("1792x1024"),
    ]),
  ),
  n: Type.Optional(Type.Number({ description: "变体数，默认 1，最大 4" })),
  references: Type.Array(
    Type.Object({
      uri: Type.String({ description: "完整 canonical wb:// 引用" }),
      assetId: Type.String({ description: "该引用中的图片 assetId" }),
    }),
    {
      minItems: 1,
      maxItems: 4,
      description: "受控项目图片参考，至少 1 张，最多 4 张",
    },
  ),
});

type GenerateReferenceImageParams = Static<
  typeof GenerateReferenceImageParams
>;

/** Reference-only entry point. It delegates to generateImage's guarded path. */
export function createGenerateReferenceImageTool(
  config: AgentConfig,
): AgentTool<typeof GenerateReferenceImageParams> {
  const generateImageTool = createGenerateImageTool(config);
  return {
    name: "generateReferenceImage",
    label: "Generate Reference Image",
    description:
      "使用按权限读取的本项目或跨项目图片引用生成新素材。必须提供至少一个 uri + assetId；只生成并保存素材，不修改白板、配置或源项目。",
    parameters: GenerateReferenceImageParams,
    execute: async (_toolCallId, args, signal) => {
      if (!Array.isArray(args.references) || !args.references.length) {
        return {
          content: [{ type: "text", text: "Error: references 至少需要一张图片" }],
          details: { error: "references_required" },
          isError: true,
        };
      }
      const auth = config.authorAuthorization;
      if (
        config.toolMode === "viewer-readonly" ||
        !auth ||
        auth.expiresAt <= Date.now() ||
        !auth.userId ||
        auth.projectId !== config.projectId
      ) {
        return {
          content: [{ type: "text", text: "Error: 当前会话无权读取图片参考" }],
          details: { error: "reference_unauthorized" },
          isError: true,
        };
      }
      if (!getImageGenConfig().enabled) {
        return {
          content: [{ type: "text", text: "Error: 图像生成未启用" }],
          details: { error: "image_gen_disabled" },
          isError: true,
        };
      }
      return generateImageTool.execute(_toolCallId, args, signal);
    },
  };
}
