/**
 * AI 后端供应商管理器（单例）
 *
 * 数据源优先级（运行时）：
 * 1. author-site 通过 POST /internal/backend-providers 推送的最新配置（最高优先级）
 * 2. .env 中 PI_AGENT_PROVIDERS JSON 配置（启动时 fallback）
 * 3. 硬编码默认（极简场景）
 *
 * 设计要点：
 * - agent-service 启动时不直连 DB（保持进程边界清晰）
 * - author-site 写入 DB 后主动推送，保持配置同步
 * - 支持运行时热更新（已有 agent 的模型选择会失效，但不会崩溃）
 */

import type { BackendProvider, BackendProvidersConfig } from "@opencode-workbench/shared";
import { logger } from "../utils/logger";

class BackendProvidersManager {
  private config: BackendProvidersConfig = { providers: [] };
  private loaded = false;

  /**
   * 初始化（启动时调用）
   *
   * 加载优先级：.env PI_AGENT_PROVIDERS > 默认
   * 运行时通过 setConfig() 接收 author-site 推送
   */
  initialize(): void {
    if (this.loaded) {
      logger.warn("BackendProvidersManager already initialized");
      return;
    }

    const envConfig = this.loadFromEnv();
    if (envConfig.providers.length > 0) {
      this.config = envConfig;
      logger.info(
        { providerCount: envConfig.providers.length, ids: envConfig.providers.map((p) => p.id) },
        "BackendProviders loaded from .env PI_AGENT_PROVIDERS",
      );
    } else {
      this.config = { providers: [] };
      logger.info("No PI_AGENT_PROVIDERS in .env, waiting for author-site push");
    }

    this.loaded = true;
  }

  /**
   * 从环境变量加载（启动 fallback）
   */
  private loadFromEnv(): BackendProvidersConfig {
    const raw = process.env.PI_AGENT_PROVIDERS;
    if (!raw || !raw.trim()) {
      return { providers: [] };
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        logger.warn("PI_AGENT_PROVIDERS is not an array, ignoring");
        return { providers: [] };
      }

      const providers: BackendProvider[] = [];
      for (const item of parsed) {
        if (!item.id || !item.baseURL || !Array.isArray(item.models)) {
          logger.warn({ item }, "Invalid provider config in PI_AGENT_PROVIDERS, skipping");
          continue;
        }
        providers.push({
          id: String(item.id),
          name: item.name ? String(item.name) : String(item.id),
          baseURL: String(item.baseURL),
          apiKey: item.apiKey ? String(item.apiKey) : "",
          models: item.models.map((m: unknown) => String(m)),
          defaultModel: item.defaultModel ? String(item.defaultModel) : undefined,
          enabled: item.enabled !== false,
        });
      }

      const activeProviderId = process.env.PI_AGENT_PROVIDER;
      const activeModelRaw = process.env.PI_AGENT_MODEL;
      const activeModelId =
        activeProviderId && activeModelRaw
          ? `${activeProviderId}/${activeModelRaw}`
          : undefined;

      return { providers, activeProviderId, activeModelId };
    } catch (err) {
      logger.error({ err }, "Failed to parse PI_AGENT_PROVIDERS JSON");
      return { providers: [] };
    }
  }

  /**
   * 接收 author-site 推送的配置（运行时）
   */
  setConfig(config: BackendProvidersConfig): void {
    if (!this.loaded) {
      this.initialize();
    }
    this.config = config;
    logger.info(
      {
        providerCount: config.providers.length,
        ids: config.providers.map((p) => p.id),
        activeProviderId: config.activeProviderId,
        activeModelId: config.activeModelId,
      },
      "BackendProviders config updated",
    );
  }

  /**
   * 获取当前完整配置（供内部使用）
   */
  getConfig(): BackendProvidersConfig {
    if (!this.loaded) {
      this.initialize();
    }
    return this.config;
  }

  /**
   * 根据 ID 获取供应商
   */
  getProvider(id: string): BackendProvider | undefined {
    return this.getConfig().providers.find((p) => p.id === id && p.enabled !== false);
  }

  /**
   * 获取激活的供应商 ID
   *
   * 优先级：activeProviderId > PI_AGENT_PROVIDER（env）> 第一个 enabled 供应商
   */
  getActiveProviderId(): string | undefined {
    const cfg = this.getConfig();
    if (cfg.activeProviderId && this.getProvider(cfg.activeProviderId)) {
      return cfg.activeProviderId;
    }
    const firstEnabled = cfg.providers.find((p) => p.enabled !== false);
    return firstEnabled?.id;
  }

  /**
   * 获取激活的模型 ID（格式：providerId/modelId）
   */
  getActiveModelId(): string | undefined {
    const cfg = this.getConfig();
    if (cfg.activeModelId) return cfg.activeModelId;

    const providerId = this.getActiveProviderId();
    if (!providerId) return undefined;

    const provider = this.getProvider(providerId);
    if (!provider) return undefined;

    const modelId = provider.defaultModel || provider.models[0];
    if (!modelId) return undefined;
    return `${providerId}/${modelId}`;
  }

  /**
   * 获取指定供应商下的所有可用模型（统一格式）
   *
   * 优先使用 backendProviders 中声明的 models 列表（解决 pi-ai 不识别自定义 provider 的问题）
   */
  getProviderModels(providerId: string): Array<{ id: string; label: string }> {
    const provider = this.getProvider(providerId);
    if (!provider) return [];

    return provider.models.map((m) => ({
      id: `${provider.id}/${m}`,
      label: m,
    }));
  }
}

let globalManager: BackendProvidersManager | null = null;

export function getBackendProvidersManager(): BackendProvidersManager {
  if (!globalManager) {
    globalManager = new BackendProvidersManager();
  }
  return globalManager;
}
