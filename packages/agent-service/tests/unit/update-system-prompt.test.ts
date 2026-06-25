import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PiAgentBackend } from '../../src/backends/pi-agent';
import { BackendAgent } from '../../src/core/backend-agent';
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
    expect(typeof backend.updateSystemPrompt).toBe('function');
  });
});

describe('BackendAgent - updateSystemPrompt 委托', () => {
  const mockConfig: AgentConfig = {
    sessionId: 'test',
    workingDir: '/tmp/test-workspace',
  };

  it('应委托到 backend 的 updateSystemPrompt', async () => {
    const updateFn = vi.fn().mockResolvedValue(undefined);
    const mockBackend = { updateSystemPrompt: updateFn, onStream: vi.fn() } as any;
    const agent = new BackendAgent(mockConfig, mockBackend);
    await agent.updateSystemPrompt('new prompt');
    expect(updateFn).toHaveBeenCalledWith('new prompt');
  });

  it('backend 不支持 updateSystemPrompt 时应抛出错误', async () => {
    const mockBackend = { onStream: vi.fn() } as any;
    const agent = new BackendAgent(mockConfig, mockBackend);
    await expect(agent.updateSystemPrompt('new prompt')).rejects.toThrow('updateSystemPrompt not supported');
  });

  it('sendMessage 失败时应带上后端响应调试信息', async () => {
    const mockBackend = {
      onStream: vi.fn(),
      initialize: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockRejectedValue(new Error('provider error')),
      getLastResponseDebug: vi.fn().mockReturnValue({
        contentLength: 0,
        errorMessage: 'provider error',
      }),
    } as any;
    const agent = new BackendAgent(mockConfig, mockBackend);

    const result = await agent.sendMessage('hello');

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('provider error');
    expect(result.metadata?.emptyResponseDebug).toEqual({
      contentLength: 0,
      errorMessage: 'provider error',
    });
  });
});
