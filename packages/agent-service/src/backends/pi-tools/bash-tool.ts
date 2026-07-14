import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  getCommandPermissionResult,
  isLiveWorkspaceReadOnlyCommandAllowed,
  DEFAULT_WORKSPACE_PERMISSIONS,
} from './permissions';
import { resolveLiveWorkspaceMutationContext } from '../../workspace/workspace-mutation-authority';

const execAsync = promisify(exec);

const BashParams = Type.Object({
  command: Type.String({ description: 'Shell command to execute' }),
});
type BashParams = Static<typeof BashParams>;

export function createBashTool(config: AgentConfig): AgentTool<typeof BashParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: 'bash',
    label: 'Bash',
    description: 'Execute a shell command in the workspace',
    parameters: BashParams,
    execute: async (toolCallId: string, args: BashParams) => {
      const command = args.command.trim();

      const permResult = getCommandPermissionResult(command, permissions);
      if (!permResult.allowed) {
        const baseCommand = permResult.baseCommand || command.split(/\s+/)[0] || '';
        const detail = permResult.reason === 'node_eval_blocked'
          ? `"node -e" and "node --eval" are blocked for security reasons. Use readFile/writeFile/editFile tools instead.`
          : permResult.reason === 'npm_npx_blocked'
            ? `"npm" and "npx" are not allowed in the workspace sandbox.`
            : permResult.reason === 'denied_command'
              ? `command "${baseCommand}" is in the denied list.`
              : `command "${baseCommand}" is not in the allowed list.`;
        logger.warn({ command: baseCommand, reason: permResult.reason }, 'Command not allowed by permissions');
        return {
          content: [{ type: 'text', text: `Error: ${detail} Allowed: ${permissions.allowedCommands.join(', ')}. Denied: ${permissions.deniedCommands.join(', ')}` }],
          details: { command, error: 'permission denied', reason: permResult.reason },
          isError: true,
        };
      }

      const liveWorkspace = config.workingDir
        ? resolveLiveWorkspaceMutationContext(config.workingDir)
        : null;
      if (liveWorkspace && !isLiveWorkspaceReadOnlyCommandAllowed(command, permissions)) {
        const baseCommand = command.split(/\s+/)[0] || '';
        logger.warn({ command: baseCommand, workspaceId: liveWorkspace.workspaceId }, 'Live Workspace bash command blocked by Authority guard');
        return {
          content: [{ type: 'text', text: 'Error: live Workspace bash is read-only. File writes must go through Workspace Mutation Authority.' }],
          details: {
            command,
            error: 'WORKSPACE_AUTHORITY_REQUIRED',
            workspaceId: liveWorkspace.workspaceId,
            projectId: liveWorkspace.projectId,
          },
          isError: true,
        };
      }
      
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: config.workingDir || process.cwd(),
          timeout: 30000,
          maxBuffer: 1024 * 1024,
        });
        
        const output = stdout || stderr || 'Command executed successfully';
        logger.debug({ command, outputLength: output.length }, 'Command executed');
        return {
          content: [{ type: 'text', text: output }],
          details: { command, outputLength: output.length },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ command, error: message }, 'Failed to execute command');
        return {
          content: [{ type: 'text', text: `Error executing command: ${message}` }],
          details: { command, error: message },
          isError: true,
        };
      }
    },
  };
}
