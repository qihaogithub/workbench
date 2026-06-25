/**
 * 模型配置读取层
 *
 * 优先从数据库读取配置(管理后台动态配置)
 * Fallback 到环境变量(保持向后兼容)
 *
 * 支持缓存机制,避免频繁读取数据库
 */

import { readDbConfig } from "./db-config";
import type { BackendProvidersConfig } from "@opencode-workbench/shared";

const CONFIG_ID = "model_config";
const CACHE_TTL = 60 * 1000; // 1 分钟缓存

interface CachedConfig {
  data: ModelConfigData;
  lastFetched: number;
}

/**
 * 自动启用规则
 *
 * - type="prefix"     : 按分组前缀匹配,如 "xjjj/"
 * - type="nameFilter": 按分组+关键词匹配,格式 "分组:关键词",如 "opencode:Free"
 */
export type AutoEnableRule =
  | { type: "prefix"; value: string }
  | { type: "nameFilter"; value: string };

export interface ModelConfigData {
  frontend: {
    /** 启用并按优先级排序的模型 ID 列表(新结构,顺序即优先级) */
    enabledModels?: string[];
    /** 自动启用规则(新结构,匹配的新发现模型自动启用) */
    autoEnableRules?: AutoEnableRule[];
    /** @deprecated 旧结构: 白名单分组前缀,从 autoEnableRules type=prefix 兼容 */
    allowedPrefixes: string[];
    /** @deprecated 旧结构: 黑名单模型 ID,启用列表模式时为空 */
    blacklist: string[];
    /** @deprecated 旧结构: 默认模型 ID 列表,启用列表模式时等于 enabledModels */
    defaultModelIds: string[];
    /** @deprecated 旧结构: 名称过滤器,从 autoEnableRules type=nameFilter 兼容 */
    nameFilters: string[];
  };
  multimodalModels: string[];
  /**
   * AI 后端供应商配置(用于 agent-service 的 LLM 后端)
   * 字段缺失时视为空(agent-service 走 .env PI_AGENT_PROVIDERS fallback)
   */
  backendProviders?: BackendProvidersConfig;
}

let cachedConfig: CachedConfig | null = null;

/**
 * 从环境变量读取配置 (Fallback)
 */
function readFromEnv(): ModelConfigData {
  const allowedPrefixes = (process.env.NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const nameFilters = (process.env.NEXT_PUBLIC_MODEL_NAME_FILTERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultModelIds = (process.env.NEXT_PUBLIC_DEFAULT_MODEL_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    frontend: {
      // 新结构: 从环境变量反向转换
      enabledModels: defaultModelIds,
      autoEnableRules: [
        ...allowedPrefixes.map((v) => ({ type: "prefix" as const, value: v })),
        ...nameFilters.map((v) => ({ type: "nameFilter" as const, value: v })),
      ],
      // 旧结构: 原样保留
      allowedPrefixes,
      blacklist: (process.env.NEXT_PUBLIC_MODEL_BLACKLIST || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      defaultModelIds,
      nameFilters,
    },
    multimodalModels: [],
  };
}

/**
 * 将数据库原始配置规范化为完整 ModelConfigData
 *
 * 兼容规则:
 * - 如果包含 enabledModels / autoEnableRules, 保留并据此生成旧字段
 * - 如果仅有旧字段, 反向转换为 enabledModels / autoEnableRules
 * - 确保两种模式都能被下游代码消费
 */
function normalizeConfig(dbConfig: Record<string, any>): ModelConfigData {
  const frontend = dbConfig.frontend || {};
  const multimodalModels: string[] = Array.isArray(dbConfig.multimodalModels)
    ? dbConfig.multimodalModels
    : [];
  const backendProviders: BackendProvidersConfig | undefined =
    dbConfig.backendProviders &&
    Array.isArray(dbConfig.backendProviders.providers)
      ? (dbConfig.backendProviders as BackendProvidersConfig)
      : undefined;

  // 读取新结构
  const enabledModels: string[] | undefined = Array.isArray(
    frontend.enabledModels,
  )
    ? frontend.enabledModels
    : undefined;
  const autoEnableRules: AutoEnableRule[] | undefined = Array.isArray(
    frontend.autoEnableRules,
  )
    ? (frontend.autoEnableRules as AutoEnableRule[])
    : undefined;

  // 读取旧结构
  let allowedPrefixes: string[] = Array.isArray(frontend.allowedPrefixes)
    ? frontend.allowedPrefixes
    : [];
  let blacklist: string[] = Array.isArray(frontend.blacklist)
    ? frontend.blacklist
    : [];
  let defaultModelIds: string[] = Array.isArray(frontend.defaultModelIds)
    ? frontend.defaultModelIds
    : [];
  let nameFilters: string[] = Array.isArray(frontend.nameFilters)
    ? frontend.nameFilters
    : [];

  // 新结构 → 旧结构
  if (enabledModels && !defaultModelIds.length) {
    defaultModelIds = [...enabledModels];
  }
  if (autoEnableRules && autoEnableRules.length > 0) {
    if (!allowedPrefixes.length) {
      allowedPrefixes = autoEnableRules
        .filter((r) => r.type === "prefix")
        .map((r) => r.value);
    }
    if (!nameFilters.length) {
      nameFilters = autoEnableRules
        .filter((r) => r.type === "nameFilter")
        .map((r) => r.value);
    }
  }

  // 旧结构 → 新结构 (仅当新结构不存在时)
  const finalEnabledModels = enabledModels ?? [...defaultModelIds];
  const finalAutoEnableRules = autoEnableRules ?? [
    ...allowedPrefixes.map((v) => ({ type: "prefix" as const, value: v })),
    ...nameFilters.map((v) => ({ type: "nameFilter" as const, value: v })),
  ];

  return {
    frontend: {
      enabledModels: finalEnabledModels,
      autoEnableRules: finalAutoEnableRules,
      allowedPrefixes,
      blacklist,
      defaultModelIds,
      nameFilters,
    },
    multimodalModels,
    backendProviders,
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
      const config = normalizeConfig(dbConfig);

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
