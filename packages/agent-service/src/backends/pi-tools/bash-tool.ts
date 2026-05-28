import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const ALLOWED_COMMANDS = ['npm', 'node', 'npx', 'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc', 'echo'];

const BashParams = Type.Object({
  command: Type.String({ description: 'Shell command to execute' }),
});
type BashParams = Static<typeof BashParams>;

export function createBashTool(config: AgentConfig): AgentTool<typeof BashParams> {
  return {
    name: 'bash',
    label: 'Bash',
    description: 'Execute a shell command in the workspace',
    parameters: BashParams,
    execute: async (toolCallId: string, args: BashParams) => {
      const command = args.command.trim();
      const baseCommand = command.split(/\s+/)[0];
      
      if (!ALLOWED_COMMANDS.includes(baseCommand)) {
        logger.warn({ command: baseCommand }, 'Command not in allowed list');
        return {
          content: [{ type: 'text', text: `Error: Command "${baseCommand}" is not allowed. Allowed commands: ${ALLOWED_COMMANDS.join(', ')}` }],
          details: { command, error: 'Command not allowed' },
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
