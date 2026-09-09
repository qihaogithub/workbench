import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import {
  createActivateCapabilitiesTool,
  type CapabilityActivationHandler,
  type CapabilityName,
} from "./capability-activation-tool";
import {
  createReadFileTool,
  createWriteFileTool,
  createListFilesTool,
} from "./file-tools";
import { createDeleteFileTool } from "./delete-file-tool";
import { createReadUploadedFileTool } from "./read-uploaded-file-tool";
import { createEditFileTool } from "./edit-file-tool";
import { createBashTool } from "./bash-tool";
import { createSchemaValidateTool } from "./schema-tool";
import { createSaveImageTool } from "./save-image-tool";
import { createGetConsoleLogsTool } from "./console-tool";
import { createCaptureScreenshotTool } from "./screenshot-tool";
import { createListImagesTool } from "./list-images-tool";
import { createReadUserImageTool } from "./read-user-image-tool";
import { createKnowledgeReportTool } from "./knowledge-report-tool";
import { createReadKnowledgeSourceTool } from "./read-knowledge-source-tool";
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
import { createCreatePageTool } from "./create-page-tool";
import { createDelegateTaskTool, type SubagentRunner } from "./subagent-tool";
import { createGenerateImageTool } from "./generate-image-tool";
import { createExtractImageElementTool } from "./extract-image-element-tool";
import { getImageGenConfig } from "../../services/image-gen-config";
import {
  createReadCommentsTool,
  createInspectElementTool,
  createReplyCommentTool,
  createResolveCommentTool,
} from "./comment-tools";
import { createSubmitFeedbackTool } from "./feedback-tool";
import {
  createApplyWhiteboardActionsTool,
  createGenerateWhiteboardAssetTool,
  createImportWhiteboardCodeTool,
  createPlanWhiteboardCompositionTool,
  createReadWhiteboardContextTool,
  createSerializeWhiteboardCodeTool,
  createUndoWhiteboardEditTool,
} from "./whiteboard-tool";
import {
  createCommitConfigVisibilityDraftTool,
  createExplainConfigVisibilityTool,
  createInspectConfigVisibilityTool,
  createMigrateConfigVisibilityTool,
  createPrepareConfigVisibilityDraftTool,
  createRepairConfigVisibilityTool,
  createValidateConfigVisibilityTool,
} from "./visibility-tools";
import type { ConfigVisibilityApprovalHandler } from "./visibility-tools";

export const WORKBENCH_TOOL_VERSION = 34;

const SKETCH_SCENE_TOOLS_ENABLED =
  process.env.PI_AGENT_SKETCH_TOOLS_ENABLED === "true";
const WHITEBOARD_TOOLS_ENABLED =
  process.env.PI_AGENT_WHITEBOARD_TOOLS_ENABLED === "true";

export type { PermissionHandler };
export type { SubagentRunner, SubagentRunResult } from "./subagent-tool";

export interface WorkbenchToolsOptions {
  includeDelegateTask?: boolean;
  subagentRunner?: SubagentRunner;
  includePlanApproval?: boolean;
  planApprovalHandler?: PlanApprovalHandler;
  configVisibilityApprovalHandler?: ConfigVisibilityApprovalHandler;
  includeUserChoice?: boolean;
  userChoiceHandler?: UserChoiceHandler;
  mode?: "workbench" | "viewer-readonly";
  /** 图片子 Agent 定向工具集：只包含图像相关工具 */
  imageSubagent?: boolean;
  capabilityActivationHandler?: CapabilityActivationHandler;
  /** Omit visual screenshot capability when the service/Chromium health check failed. */
  includeScreenshot?: boolean;
}

const CONTROL_TOOL_NAMES = new Set([
  "readPreinstalledSkill",
  "requestPlanApproval",
  "requestUserChoice",
  "updatePlan",
  "submitFeedback",
]);

const CAPABILITY_TOOL_NAMES: Record<Exclude<CapabilityName, "all">, ReadonlySet<string>> = {
  workspace: new Set(["readFile", "readUploadedFile", "listFiles", "editFile", "writeFile", "deleteFile", "bash", "schemaValidate", "inspectConfigVisibility", "validateConfigVisibility", "explainConfigVisibility", "repairConfigVisibility", "migrateConfigVisibility", "prepareConfigVisibilityDraft", "commitConfigVisibilityDraft", "knowledgeReport", "readKnowledgeSource", "getConsoleLogs", "captureScreenshot", "readWhiteboardContext", "applyWhiteboardActions", "serializeWhiteboardCode", "importWhiteboardCode", "planWhiteboardComposition", "undoWhiteboardEdit"]),
  pages: new Set(["createPage", "listPages", "arrangeCanvasPages", "previewDeletePages", "executeDeletePagePlan", "deletePage", "deletePages"]),
  comments: new Set(["readComments", "inspectElement", "replyComment", "resolveComment", "submitFeedback"]),
  image: new Set(["saveImage", "listImages", "readUserImage", "captureScreenshot", "delegateTask", "generateWhiteboardAsset"]),
  web: new Set(["webRead", "webSearch"]),
  external: new Set(["figmaMcp", "dingtalk"]),
};

