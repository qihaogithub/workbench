import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PiAgentBackend } from '../../src/backends/pi-agent';
import { AgentConfig, AgentEvent } from '../../src/core/types';

describe('Pi Agent 集成测试', () => {
  let backend: PiAgentBackend;
  let events: AgentEvent[];

  beforeEach(() => {
    events = [];
  });

  afterEach(async () => {
    if (backend) {
      await backend.destroy();
    }
  });

  describe('初始化和销毁', () => {
    it('应该正确初始化和销毁', async () => {
      const config: AgentConfig = {
        sessionId: 'test-session',
        workingDir: '/tmp/test-workspace',
        piAgent: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
        },
      };

      backend = new PiAgentBackend(config);
      
      expect(await backend.getStatus()).toBe('idle');
      
      await backend.start();
      
      expect(await backend.getStatus()).toBe('ready');
      expect(await backend.checkHealth()).toBe(true);
      
      await backend.destroy();
      
      expect(await backend.getStatus()).toBe('idle');
      expect(await backend.checkHealth()).toBe(false);
    });
  });

  describe('事件回调', () => {
    it('应该正确注册事件回调', async () => {
      const config: AgentConfig = {
        sessionId: 'test-session',
        workingDir: '/tmp/test-workspace',
      };

      backend = new PiAgentBackend(config);
      
      const callback = (event: AgentEvent) => {
        events.push(event);
      };
      
      backend.onStream(callback);
      
      expect(events).toHaveLength(0);
    });
  });

  describe('配置管理', () => {
    it('应该返回正确的配置信息', async () => {
      const config: AgentConfig = {
        sessionId: 'test-session',
        workingDir: '/tmp/test-workspace',
        piAgent: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
        },
      };

      backend = new PiAgentBackend(config);
      
      expect(backend.getWorkingDir()).toBe('/tmp/test-workspace');
      expect(backend.getCurrentSessionId()).toBeNull();
      expect(backend.getFiles()).toHaveLength(0);
      
      const modelInfo = await backend.getModelInfo();
      expect(modelInfo).toBeDefined();
      expect(modelInfo?.currentModelId).toBe('anthropic/claude-sonnet-4-20250514');
      expect(modelInfo?.canSwitch).toBe(true);
    });
  });

  describe('超时控制', () => {
    it('应该设置超时时间', async () => {
      const config: AgentConfig = {
        sessionId: 'test-session',
        workingDir: '/tmp/test-workspace',
      };

      backend = new PiAgentBackend(config);
      
      // 设置超时不应抛出错误
      backend.setPromptTimeout(60);
      
      // 验证状态
      expect(await backend.getStatus()).toBe('idle');
    });
  });

  describe('取消操作', () => {
    it('应该安全地取消操作', async () => {
      const config: AgentConfig = {
        sessionId: 'test-session',
        workingDir: '/tmp/test-workspace',
      };

      backend = new PiAgentBackend(config);
      
      // 取消操作不应抛出错误
      backend.cancelPrompt();
      
      // 验证状态
      expect(await backend.getStatus()).toBe('idle');
    });
  });

  describe('模型管理', () => {
    it('应该设置和获取模型信息', async () => {
      const config: AgentConfig = {
        sessionId: 'test-session',
        workingDir: '/tmp/test-workspace',
        piAgent: {
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
        },
      };

      backend = new PiAgentBackend(config);
      
      const modelInfo = await backend.getModelInfo();
      expect(modelInfo?.currentModelId).toBe('anthropic/claude-sonnet-4-20250514');
    });
  });

  describe('错误处理', () => {
    it('应该处理未初始化时的操作', async () => {
      const config: AgentConfig = {
        sessionId: 'test-session',
        workingDir: '/tmp/test-workspace',
      };

      backend = new PiAgentBackend(config);
      
      // 未初始化时发送消息应抛出错误
      await expect(backend.sendMessage('hello')).rejects.toThrow('Agent not initialized');
    });

    it('应该处理重复初始化', async () => {
      const config: AgentConfig = {
        sessionId: 'test-session',
        workingDir: '/tmp/test-workspace',
      };

      backend = new PiAgentBackend(config);
      
      await backend.start();
      await backend.start(); // 重复初始化不应抛出错误
      
      expect(await backend.getStatus()).toBe('ready');
    });
  });
});
