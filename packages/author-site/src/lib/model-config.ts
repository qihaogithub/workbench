/**
 * 全局模型配置读取层。
 *
 * 数据库是运行时主来源；数据库没有可用的 canonical 配置时，使用
 * PI_AGENT_PROVIDERS 或 PI_AGENT_PROVIDER/PI_AGENT_MODEL 生成完整 fallback。
 * 前端策略只允许 enabledModels、autoEnableRules、excludedModels 三个字段。
 */

import { readDbConfig } from "./db-config";
import {
  DEFAULT_IMAGE_GEN_CONFIG as RUNTIME_IMAGE_GEN_DEFAULTS,
  type AutoEnableRule,
  type FrontendModelPolicy,
  type ImageGenConfig as RuntimeImageGenConfig,
} from "@workbench/runtime-config/model";
import {
  hydrateBackendProviders,
  hydrateImageGen,
} from "./global-model-secrets";
import type { BackendProvidersConfig } from "@workbench/shared";

const CONFIG_ID = "model_config";
const CACHE_TTL = 60 * 1000;

export type { AutoEnableRule } from "@workbench/runtime-config/model";
export type ImageGenConfig = RuntimeImageGenConfig & { apiKey: string };
export type FrontendModelConfig = {
  -readonly [Key in keyof FrontendModelPolicy]: FrontendModelPolicy[Key];
};

export interface ModelConfigData {
  frontend: FrontendModelConfig;
  backendProviders?: BackendProvidersConfig;
  imageGen?: ImageGenConfig;
}

export const DEFAULT_IMAGE_GEN_CONFIG: ImageGenConfig = {
  ...RUNTIME_IMAGE_GEN_DEFAULTS,
  apiKey: "",
};

interface CachedConfig {
  data: ModelConfigData;
  lastFetched: number;
}

let cachedConfig: CachedConfig | null = null;

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeRules(value: unknown): AutoEnableRule[] {
  if (!Array.isArray(value)) return [];
  const rules: AutoEnableRule[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rule = item as { type?: unknown; value?: unknown };
    if (
      (rule.type !== "prefix" && rule.type !== "nameFilter") ||
      typeof rule.value !== "string" ||
      !rule.value.trim()
    ) {
      continue;
    }
    const normalized = rule.value.trim();
    const key = `${rule.type}:${normalized}`;
    if (!seen.has(key)) {
      rules.push({ type: rule.type, value: normalized });
      seen.add(key);
    }
  }
  return rules;
}

export function normalizeFrontendModelConfig(value: unknown): FrontendModelConfig {
  const frontend =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    enabledModels: uniqueStrings(frontend.enabledModels),
    autoEnableRules: normalizeRules(frontend.autoEnableRules),
    excludedModels: uniqueStrings(frontend.excludedModels),
  };
}

function normalizeBackendProviders(
  value: unknown,
): BackendProvidersConfig | undefined {
  return hydrateBackendProviders(value);
}

function normalizeImageGen(value: unknown): ImageGenConfig | undefined {
  const hydrated = hydrateImageGen(value);
  if (!hydrated) return undefined;
  return {
    ...DEFAULT_IMAGE_GEN_CONFIG,
    ...hydrated,
  };
}

function parseProvidersFromEnv(): BackendProvidersConfig {
  const raw = process.env.PI_AGENT_PROVIDERS?.trim();
  const providers: Array<BackendProvidersConfig["providers"][number]> = [];

  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const provider = item as Record<string, unknown>;
          const id = typeof provider.id === "string" ? provider.id.trim() : "";
          const baseURL =
            typeof provider.baseURL === "string" ? provider.baseURL.trim() : "";
          const models = uniqueStrings(provider.models);
          if (!id || !baseURL || models.length === 0) continue;
          providers.push({
            id,
            name:
              typeof provider.name === "string" && provider.name.trim()
                ? provider.name.trim()
                : id,
            baseURL,
            apiKey: typeof provider.apiKey === "string" ? provider.apiKey : "",
            models,
            defaultModel:
              typeof provider.defaultModel === "string"
                ? provider.defaultModel
                : undefined,
            enabled: provider.enabled !== false,
            contextWindow:
              typeof provider.contextWindow === "number"
                ? provider.contextWindow
                : undefined,
            maxTokens:
              typeof provider.maxTokens === "number"
                ? provider.maxTokens
                : undefined,
          });
        }
      }
    } catch {
      // agent-service 负责记录 provider 解析错误；这里保持 API 可用。
    }
  }

  const activeProviderId = process.env.PI_AGENT_PROVIDER?.trim() || undefined;
  const activeModel = process.env.PI_AGENT_MODEL?.trim() || undefined;
  const activeModelId =
    activeProviderId && activeModel
      ? `${activeProviderId}/${activeModel}`
      : undefined;

  if (providers.length === 0 && activeProviderId && activeModel) {
    providers.push({
      id: activeProviderId,
      name: activeProviderId,
      baseURL:
        process.env.PI_AGENT_BASE_URL?.trim() || "https://api.openai.com/v1",
      apiKey: process.env.PI_AGENT_API_KEY || "",
      models: [activeModel],
      defaultModel: activeModel,
      enabled: true,
    });
  }

  return { providers, activeProviderId, activeModelId };
}

function buildEnvFallback(): ModelConfigData {
  const backendProviders = parseProvidersFromEnv();
  const enabledModels = backendProviders.providers
    .filter((provider) => provider.enabled !== false)
    .flatMap((provider) =>
      provider.models.map((model) => `${provider.id}/${model}`),
    );
  const providerIds = Array.from(
    new Set(
      backendProviders.providers
        .filter((provider) => provider.enabled !== false)
        .map((provider) => provider.id),
    ),
  );

  return {
    frontend: {
      enabledModels,
      autoEnableRules: providerIds.map((value) => ({
        type: "prefix" as const,
        value: `${value}/`,
      })),
      excludedModels: [],
    },
    backendProviders,
    imageGen: { ...DEFAULT_IMAGE_GEN_CONFIG },
  };
}

function normalizeConfig(value: Record<string, unknown>): ModelConfigData {
  const config: ModelConfigData = {
      frontend: normalizeFrontendModelConfig(value.frontend),
  };
  const backendProviders = normalizeBackendProviders(value.backendProviders);
  if (backendProviders) config.backendProviders = backendProviders;
  const imageGen = normalizeImageGen(value.imageGen);
  if (imageGen) config.imageGen = imageGen;
  return config;
}

export async function getModelConfig(): Promise<ModelConfigData> {
  if (cachedConfig && Date.now() - cachedConfig.lastFetched < CACHE_TTL) {
    return cachedConfig.data;
  }

  try {
    const dbConfig = readDbConfig(CONFIG_ID);
    if (dbConfig && dbConfig.frontend) {
      const config = normalizeConfig(dbConfig);
      cachedConfig = { data: config, lastFetched: Date.now() };
      return config;
    }
  } catch (error) {
    console.warn("[model-config] Failed to read database config:", error);
  }

  const fallback = buildEnvFallback();
  cachedConfig = { data: fallback, lastFetched: Date.now() };
  return fallback;
}

export function getModelConfigSync(): ModelConfigData {
  return buildEnvFallback();
}

export function invalidateConfigCache(): void {
  cachedConfig = null;
}
