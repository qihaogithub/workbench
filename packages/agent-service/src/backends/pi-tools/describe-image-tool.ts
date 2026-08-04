import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ImageDescriber } from "../../services/image-describer";
import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";

const DescribeImageParams = Type.Object({
  imageUrl: Type.String({
    description:
      "The URL of the image to describe. Can be a screenshot URL from captureScreenshot, a saved image URL from saveImage/listImages, or any accessible image URL.",
  }),
});

type DescribeImageParams = Static<typeof DescribeImageParams>;

const URL_FETCH_TIMEOUT = 15_000;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

export function createDescribeImageTool(
  config: AgentConfig,
  imageDescriber: ImageDescriber,
): AgentTool<typeof DescribeImageParams> {
  return {
    name: "describeImage",
    label: "Describe Image",
    description:
      "Use a vision model to analyze an image and return a text description of its content. " +
      "Use this when you need to understand what's visually shown in a screenshot, " +
      "identify UI elements, read text from images, or describe the layout and style of a page. " +
      "Pass the image URL from captureScreenshot's result, or from saveImage/listImages.",
    parameters: DescribeImageParams,
    execute: async (_toolCallId: string, args: DescribeImageParams) => {
      const { imageUrl } = args;

      if (!imageUrl || !imageUrl.trim()) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: imageUrl is required.",
            },
          ],
          details: { error: "missing_image_url" },
          isError: true,
        };
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT);

        let response: Response;
        try {
          response = await fetch(imageUrl.trim(), {
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Failed to fetch image from URL, HTTP ${response.status}.`,
              },
            ],
            details: { error: "fetch_failed", status: response.status },
            isError: true,
          };
        }

        const contentType = response.headers.get("content-type") || "image/png";
        const buffer = Buffer.from(await response.arrayBuffer());

        if (buffer.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: Fetched image is empty.",
              },
            ],
            details: { error: "empty_image" },
            isError: true,
          };
        }

        if (buffer.length > MAX_IMAGE_SIZE) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Image exceeds 10MB size limit (${(buffer.length / 1024 / 1024).toFixed(1)}MB).`,
              },
            ],
            details: { error: "file_too_large", size: buffer.length },
            isError: true,
          };
        }

        const base64 = buffer.toString("base64");
        const image = {
          data: base64,
          mimeType: contentType,
          name: imageUrl.trim().split("/").pop() || "image",
        };

        const description = await imageDescriber.describe([image]);

        const sizeKB = Math.round(buffer.length / 1024);

        return {
          content: [
            {
              type: "text" as const,
              text: `Image description (${sizeKB}KB):\n${description}`,
            },
          ],
          details: {
            sizeKB,
            descriptionLength: description.length,
            imageUrl: imageUrl.trim(),
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { error: message, imageUrl },
          "describeImage failed",
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to describe image: ${message}`,
            },
          ],
          details: { error: "describe_failed", message },
          isError: true,
        };
      }
    },
  };
}