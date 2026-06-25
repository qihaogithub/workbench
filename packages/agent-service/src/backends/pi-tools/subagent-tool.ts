import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { FileChange } from '../../core/types';

const DelegateTaskParams = Type.Object({
  task: Type.String({
    description: 'A concrete task for a short-lived subagent to complete in the current workspace',
    minLength: 1,
  }),
  context: Type.Optional(Type.String({
    description: 'Optional extra context, constraints, or files the subagent should consider',
  })),
});
type DelegateTaskParams = Static<typeof DelegateTaskParams>;

export interface SubagentRunResult {
  success: boolean;
  content: string;
  files?: FileChange[];
  durationMs: number;
}

export type SubagentRunner = (
  params: DelegateTaskParams,
  signal?: AbortSignal,
) => Promise<SubagentRunResult>;

export function createDelegateTaskTool(
  runner: SubagentRunner,
): AgentTool<typeof DelegateTaskParams> {
  return {
    name: 'delegateTask',
    label: 'Delegate Task',
    description:
      'Delegate a self-contained investigation or implementation task to a short-lived subagent. The subagent works in the same workspace, may edit files, and returns a concise result.',
    parameters: DelegateTaskParams,
    executionMode: 'parallel',
    execute: async (_toolCallId: string, args: DelegateTaskParams, signal?: AbortSignal) => {
      const task = args.task.trim();
      if (!task) {
        return {
          content: [{ type: 'text', text: 'Error: task must not be empty' }],
          details: { success: false, error: 'empty task' },
          isError: true,
        };
      }

      try {
        const result = await runner({ task, context: args.context }, signal);
        return {
          content: [{ type: 'text', text: result.content || 'Subagent completed without textual output.' }],
          details: result,
          isError: !result.success,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error running subagent: ${message}` }],
          details: { success: false, error: message },
          isError: true,
        };
      }
    },
  };
}
