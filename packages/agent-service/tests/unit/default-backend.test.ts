import { describe, it, expect, beforeEach } from 'vitest';
import { AgentFactory } from '../../src/core/agent-factory';
import { MemorySessionStore } from '../../src/session/session-store';
import { AgentConfig, AgentType } from '../../src/core/types';
import { BaseAgent } from '../../src/core/agent';

const DEFAULT_BACKEND = 'opencode-http';

function createMockCreator(backendName: string) {
  return (config: AgentConfig) => ({
    status: 'ready' as const,
    config,
    backendName,
    start: async () => {},
    sendMessage: async () => ({ success: true, content: '' }),
    on: () => {},
    off: () => {},
    cancel: () => {},
    getInfo: () => ({ sessionId: config.sessionId, backend: backendName }),
  }) as unknown as BaseAgent;
}

describe('默认后端配置', () => {
  describe('AgentFactory', () => {
    let factory: AgentFactory;

    beforeEach(() => {
      factory = new AgentFactory();
      factory.register('opencode', createMockCreator('opencode'));
      factory.register('opencode-http', createMockCreator('opencode-http'));
      factory.register('claude', createMockCreator('claude'));
    });

    it(`默认后端应为 ${DEFAULT_BACKEND}`, () => {
      const config: AgentConfig = {
        sessionId: 'test-session',
      };

      const agent = factory.create(config);
      expect(agent).toBeDefined();
    });

    it('未指定 backend 时应使用 opencode-http', () => {
      const config: AgentConfig = {
        sessionId: 'test-session',
      };

      const agent = factory.create(config);
      expect(agent.config.backend).toBeUndefined();
    });

    it('显式指定 backend 时应使用指定值', () => {
      const config: AgentConfig = {
        sessionId: 'test-session',
        backend: 'claude' as AgentType,
      };

      const agent = factory.create(config);
      expect(agent).toBeDefined();
    });

    it('应同时注册 opencode 和 opencode-http', () => {
      expect(factory.has('opencode')).toBe(true);
      expect(factory.has('opencode-http')).toBe(true);
    });

    it('getRegisteredTypes 应包含两种后端', () => {
      const types = factory.getRegisteredTypes();
      expect(types).toContain('opencode');
      expect(types).toContain('opencode-http');
    });
  });

  describe('MemorySessionStore', () => {
    let store: MemorySessionStore;

    beforeEach(() => {
      store = new MemorySessionStore();
    });

    it(`未指定 backend 时默认应为 ${DEFAULT_BACKEND}`, () => {
      const config = {
        sessionId: 'test-session',
        workingDir: '/tmp/test',
      };

      const meta = store.create('test-session', config);
      expect(meta.backend).toBe(DEFAULT_BACKEND);
    });

    it('显式指定 backend 时应使用指定值', () => {
      const config = {
        sessionId: 'test-session',
        backend: 'opencode',
        workingDir: '/tmp/test',
      };

      const meta = store.create('test-session', config);
      expect(meta.backend).toBe('opencode');
    });

    it('指定 opencode-http 时应正确存储', () => {
      const config = {
        sessionId: 'test-session',
        backend: 'opencode-http',
        workingDir: '/tmp/test',
      };

      const meta = store.create('test-session', config);
      expect(meta.backend).toBe('opencode-http');
    });

    it('应支持按 backend 过滤会话', () => {
      store.create('session-1', {
        sessionId: 'session-1',
        backend: 'opencode-http',
        workingDir: '/tmp/test1',
      });
      store.create('session-2', {
        sessionId: 'session-2',
        backend: 'opencode',
        workingDir: '/tmp/test2',
      });
      store.create('session-3', {
        sessionId: 'session-3',
        backend: 'opencode-http',
        workingDir: '/tmp/test3',
      });

      const httpSessions = store.list({ backend: 'opencode-http' });
      expect(httpSessions).toHaveLength(2);

      const acpSessions = store.list({ backend: 'opencode' });
      expect(acpSessions).toHaveLength(1);
    });
  });
});
