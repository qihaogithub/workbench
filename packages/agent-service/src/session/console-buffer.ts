export interface ConsoleEntry {
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: string;
  timestamp: number;
}

class ConsoleBuffer {
  private buffers = new Map<string, ConsoleEntry[]>();
  private readonly MAX_ENTRIES_PER_SESSION = 500;

  addEntry(sessionId: string, entry: ConsoleEntry): void {
    let buffer = this.buffers.get(sessionId);
    if (!buffer) {
      buffer = [];
      this.buffers.set(sessionId, buffer);
    }
    buffer.push(entry);
    if (buffer.length > this.MAX_ENTRIES_PER_SESSION) {
      buffer.splice(0, buffer.length - this.MAX_ENTRIES_PER_SESSION);
    }
  }

  getEntries(sessionId: string, options?: {
    level?: string;
    limit?: number;
    since?: number;
  }): ConsoleEntry[] {
    let entries = this.buffers.get(sessionId) || [];
    if (options?.level) {
      entries = entries.filter(e => e.level === options.level);
    }
    if (options?.since) {
      entries = entries.filter(e => e.timestamp >= options.since!);
    }
    if (options?.limit && options.limit > 0) {
      entries = entries.slice(-options.limit);
    }
    return entries;
  }

  clear(sessionId: string): void {
    this.buffers.delete(sessionId);
  }
}

export const consoleBuffer = new ConsoleBuffer();
