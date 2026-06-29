import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelManager, splitFullModelId } from '../../src/backends/managers/model-manager';
import { loadPiAgentDeps } from '../../src/backends/managers/pi-agent-deps';
import type { AgentConfig } from '../../src/core/types';

vi.mock('@earendil-works/pi-agent-core', () => ({
  AgentHarness: vi.fn(),
  InMemorySessionRepo: vi.fn(),
}));
vi.mock('@earendil-works/pi-agent-core/node', () => ({
  NodeExecutionEnv: vi.fn(),
}));
vi.mock('@earendil-works/pi-ai', () => ({
  getModel: (provider: string, modelId: string) => ({
    id: modelId,
    name: modelId,
    provider,
    input: ['text'],
  }),
  getModels: () => [],
}));

describe('splitFullModelId', () => {
  it('应正确拆分 provider/model 格式', () => {
    expect(splitFullModelId('anthropic/claude-sonnet')).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet',
    });
  });

  it('应处理包含斜杠的 model id', () => {
    expect(splitFullModelId('openai/gpt-4/turbo')).toEqual({
      provider: 'openai',
      model: 'gpt-4/turbo',
    });
  });

  it('空输入应返回空对象', () => {
    expect(splitFullModelId(undefined)).toEqual({});
    expect(splitFullModelId('')).toEqual({});
  });

  it('缺少 model 部分应返回空对象', () => {
    expect(splitFullModelId('anthropic')).toEqual({});
  });
});

describe('ModelManager', () => {
  const config: AgentConfig = {
    sessionId: 'test-session',
    piAgent: {
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
    },
  };

  let manager: ModelManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ModelManager(config);
  });

  describe('resolveProviderAndModel', () => {
    it('应从 piAgent 配置解析 provider 和 model', () => {
      const result = manager.resolveProviderAndModel();
      expect(result.provider).toBe('anthropic');
      expect(result.modelId).toBe('claude-sonnet-4-20250514');
    });

    it('selectedModel 应优先于配置', () => {
      manager.setSelectedModel({ provider: 'openai', modelId: 'gpt-4' });
      const result = manager.resolveProviderAndModel();
      expect(result.provider).toBe('openai');
      expect(result.modelId).toBe('gpt-4');
    });
  });

  describe('getModel', () => {
    it('无 baseUrl 时应回退到 pi-ai 内置 getModel', async () => {
      await loadPiAgentDeps();
      const model = manager.getModel();
      expect(model.id).toBe('claude-sonnet-4-20250514');
      expect(model.provider).toBe('anthropic');
    });

    it('配置 baseUrl 时应返回自定义模型对象', () => {
      const configWithBaseUrl: AgentConfig = {
        sessionId: 'test-session',
        piAgent: {
          provider: 'custom',
          model: 'my-model',
          baseUrl: 'https://api.example.com/v1',
        },
        backendProviders: {
          providers: [{
            id: 'custom',
            models: ['my-model'],
            apiKey: 'sk-test',
            baseURL: 'https://api.example.com/v1',
          }],
          activeProviderId: 'custom',
        },
      };
      const customManager = new ModelManager(configWithBaseUrl);
      const model = customManager.getModel();
      expect(model.baseUrl).toBe('https://api.example.com/v1');
      expect(model.api).toBe('openai-completions');
      expect(model.apiKey).toBe('sk-test');
    });
  });

  describe('getApiKeyAndHeaders', () => {
    it('应从 providerConfig 解析 apiKey', async () => {
      const configWithProviders: AgentConfig = {
        sessionId: 'test-session',
        backendProviders: {
          providers: [{
            id: 'anthropic',
            models: ['claude-sonnet'],
            apiKey: 'sk-from-provider',
            baseURL: 'https://api.anthropic.com',
          }],
          activeProviderId: 'anthropic',
        },
      };
      const m = new ModelManager(configWithProviders);
      const result = await m.getApiKeyAndHeaders({ provider: 'anthropic' });
      expect(result?.apiKey).toBe('sk-from-provider');
    });

    it('无任何 apiKey 配置时应返回 undefined', async () => {
      const minimalConfig: AgentConfig = { sessionId: 'test' };
      const m = new ModelManager(minimalConfig);
      const result = await m.getApiKeyAndHeaders({ provider: 'unknown' });
      expect(result).toBeUndefined();
    });
  });

  describe('getModelInfo', () => {
    it('应返回当前模型信息和可切换模型列表', async () => {
      const info = await manager.getModelInfo();
      expect(info).not.toBeNull();
      expect(info?.currentModelId).toBe('anthropic/claude-sonnet-4-20250514');
      expect(info?.canSwitch).toBe(true);
      expect(Array.isArray(info?.availableModels)).toBe(true);
    });

    it('backendProviders 应提供可切换模型列表', async () => {
      const configWithProviders: AgentConfig = {
        sessionId: 'test-session',
        backendProviders: {
          providers: [
            { id: 'anthropic', models: ['claude-sonnet', 'claude-haiku'] },
            { id: 'openai', models: ['gpt-4', 'gpt-3.5'] },
          ],
          activeProviderId: 'anthropic',
        },
      };
      const m = new ModelManager(configWithProviders);
      const info = await m.getModelInfo();
      expect(info?.availableModels.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('applyModelSwitch', () => {
    it('应更新 selectedModel 和 config.piAgent', () => {
      manager.applyModelSwitch('openai/gpt-4');
      expect(manager.getSelectedModel()).toEqual({ provider: 'openai', modelId: 'gpt-4' });
      expect(config.piAgent?.provider).toBe('openai');
      expect(config.piAgent?.model).toBe('gpt-4');
    });
  });
});
