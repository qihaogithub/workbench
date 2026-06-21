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

  describe('图片预描述', () => {
    const textOnlyConfig: AgentConfig = {
      sessionId: 'test-session',
      workingDir: '/tmp/test-workspace',
      backendProviders: {
        providers: [
          {
            id: 'custom',
            name: 'Custom',
            baseURL: 'https://api.example.com/v1',
            apiKey: 'sk-test',
            models: ['text-model'],
            defaultModel: 'text-model',
            enabled: true,
          },
        ],
        activeProviderId: 'custom',
        activeModelId: 'custom/text-model',
      },
    };

    it('非多模态模型收到图片且未配置预描述时应报错', async () => {
      const backend = new PiAgentBackend(textOnlyConfig);
      Object.defineProperty(backend, 'harness', {
        value: { prompt: vi.fn() },
      });

      await expect(
        backend.sendMessage('请看图', {
          images: [
            {
              data: Buffer.from('image').toString('base64'),
              mimeType: 'image/png',
              name: 'screen.png',
            },
          ],
        }),
      ).rejects.toThrow('当前模型不支持图片处理');
    });

    it('非多模态模型收到图片且已配置预描述时应注入描述文本', async () => {
      const prompt = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const backend = new PiAgentBackend(textOnlyConfig);
      Object.defineProperty(backend, 'harness', { value: { prompt } });
      Object.defineProperty(backend, 'imageDescriber', {
        value: {
          isAvailable: () => true,
          describe: vi.fn().mockResolvedValue('图片里有一个红色提交按钮'),
        },
      });

      await expect(
        backend.sendMessage('这个按钮有什么问题？', {
          images: [
            {
              data: Buffer.from('image').toString('base64'),
              mimeType: 'image/png',
              name: 'screen.png',
            },
          ],
        }),
      ).resolves.toBe('ok');

      expect(prompt).toHaveBeenCalledWith(
        '【图片内容】图片里有一个红色提交按钮\n\n【用户问题】这个按钮有什么问题？',
        { images: undefined },
      );
    });

    it('通过环境变量启用预描述后应走真实 ImageDescriber 缓存路径', async () => {
      process.env.IMAGE_DESCRIPTION_ENABLED = 'true';
      process.env.IMAGE_DESCRIPTION_MODEL = 'custom/vision-model';

      const prompt = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
      const backend = new PiAgentBackend(textOnlyConfig);
      Object.defineProperty(backend, 'harness', { value: { prompt } });

      const describeSpy = vi
        .spyOn(backend as any, 'describeImageWithVisionModel')
        .mockResolvedValue('图片展示了一个设置面板');

      const image = {
        data: Buffer.from('same-image').toString('base64'),
        mimeType: 'image/png',
        name: 'settings.png',
      };

      await backend.sendMessage('说明这个界面', { images: [image] });
      await backend.sendMessage('再次说明这个界面', { images: [image] });

      expect(describeSpy).toHaveBeenCalledTimes(1);
      expect(describeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          image,
          modelId: 'custom/vision-model',
        }),
      );
      expect(prompt).toHaveBeenNthCalledWith(
        1,
        '【图片内容】图片展示了一个设置面板\n\n【用户问题】说明这个界面',
        { images: undefined },
      );
      expect(prompt).toHaveBeenNthCalledWith(
        2,
        '【图片内容】图片展示了一个设置面板\n\n【用户问题】再次说明这个界面',
        { images: undefined },
      );
    });
  });
});

describe('PiAgentBackend session model config', () => {
  it('uses session backendProviders before global defaults', async () => {
    const backend = new PiAgentBackend({
      sessionId: 'test-session',
      backendProviders: {
        providers: [
          {
            id: 'custom',
            name: 'Custom',
            baseURL: 'https://api.example.com/v1',
            apiKey: 'sk-test',
            models: ['model-a', 'model-b'],
            defaultModel: 'model-b',
            enabled: true,
          },
        ],
        activeProviderId: 'custom',
        activeModelId: 'custom/model-b',
      },
    });
    const modelInfo = await backend.getModelInfo();

    expect(modelInfo?.currentModelId).toBe('custom/model-b');
    expect(modelInfo?.availableModels).toEqual([
      { id: 'custom/model-a', label: 'model-a' },
      { id: 'custom/model-b', label: 'model-b' },
    ]);
  });

  it('keeps user session model as default while listing admin providers', async () => {
    const backend = new PiAgentBackend({
      sessionId: 'test-session',
      piAgent: {
        provider: 'admin',
        model: 'admin-model',
      },
      backendProviders: {
        providers: [
          {
            id: 'custom',
            name: 'Custom',
            baseURL: 'https://api.example.com/v1',
            apiKey: 'sk-user',
            models: ['user-model'],
            defaultModel: 'user-model',
            enabled: true,
          },
          {
            id: 'admin',
            name: 'Admin',
            baseURL: 'https://admin.example.com/v1',
            apiKey: 'sk-admin',
            models: ['admin-model'],
            defaultModel: 'admin-model',
            enabled: true,
          },
        ],
        activeProviderId: 'custom',
        activeModelId: 'custom/user-model',
      },
    });
    const modelInfo = await backend.getModelInfo();

    expect(modelInfo?.currentModelId).toBe('custom/user-model');
    expect(modelInfo?.availableModels).toEqual([
      { id: 'custom/user-model', label: 'user-model' },
      { id: 'admin/admin-model', label: 'admin-model' },
    ]);
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
      
      expect(tools).toHaveLength(14);
      
      const toolNames = tools.map(tool => tool.name);
      expect(toolNames).toContain('readFile');
      expect(toolNames).toContain('readFileWithLines');
      expect(toolNames).toContain('editFile');
      expect(toolNames).toContain('writeFile');
      expect(toolNames).toContain('listFiles');
      expect(toolNames).toContain('bash');
      expect(toolNames).toContain('schemaValidate');
      expect(toolNames).toContain('saveImage');
      expect(toolNames).toContain('getConsoleLogs');
      expect(toolNames).toContain('captureScreenshot');
      expect(toolNames).toContain('listImages');
      expect(toolNames).toContain('listPages');
      expect(toolNames).toContain('deletePage');
      expect(toolNames).toContain('deletePages');
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
