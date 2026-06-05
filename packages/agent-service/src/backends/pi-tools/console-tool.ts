import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { consoleBuffer } from '../../session/console-buffer';

const GetConsoleLogsParams = Type.Object({
  level: Type.Optional(
    Type.Union([
      Type.Literal('log'),
      Type.Literal('warn'),
      Type.Literal('error'),
      Type.Literal('info'),
      Type.Literal('debug'),
    ], { description: 'Filter by log level. If omitted, returns all levels.' })
  ),
  limit: Type.Optional(
    Type.Number({ description: 'Return the most recent N log entries. Default 50, max 200.', minimum: 1, maximum: 200, default: 50 })
  ),
  since: Type.Optional(
    Type.Number({ description: 'Unix timestamp in milliseconds. Only return entries after this time.' })
  ),
});
type GetConsoleLogsParamsType = Static<typeof GetConsoleLogsParams>;

export function createGetConsoleLogsTool(config: AgentConfig): AgentTool<typeof GetConsoleLogsParams> {
  return {
    name: 'getConsoleLogs',
    label: 'Get Console Logs',
    description:
      'Get console output (console.log/warn/error/info/debug) from the iframe preview sandbox. ' +
      'Use this to debug runtime issues in the user preview. Returns the most recent console log entries. ' +
      'Note: Only contains logs produced after the page was loaded. If the user has not opened the preview yet, the result may be empty.',
    parameters: GetConsoleLogsParams,
    execute: async (_toolCallId: string, args: GetConsoleLogsParamsType) => {
      const entries = consoleBuffer.getEntries(config.sessionId, {
        level: args.level,
        limit: args.limit ?? 50,
        since: args.since,
      });

      if (entries.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No console logs available. The user may not have opened the preview yet.' }],
          details: { count: 0, sessionId: config.sessionId },
        };
      }

      const formatted = entries
        .map(e => `[${new Date(e.timestamp).toISOString()}] [${e.level.toUpperCase()}] ${e.args}`)
        .join('\n');

      return {
        content: [{
          type: 'text' as const,
          text: `Console Logs (${entries.length} entries):\n\n${formatted}`,
        }],
        details: { count: entries.length, filtered: !!(args.level || args.since) },
      };
    },
  };
}
