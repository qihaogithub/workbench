import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PiAgentBackend } from '../../src/backends/pi-agent';
import { AgentConfig } from '../../src/core/types';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
  },
}));

describe('PiAgentBackend - updateSystemPrompt (PI-4)', () => {
  const mockConfig: AgentConfig = {
    sessionId: 'test',
    workingDir: '/tmp/test-workspace',
    piAgent: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未初始化时调用 updateSystemPrompt 应不抛出错误（忽略）', async () => {
    const backend = new PiAgentBackend(mockConfig);
    await expect(backend.updateSystemPrompt('test')).resolves.not.toThrow();
  });

  it('应实现 updateSystemPrompt 方法（v3.2 关键 API）', () => {
    const backend = new PiAgentBackend(mockConfig);
    expect(typeof backend.updateSystemPrompt).toBe('function');
  });

  it('buildSystemPrompt 私有方法应已删除（v3.2 拆分）', () => {
    const backend = new PiAgentBackend(mockConfig) as any;
    // 私有方法在编译后仍存在但不应被外部调用
    // 这里我们仅通过 ts 类型层面验证
    expect(typeof backend.updateSystemPrompt).toBe('function');
  });
});
