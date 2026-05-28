/**
 * 模型配置读取层
 *
 * 优先从数据库读取配置(管理后台动态配置)
 * Fallback 到环境变量(保持向后兼容)
 *
 * 支持缓存机制,避免频繁读取数据库
 */

import { readDbConfig } from "./db-config";

const CONFIG_ID = "model_config";
const CACHE_TTL = 60 * 1000; // 1 分钟缓存

interface CachedConfig {
  data: ModelConfigData;
  lastFetched: number;
}

export interface ModelConfigData {
  frontend: {
    allowedPrefixes: string[];
    blacklist: string[];
    defaultModelIds: string[];
    nameFilters: string[];
  };
  multimodalModels: string[];
}

let cachedConfig: CachedConfig | null = null;

/**
 * 从环境变量读取配置 (Fallback)
 */
function readFromEnv(): ModelConfigData {
  return {
    frontend: {
      allowedPrefixes: (process.env.NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      blacklist: (process.env.NEXT_PUBLIC_MODEL_BLACKLIST || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      defaultModelIds: (process.env.NEXT_PUBLIC_DEFAULT_MODEL_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      nameFilters: (process.env.NEXT_PUBLIC_MODEL_NAME_FILTERS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
    multimodalModels: [],
  };
}

/**
 * 获取模型配置 (优先数据库, fallback 环境变量)
 *
 * 注意: 此函数可在服务端和客户端调用
 * - 服务端: 直接读取数据库
 * - 客户端: 通过 API 读取 (自动 fallback)
 */
export async function getModelConfig(): Promise<ModelConfigData> {
  // 检查缓存
  if (cachedConfig && Date.now() - cachedConfig.lastFetched < CACHE_TTL) {
    return cachedConfig.data;
  }

  try {
    // 尝试从数据库读取
    const dbConfig = readDbConfig(CONFIG_ID);

    if (dbConfig && dbConfig.frontend) {
      const config: ModelConfigData = {
        frontend: {
          allowedPrefixes: dbConfig.frontend.allowedPrefixes || [],
          blacklist: dbConfig.frontend.blacklist || [],
          defaultModelIds: dbConfig.frontend.defaultModelIds || [],
          nameFilters: dbConfig.frontend.nameFilters || [],
        },
        multimodalModels: dbConfig.multimodalModels || [],
      };

      // 更新缓存
      cachedConfig = { data: config, lastFetched: Date.now() };
      return config;
    }
  } catch (error) {
    // 数据库读取失败, fallback 到环境变量
    console.warn(
      "[model-config] Failed to read from database, falling back to env:",
      error,
    );
  }

  // Fallback: 从环境变量读取
  const envConfig = readFromEnv();
  cachedConfig = { data: envConfig, lastFetched: Date.now() };
  return envConfig;
}

/**
 * 清除配置缓存 (用于配置更新后强制刷新)
 */
export function invalidateConfigCache(): void {
  cachedConfig = null;
}

/**
 * 同步获取配置 (仅用于服务端同步场景,不支持数据库读取)
 *
 * 警告: 此函数仅从环境变量读取,不读取数据库
 * 仅用于构建时或无法使用异步的场景
 */
export function getModelConfigSync(): ModelConfigData {
  return readFromEnv();
}
