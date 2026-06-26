import { afterEach, describe, expect, it } from 'vitest';
import { createGetConsoleLogsTool } from '../../src/backends/pi-tools/console-tool';
import type { AgentConfig } from '../../src/core/types';
import { consoleBuffer, type ConsoleEntry } from '../../src/session/console-buffer';

describe('createGetConsoleLogsTool', () => {
  const config: AgentConfig = { sessionId: 'console-tool-test-session' };

  function entry(args: string, timestamp: number, level: ConsoleEntry['level'] = 'log'): ConsoleEntry {
    return { level, args, timestamp };
  }

  afterEach(() => {
    consoleBuffer.clear(config.sessionId);
  });

  it('没有日志时返回空结果提示', async () => {
    const tool = createGetConsoleLogsTool(config);

    const result = await tool.execute('tool-call-1', {});

    expect(result.content).toEqual([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('No console logs available'),
      }),
    ]);
    expect(result.details).toEqual({ count: 0, sessionId: config.sessionId });
  });

  it('按参数读取并格式化控制台日志', async () => {
    consoleBuffer.addEntry(config.sessionId, entry('first', Date.UTC(2026, 0, 1), 'log'));
    consoleBuffer.addEntry(config.sessionId, entry('boom', Date.UTC(2026, 0, 2), 'error'));
    consoleBuffer.addEntry(config.sessionId, entry('again', Date.UTC(2026, 0, 3), 'error'));
    const tool = createGetConsoleLogsTool(config);

    const result = await tool.execute('tool-call-1', { level: 'error', limit: 1 });

    expect(result.content).toEqual([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('[ERROR] again'),
      }),
    ]);
    expect(result.content[0]).toEqual(
      expect.not.objectContaining({
        text: expect.stringContaining('boom'),
      }),
    );
    expect(result.details).toEqual({ count: 1, filtered: true });
  });
});
