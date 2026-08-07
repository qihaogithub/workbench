import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig, FileChange } from "../../core/types";

const DelegateTaskParams = Type.Object({
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
  model: Type.Optional(
    Type.Union([Type.Literal("inherit"), Type.Literal("vision")], {
      description:
        'Model for the subagent. "inherit" (default) uses the same model as the main agent. "vision" uses the configured vision model for image analysis. Use "vision" when your main model cannot see images but you need visual understanding of screenshots or images.',
    }),
  ),
  images: Type.Optional(
    Type.Array(Type.String(), {
      description:
        'Image URLs for the subagent to analyze. Only effective when model is "vision". Supports absolute URLs and relative paths (/api/images/..., /api/screenshots/file/...). Relative paths are automatically resolved by the server. Obtain URLs from captureScreenshot, saveImage, or listImages results.',
    }),
  ),
});
type DelegateTaskParams = Static<typeof DelegateTaskParams>;

export interface SubagentRunnerParams {
  task: string;
  context?: string;
  model?: "inherit" | "vision";
  imageUrls?: string[];
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
): AgentTool<typeof DelegateTaskParams> {
  return {
    name: "delegateTask",
    label: "Delegate Task",
    description:
      "Delegate a self-contained task to a short-lived subagent. The subagent works in the same workspace, may edit files, and returns a concise result. Use model: 'vision' + images to let a vision-model subagent analyze screenshots or images when your main model cannot see images.",
    parameters: DelegateTaskParams,
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

      try {
        const result = await runner(
          {
            task,
            context: args.context,
            model: args.model,
            imageUrls: args.images,
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
