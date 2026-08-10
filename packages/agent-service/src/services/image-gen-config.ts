/**
 * 图像生成（文生图/抠图）运行时配置
 *
 * 配置来源优先级：管理后台推送（内存覆盖） > 环境变量默认值。
 * agent-service 启动时从环境变量初始化默认值；author-site 管理后台
 * 保存绘图配置后通过 PUT /internal/image-gen 覆盖内存配置。
 */

import { loadConfig } from "../utils/config";
import { logger } from "../utils/logger";

export interface ImageGenRuntimeConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxPerSession: number;
  maxRetries: number;
  concurrency: number;
  maxPromptLen: number;
}

let _config: ImageGenRuntimeConfig | null = null;

function fromEnv(): ImageGenRuntimeConfig {
  const gen = loadConfig().imageGen;
  return {
    enabled: gen.enabled,
    apiKey: gen.apiKey,
    baseUrl: gen.baseUrl,
    model: gen.model,
    timeoutMs: gen.timeoutMs,
    maxPerSession: gen.maxPerSession,
    maxRetries: gen.maxRetries,
    concurrency: gen.concurrency,
    maxPromptLen: gen.maxPromptLen,
  };
}

export function getImageGenConfig(): ImageGenRuntimeConfig {
  if (!_config) {
    _config = fromEnv();
  }
  return { ..._config };
}

export function updateImageGenConfig(
  partial: Partial<ImageGenRuntimeConfig>,
): ImageGenRuntimeConfig {
  const current = getImageGenConfig();
  _config = { ...current, ...partial };
  logger.info(
    {
      enabled: _config.enabled,
      model: _config.model,
      baseUrl: _config.baseUrl,
      hasApiKey: Boolean(_config.apiKey),
      maxPerSession: _config.maxPerSession,
    },
    "ImageGen config updated",
  );
  return { ..._config };
}

export function resetImageGenConfig(): void {
  _config = null;
}