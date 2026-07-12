import * as fs from 'fs';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';
import { withPathPermissionCheck } from './permission-wrapper';
import {
  formatRuntimeValidationInstruction,
  validatePreviewFileWrite,
} from './preview-validation';

const EditFileParams = Type.Object({
  path: Type.String({ description: 'Relative path to the file to edit' }),
  old_string: Type.String({ description: 'The exact text to find and replace. Must match exactly, including whitespace and indentation.' }),
  new_string: Type.String({ description: 'The text to replace old_string with. Use empty string to delete the matched text.' }),
});
type EditFileParams = Static<typeof EditFileParams>;

export function createEditFileTool(config: AgentConfig): AgentTool<typeof EditFileParams> {
  return {
    name: 'editFile',
    label: 'Edit File',
    description:
      'Make a precise edit to a file by replacing an exact text match. Finds old_string in the file and replaces it with new_string. The old_string must match exactly (including whitespace and indentation). Prefer this over writeFile for making targeted changes to existing files, as it preserves the rest of the file and reduces token usage.',
    parameters: EditFileParams,
    execute: withPathPermissionCheck(
      config,
      'editFile',
      (args) => args.path,
      async (toolCallId: string, args: EditFileParams) => {
        const filePath = path.resolve(config.workingDir || '.', args.path);

        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');

          const matchIndex = content.indexOf(args.old_string);
          if (matchIndex === -1) {
            const lines = content.split('\n');
            const totalLines = lines.length;
            const previewLines = lines.slice(0, Math.min(20, totalLines));
            const preview = previewLines.map((line, i) => `${i + 1}→${line}`).join('\n');

            logger.warn({ path: args.path }, 'editFile: old_string not found');
            return {
              content: [{
                type: 'text',
                text: `Error: old_string not found in ${args.path}. Ensure the text matches exactly, including whitespace and indentation. File has ${totalLines} lines. First 20 lines:\n${preview}`,
              }],
              details: { path: args.path, error: 'old_string not found' },
              isError: true,
            };
          }

          const secondMatchIndex = content.indexOf(args.old_string, matchIndex + 1);
          if (secondMatchIndex !== -1) {
            const beforeFirst = content.substring(0, matchIndex);
            const lineNum1 = beforeFirst.split('\n').length;
            const beforeSecond = content.substring(0, secondMatchIndex);
            const lineNum2 = beforeSecond.split('\n').length;

            logger.warn({ path: args.path }, 'editFile: old_string has multiple matches');
            return {
              content: [{
                type: 'text',
                text: `Error: old_string appears multiple times in ${args.path} (found at lines ${lineNum1} and ${lineNum2}). Provide more surrounding context in old_string to make the match unique.`,
              }],
              details: { path: args.path, error: 'multiple matches', lineNum1, lineNum2 },
              isError: true,
            };
          }

          const newContent = content.substring(0, matchIndex) + args.new_string + content.substring(matchIndex + args.old_string.length);

          await fs.promises.writeFile(filePath, newContent, 'utf-8');

          const beforeMatch = content.substring(0, matchIndex);
          const lineNumber = beforeMatch.split('\n').length;

          const oldLineCount = args.old_string.split('\n').length;
          const newLineCount = args.new_string.split('\n').length;

          const runtimeValidation = validatePreviewFileWrite(args.path, newContent);
          logger.debug({ path: args.path, lineNumber }, 'File edited successfully');
          const validationText = formatRuntimeValidationInstruction(runtimeValidation);
          return {
            content: [{
              type: 'text',
              text: `Successfully edited ${args.path} at line ${lineNumber} (${oldLineCount} line(s) replaced with ${newLineCount} line(s))${validationText}`,
            }],
            details: { path: args.path, lineNumber, oldLineCount, newLineCount, runtimeValidation },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ path: args.path, error: message }, 'Failed to edit file');
          return {
            content: [{ type: 'text', text: `Error editing file: ${message}` }],
            details: { path: args.path, error: message },
            isError: true,
          };
        }
      },
    ),
  };
}
