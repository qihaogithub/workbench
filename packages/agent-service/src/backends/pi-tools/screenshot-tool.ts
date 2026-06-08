import * as fs from "fs";
import * as path from "path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import { logger } from "../../utils/logger";

const CaptureScreenshotParams = Type.Object({
  width: Type.Optional(
    Type.Number({
      description: "Viewport width in pixels. Default 375.",
      minimum: 200,
      maximum: 1920,
      default: 375,
    }),
  ),
  height: Type.Optional(
    Type.Number({
      description: "Viewport height in pixels. Default 812.",
      minimum: 200,
      maximum: 1920,
      default: 812,
    }),
  ),
  fullPage: Type.Optional(
    Type.Boolean({
      description:
        "Whether to capture the full page (including scroll area). Default true.",
      default: true,
    }),
  ),
});
type CaptureScreenshotParamsType = Static<typeof CaptureScreenshotParams>;

function getScreenshotServiceUrl(): string {
  return process.env.SCREENSHOT_SERVICE_URL || "http://localhost:3202";
}

/**
 * Read config.schema.json from the demo directory and extract default configData.
 * Returns an empty object if the file doesn't exist or has no defaults.
 */
function readDefaultConfigData(demoDir: string): Record<string, unknown> {
  const schemaPath = path.join(demoDir, "config.schema.json");
  if (!fs.existsSync(schemaPath)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(schemaPath, "utf-8");
    const schema = JSON.parse(raw) as {
      properties?: Record<string, { default?: unknown }>;
    };
    const configData: Record<string, unknown> = {};

    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (prop.default !== undefined) {
          configData[key] = prop.default;
        }
      }
    }

    return configData;
  } catch {
    return {};
  }
}

export function createCaptureScreenshotTool(
  config: AgentConfig,
): AgentTool<typeof CaptureScreenshotParams> {
  return {
    name: "captureScreenshot",
    label: "Capture Screenshot",
    description:
      "Capture a screenshot of the preview page. Use this to check visual effects, layout, and styling issues. " +
      "The screenshot is rendered server-side by screenshot-service using Puppeteer based on the current code files. " +
      "Note: The screenshot reflects the latest saved code state, which may differ slightly from the user's live preview if edits are unsaved.",
    parameters: CaptureScreenshotParams,
    execute: async (_toolCallId: string, args: CaptureScreenshotParamsType) => {
      const workingDir = config.workingDir;
      const demoId = config.demoId;

      if (!workingDir || !demoId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: No working directory or demo ID configured for this session.",
            },
          ],
          details: { error: "MISSING_CONFIG" },
          isError: true,
        };
      }

      const demoDir = path.join(workingDir, demoId);
      const codePath = path.join(demoDir, "index.tsx");

      // Read code file
      if (!fs.existsSync(codePath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Code file not found at ${codePath}. The page may not exist yet.`,
            },
          ],
          details: { error: "CODE_NOT_FOUND" },
          isError: true,
        };
      }

      let code: string;
      try {
        code = fs.readFileSync(codePath, "utf-8");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to read code file: ${message}`,
            },
          ],
          details: { error: "READ_ERROR" },
          isError: true,
        };
      }

      // Read configData
      const configData = readDefaultConfigData(demoDir);
      const width = args.width ?? 375;
      const height = args.height ?? 812;
      const serviceUrl = getScreenshotServiceUrl();

      // Step 1: Call screenshot-service /api/screenshots/generate
      let generateResult: {
        url: string;
        hash: string;
        elapsed: number;
        cached: boolean;
      };
      try {
        const generateResponse = await fetch(
          `${serviceUrl}/api/screenshots/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: demoId,
              pageId: demoId,
              code,
              configData,
              width,
              height,
            }),
          },
        );

        if (!generateResponse.ok) {
          const errorBody = (await generateResponse
            .json()
            .catch(() => ({}))) as Record<string, unknown>;
          const errorData = errorBody.error as
            | { code?: string; message?: string }
            | undefined;
          const errorCode = errorData?.code || "SCREENSHOT_ERROR";
          const errorMessage =
            errorData?.message ||
            `Screenshot generation failed (${generateResponse.status})`;

          return {
            content: [
              { type: "text" as const, text: `Error: ${errorMessage}` },
            ],
            details: { error: errorCode },
            isError: true,
          };
        }

        const body = (await generateResponse.json()) as {
          success: boolean;
          data: typeof generateResult;
        };
        generateResult = body.data;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { error: message, serviceUrl },
          "Failed to call screenshot-service",
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: screenshot-service is unavailable at ${serviceUrl}. Please ensure the screenshot service is running.`,
            },
          ],
          details: { error: "SERVICE_UNAVAILABLE" },
          isError: true,
        };
      }

      // Step 2: Fetch the PNG file
      let pngBuffer: Buffer;
      try {
        const fileUrl = `${serviceUrl}${generateResult.url}`;
        const fileResponse = await fetch(fileUrl);

        if (!fileResponse.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Failed to fetch screenshot file (${fileResponse.status}).`,
              },
            ],
            details: { error: "FILE_FETCH_ERROR" },
            isError: true,
          };
        }

        const arrayBuffer = await fileResponse.arrayBuffer();
        pngBuffer = Buffer.from(arrayBuffer);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ error: message }, "Failed to fetch screenshot file");
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to fetch screenshot file: ${message}`,
            },
          ],
          details: { error: "FILE_FETCH_ERROR" },
          isError: true,
        };
      }

      // Step 3: Convert to base64 and return as ImageContent
      const base64 = pngBuffer.toString("base64");
      const sizeKB = Math.round(pngBuffer.length / 1024);

      logger.info(
        {
          demoId,
          width,
          height,
          sizeKB,
          elapsed: generateResult.elapsed,
          cached: generateResult.cached,
        },
        "Screenshot captured",
      );

      return {
        content: [
          {
            type: "text" as const,
            text: `Screenshot captured (${width}x${height}, ${sizeKB}KB, ${generateResult.cached ? "cached" : "fresh"}, ${generateResult.elapsed}ms)`,
          },
          {
            type: "image" as const,
            data: base64,
            mimeType: "image/png",
          },
        ],
        details: {
          width,
          height,
          sizeKB,
          elapsed: generateResult.elapsed,
          cached: generateResult.cached,
        },
      };
    },
  };
}
