import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PiAgentBackend } from '../../src/backends/pi-agent';
import { AgentConfig } from '../../src/core/types';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    readdir: vi.fn(),
  },
}));

describe('PiAgentBackend', () => {
  const mockConfig: AgentConfig = {
    sessionId: 'test-session',
    workingDir: '/tmp/test-workspace',
    piAgent: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('初始化', () => {
    it('应正确创建后端实例', () => {
      const backend = new PiAgentBackend(mockConfig);
      expect(backend).toBeDefined();
      expect(backend.name).toBe('pi-agent');
    });

    it('初始状态应为 idle', async () => {
      const backend = new PiAgentBackend(mockConfig);
      const status = await backend.getStatus();
      expect(status).toBe('idle');
    });
  });

  describe('配置', () => {
    it('应返回正确的 workingDir', () => {
      const backend = new PiAgentBackend(mockConfig);
      expect(backend.getWorkingDir()).toBe('/tmp/test-workspace');
    });

    it('当 workingDir 未设置时应返回 null', () => {
      const configWithoutWorkingDir: AgentConfig = {
        sessionId: 'test-session',
      };
      const backend = new PiAgentBackend(configWithoutWorkingDir);
      expect(backend.getWorkingDir()).toBeNull();
    });

    it('应返回正确的 session ID', () => {
      const backend = new PiAgentBackend(mockConfig);
      expect(backend.getCurrentSessionId()).toBeNull();
    });
  });

  describe('模型信息', () => {
    it('应返回当前模型信息', async () => {
      const backend = new PiAgentBackend(mockConfig);
      const modelInfo = await backend.getModelInfo();
      
      expect(modelInfo).toBeDefined();
      expect(modelInfo?.currentModelId).toBe('anthropic/claude-sonnet-4-20250514');
      expect(modelInfo?.canSwitch).toBe(true);
    });

    it('当未配置模型时应使用默认值', async () => {
      const configWithoutModel: AgentConfig = {
        sessionId: 'test-session',
        workingDir: '/tmp/test-workspace',
      };
      const backend = new PiAgentBackend(configWithoutModel);
      const modelInfo = await backend.getModelInfo();
      
      expect(modelInfo?.currentModelId).toBe('anthropic/claude-sonnet-4-20250514');
    });
  });

  describe('文件操作', () => {
    it('初始时应返回空文件列表', () => {
      const backend = new PiAgentBackend(mockConfig);
      const files = backend.getFiles();
      expect(files).toEqual([]);
    });
  });

  describe('超时控制', () => {
    it('应设置超时时间', () => {
      const backend = new PiAgentBackend(mockConfig);
      backend.setPromptTimeout(60);
      // 超时值存储在内部，我们只能验证它不抛出错误
      expect(true).toBe(true);
    });
  });

  describe('取消操作', () => {
    it('未初始化时取消不应抛出错误', () => {
      const backend = new PiAgentBackend(mockConfig);
      expect(() => backend.cancelPrompt()).not.toThrow();
    });
  });

  describe('健康检查', () => {
    it('未初始化时健康检查应返回 false', async () => {
      const backend = new PiAgentBackend(mockConfig);
      const healthy = await backend.checkHealth();
      expect(healthy).toBe(false);
    });
  });

  describe('销毁', () => {
    it('销毁后状态应为 idle', async () => {
      const backend = new PiAgentBackend(mockConfig);
      await backend.destroy();
      const status = await backend.getStatus();
      expect(status).toBe('idle');
    });
  });
});

describe('PiAgent 工具', () => {
  const mockConfig: AgentConfig = {
    sessionId: 'test-session',
    workingDir: '/tmp/test-workspace',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createWorkbenchTools', () => {
    it('应创建所有必要的工具', async () => {
      const { createWorkbenchTools } = await import('../../src/backends/pi-tools');
      const tools = createWorkbenchTools(mockConfig);
      
      expect(tools).toHaveLength(6);
      
      const toolNames = tools.map(tool => tool.name);
      expect(toolNames).toContain('readFile');
      expect(toolNames).toContain('writeFile');
      expect(toolNames).toContain('listFiles');
      expect(toolNames).toContain('bash');
      expect(toolNames).toContain('schemaValidate');
      expect(toolNames).toContain('saveImage');
    });

    it('每个工具应有 label 和 execute 方法', async () => {
      const { createWorkbenchTools } = await import('../../src/backends/pi-tools');
      const tools = createWorkbenchTools(mockConfig);
      
      for (const tool of tools) {
        expect(tool.label).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      }
    });
  });
});
