import type { BackendProvider, BackendProvidersConfig } from '@workbench/shared/contracts';

import type { AgentConfig } from '../../core/types';
import { loadConfig, type ServiceConfig } from '../../utils/config';
import { getBackendProvidersManager } from '../../config/backend-providers';
import { getGetModel, getGetModels } from './pi-agent-deps';
import { logger } from '../../utils/logger';

// 惰性加载 serviceConfig:避免在 dotenv.config() 执行前读取环境变量
let _serviceConfig: ServiceConfig | null = null;

function getServiceConfig(): ServiceConfig {
  if (!_serviceConfig) {
    _serviceConfig = loadConfig();
  }
  return _serviceConfig;
}

export function findProvider(
  config: BackendProvidersConfig | undefined,
  providerId: string,
): BackendProvider | undefined {
  return config?.providers.find((provider) => provider.id === providerId && provider.enabled !== false);
}

export function getActiveModelId(config: BackendProvidersConfig | undefined): string | undefined {
  if (!config) return undefined;
  if (config.activeModelId) return config.activeModelId;

  const provider =
    (config.activeProviderId ? findProvider(config, config.activeProviderId) : undefined) ||
    config.providers.find((item) => item.enabled !== false);
  if (!provider) return undefined;

  const model = provider.defaultModel || provider.models[0];
  return model ? `${provider.id}/${model}` : undefined;
}

export function splitFullModelId(fullModelId: string | undefined): { provider?: string; model?: string } {
  if (!fullModelId) return {};
  const [provider, ...modelParts] = fullModelId.split('/');
  const model = modelParts.join('/');
  return provider && model ? { provider, model } : {};
}

