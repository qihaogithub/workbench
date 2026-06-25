import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import {
  createReadFileTool,
  createWriteFileTool,
  createListFilesTool,
} from "./file-tools";
import { createReadFileLinesTool } from "./read-file-lines-tool";
import { createEditFileTool } from "./edit-file-tool";
import { createBashTool } from "./bash-tool";
import { createSchemaValidateTool } from "./schema-tool";
import { createSaveImageTool } from "./save-image-tool";
import { createGetConsoleLogsTool } from "./console-tool";
import { createCaptureScreenshotTool } from "./screenshot-tool";
import { createListImagesTool } from "./list-images-tool";
import {
  createDeletePageTool,
  createDeletePagesTool,
  createDeletionPlanStore,
  createExecuteDeletePagePlanTool,
  createListPagesTool,
  createPreviewDeletePagesTool,
  type PermissionHandler,
} from "./delete-page-tool";
import { createDelegateTaskTool, type SubagentRunner } from "./subagent-tool";

export const WORKBENCH_TOOL_VERSION = 3;

export type { PermissionHandler };
export type { SubagentRunner, SubagentRunResult } from "./subagent-tool";

export interface WorkbenchToolsOptions {
  includeDelegateTask?: boolean;
  subagentRunner?: SubagentRunner;
}

export function createWorkbenchTools(
  config: AgentConfig,
  permissionHandler?: PermissionHandler,
  options: WorkbenchToolsOptions = {},
): AgentTool[] {
  const deletionPlanStore = createDeletionPlanStore();
  const tools: AgentTool[] = [
    createReadFileTool(config),
    createReadFileLinesTool(config),
    createEditFileTool(config),
    createWriteFileTool(config),
    createListFilesTool(config),
    createBashTool(config),
    createSchemaValidateTool(config),
    createSaveImageTool(config),
    createGetConsoleLogsTool(config),
    createCaptureScreenshotTool(config),
    createListImagesTool(config),
    createListPagesTool(config),
    createPreviewDeletePagesTool(config, deletionPlanStore),
    createExecuteDeletePagePlanTool(
      config,
      deletionPlanStore,
      permissionHandler,
    ),
    createDeletePageTool(config, permissionHandler),
    createDeletePagesTool(config, permissionHandler),
  ];

  if (options.includeDelegateTask !== false && options.subagentRunner) {
    tools.push(createDelegateTaskTool(options.subagentRunner));
  }

  return tools;
}

export function getWorkbenchToolCapabilities(): {
  toolVersion: number;
  toolNames: string[];
} {
  const tools = createWorkbenchTools({ sessionId: "capabilities" }, undefined, {
    includeDelegateTask: false,
  });
  return {
    toolVersion: WORKBENCH_TOOL_VERSION,
    toolNames: tools.map((tool) => tool.name),
  };
}
