import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig, FileChange } from "../../core/types";

// 通用参数（不含 subagentType）
const BaseDelegateTaskParams = Type.Object({
  task: Type.String({
    description:
      "A concrete task for a short-lived subagent to complete in the current workspace",
    minLength: 1,
  }),
  context: Type.Optional(
    Type.String({
      description:
        "Optional extra context, constraints, or files the subagent should consider",
    }),
  ),
  images: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Image URLs for the subagent to analyze with the current multimodal model. Supports absolute URLs and relative paths (/api/images/..., /api/screenshots/file/...). Relative paths are automatically resolved by the server. Obtain URLs from captureScreenshot, saveImage, or listImages results.",
    }),
  ),
});

// 仅当绘图子 Agent 启用时才暴露 subagentType 参数
const ImageSubagentParam = Type.Optional(
  Type.Union([Type.Literal("general"), Type.Literal("image")], {
    description:
      'Subagent type. "general" (default) is a general-purpose subagent with the full toolset. "image" is a dedicated image subagent with only image tools (generateImage, extractImageElement, saveImage, listImages, readUserImage, readFile, writeFile) — use it when you need to generate, extract, or curate images and visually self-review generated images.',
  }),
);

type DelegateTaskParams = Static<typeof BaseDelegateTaskParams> & {
  subagentType?: "general" | "image";
};

export interface SubagentRunnerParams {
  task: string;
  context?: string;
  imageUrls?: string[];
  subagentType?: "general" | "image";
}

export interface SubagentRunResult {
  success: boolean;
  content: string;
  files?: FileChange[];
  durationMs: number;
}

export type SubagentRunner = (
  params: SubagentRunnerParams,
  signal?: AbortSignal,
) => Promise<SubagentRunResult>;

export function createDelegateTaskTool(
  runner: SubagentRunner,
  _config: AgentConfig,
  options: { imageSubagentEnabled?: boolean } = {},
): AgentTool<typeof BaseDelegateTaskParams> {
  const imageSubagentEnabled = options.imageSubagentEnabled === true;

  const parameters = imageSubagentEnabled
    ? (Type.Object({
        ...BaseDelegateTaskParams.properties,
        subagentType: ImageSubagentParam,
      }) as typeof BaseDelegateTaskParams)
    : BaseDelegateTaskParams;

  const description = imageSubagentEnabled
    ? "Delegate a self-contained task to a short-lived subagent. The subagent works in the same workspace, may edit files, and returns a concise result. Pass images when the current multimodal model needs to inspect them. Use subagentType: 'image' to spawn a dedicated image subagent (image tools only) that can generate and extract images and self-review them."
    : "Delegate a self-contained task to a short-lived subagent. The subagent works in the same workspace, may edit files, and returns a concise result. Pass images when the current multimodal model needs to inspect them.";

  return {
    name: "delegateTask",
    label: "Delegate Task",
    description,
    parameters,
    executionMode: "parallel",
    execute: async (
      _toolCallId: string,
      args: DelegateTaskParams,
      signal?: AbortSignal,
    ) => {
      const task = args.task.trim();
      if (!task) {
        return {
          content: [{ type: "text", text: "Error: task must not be empty" }],
          details: { success: false, error: "empty task" },
          isError: true,
        };
      }

      // 绘图未启用时，即使模型强行传 subagentType: image 也拒绝
      if (!imageSubagentEnabled && args.subagentType === "image") {
        return {
          content: [
            {
              type: "text",
              text: "Error: 图像生成子 Agent 未启用（绘图模型未配置），无法委派图片任务。",
            },
          ],
          details: { success: false, error: "image_subagent_disabled" },
          isError: true,
        };
      }

      try {
        const result = await runner(
          {
            task,
            context: args.context,
            imageUrls: args.images,
            subagentType: args.subagentType,
          },
          signal,
        );
        return {
          content: [
            {
              type: "text",
              text:
                result.content || "Subagent completed without textual output.",
            },
          ],
          details: result,
          isError: !result.success,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          content: [
            { type: "text", text: `Error running subagent: ${message}` },
          ],
          details: { success: false, error: message },
          isError: true,
        };
      }
    },
  };
}
