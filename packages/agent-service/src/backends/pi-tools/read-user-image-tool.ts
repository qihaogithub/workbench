import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import { logger } from "../../utils/logger";
import { readGlobalImageById } from "./global-image-store";

const ReadUserImageParams = Type.Object({
  imageId: Type.String({
    description:
      "图片 ID，可从 URL 中提取（例如 /api/images/img_xxx 中的 img_xxx 部分）",
  }),
});
type ReadUserImageParams = Static<typeof ReadUserImageParams>;

export function createReadUserImageTool(): AgentTool<
  typeof ReadUserImageParams
> {
  return {
    name: "readUserImage",
    label: "Read User Image",
    description:
      "重新查看之前用户上传的图片。当需要回顾历史图片内容时使用此工具，传入图片入库时返回的 imageId。",
    parameters: ReadUserImageParams,
    execute: async (_toolCallId: string, args: ReadUserImageParams) => {
      const result = readGlobalImageById(args.imageId);
      if (!result.success) {
        logger.warn(
          { imageId: args.imageId, error: result.error },
          "readUserImage failed",
        );
        return {
          content: [
            {
              type: "text",
              text: `无法读取图片: ${result.error}`,
            },
          ],
          details: { imageId: args.imageId, error: result.error },
          isError: true,
        };
      }

      logger.debug(
        { imageId: args.imageId, sizeBytes: result.sizeBytes },
        "readUserImage succeeded",
      );

      return {
        content: [
          {
            type: "image" as const,
            data: result.data,
            mimeType: result.mimeType,
          },
        ],
        details: {
          imageId: args.imageId,
          filename: result.filename,
          sizeBytes: result.sizeBytes,
        },
      };
    },
  };
}