function fullModelId(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

/**
 * 模型管理器
 *
 * 负责模型解析、API 密钥获取、提供商配置。
 * 从 PiAgentBackend 中提取，使模型相关逻辑可独立测试和演进。
 */
export class ModelManager {
  constructor(
    private config: AgentConfig,
    private selectedModel: { provider: string; modelId: string } | null = null,
  ) {}

  setSelectedModel(model: { provider: string; modelId: string } | null): void {
    this.selectedModel = model;
  }

  getSelectedModel(): { provider: string; modelId: string } | null {
    return this.selectedModel;
  }

  private getSessionProvidersConfig(): BackendProvidersConfig | undefined {
    return this.config.backendProviders;
  }

  getProviderConfig(providerId: string): BackendProvider | undefined {
    return (
      findProvider(this.getSessionProvidersConfig(), providerId) ||
      getBackendProvidersManager().getProvider(providerId)
    );
  }

  private getMultimodalModels(): Set<string> {
    return new Set([
      ...(this.getSessionProvidersConfig()?.multimodalModels || []),
      ...(getBackendProvidersManager().getConfig().multimodalModels || []),
    ]);
  }

  private modelSupportsImages(provider: string, modelId: string): boolean {
    return this.getMultimodalModels().has(fullModelId(provider, modelId));
  }

  resolveProviderAndModel(): { provider: string; modelId: string } {
    const svc = getServiceConfig();
    const selected = this.selectedModel;
    const configuredModel = splitFullModelId(this.config.model);
    const configuredModelOnly =
      this.config.model && !this.config.model.includes('/')
        ? this.config.model
        : undefined;
    const sessionActive = splitFullModelId(getActiveModelId(this.getSessionProvidersConfig()));
    const managerActive = splitFullModelId(getBackendProvidersManager().getActiveModelId());

    return {
      provider:
        selected?.provider ||
        configuredModel.provider ||
        sessionActive.provider ||
        this.config.piAgent?.provider ||
        managerActive.provider ||
        svc.piAgent.provider,
      modelId:
        selected?.modelId ||
        configuredModel.model ||
        configuredModelOnly ||
        sessionActive.model ||
        this.config.piAgent?.model ||
        managerActive.model ||
        svc.piAgent.model,
    };
  }

  getModel(): any {
    const svc = getServiceConfig();
    const { provider, modelId } = this.resolveProviderAndModel();

    const providerConfig = this.getProviderConfig(provider);
    const baseUrl = providerConfig?.baseURL || this.config.piAgent?.baseUrl || svc.piAgent.baseUrl;
    const apiKeyFromProvider = providerConfig?.apiKey;
    const supportsImages = this.modelSupportsImages(provider, modelId);

    logger.info(
      { modelId, provider, baseUrl, hasProviderConfig: !!providerConfig, supportsImages },
      "Pi Agent getModel",
    );

    if (baseUrl) {
      return {
        id: modelId,
        name: modelId,
        api: 'openai-completions' as const,
        provider: provider,
        baseUrl: baseUrl,
        ...(apiKeyFromProvider ? { apiKey: apiKeyFromProvider } : {}),
        reasoning: false,
        input: supportsImages ? (['text', 'image'] as const) : (['text'] as const),
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      };
    }

    const getModelFn = getGetModel();
    const model = getModelFn(provider, modelId);
    if (!supportsImages) return model;
    return {
      ...model,
      input: Array.from(new Set([...(model.input || []), 'image'])),
    };
  }

  getVisionModel(fullModelId: string): any {
    const svc = getServiceConfig();
    const parsed = splitFullModelId(fullModelId);
    const provider = parsed.provider || this.resolveProviderAndModel().provider;
    const modelId = parsed.model || fullModelId;

    const providerConfig = this.getProviderConfig(provider);
    const baseUrl = providerConfig?.baseURL || this.config.piAgent?.baseUrl || svc.piAgent.baseUrl;
    const apiKeyFromProvider = providerConfig?.apiKey;

    if (baseUrl) {
      return {
        id: modelId,
        name: modelId,
        api: 'openai-completions' as const,
        provider,
        baseUrl,
        ...(apiKeyFromProvider ? { apiKey: apiKeyFromProvider } : {}),
        reasoning: false,
        input: ['text', 'image'] as const,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 1024,
      };
    }

    const getModelFn = getGetModel();
    const model = getModelFn(provider, modelId);
    return {
      ...model,
      input: Array.from(new Set([...(model.input || []), 'image'])),
    };
  }

  async getApiKeyAndHeaders(model: any): Promise<{ apiKey: string; headers?: Record<string, string> } | undefined> {
    const provider = model.provider;

    // 优先级：backendProviders.apiKey > model.apiKey > piAgent.apiKey > env var > serviceConfig
    const providerConfig = this.getProviderConfig(provider);
    const apiKey =
      providerConfig?.apiKey ||
      model.apiKey ||
      this.config.piAgent?.apiKey ||
      process.env[`${provider.toUpperCase()}_API_KEY`] ||
      getServiceConfig().piAgent.apiKey;

    logger.info({ provider, apiKeyLength: apiKey?.length }, "Pi Agent getApiKeyAndHeaders called");

    if (!apiKey) return undefined;

    return { apiKey };
  }

  async getModelInfo(): Promise<{
    currentModelId: string | null;
    availableModels: Array<{ id: string; label: string }>;
    canSwitch: boolean;
  } | null> {
    const sessionProviders = this.getSessionProvidersConfig();
    const resolved = this.resolveProviderAndModel();
    const provider = resolved.provider;
    const modelId = resolved.modelId;

    const availableModels: Array<{ id: string; label: string }> = [];
    const seen = new Set<string>();
    const add = (id: string, label: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      availableModels.push({ id, label });
    };

    // 1) 当前激活 provider: 优先使用 backendProviders 中声明的模型列表
    const providerConfig = this.getProviderConfig(provider);
    const providerModels = providerConfig
      ? providerConfig.models.map((model) => ({
          id: `${providerConfig.id}/${model}`,
          label: model,
        }))
      : [];
    if (providerModels.length > 0) {
      for (const m of providerModels) {
        add(m.id, m.label);
      }
      logger.info(
        { provider, modelCount: providerModels.length },
        "Using backendProviders for active provider model list",
      );
    } else {
      try {
        const getModelsFn = getGetModels();
        if (getModelsFn) {
          const models = getModelsFn(provider);
          if (models.length > 0) {
            for (const m of models) {
              add(`${provider}/${m.id}`, m.name || m.id);
            }
          }
        }
      } catch (error) {
        logger.warn({ error, provider }, "Failed to get available models from pi-ai");
      }
    }

    // 2) 遍历其他 backendProviders
    const allProviders =
      sessionProviders?.providers || getBackendProvidersManager().getConfig().providers;
    for (const p of allProviders) {
      if (p.id === provider) continue;
      if (p.enabled === false) continue;
      for (const m of p.models) {
        add(`${p.id}/${m}`, m);
      }
    }
    if (allProviders.length > 1) {
      logger.info(
        { totalProviders: allProviders.length, totalModels: availableModels.length },
        "Multi-provider model list assembled",
      );
    }

    // 3) 终极 fallback
    if (availableModels.length === 0 && modelId) {
      add(`${provider}/${modelId}`, modelId);
      logger.info(
        { provider, modelId },
        "Using synthetic model from config (last-resort fallback)",
      );
    }

    return {
      currentModelId: `${provider}/${modelId}`,
      availableModels,
      canSwitch: true,
    };
  }

  /**
   * 当用户请求切换模型时更新配置
   */
  applyModelSwitch(modelId: string): void {
    const [provider, ...modelParts] = modelId.split('/');
    const id = modelParts.join('/');
    this.config.piAgent = {
      ...this.config.piAgent,
      provider: provider || this.config.piAgent?.provider,
      model: id || modelId,
    };
    this.selectedModel = {
      provider: provider || this.config.piAgent.provider || '',
      modelId: id || modelId,
    };
  }

  updateConfig(config: Partial<AgentConfig>): void {
    Object.assign(this.config, config);
    if (config.piAgent) {
      this.config.piAgent = {
        ...this.config.piAgent,
        ...config.piAgent,
      };
    }
  }
}

export { getServiceConfig };