const INITIAL_TOOL_NAMES = new Set([
  "readFile", "readUploadedFile", "listFiles", "readPreinstalledSkill",
  "activateCapabilities", "requestPlanApproval", "requestUserChoice", "updatePlan",
]);

export function formatCapabilityDirectory(): string {
  const entries = [
    "- `workspace`：文件编辑、命令、校验、配置联动上下文/规则草稿、知识、诊断，以及（启用时）白板 document/代码/语义 action、只读 composition plan 与可确认撤销。",
    "- `pages`：原子创建页面、页面列表、画布整理和受确认的页面删除。",
    "- `comments`：评论读取、定位、回复和解决。",
    "- `image`：图片素材、截图、白板候选资产与图像子 Agent。",
    "- `web`：公开网页阅读与联网搜索（取决于服务端配置）。",
    "- `external`：已配置的 Figma、钉钉等外部集成。",
  ];
  return [
    "## 按需能力",
    "",
    ...entries,
    "",
    "需要当前未列出的能力时，先调用 `activateCapabilities`，再继续当前任务。加载由服务端自动完成，不向用户索取授权，也不改变既有工具权限。",
  ].join("\n");
}

export function getInitialActiveToolNames(tools: AgentTool[]): string[] {
  return tools.filter((tool) => INITIAL_TOOL_NAMES.has(tool.name)).map((tool) => tool.name);
}

export function resolveCapabilityToolNames(
  tools: AgentTool[],
  capabilities: CapabilityName[],
): string[] {
  const requested = capabilities.includes("all")
    ? new Set(tools.map((tool) => tool.name))
    : new Set(
        capabilities
          .filter((capability): capability is Exclude<CapabilityName, "all"> => capability !== "all")
          .flatMap((capability) => [...CAPABILITY_TOOL_NAMES[capability]]),
      );
  for (const name of CONTROL_TOOL_NAMES) requested.add(name);
  requested.add("activateCapabilities");
  return tools.filter((tool) => requested.has(tool.name)).map((tool) => tool.name);
}

export function createWorkbenchTools(
  config: AgentConfig,
  permissionHandler?: PermissionHandler,
  options: WorkbenchToolsOptions = {},
): AgentTool[] {
  if (options.mode === "viewer-readonly") {
    return [
      createReadFileTool(config),
      createListFilesTool(config),
      createKnowledgeReportTool(config, { mode: "viewer-readonly" }),
      createSubmitFeedbackTool(config, "viewer-readonly"),
    ];
  }

  if (options.imageSubagent) {
    return [
      createReadFileTool(config),
      createWriteFileTool(config),
      createListFilesTool(config),
      createSaveImageTool(config),
      createListImagesTool(config),
      createReadUserImageTool(),
      createGenerateImageTool(config),
      createExtractImageElementTool(config),
    ];
  }

  const deletionPlanStore = createDeletionPlanStore();
  const tools: AgentTool[] = [
    createReadFileTool(config),
    createReadUploadedFileTool(config),
    createEditFileTool(config),
    createWriteFileTool(config),
    createDeleteFileTool(config),
    createListFilesTool(config),
    createBashTool(config),
    createSchemaValidateTool(config),
    createSaveImageTool(config),
    createGetConsoleLogsTool(config),
    ...(options.includeScreenshot === false ? [] : [createCaptureScreenshotTool(config)]),
    createListImagesTool(config),
    createReadUserImageTool(),
    createKnowledgeReportTool(config),
    createReadKnowledgeSourceTool(config),
    createReadPreinstalledSkillTool(),
    createInspectConfigVisibilityTool(config),
    createValidateConfigVisibilityTool(config),
    createExplainConfigVisibilityTool(config),
    createRepairConfigVisibilityTool(config),
    createMigrateConfigVisibilityTool(config),
    createPrepareConfigVisibilityDraftTool(config),
    createCommitConfigVisibilityDraftTool(config, options.configVisibilityApprovalHandler),
    createActivateCapabilitiesTool(options.capabilityActivationHandler),
    createArrangeCanvasPagesTool(config),
    ...(WHITEBOARD_TOOLS_ENABLED
      ? [
          createReadWhiteboardContextTool(config),
          createApplyWhiteboardActionsTool(config, permissionHandler),
          createSerializeWhiteboardCodeTool(config),
          createImportWhiteboardCodeTool(config, permissionHandler),
          createPlanWhiteboardCompositionTool(config),
          createGenerateWhiteboardAssetTool(config),
          createUndoWhiteboardEditTool(config, permissionHandler),
        ]
      : []),
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
    createCreatePageTool(config),
    createListPagesTool(config),
    createPreviewDeletePagesTool(config, deletionPlanStore),
    createExecuteDeletePagePlanTool(
      config,
      deletionPlanStore,
      permissionHandler,
    ),
    createDeletePageTool(config, permissionHandler),
    createDeletePagesTool(config, permissionHandler),
    createReadCommentsTool(config),
    createInspectElementTool(config),
    createReplyCommentTool(config),
    createResolveCommentTool(config),
    createSubmitFeedbackTool(config, "workbench"),
  ];

  if (options.includeDelegateTask !== false && options.subagentRunner) {
    tools.push(
      createDelegateTaskTool(options.subagentRunner, config, {
        imageSubagentEnabled: getImageGenConfig().enabled,
      }),
    );
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
