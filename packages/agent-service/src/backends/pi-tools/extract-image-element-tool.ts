import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";
import {
  readGlobalImageById,
  uploadToGlobalImageStore,
} from "./global-image-store";
import { registerGlobalImageToProject } from "./image-store-register";
import { segmentImageElementByText } from "./image-segmenter";

const ExtractImageElementParams = Type.Object({
  imageId: Type.String({
    description: "来源图 imageId，可从 URL 中提取（/api/images/img_xxx 的 img_xxx）",
    minLength: 1,
  }),
  element: Type.String({
    description: "语义描述要抠出的元素，如 'the red car on the left'、'这个人'",
    minLength: 1,
  }),
  output: Type.String({
    description: "输出文件名，如 extracted-car.png（仅支持 png）",
    minLength: 1,
  }),
  softEdge: Type.Optional(
    Type.Number({
      description: "边缘羽化像素，默认 0",
    }),
  ),
  invert: Type.Optional(
    Type.Boolean({
      description: "反选：抠出除 element 外的所有内容，默认 false",
    }),
  ),
  threshold: Type.Optional(
    Type.Number({
      description: "mask 阈值 0-1，默认 0.5",
    }),
  ),
});
type ExtractImageElementParams = Static<typeof ExtractImageElementParams>;

export function createExtractImageElementTool(
  config: AgentConfig,
): AgentTool<typeof ExtractImageElementParams> {
  return {
    name: "extractImageElement",
    label: "Extract Image Element",
    description:
      "语义抠图：使用 CLIPSeg 抠出图片中符合语义描述的元素区域，输出为透明背景 PNG 并保存到全局图床。适用场景：从一张素材图中抠出主体（人、车、产品、形状）单独使用。返回 imageId 和 URL，可直接在页面代码中用 /api/images/{imageId} 引用。",
    parameters: ExtractImageElementParams,
    execute: async (
      _toolCallId: string,
      args: ExtractImageElementParams,
      signal?: AbortSignal,
    ) => {
      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "Error: 抠图已取消" }],
          details: { error: "cancelled" },
          isError: true,
        };
      }

      const output = args.output.trim();
      const ext = output.split(".").pop()?.toLowerCase() ?? "";
      if (ext !== "png") {
        return {
          content: [
            {
              type: "text",
              text: 'Error: 输出文件格式仅支持 png（透明背景需要 PNG）',
            },
          ],
          details: { error: "invalid_format" },
          isError: true,
        };
      }
      if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(output)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: 非法文件名 "${output}"，仅允许字母、数字、连字符和下划线`,
            },
          ],
          details: { error: "invalid_filename" },
          isError: true,
        };
      }

      const threshold =
        args.threshold === undefined ? 0.5 : Math.min(Math.max(0, args.threshold), 1);
      const softEdge = Math.max(0, args.softEdge ?? 0);
      const invert = args.invert ?? false;

      logger.info(
        { imageId: args.imageId, element: args.element, threshold, softEdge, invert },
        "extractImageElement: starting",
      );

      const segment = await segmentImageElementByText(
        args.imageId,
        args.element,
        threshold,
      );
      if (!segment.success) {
        return {
          content: [
            {
              type: "text",
              text: `Error: 抠图失败：${segment.error}`,
            },
          ],
          details: { error: "segmentation_failed" },
          isError: true,
        };
      }

      if (segment.empty) {
        return {
          content: [
            {
              type: "text",
              text: `未在图片中定位到与「${args.element}」匹配的元素区域，请换一个更具体的语义描述后重试。`,
            },
          ],
          details: { error: "element_not_found" },
          isError: true,
        };
      }

      try {
        const sharp = (await import("sharp")).default;
        const source = readGlobalImageById(args.imageId);
        if (!source.success) {
          return {
            content: [{ type: "text", text: `Error: ${source.error}` }],
            details: { error: "source_read_failed" },
            isError: true,
          };
        }
        const sourceBuffer = Buffer.from(source.data, "base64");

        let mask = segment.mask;
        if (softEdge > 0) {
          mask = await sharp(mask, {
            raw: { width: segment.width, height: segment.height, channels: 1 },
          })
            .blur(softEdge)
            .raw()
            .toBuffer();
        }
        if (invert) {
          mask = Buffer.from(
            mask.map((v) => (v > 0 ? 0 : 255)),
          );
        }

        // 原图 RGB + mask 作为 Alpha（0=透明，255=不透明）
        const rgb = await sharp(sourceBuffer)
          .ensureAlpha(0)
          .removeAlpha()
          .raw()
          .toBuffer();

        const rgbWidth = segment.width;
        const rgbHeight = segment.height;
        const rgba = Buffer.alloc(rgb.length + rgbWidth * rgbHeight);
        for (let i = 0; i < rgb.length; i++) {
          rgba[i] = rgb[i];
        }
        for (let i = 0; i < rgbWidth * rgbHeight; i++) {
          rgba[rgb.length + i] = mask[i];
        }

        const pngBuffer = await sharp(rgba, {
          raw: { width: rgbWidth, height: rgbHeight, channels: 4 },
        })
          .png()
          .toBuffer();

        const stored = uploadToGlobalImageStore({
          buffer: pngBuffer,
          filename: output,
          sourceType: "ai_generated",
          projectId: config.projectId ?? undefined,
          createdBy: "ai-agent",
        });

        if (!stored.success) {
          return {
            content: [{ type: "text", text: `Error: 保存抠图结果失败：${stored.error}` }],
            details: { error: "save_failed" },
            isError: true,
          };
        }

        registerGlobalImageToProject(config, stored, output, {
          createdBy: "ai",
          sourceType: "ai_generated",
          originalUrl: `/api/images/${args.imageId}`,
          alt: `抠图：${args.element}`,
        });

        return {
          content: [
            {
              type: "text",
              text: `抠图成功：已从 ${args.imageId} 抠出「${args.element}」，保存为透明 PNG（${stored.url}）。页面代码和 config.schema.json 中用 /api/images/${stored.imageId} 引用。`,
            },
          ],
          details: {
            success: true,
            imageId: stored.imageId,
            url: stored.url,
            width: stored.width,
            height: stored.height,
            sourceImageId: args.imageId,
            element: args.element,
            empty: false,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, "extractImageElement failed");
        return {
          content: [{ type: "text", text: `Error: 抠图失败：${message}` }],
          details: { error: "processing_failed" },
          isError: true,
        };
      }
    },
  };
}