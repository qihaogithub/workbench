import crypto from "crypto";

import { ImageAttachment } from "../core/types";
import { logger } from "../utils/logger";

export interface ImageDescription {
  hash: string;
  description: string;
  fromCache: boolean;
}

export interface ImageDescriberConfig {
  enabled: boolean;
  visionModelId: string;
  describePrompt: string;
  maxCacheSize: number;
  timeout: number;
}

export interface VisionDescribeRequest {
  image: ImageAttachment;
  modelId: string;
  prompt: string;
  signal: AbortSignal;
}

export type VisionDescribeFn = (
  request: VisionDescribeRequest,
) => Promise<string>;

export class ImageDescriptionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ImageDescriptionError";
  }
}

export const DEFAULT_IMAGE_DESCRIPTION_PROMPT = `请用简洁的中文描述这张图片的内容。
重点关注：
- UI 元素（按钮、表单、布局、颜色）
- 代码或文本内容（如可见）
- 图表或数据结构（如可见）
- 整体设计风格和意图

要求：
- 描述控制在 150 字以内
- 使用技术相关术语
- 避免主观猜测`;

const DEFAULT_CONFIG: ImageDescriberConfig = {
  enabled: true,
  visionModelId: "",
  describePrompt: DEFAULT_IMAGE_DESCRIPTION_PROMPT,
  maxCacheSize: 500,
  timeout: 10000,
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readEnvConfig(): Partial<ImageDescriberConfig> {
  const config: Partial<ImageDescriberConfig> = {};

  if (process.env.IMAGE_DESCRIPTION_ENABLED !== undefined) {
    config.enabled = process.env.IMAGE_DESCRIPTION_ENABLED === "true";
  }
  if (process.env.IMAGE_DESCRIPTION_MODEL) {
    config.visionModelId = process.env.IMAGE_DESCRIPTION_MODEL;
  }
  if (process.env.IMAGE_DESCRIPTION_TIMEOUT) {
    config.timeout = parsePositiveInt(
      process.env.IMAGE_DESCRIPTION_TIMEOUT,
      DEFAULT_CONFIG.timeout,
    );
  }
  if (process.env.IMAGE_DESCRIPTION_MAX_CACHE) {
    config.maxCacheSize = parsePositiveInt(
      process.env.IMAGE_DESCRIPTION_MAX_CACHE,
      DEFAULT_CONFIG.maxCacheSize,
    );
  }
  if (process.env.IMAGE_DESCRIPTION_PROMPT) {
    config.describePrompt = process.env.IMAGE_DESCRIPTION_PROMPT;
  }

  return config;
}

export class ImageDescriber {
  private cache = new Map<string, string>();
  private config: ImageDescriberConfig;
  private hitCount = 0;
  private missCount = 0;

  constructor(
    config: Partial<ImageDescriberConfig> = {},
    private readonly describeWithVision: VisionDescribeFn,
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...readEnvConfig(),
      ...config,
    };
  }

  isAvailable(): boolean {
    return this.config.enabled;
  }

  getConfig(): ImageDescriberConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<ImageDescriberConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    if (config.maxCacheSize !== undefined) {
      this.resizeCache(config.maxCacheSize);
    }
  }

  async describe(images: ImageAttachment[]): Promise<string> {
    if (!this.config.enabled) {
      throw new ImageDescriptionError(
        "IMAGE_DESCRIPTION_DISABLED",
        "当前模型不支持图片处理，且图片预描述功能未启用。请联系管理员配置识图模型。",
      );
    }

    if (images.length === 0) {
      return "";
    }

    const descriptions = await Promise.all(
      images.map((image) => this.describeOne(image)),
    );

    return this.formatDescriptions(descriptions);
  }

  clearCache(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.config.maxCacheSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
    };
  }

  private async describeOne(image: ImageAttachment): Promise<ImageDescription> {
    const hash = this.computeHash(image.data);
    const cached = this.cache.get(hash);

    if (cached !== undefined) {
      this.hitCount++;
      this.cache.delete(hash);
      this.cache.set(hash, cached);
      return { hash, description: cached, fromCache: true };
    }

    this.missCount++;
    const description = await this.callVisionModel(image);
    this.updateCache(hash, description);
    return { hash, description, fromCache: false };
  }

  private computeHash(base64Data: string): string {
    return crypto.createHash("sha256").update(base64Data).digest("hex");
  }

  private async callVisionModel(image: ImageAttachment): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const description = await this.describeWithVision({
        image,
        modelId: this.config.visionModelId,
        prompt: this.config.describePrompt,
        signal: controller.signal,
      });

      const trimmed = description.trim();
      if (trimmed) {
        logger.info(
          {
            image: image.name,
            modelId: this.config.visionModelId,
            descriptionLength: trimmed.length,
          },
          "Image description generated",
        );
        return trimmed;
      }

      logger.warn(
        { image: image.name, modelId: this.config.visionModelId },
        "Vision model returned empty image description",
      );
      return this.formatImageMetadata(image);
    } catch (error) {
      logger.error(
        { error, image: image.name, modelId: this.config.visionModelId },
        "Vision model call failed",
      );
      return this.formatImageMetadata(image);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private updateCache(hash: string, description: string): void {
    if (this.config.maxCacheSize <= 0) return;

    if (this.cache.has(hash)) {
      this.cache.delete(hash);
    }

    while (this.cache.size >= this.config.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }

    this.cache.set(hash, description);
  }

  private resizeCache(newSize: number): void {
    this.config.maxCacheSize = Math.max(0, newSize);

    while (this.cache.size > this.config.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }

  private formatDescriptions(descriptions: ImageDescription[]): string {
    return descriptions
      .map((desc, index) => {
        const header = descriptions.length > 1 ? `图片 ${index + 1}：` : "";
        return `${header}${desc.description}`;
      })
      .join("\n\n");
  }

  private formatImageMetadata(image: ImageAttachment): string {
    return `[图片：${image.name || "未命名"}，格式：${image.mimeType}]`;
  }
}
