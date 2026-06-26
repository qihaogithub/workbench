import * as fs from 'fs';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from './permissions';
import { resolveVirtualKnowledgeFile } from './virtual-knowledge';

const ReadFileLinesParams = Type.Object({
  path: Type.String({ description: 'Relative path to the file to read' }),
  startLine: Type.Optional(Type.Number({ description: 'Start line number (1-based, inclusive). Defaults to 1', minimum: 1 })),
  endLine: Type.Optional(Type.Number({ description: 'End line number (1-based, inclusive). Defaults to last line', minimum: 1 })),
});
type ReadFileLinesParams = Static<typeof ReadFileLinesParams>;

export function createReadFileLinesTool(config: AgentConfig): AgentTool<typeof ReadFileLinesParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: 'readFileWithLines',
    label: 'Read File With Lines',
    description:
      'Read file contents with line numbers. Supports reading a specific line range via startLine/endLine parameters (1-based, inclusive). Useful for precisely locating code to edit.',
    parameters: ReadFileLinesParams,
    execute: async (toolCallId: string, args: ReadFileLinesParams) => {
      const filePath = path.resolve(config.workingDir || '.', args.path);

      if (!isPathAllowed(args.path, config.workingDir || '', permissions)) {
        logger.warn({ path: args.path }, 'readFileWithLines denied by permissions');
        return {
          content: [{ type: 'text', text: `Error: path "${args.path}" is not allowed by workspace permissions` }],
          details: { path: args.path, error: 'permission denied' },
          isError: true,
        };
      }

      try {
        const virtualFile = resolveVirtualKnowledgeFile(args.path, config.workingDir || '');
        const content = virtualFile
          ? virtualFile.content
          : await fs.promises.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const totalLines = lines.length;

        const start = args.startLine ?? 1;
        const end = args.endLine ?? totalLines;

        const clampedStart = Math.max(1, start);
        const clampedEnd = Math.min(totalLines, end);

        if (clampedStart > clampedEnd) {
          return {
            content: [{ type: 'text', text: `Error: invalid line range (start=${start}, end=${end}). File has ${totalLines} lines.` }],
            details: { path: args.path, error: 'invalid range' },
            isError: true,
          };
        }

        const selectedLines = lines.slice(clampedStart - 1, clampedEnd);
        const numberedContent = selectedLines
          .map((line, i) => `${clampedStart + i}→${line}`)
          .join('\n');

        const displayPath = virtualFile?.path || args.path;
        const header = `File: ${displayPath} (${totalLines} lines total, showing ${clampedStart}-${clampedEnd})`;

        logger.debug({ path: displayPath, startLine: clampedStart, endLine: clampedEnd, virtual: Boolean(virtualFile) }, 'File read with lines successfully');
        return {
          content: [{ type: 'text', text: `${header}\n${numberedContent}` }],
          details: { path: displayPath, totalLines, startLine: clampedStart, endLine: clampedEnd, virtual: Boolean(virtualFile) },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ path: args.path, error: message }, 'Failed to read file with lines');
        return {
          content: [{ type: 'text', text: `Error reading file: ${message}` }],
          details: { path: args.path, error: message },
          isError: true,
        };
      }
    },
  };
}
