import * as fs from 'fs';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from './permissions';
import { resolveVirtualKnowledgeFile } from './virtual-knowledge';

const ReadFileParams = Type.Object({
  path: Type.String({ description: 'Relative path to the file to read' }),
});
type ReadFileParams = Static<typeof ReadFileParams>;

export function createReadFileTool(config: AgentConfig): AgentTool<typeof ReadFileParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: 'readFile',
    label: 'Read File',
    description: 'Read the contents of a file in the workspace',
    parameters: ReadFileParams,
    execute: async (toolCallId: string, args: ReadFileParams) => {
      const filePath = path.resolve(config.workingDir || '.', args.path);

      if (!isPathAllowed(args.path, config.workingDir || '', permissions)) {
        logger.warn({ path: args.path }, 'readFile denied by permissions');
        return {
          content: [{ type: 'text', text: `Error: path "${args.path}" is not allowed by workspace permissions` }],
          details: { path: args.path, error: 'permission denied' },
          isError: true,
        };
      }

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
  };
}

const WriteFileParams = Type.Object({
  path: Type.String({ description: 'Relative path to the file to write' }),
  content: Type.String({ description: 'Content to write to the file' }),
});
type WriteFileParams = Static<typeof WriteFileParams>;

export function createWriteFileTool(config: AgentConfig): AgentTool<typeof WriteFileParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: 'writeFile',
    label: 'Write File',
    description: 'Write content to a file in the workspace',
    parameters: WriteFileParams,
    execute: async (toolCallId: string, args: WriteFileParams) => {
      const filePath = path.resolve(config.workingDir || '.', args.path);
      const dir = path.dirname(filePath);

      if (!isPathAllowed(args.path, config.workingDir || '', permissions)) {
        logger.warn({ path: args.path }, 'writeFile denied by permissions');
        return {
          content: [{ type: 'text', text: `Error: path "${args.path}" is not allowed by workspace permissions` }],
          details: { path: args.path, error: 'permission denied' },
          isError: true,
        };
      }
      
      try {
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(filePath, args.content, 'utf-8');
        logger.debug({ path: args.path }, 'File written successfully');
        return {
          content: [{ type: 'text', text: `Successfully wrote to ${args.path}` }],
          details: { path: args.path, size: args.content.length },
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
  };
}

const ListFilesParams = Type.Object({
  path: Type.Optional(Type.String({ description: 'Relative path to the directory (default: current directory)' })),
});
type ListFilesParams = Static<typeof ListFilesParams>;

export function createListFilesTool(config: AgentConfig): AgentTool<typeof ListFilesParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: 'listFiles',
    label: 'List Files',
    description: 'List files and directories in the workspace',
    parameters: ListFilesParams,
    execute: async (toolCallId: string, args: ListFilesParams) => {
      const dirPath = path.resolve(config.workingDir || '.', args.path || '.');

      if (!isPathAllowed(args.path || '.', config.workingDir || '', permissions)) {
        logger.warn({ path: args.path || '.' }, 'listFiles denied by permissions');
        return {
          content: [{ type: 'text', text: `Error: path "${args.path || '.'}" is not allowed by workspace permissions` }],
          details: { path: args.path || '.', error: 'permission denied' },
          isError: true,
        };
      }
      
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
  };
}
