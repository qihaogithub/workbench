import { describe, expect, it } from 'vitest';
import { consoleBuffer, type ConsoleEntry } from '../../src/session/console-buffer';

describe('consoleBuffer', () => {
  const sessionId = 'console-buffer-test-session';

  function entry(index: number, level: ConsoleEntry['level'] = 'log'): ConsoleEntry {
    return {
      level,
      args: `message-${index}`,
      timestamp: 1_700_000_000_000 + index,
    };
  }

  it('按会话保存日志并支持级别、时间和数量过滤', () => {
    consoleBuffer.clear(sessionId);
    consoleBuffer.addEntry(sessionId, entry(1, 'log'));
    consoleBuffer.addEntry(sessionId, entry(2, 'error'));
    consoleBuffer.addEntry(sessionId, entry(3, 'warn'));

    expect(consoleBuffer.getEntries(sessionId, { level: 'error' })).toEqual([entry(2, 'error')]);
    expect(consoleBuffer.getEntries(sessionId, { since: entry(2).timestamp })).toEqual([
      entry(2, 'error'),
      entry(3, 'warn'),
    ]);
    expect(consoleBuffer.getEntries(sessionId, { limit: 2 })).toEqual([
      entry(2, 'error'),
      entry(3, 'warn'),
    ]);

    consoleBuffer.clear(sessionId);
  });

  it('每个会话最多保留最近 500 条日志，清理后不再返回旧数据', () => {
    consoleBuffer.clear(sessionId);

    for (let index = 1; index <= 505; index += 1) {
      consoleBuffer.addEntry(sessionId, entry(index));
    }

    const entries = consoleBuffer.getEntries(sessionId);
    expect(entries).toHaveLength(500);
    expect(entries[0]).toEqual(entry(6));
    expect(entries[499]).toEqual(entry(505));

    consoleBuffer.clear(sessionId);
    expect(consoleBuffer.getEntries(sessionId)).toEqual([]);
  });
});
