import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import {
  createReadFileTool,
  createWriteFileTool,
  createListFilesTool,
} from "./file-tools";
import { createReadFileLinesTool } from "./read-file-lines-tool";
import { createReadUploadedFileTool } from "./read-uploaded-file-tool";
import { createEditFileTool } from "./edit-file-tool";
import { createBashTool } from "./bash-tool";
import { createSchemaValidateTool } from "./schema-tool";
import { createSaveImageTool } from "./save-image-tool";
import { createGetConsoleLogsTool } from "./console-tool";
import { createCaptureScreenshotTool } from "./screenshot-tool";
import { createListImagesTool } from "./list-images-tool";
import { createKnowledgeReportTool } from "./knowledge-report-tool";
import { createReadPreinstalledSkillTool } from "./read-preinstalled-skill-tool";
import { createArrangeCanvasPagesTool } from "./canvas-layout-tool";
import { createDingtalkTool } from "./dingtalk-tool";
import { createFigmaMcpTool } from "./figma-mcp-tool";
import {
  createBindSketchConfigTool,
  createConvertSketchPageTool,
  createCreateSketchNodesTool,
  createPatchSketchSceneTool,
  createReadSketchSceneTool,
} from "./sketch-scene-tool";
import { createWebSearchTool, isWebSearchEnabled } from "./web-search-tool";
import { createWebReadTool, isWebReadEnabled } from "./web-read-tool";
import {
  createRequestPlanApprovalTool,
  type PlanApprovalHandler,
} from "./plan-approval-tool";
import {
  createRequestUserChoiceTool,
  type UserChoiceHandler,
} from "./user-choice-tool";
import { createUpdatePlanTool } from "./plan-tool";
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

export const WORKBENCH_TOOL_VERSION = 19;

const SKETCH_SCENE_TOOLS_ENABLED =
  process.env.PI_AGENT_SKETCH_TOOLS_ENABLED === "true";

export type { PermissionHandler };
export type { SubagentRunner, SubagentRunResult } from "./subagent-tool";

export interface WorkbenchToolsOptions {
  includeDelegateTask?: boolean;
  subagentRunner?: SubagentRunner;
  includePlanApproval?: boolean;
  planApprovalHandler?: PlanApprovalHandler;
  includeUserChoice?: boolean;
  userChoiceHandler?: UserChoiceHandler;
  mode?: "workbench" | "viewer-readonly";
}

export function createWorkbenchTools(
  config: AgentConfig,
  permissionHandler?: PermissionHandler,
  options: WorkbenchToolsOptions = {},
): AgentTool[] {
  if (options.mode === "viewer-readonly") {
    return [
      createReadFileTool(config),
      createReadFileLinesTool(config),
      createListFilesTool(config),
      createKnowledgeReportTool(config, { mode: "viewer-readonly" }),
    ];
  }

  const deletionPlanStore = createDeletionPlanStore();
  const tools: AgentTool[] = [
    createReadFileTool(config),
    createReadFileLinesTool(config),
    createReadUploadedFileTool(config),
    createEditFileTool(config),
    createWriteFileTool(config),
    createListFilesTool(config),
    createBashTool(config),
    createSchemaValidateTool(config),
    createSaveImageTool(config),
    createGetConsoleLogsTool(config),
    createCaptureScreenshotTool(config),
    createListImagesTool(config),
    createKnowledgeReportTool(config),
    createReadPreinstalledSkillTool(),
    createArrangeCanvasPagesTool(config),
    ...(SKETCH_SCENE_TOOLS_ENABLED
      ? [
          createReadSketchSceneTool(config),
          createPatchSketchSceneTool(config),
          createCreateSketchNodesTool(config),
          createBindSketchConfigTool(config),
          createConvertSketchPageTool(config),
        ]
      : []),
    ...(isWebReadEnabled() ? [createWebReadTool()] : []),
    ...(isWebSearchEnabled() ? [createWebSearchTool()] : []),
    createFigmaMcpTool(config, permissionHandler),
    createDingtalkTool(config, permissionHandler),
    ...(options.includePlanApproval === false
      ? []
      : [createRequestPlanApprovalTool(options.planApprovalHandler)]),
    ...(options.includeUserChoice === false
      ? []
      : [createRequestUserChoiceTool(options.userChoiceHandler)]),
    createUpdatePlanTool(),
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
    tools.push(createDelegateTaskTool(options.subagentRunner, config));
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

export function getViewerReadonlyToolCapabilities(): {
  toolVersion: number;
  toolNames: string[];
} {
  const tools = createWorkbenchTools(
    { sessionId: "viewer-readonly-capabilities" },
    undefined,
    {
      includeDelegateTask: false,
      includePlanApproval: false,
      mode: "viewer-readonly",
    },
  );
  return {
    toolVersion: WORKBENCH_TOOL_VERSION,
    toolNames: tools.map((tool) => tool.name),
  };
}
