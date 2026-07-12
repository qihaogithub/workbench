import * as fs from 'fs';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';
import { resolveVirtualKnowledgeFile } from './virtual-knowledge';
import { withPathPermissionCheck } from './permission-wrapper';
import {
  formatRuntimeValidationInstruction,
  validatePreviewFileWrite,
} from './preview-validation';

const ReadFileParams = Type.Object({
  path: Type.String({ description: 'Relative path to the file to read' }),
});
type ReadFileParams = Static<typeof ReadFileParams>;

export function createReadFileTool(config: AgentConfig): AgentTool<typeof ReadFileParams> {
  return {
    name: 'readFile',
    label: 'Read File',
    description: 'Read the contents of a file in the workspace',
    parameters: ReadFileParams,
    execute: withPathPermissionCheck(
      config,
      'readFile',
      (args) => args.path,
      async (toolCallId: string, args: ReadFileParams) => {
        const filePath = path.resolve(config.workingDir || '.', args.path);

        const virtualFile = resolveVirtualKnowledgeFile(args.path, config.workingDir || '');
        if (virtualFile) {
          logger.debug({ path: virtualFile.path }, 'Virtual system knowledge file read successfully');
          return {
            content: [{ type: 'text', text: virtualFile.content }],
            details: { path: virtualFile.path, size: virtualFile.content.length, virtual: true },
          };
        }

        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          logger.debug({ path: args.path }, 'File read successfully');
          return {
            content: [{ type: 'text', text: content }],
            details: { path: args.path, size: content.length },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ path: args.path, error: message }, 'Failed to read file');
          return {
            content: [{ type: 'text', text: `Error reading file: ${message}` }],
            details: { path: args.path, error: message },
            isError: true,
          };
        }
      },
    ),
  };
}

const WriteFileParams = Type.Object({
  path: Type.String({ description: 'Relative path to the file to write' }),
  content: Type.String({ description: 'Content to write to the file' }),
});
type WriteFileParams = Static<typeof WriteFileParams>;

export function createWriteFileTool(config: AgentConfig): AgentTool<typeof WriteFileParams> {
  return {
    name: 'writeFile',
    label: 'Write File',
    description: 'Write content to a file in the workspace',
    parameters: WriteFileParams,
    execute: withPathPermissionCheck(
      config,
      'writeFile',
      (args) => args.path,
      async (toolCallId: string, args: WriteFileParams) => {
        const filePath = path.resolve(config.workingDir || '.', args.path);
        const dir = path.dirname(filePath);

        try {
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.writeFile(filePath, args.content, 'utf-8');
          const runtimeValidation = validatePreviewFileWrite(args.path, args.content);
          logger.debug({ path: args.path }, 'File written successfully');
          const validationText = formatRuntimeValidationInstruction(runtimeValidation);
          return {
            content: [{ type: 'text', text: `Successfully wrote to ${args.path}${validationText}` }],
            details: { path: args.path, size: args.content.length, runtimeValidation },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ path: args.path, error: message }, 'Failed to write file');
          return {
            content: [{ type: 'text', text: `Error writing file: ${message}` }],
            details: { path: args.path, error: message },
            isError: true,
          };
        }
      },
    ),
  };
}

const ListFilesParams = Type.Object({
  path: Type.Optional(Type.String({ description: 'Relative path to the directory (default: current directory)' })),
});
type ListFilesParams = Static<typeof ListFilesParams>;

export function createListFilesTool(config: AgentConfig): AgentTool<typeof ListFilesParams> {
  return {
    name: 'listFiles',
    label: 'List Files',
    description: 'List files and directories in the workspace',
    parameters: ListFilesParams,
    execute: withPathPermissionCheck(
      config,
      'listFiles',
      (args) => args.path || '.',
      async (toolCallId: string, args: ListFilesParams) => {
        const dirPath = path.resolve(config.workingDir || '.', args.path || '.');

        try {
          const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
          const result = entries.map(entry => {
            const type = entry.isDirectory() ? 'directory' : 'file';
            return `${type}: ${entry.name}`;
          }).join('\n');

          logger.debug({ path: args.path || '.' }, 'Directory listed successfully');
          return {
            content: [{ type: 'text', text: result || 'Directory is empty' }],
            details: { path: args.path || '.', entries: entries.length },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ path: args.path || '.', error: message }, 'Failed to list directory');
          return {
            content: [{ type: 'text', text: `Error listing directory: ${message}` }],
            details: { path: args.path || '.', error: message },
            isError: true,
          };
        }
      },
    ),
  };
}
