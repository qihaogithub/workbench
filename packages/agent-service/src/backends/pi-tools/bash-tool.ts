import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';
import { spawn } from 'child_process';
import {
  getCommandPermissionResult,
  isLiveWorkspaceReadOnlyCommandAllowed,
  DEFAULT_WORKSPACE_PERMISSIONS,
} from './permissions';
import { resolveLiveWorkspaceMutationContext } from '../../workspace/workspace-mutation-authority';
import { truncateTail, formatSize } from './truncate';

/** Maximum allowed timeout in seconds (5 minutes) */
const MAX_TIMEOUT_SECONDS = 300;
/** Default timeout in seconds */
const DEFAULT_TIMEOUT_SECONDS = 30;
/** Throttle interval for onUpdate streaming (ms) */
const UPDATE_THROTTLE_MS = 100;

/**
 * Result type for bash tool — includes isError which AgentToolResult
 * accepts via structural typing but doesn't declare explicitly.
 */
interface BashToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, unknown>;
  isError?: boolean;
}

const BashParams = Type.Object({
  command: Type.String({ description: 'Shell command to execute' }),
  timeout: Type.Optional(
    Type.Number({
      description: `Timeout in seconds (optional, default: ${DEFAULT_TIMEOUT_SECONDS}, max: ${MAX_TIMEOUT_SECONDS}). Use a longer timeout for build or test commands.`,
    }),
  ),
});
type BashParams = Static<typeof BashParams>;

export function createBashTool(config: AgentConfig): AgentTool<typeof BashParams> {
  const permissions = config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS;
  return {
    name: 'bash',
    label: 'Bash',
    description: 'Execute a shell command in the workspace. Output is automatically truncated to the last 2000 lines or 50KB. Use the timeout parameter for long-running commands.',
    parameters: BashParams,
    execute: async (
      toolCallId: string,
      args: BashParams,
      signal?: AbortSignal,
      onUpdate?: (result: { content: Array<{ type: 'text'; text: string }>; details: Record<string, unknown> }) => void,
    ) => {
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

      const timeoutSeconds = args.timeout
        ? Math.min(Math.max(args.timeout, 1), MAX_TIMEOUT_SECONDS)
        : DEFAULT_TIMEOUT_SECONDS;
      const timeoutMs = timeoutSeconds * 1000;

      return new Promise<BashToolResult>((resolve) => {
        const child = spawn(command, {
          cwd: config.workingDir || process.cwd(),
          shell: true,
          env: { ...process.env, FORCE_COLOR: '0' },
        });

        let stdout = '';
        let stderr = '';
        let lastUpdateTime = 0;
        let settled = false;

        function sendUpdate() {
          if (!onUpdate || settled) return;
          const now = Date.now();
          if (now - lastUpdateTime < UPDATE_THROTTLE_MS) return;
          lastUpdateTime = now;
          const combined = stdout + stderr;
          if (!combined) return;
          const preview = truncateTail(combined, { maxLines: 50, maxBytes: 2048 });
          onUpdate({
            content: [{ type: 'text', text: preview.content }],
            details: { command, partial: true },
          });
        }

        child.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
          sendUpdate();
        });

        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
          sendUpdate();
        });

        const timer = setTimeout(() => {
          if (!settled && !child.killed) {
            child.kill('SIGKILL');
          }
        }, timeoutMs);

        // Abort signal support
        const onAbort = () => {
          if (!settled && !child.killed) {
            child.kill('SIGKILL');
          }
        };
        if (signal) {
          if (signal.aborted) {
            child.kill('SIGKILL');
          } else {
            signal.addEventListener('abort', onAbort, { once: true });
          }
        }

        child.on('close', (code, signalName) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }

          const wasAborted = signal?.aborted === true;
          const wasTimedOut = signalName === 'SIGKILL' && !wasAborted;

          // Combine output
          const combined = stdout + (stderr ? (stdout ? '\n' : '') + stderr : '');
          const truncResult = truncateTail(combined);

          let outputText = truncResult.content;
          if (truncResult.truncated) {
            const startLine = truncResult.totalLines - truncResult.outputLines + 1;
            outputText = `[Showing last ${truncResult.outputLines} lines / ${formatSize(truncResult.outputBytes)} of ${truncResult.totalLines} lines / ${formatSize(truncResult.totalBytes)}.]\n${outputText}`;
          }

          if (wasAborted) {
            logger.info({ command }, 'Command aborted by signal');
            resolve({
              content: [{ type: 'text', text: `Command aborted.\n${outputText}` }],
              details: {
                command,
                aborted: true,
                exitCode: code,
                outputLength: truncResult.outputBytes,
                truncated: truncResult.truncated,
              },
              isError: true,
            });
            return;
          }

          if (wasTimedOut) {
            logger.warn({ command, timeoutSeconds }, 'Command timed out');
            resolve({
              content: [{ type: 'text', text: `Command timed out after ${timeoutSeconds} seconds.\n${outputText}` }],
              details: {
                command,
                timedOut: true,
                exitCode: code,
                outputLength: truncResult.outputBytes,
                truncated: truncResult.truncated,
              },
              isError: true,
            });
            return;
          }

          if (code !== 0) {
            const errorText = outputText || stderr || `Command exited with code ${code}`;
            logger.debug({ command, exitCode: code }, 'Command exited with non-zero code');
            resolve({
              content: [{ type: 'text', text: errorText }],
              details: {
                command,
                exitCode: code,
                outputLength: truncResult.outputBytes,
                truncated: truncResult.truncated,
              },
              isError: true,
            });
            return;
          }

          logger.debug({ command, outputLength: truncResult.outputBytes }, 'Command executed');
          resolve({
            content: [{ type: 'text', text: outputText || 'Command executed successfully' }],
            details: {
              command,
              exitCode: code,
              outputLength: truncResult.outputBytes,
              truncated: truncResult.truncated,
            },
          });
        });

        child.on('error', (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }
          logger.error({ command, error: err.message }, 'Failed to spawn command');
          resolve({
            content: [{ type: 'text', text: `Error executing command: ${err.message}` }],
            details: { command, error: err.message },
            isError: true,
          });
        });
      });
    },
  };
}
