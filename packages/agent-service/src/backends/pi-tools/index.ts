import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { createReadFileTool, createWriteFileTool, createListFilesTool } from './file-tools';
import { createReadFileLinesTool } from './read-file-lines-tool';
import { createEditFileTool } from './edit-file-tool';
import { createBashTool } from './bash-tool';
import { createSchemaValidateTool } from './schema-tool';
import { createSaveImageTool } from "./save-image-tool";
import { createGetConsoleLogsTool } from "./console-tool";
import { createListImagesTool } from './list-images-tool';
import { createCaptureScreenshotTool } from './screenshot-tool';
import { createDeletePageTool, createDeletePagesTool, createListPagesTool, type PermissionHandler } from './delete-page-tool';
import { createDelegateTaskTool, type SubagentRunner } from './subagent-tool';

export type { PermissionHandler };
export type { SubagentRunner, SubagentRunResult } from './subagent-tool';

export interface WorkbenchToolsOptions {
  includeDelegateTask?: boolean;
  subagentRunner?: SubagentRunner;
}

export function createWorkbenchTools(
  config: AgentConfig,
  permissionHandler?: PermissionHandler,
  options: WorkbenchToolsOptions = {},
): AgentTool[] {
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
    createDeletePageTool(config, permissionHandler),
    createDeletePagesTool(config, permissionHandler),
  ];

  if (options.includeDelegateTask !== false && options.subagentRunner) {
    tools.push(createDelegateTaskTool(options.subagentRunner));
  }

  return tools;
}
