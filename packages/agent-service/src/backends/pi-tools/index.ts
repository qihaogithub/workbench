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

export function createWorkbenchTools(config: AgentConfig): AgentTool[] {
  return [
    createReadFileTool(config),
    createReadFileLinesTool(config),
    createEditFileTool(config),
    createWriteFileTool(config),
    createListFilesTool(config),
    createBashTool(config),
    createSchemaValidateTool(config),
    createSaveImageTool(config),
    createGetConsoleLogsTool(config),
    createListImagesTool(config),
  ];
}
